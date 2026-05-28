import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, inArray, count } from "@slyncpay/db";
import { createHash } from "crypto";
import { db, disbursements, payables, tenantEntities, contractors, idempotencyKeys } from "@slyncpay/db";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getWingspanClient, entityChildUserId } from "../lib/wingspan.js";
import { toDisbursementDTO, toPayableDTO } from "../lib/dto.js";
import { logAudit } from "../lib/audit.js";
import { clientIp } from "../lib/rate-limit.js";

/**
 * Map Wingspan's payable status (capitalized) to SlyncPay's lowercase enum.
 */
function mapWingspanStatus(ws: string): "draft" | "pending" | "processing" | "paid" | "failed" | "cancelled" {
  switch (ws.toLowerCase()) {
    case "draft": return "draft";
    case "pending":
    case "open":
    case "approved": return "pending";
    case "processing":
    case "in_progress": return "processing";
    case "paid":
    case "complete":
    case "completed": return "paid";
    case "failed":
    case "rejected": return "failed";
    case "cancelled":
    case "canceled":
    case "void": return "cancelled";
    default: return "pending";
  }
}

/**
 * Refresh statuses of all payables in this disbursement from Wingspan. Best-effort:
 * any per-payable failure is logged and skipped so partial information still flows.
 * Returns the updated disbursement + payables rows.
 */
async function refreshDisbursementStatus(
  disbursement: typeof disbursements.$inferSelect,
): Promise<{
  disbursement: typeof disbursements.$inferSelect;
  payables: Array<typeof payables.$inferSelect>;
}> {
  const env: "live" | "test" = disbursement.environment;
  const [entity] = await db
    .select({
      wingspanChildUserId: tenantEntities.wingspanChildUserId,
      wingspanChildUserIdSandbox: tenantEntities.wingspanChildUserIdSandbox,
    })
    .from(tenantEntities)
    .where(eq(tenantEntities.id, disbursement.entityId))
    .limit(1);

  const childUserId = entity ? entityChildUserId(entity, env) : null;
  if (!childUserId) {
    const live = await db.select().from(payables).where(eq(payables.disbursementId, disbursement.id));
    return { disbursement, payables: live };
  }

  const rows = await db.select().from(payables).where(eq(payables.disbursementId, disbursement.id));
  const wingspan = getWingspanClient(env).withChild(childUserId);

  const TERMINAL = new Set(["paid", "failed", "cancelled"]);
  const updated: typeof rows = [];
  for (const row of rows) {
    if (!row.wingspanPayableId) {
      updated.push(row);
      continue;
    }
    try {
      const remote = await wingspan.getPayable(row.wingspanPayableId);
      const mapped = mapWingspanStatus(remote.status);
      console.log(
        `[disbursement-refresh] payable=${row.id} wingspan=${row.wingspanPayableId} remoteStatus=${remote.status} → mapped=${mapped} (current=${row.status})`,
      );
      // Only advance to terminal states. Wingspan often reports "Pending"/"Approved"
      // for batches in flight; don't regress our "processing" back to "pending".
      const shouldAdvance = TERMINAL.has(mapped) && mapped !== row.status;
      if (shouldAdvance) {
        const paidAt = mapped === "paid" && !row.paidAt ? new Date() : row.paidAt;
        const [u] = await db
          .update(payables)
          .set({ status: mapped, paidAt, updatedAt: new Date() })
          .where(eq(payables.id, row.id))
          .returning();
        updated.push(u ?? row);
      } else {
        updated.push(row);
      }
    } catch (err) {
      console.error(`[disbursement-refresh] Failed to fetch ${row.wingspanPayableId}:`, (err as Error).message);
      updated.push(row);
    }
  }

  // Roll up disbursement status from payable statuses
  const counts = { paid: 0, failed: 0, processing: 0, pending: 0, total: updated.length };
  for (const p of updated) {
    if (p.status === "paid") counts.paid += 1;
    else if (p.status === "failed") counts.failed += 1;
    else if (p.status === "processing") counts.processing += 1;
    else counts.pending += 1;
  }

  let nextDisbStatus: typeof disbursement.status = disbursement.status;
  if (counts.paid === counts.total) nextDisbStatus = "completed";
  else if (counts.failed === counts.total) nextDisbStatus = "failed";
  else if (counts.paid > 0 && counts.failed + counts.paid === counts.total) nextDisbStatus = "partial";

  let nextDisb = disbursement;
  if (nextDisbStatus !== disbursement.status) {
    const completedAt =
      nextDisbStatus === "completed" || nextDisbStatus === "partial" || nextDisbStatus === "failed"
        ? new Date()
        : disbursement.completedAt;
    const [u] = await db
      .update(disbursements)
      .set({ status: nextDisbStatus, completedAt })
      .where(eq(disbursements.id, disbursement.id))
      .returning();
    if (u) nextDisb = u;
  }

  return { disbursement: nextDisb, payables: updated };
}

