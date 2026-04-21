import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, count } from "@slyncpay/db";
import { createHash } from "crypto";
import { db, payables, engagements, tenantEntities, tenants, contractors, idempotencyKeys } from "@slyncpay/db";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getWingspanClient } from "../lib/wingspan.js";

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
  contractorId: z.string().uuid(),
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
  const { tenantId } = c.var.auth;
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

  // Resolve engagement
  const [engagement] = await db
    .select()
    .from(engagements)
    .where(
      and(
        eq(engagements.tenantId, tenantId),
        eq(engagements.contractorId, body.contractorId),
        eq(engagements.entityId, body.entityId),
      ),
    )
    .limit(1);

  if (!engagement) {
    throw new ValidationError(
      `No engagement found for contractor ${body.contractorId} + entity ${body.entityId}. Call POST /v1/contractors/:id/engagements first.`,
    );
  }

  // Resolve entity child user
  const [entity] = await db
    .select({ wingspanChildUserId: tenantEntities.wingspanChildUserId })
    .from(tenantEntities)
    .where(and(eq(tenantEntities.id, body.entityId), eq(tenantEntities.tenantId, tenantId)))
    .limit(1);

  if (!entity?.wingspanChildUserId) {
    throw new ValidationError("Entity is not yet provisioned");
  }

  const feeAmountCents = calculateFee(body.amountCents, tenant.disbursementFeeBps, tenant.perTxFeeCents);

  // Create payable in Wingspan (entity context)
  const wingspan = getWingspanClient().withChild(entity.wingspanChildUserId);

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

  // Persist payable
  const [payable] = await db
    .insert(payables)
    .values({
      tenantId,
      entityId: body.entityId,
      contractorId: body.contractorId,
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
    })
    .returning();

  if (!payable) throw new Error("Failed to save payable");

  const responseBody = {
    id: payable.id,
    entityId: payable.entityId,
    contractorId: payable.contractorId,
    externalReferenceId: payable.externalReferenceId,
    amountCents: payable.amountCents,
    feeAmountCents: payable.feeAmountCents,
    status: payable.status,
    wingspanPayableId: payable.wingspanPayableId,
    dueDate: payable.dueDate,
    lineItems: payable.lineItems,
    createdAt: payable.createdAt,
  };

  // Complete idempotency record
  await db
    .update(idempotencyKeys)
    .set({ responseStatus: 201, responseBody, completedAt: new Date() })
    .where(and(eq(idempotencyKeys.tenantId, tenantId), eq(idempotencyKeys.idempotencyKey, idempotencyKey)));

  return c.json(responseBody, 201);
});

payableRoutes.get("/", async (c) => {
  const { tenantId } = c.var.auth;
  const entityId = c.req.query("entityId");
  const contractorId = c.req.query("contractorId");
  const status = c.req.query("status");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = (page - 1) * limit;

  type PayableStatus = "draft" | "pending" | "processing" | "paid" | "failed" | "cancelled";
  const conditions = [eq(payables.tenantId, tenantId)];
  if (entityId) conditions.push(eq(payables.entityId, entityId));
  if (contractorId) conditions.push(eq(payables.contractorId, contractorId));
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
    data: rows.map((r) => ({
      id: r.id,
      entityId: r.entityId,
      contractorId: r.contractorId,
      externalReferenceId: r.externalReferenceId,
      amountCents: r.amountCents,
      feeAmountCents: r.feeAmountCents,
      status: r.status,
      dueDate: r.dueDate,
      createdAt: r.createdAt,
      paidAt: r.paidAt,
    })),
    pagination: { page, limit, total, hasMore: offset + rows.length < total },
  });
});

payableRoutes.get("/:id", async (c) => {
  const { tenantId } = c.var.auth;
  const { id } = c.req.param();

  const [payable] = await db
    .select()
    .from(payables)
    .where(and(eq(payables.id, id), eq(payables.tenantId, tenantId)))
    .limit(1);

  if (!payable) throw new NotFoundError("Payable");

  return c.json({
    id: payable.id,
    entityId: payable.entityId,
    contractorId: payable.contractorId,
    engagementId: payable.engagementId,
    externalReferenceId: payable.externalReferenceId,
    amountCents: payable.amountCents,
    feeBps: payable.feeBps,
    perTxFeeCents: payable.perTxFeeCents,
    feeAmountCents: payable.feeAmountCents,
    status: payable.status,
    wingspanPayableId: payable.wingspanPayableId,
    lineItems: payable.lineItems,
    dueDate: payable.dueDate,
    disbursementId: payable.disbursementId,
    createdAt: payable.createdAt,
    updatedAt: payable.updatedAt,
    paidAt: payable.paidAt,
  });
});
