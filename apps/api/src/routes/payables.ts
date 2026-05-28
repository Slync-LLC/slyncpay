import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, count } from "@slyncpay/db";
import { createHash } from "crypto";
import { db, payables, engagements, tenantEntities, tenants, workers, idempotencyKeys } from "@slyncpay/db";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getWingspanClient, entityChildUserId } from "../lib/wingspan.js";
import { toPayableDTO } from "../lib/dto.js";
import { logAudit } from "../lib/audit.js";
import { clientIp } from "../lib/rate-limit.js";

export const payableRoutes = new Hono();
payableRoutes.use("*", authMiddleware);

const lineItemSchema = z.object({
  description: z.string().max(500).optional(),
  amountCents: z.number().int().positive(),
  quantity: z.number().positive().optional(),
  unit: z.string().max(50).optional(),
  metadata: z.record(z.string()).optional(),
});

const createPayableSchema = z.object({
  entityId: z.string().uuid(),
  workerId: z.string().uuid(),
  externalReferenceId: z.string().max(200).optional(),
  amountCents: z.number().int().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate must be YYYY-MM-DD"),
  lineItems: z.array(lineItemSchema).min(1),
  metadata: z.record(z.unknown()).optional(),
});

function calculateFee(amountCents: number, feeBps: number, perTxFeeCents: number): number {
  return Math.round(amountCents * (feeBps / 10000)) + perTxFeeCents;
}