export const disbursementRoutes = new Hono();
disbursementRoutes.use("*", authMiddleware);

disbursementRoutes.post(
  "/",
  zValidator("json", z.object({ entityId: z.string().uuid() })),
  async (c) => {
    const { tenantId, environment } = c.var.auth;
    const { entityId } = c.req.valid("json");
    const idempotencyKey = c.req.header("Idempotency-Key");

    if (!idempotencyKey) {
      throw new ValidationError("Idempotency-Key header is required for disbursements");
    }

    // Check idempotency cache
    const requestHash = createHash("sha256").update(JSON.stringify({ entityId })).digest("hex");
    const [existingKey] = await db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.tenantId, tenantId),
          eq(idempotencyKeys.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);

    if (existingKey?.completedAt && existingKey.responseBody) {
      return c.json(existingKey.responseBody as Record<string, unknown>);
    }

    await db
      .insert(idempotencyKeys)
      .values({
        tenantId,
        idempotencyKey,
        requestPath: "/v1/disbursements",
        requestHash,
        lockedAt: new Date(),
      })
      .onConflictDoNothing();

    // Validate env-scoped entity
    const [entity] = await db
      .select()
      .from(tenantEntities)
      .where(
        and(
          eq(tenantEntities.id, entityId),
          eq(tenantEntities.tenantId, tenantId),
          eq(tenantEntities.environment, environment),
        ),
      )
      .limit(1);

    if (!entity) throw new NotFoundError("Entity");
    const childUserId = entityChildUserId(entity, environment);
    if (!childUserId) {
      throw new ValidationError("Entity is not yet provisioned");
    }

    // Count + sum pending payables for this entity (env-scoped)
    const pendingPayables = await db
      .select({ id: payables.id, amountCents: payables.amountCents, feeAmountCents: payables.feeAmountCents })
      .from(payables)
      .where(
        and(
          eq(payables.tenantId, tenantId),
          eq(payables.entityId, entityId),
          eq(payables.environment, environment),
          eq(payables.status, "pending"),
        ),
      );

    if (pendingPayables.length === 0) {
      throw new ValidationError("No pending payables for this entity");
    }

    const totalAmountCents = pendingPayables.reduce((sum, p) => sum + p.amountCents, 0);
    const totalFeesCents = pendingPayables.reduce((sum, p) => sum + p.feeAmountCents, 0);

    // Create disbursement record
    const [disbursement] = await db
      .insert(disbursements)
      .values({
        tenantId,
        entityId,
        status: "processing",
        totalPayablesCount: pendingPayables.length,
        totalAmountCents,
        totalFeesCents,
        environment,
      })
      .returning();

    if (!disbursement) throw new Error("Failed to create disbursement");

    // Link payables to this disbursement and mark as processing
    await db
      .update(payables)
      .set({ disbursementId: disbursement.id, status: "processing", updatedAt: new Date() })
      .where(
        and(
          eq(payables.tenantId, tenantId),
          eq(payables.entityId, entityId),
          eq(payables.environment, environment),
          eq(payables.status, "pending"),
          inArray(payables.id, pendingPayables.map((p) => p.id)),
        ),
      );

    // Call Wingspan: POST /payments/pay-approved (env-specific entity context)
    const wingspan = getWingspanClient(environment).withChild(childUserId);
    const batchResult = await wingspan.payApproved();

    // Update disbursement with Wingspan batch ID
    await db
      .update(disbursements)
      .set({ wingspanBulkBatchId: batchResult.bulkPayrollBatchId })
      .where(eq(disbursements.id, disbursement.id));

    const responseBody = toDisbursementDTO(disbursement);

    await logAudit({
      tenantId,
      actorType: "api_key",
      actorId: c.var.auth.apiKeyId,
      action: "disbursement.triggered",
      resourceType: "disbursement",
      resourceId: disbursement.id,
      metadata: {
        entityId,
        totalPayablesCount: disbursement.totalPayablesCount,
        totalAmountCents: disbursement.totalAmountCents,
      },
      ipAddress: clientIp(c),
    });

    await db
      .update(idempotencyKeys)
      .set({ responseStatus: 201, responseBody, completedAt: new Date() })
      .where(
        and(
          eq(idempotencyKeys.tenantId, tenantId),
          eq(idempotencyKeys.idempotencyKey, idempotencyKey),
        ),
      );

    return c.json(responseBody, 201);
  },
);

