import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, inArray, count } from "@slyncpay/db";
import { createHash } from "crypto";
import { db, disbursements, payables, tenantEntities, idempotencyKeys } from "@slyncpay/db";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getWingspanClient, entityChildUserId } from "../lib/wingspan.js";
import { toDisbursementDTO, toPayableDTO } from "../lib/dto.js";
import { logAudit } from "../lib/audit.js";
import { clientIp } from "../lib/rate-limit.js";

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

  const relatedPayables = await db
    .select()
    .from(payables)
    .where(eq(payables.disbursementId, id));

  return c.json({
    ...toDisbursementDTO(disbursement),
    payables: relatedPayables.map(toPayableDTO),
  });
});