payableRoutes.post("/", zValidator("json", createPayableSchema), async (c) => {
  const { tenantId, environment } = c.var.auth;
  const body = c.req.valid("json");
  const idempotencyKey = c.req.header("Idempotency-Key");

  if (!idempotencyKey) {
    throw new ValidationError("Idempotency-Key header is required for payable creation");
  }

  // Check idempotency cache
  const requestHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const [existingKey] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.tenantId, tenantId), eq(idempotencyKeys.idempotencyKey, idempotencyKey)))
    .limit(1);

  if (existingKey?.completedAt && existingKey.responseBody) {
    return c.json(existingKey.responseBody as Record<string, unknown>, existingKey.responseStatus as 201);
  }

  // Lock idempotency key
  await db
    .insert(idempotencyKeys)
    .values({
      tenantId,
      idempotencyKey,
      requestPath: "/v1/payables",
      requestHash,
      lockedAt: new Date(),
    })
    .onConflictDoNothing();

  // Resolve tenant fee config
  const [tenant] = await db
    .select({ disbursementFeeBps: tenants.disbursementFeeBps, perTxFeeCents: tenants.perTxFeeCents })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) throw new NotFoundError("Tenant");

  // Worker must be fully onboarded before they can be paid
  const [worker] = await db
    .select({ id: workers.id, onboardingStatus: workers.onboardingStatus })
    .from(workers)
    .where(
      and(
        eq(workers.id, body.workerId),
        eq(workers.tenantId, tenantId),
        eq(workers.environment, environment),
      ),
    )
    .limit(1);

  if (!worker) throw new NotFoundError("Worker");
  if (worker.onboardingStatus !== "active") {
    throw new ValidationError(
      `Worker onboarding is not complete (status: ${worker.onboardingStatus}). They must finish W-9 and payout setup before they can be paid.`,
    );
  }

  // Resolve engagement (env-scoped)
  const [engagement] = await db
    .select()
    .from(engagements)
    .where(
      and(
        eq(engagements.tenantId, tenantId),
        eq(engagements.workerId, body.workerId),
        eq(engagements.entityId, body.entityId),
        eq(engagements.environment, environment),
      ),
    )
    .limit(1);

  if (!engagement) {
    throw new ValidationError(
      `No engagement found for worker ${body.workerId} + entity ${body.entityId}. Call POST /v1/workers/:id/engagements first.`,
    );
  }

  // Resolve env-scoped entity child user (each entity belongs to one env now)
  const [entity] = await db
    .select({
      wingspanChildUserId: tenantEntities.wingspanChildUserId,
      wingspanChildUserIdSandbox: tenantEntities.wingspanChildUserIdSandbox,
    })
    .from(tenantEntities)
    .where(
      and(
        eq(tenantEntities.id, body.entityId),
        eq(tenantEntities.tenantId, tenantId),
        eq(tenantEntities.environment, environment),
      ),
    )
    .limit(1);

  if (!entity) {
    throw new ValidationError("Entity not found");
  }
  const childUserId = entityChildUserId(entity, environment);
  if (!childUserId) {
    throw new ValidationError("Entity is not yet provisioned");
  }

  const feeAmountCents = calculateFee(body.amountCents, tenant.disbursementFeeBps, tenant.perTxFeeCents);

  // Create payable in Wingspan (entity context, env-specific)
  const wingspan = getWingspanClient(environment).withChild(childUserId);

  const wingspanPayable = await wingspan.createPayable({
    collaboratorId: engagement.wingspanPayerPayeeEngagementId,
    dueDate: body.dueDate,
    ...(body.externalReferenceId ? { referenceId: body.externalReferenceId } : {}),
    lineItems: body.lineItems.map((li) => ({
      totalCost: li.amountCents / 100,
      ...(li.description ? { description: li.description } : {}),
      ...(li.quantity ? { quantity: li.quantity, costPerUnit: li.amountCents / 100 / li.quantity } : {}),
      ...(li.unit ? { unit: li.unit } : {}),
      ...(li.metadata ? { labels: li.metadata } : {}),
    })),
  });

  // Approve immediately so the next pay-approved sweep picks it up. SlyncPay is
  // the source of truth; the tenant approved by calling our API.
  try {
    await wingspan.approvePayable(wingspanPayable.payableId);
  } catch (err) {
    console.error(`[payable.approve] Failed to approve ${wingspanPayable.payableId}:`, (err as Error).message);
  }

  // Persist payable
  const [payable] = await db
    .insert(payables)
    .values({
      tenantId,
      entityId: body.entityId,
      workerId: body.workerId,
      engagementId: engagement.id,
      externalReferenceId: body.externalReferenceId ?? null,
      amountCents: body.amountCents,
      dueDate: body.dueDate,
      feeBps: tenant.disbursementFeeBps,
      perTxFeeCents: tenant.perTxFeeCents,
      feeAmountCents,
      status: "pending",
      wingspanPayableId: wingspanPayable.payableId,
      lineItems: body.lineItems,
      metadata: body.metadata ?? {},
      environment,
    })
    .returning();

  if (!payable) throw new Error("Failed to save payable");

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "payable.created",
    resourceType: "payable",
    resourceId: payable.id,
    metadata: {
      workerId: body.workerId,
      entityId: body.entityId,
      amountCents: body.amountCents,
    },
    ipAddress: clientIp(c),
  });

  const responseBody = toPayableDTO(payable);

  await db
    .update(idempotencyKeys)
    .set({ responseStatus: 201, responseBody, completedAt: new Date() })
    .where(and(eq(idempotencyKeys.tenantId, tenantId), eq(idempotencyKeys.idempotencyKey, idempotencyKey)));

  return c.json(responseBody, 201);
});

payableRoutes.get("/", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const entityId = c.req.query("entityId");
  const workerId = c.req.query("workerId");
  const status = c.req.query("status");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = (page - 1) * limit;

  type PayableStatus = "draft" | "pending" | "processing" | "paid" | "failed" | "cancelled";
  const conditions = [eq(payables.tenantId, tenantId), eq(payables.environment, environment)];
  if (entityId) conditions.push(eq(payables.entityId, entityId));
  if (workerId) conditions.push(eq(payables.workerId, workerId));
  if (status) conditions.push(eq(payables.status, status as PayableStatus));

  const rows = await db
    .select()
    .from(payables)
    .where(and(...conditions))
    .orderBy(desc(payables.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ value: count() })
    .from(payables)
    .where(and(...conditions));
  const total = countResult?.value ?? 0;

  return c.json({
    data: rows.map(toPayableDTO),
    pagination: { page, limit, total, hasMore: offset + rows.length < total },
  });
});

payableRoutes.get("/:id", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [payable] = await db
    .select()
    .from(payables)
    .where(
      and(eq(payables.id, id), eq(payables.tenantId, tenantId), eq(payables.environment, environment)),
    )
    .limit(1);

  if (!payable) throw new NotFoundError("Payable");

  return c.json(toPayableDTO(payable));
});