disbursementRoutes.get("/", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const entityId = c.req.query("entityId");
  const status = c.req.query("status");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = (page - 1) * limit;

  type DisbursementStatus = "processing" | "completed" | "failed" | "partial";
  const conditions = [eq(disbursements.tenantId, tenantId), eq(disbursements.environment, environment)];
  if (entityId) conditions.push(eq(disbursements.entityId, entityId));
  if (status) conditions.push(eq(disbursements.status, status as DisbursementStatus));

  const rows = await db
    .select()
    .from(disbursements)
    .where(and(...conditions))
    .orderBy(desc(disbursements.initiatedAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ value: count() })
    .from(disbursements)
    .where(and(...conditions));
  const total = countResult?.value ?? 0;

  return c.json({
    data: rows.map(toDisbursementDTO),
    pagination: { page, limit, total, hasMore: offset + rows.length < total },
  });
});

disbursementRoutes.get("/:id", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [disbursement] = await db
    .select()
    .from(disbursements)
    .where(
      and(
        eq(disbursements.id, id),
        eq(disbursements.tenantId, tenantId),
        eq(disbursements.environment, environment),
      ),
    )
    .limit(1);

  if (!disbursement) throw new NotFoundError("Disbursement");

  // Pull fresh status from Wingspan if still in flight
  const stillInFlight = disbursement.status === "processing";
  const { disbursement: latestDisb, payables: latestPayables } = stillInFlight
    ? await refreshDisbursementStatus(disbursement)
    : {
        disbursement,
        payables: await db.select().from(payables).where(eq(payables.disbursementId, id)),
      };

  // Join contractor info per payable so the UI can show names
  const contractorIds = Array.from(new Set(latestPayables.map((p) => p.contractorId)));
  const contractorRows = contractorIds.length
    ? await db
        .select({
          id: contractors.id,
          firstName: contractors.firstName,
          lastName: contractors.lastName,
          email: contractors.email,
          externalId: contractors.externalId,
        })
        .from(contractors)
        .where(inArray(contractors.id, contractorIds))
    : [];
  const contractorById = Object.fromEntries(contractorRows.map((c) => [c.id, c]));

  return c.json({
    ...toDisbursementDTO(latestDisb),
    payables: latestPayables.map((p) => {
      const co = contractorById[p.contractorId];
      const dto = toPayableDTO(p);
      return {
        ...dto,
        contractor: co
          ? {
              id: co.id,
              firstName: co.firstName,
              lastName: co.lastName,
              email: co.email,
              externalId: co.externalId,
            }
          : null,
      };
    }),
  });
});
