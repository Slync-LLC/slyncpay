import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, count, inArray } from "@slyncpay/db";
import { db, contractors, engagements, tenantEntities, tenants, payables, disbursements, idempotencyKeys } from "@slyncpay/db";
import { createHash } from "crypto";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError, ConflictError, PlanLimitError, ValidationError } from "../lib/errors.js";
import { getWingspanClient, wingspanUiBaseUrl, hasSandboxConfig, entityChildUserId } from "../lib/wingspan.js";
import { WingspanApiError } from "@slyncpay/wingspan";
import { PLAN_CONFIG } from "@slyncpay/types";
import type { TenantPlan } from "@slyncpay/types";
import { toContractorDTO, toEngagementDTO, toPayableDTO, toDisbursementDTO } from "../lib/dto.js";
import { logAudit } from "../lib/audit.js";
import { clientIp } from "../lib/rate-limit.js";

export const contractorRoutes = new Hono();
contractorRoutes.use("*", authMiddleware);

const createContractorSchema = z.object({
  externalId: z.string().min(1).max(100),
  email: z.string().email(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
  w9Prefill: z
    .object({
      addressLine1: z.string().optional(),
      city: z.string().optional(),
      state: z.string().length(2).optional(),
      postalCode: z.string().optional(),
      country: z.string().default("US"),
    })
    .optional(),
});

contractorRoutes.post("/", zValidator("json", createContractorSchema), async (c) => {
  const { tenantId, environment } = c.var.auth;
  const body = c.req.valid("json");

  // Check plan contractor limit
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new NotFoundError("Tenant");

  const payeeBucketUserId =
    environment === "test"
      ? tenant.wingspanPayeeBucketUserIdSandbox
      : tenant.wingspanPayeeBucketUserId;

  if (!payeeBucketUserId) {
    if (environment === "test" && !hasSandboxConfig()) {
      return c.json(
        { error: "sandbox_not_configured", message: "Sandbox is not enabled on this server." },
        503,
      );
    }
    return c.json(
      {
        error: "provisioning_incomplete",
        message: `${environment === "test" ? "Sandbox" : "Live"} provisioning is not yet complete. Poll /v1/tenant/provisioning-status.`,
      },
      503,
    );
  }

  const planConfig = PLAN_CONFIG[tenant.plan as TenantPlan];
  if (planConfig.maxContractors !== null) {
    const [countResult] = await db
      .select({ value: count() })
      .from(contractors)
      .where(and(eq(contractors.tenantId, tenantId), eq(contractors.environment, environment)));
    const contractorCount = countResult?.value ?? 0;

    if (contractorCount >= planConfig.maxContractors) {
      throw new PlanLimitError(
        `Your ${tenant.plan} plan allows a maximum of ${planConfig.maxContractors} contractors.`,
      );
    }
  }

  // Check duplicate externalId (within this env)
  const [existing] = await db
    .select({ id: contractors.id })
    .from(contractors)
    .where(
      and(
        eq(contractors.tenantId, tenantId),
        eq(contractors.environment, environment),
        eq(contractors.externalId, body.externalId),
      ),
    )
    .limit(1);

  if (existing) throw new ConflictError(`Contractor with externalId ${body.externalId} already exists`);

  // Call Wingspan: POST /payments/payee from Payee Bucket context
  const wingspan = getWingspanClient(environment).withChild(payeeBucketUserId);

  const wingspanPayee = await wingspan.createPayee({
    email: body.email,
    ...(body.firstName ? { firstName: body.firstName } : {}),
    ...(body.lastName ? { lastName: body.lastName } : {}),
    payeeExternalId: body.externalId,
    status: "Active",
    ...(body.w9Prefill
      ? {
          payeeW9Data: {
            country: body.w9Prefill.country,
            ...(body.w9Prefill.addressLine1 ? { addressLine1: body.w9Prefill.addressLine1 } : {}),
            ...(body.w9Prefill.city ? { city: body.w9Prefill.city } : {}),
            ...(body.w9Prefill.state ? { state: body.w9Prefill.state } : {}),
            ...(body.w9Prefill.postalCode ? { postalCode: body.w9Prefill.postalCode } : {}),
          },
        }
      : {}),
  });

  // Save contractor with Wingspan IDs
  const [contractor] = await db
    .insert(contractors)
    .values({
      tenantId,
      externalId: body.externalId,
      email: body.email,
      firstName: body.firstName ?? null,
      lastName: body.lastName ?? null,
      onboardingStatus: "invited",
      wingspanPayeeBucketPayeeId: wingspanPayee.payeeId,
      wingspanUserId: wingspanPayee.user.userId,
      environment,
      metadata: body.metadata ?? {},
      w9SeededData: body.w9Prefill ?? null,
    })
    .returning();

  if (!contractor) throw new Error("Failed to create contractor");

  // Get a session token for an immediate embedded-onboarding URL. The URL is
  // iframe-safe and the tenant can drop it directly into <iframe src=...>.
  // Falls back to null if Wingspan rejects the session call — caller can
  // refetch via GET /v1/contractors/:id/onboarding-link.
  let embeddedOnboardingUrl: string | null = null;
  let embeddedOnboardingExpiresAt: string | null = null;
  try {
    const session = await getWingspanClient(environment).getSessionToken(wingspanPayee.user.userId);
    const baseUi = wingspanUiBaseUrl(environment);
    embeddedOnboardingUrl = `${baseUi}/member/onboarding?requestingToken=${session.requestingToken}`;
    embeddedOnboardingExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  } catch {
    // Non-fatal
  }

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "contractor.created",
    resourceType: "contractor",
    resourceId: contractor.id,
    metadata: { email: contractor.email, externalId: contractor.externalId },
    ipAddress: clientIp(c),
  });

  return c.json(
    {
      ...toContractorDTO(contractor),
      embeddedOnboardingUrl,
      embeddedOnboardingExpiresAt,
    },
    201,
  );
});

contractorRoutes.get("/", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const status = c.req.query("status");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = (page - 1) * limit;

  type ContractorStatus = "invited" | "w9_pending" | "payout_pending" | "active" | "inactive";
  const conditions = [eq(contractors.tenantId, tenantId), eq(contractors.environment, environment)];
  if (status) {
    conditions.push(eq(contractors.onboardingStatus, status as ContractorStatus));
  }

  const rows = await db
    .select()
    .from(contractors)
    .where(and(...conditions))
    .orderBy(desc(contractors.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ value: count() })
    .from(contractors)
    .where(and(...conditions));
  const total = countResult?.value ?? 0;

  return c.json({
    data: rows.map(toContractorDTO),
    pagination: { page, limit, total, hasMore: offset + rows.length < total },
  });
});

contractorRoutes.get("/:id", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [contractor] = await db
    .select()
    .from(contractors)
    .where(
      and(
        eq(contractors.id, id),
        eq(contractors.tenantId, tenantId),
        eq(contractors.environment, environment),
      ),
    )
    .limit(1);

  if (!contractor) throw new NotFoundError("Contractor");

  return c.json(toContractorDTO(contractor));
});

const updateContractorSchema = z.object({
  firstName: z.string().max(100).nullish(),
  lastName: z.string().max(100).nullish(),
  metadata: z.record(z.unknown()).optional(),
  onboardingStatus: z.enum(["invited", "w9_pending", "payout_pending", "active", "inactive"]).optional(),
});

contractorRoutes.patch("/:id", zValidator("json", updateContractorSchema), async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();
  const body = c.req.valid("json");

  const [existing] = await db
    .select({ id: contractors.id })
    .from(contractors)
    .where(
      and(
        eq(contractors.id, id),
        eq(contractors.tenantId, tenantId),
        eq(contractors.environment, environment),
      ),
    )
    .limit(1);
  if (!existing) throw new NotFoundError("Contractor");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.firstName !== undefined) updates["firstName"] = body.firstName ?? null;
  if (body.lastName !== undefined) updates["lastName"] = body.lastName ?? null;
  if (body.metadata !== undefined) updates["metadata"] = body.metadata;
  if (body.onboardingStatus !== undefined) updates["onboardingStatus"] = body.onboardingStatus;

  const [updated] = await db
    .update(contractors)
    .set(updates)
    .where(eq(contractors.id, id))
    .returning();
  if (!updated) throw new Error("Failed to update contractor");

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "contractor.updated",
    resourceType: "contractor",
    resourceId: id,
    metadata: { fields: Object.keys(updates).filter((k) => k !== "updatedAt") },
    ipAddress: clientIp(c),
  });

  return c.json(toContractorDTO(updated));
});

contractorRoutes.delete("/:id", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [contractor] = await db
    .select({ id: contractors.id, email: contractors.email })
    .from(contractors)
    .where(
      and(
        eq(contractors.id, id),
        eq(contractors.tenantId, tenantId),
        eq(contractors.environment, environment),
      ),
    )
    .limit(1);
  if (!contractor) throw new NotFoundError("Contractor");

  const [[eng], [pay]] = await Promise.all([
    db.select({ n: count() }).from(engagements).where(eq(engagements.contractorId, id)),
    db.select({ n: count() }).from(payables).where(eq(payables.contractorId, id)),
  ]);
  const refs = Number(eng?.n ?? 0) + Number(pay?.n ?? 0);
  if (refs > 0) {
    return c.json(
      {
        error: "has_references",
        message: "Cannot delete contractor with engagements or payables. Mark them inactive instead.",
      },
      409,
    );
  }

  await db.delete(contractors).where(eq(contractors.id, id));

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "contractor.deleted",
    resourceType: "contractor",
    resourceId: id,
    metadata: { email: contractor.email, environment },
    ipAddress: clientIp(c),
  });

  return c.json({ ok: true });
});

contractorRoutes.get("/:id/onboarding-link", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [contractor] = await db
    .select({ wingspanUserId: contractors.wingspanUserId })
    .from(contractors)
    .where(
      and(
        eq(contractors.id, id),
        eq(contractors.tenantId, tenantId),
        eq(contractors.environment, environment),
      ),
    )
    .limit(1);

  if (!contractor) throw new NotFoundError("Contractor");
  if (!contractor.wingspanUserId) {
    return c.json({ error: "not_ready", message: "Contractor does not have an onboarding account yet" }, 422);
  }

  const session = await getWingspanClient(environment).getSessionToken(contractor.wingspanUserId);
  const baseUi = wingspanUiBaseUrl(environment);

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 60 min
  const embeddedOnboardingUrl = `${baseUi}/member/onboarding?requestingToken=${session.requestingToken}`;

  return c.json({
    embeddedOnboardingUrl,
    expiresAt,
    // Keep `url` for backwards compatibility — same value
    url: embeddedOnboardingUrl,
  });
});

// ─── Engagements (contractor ↔ entity) ────────────────────────────────────────

contractorRoutes.post("/:id/engagements", zValidator("json", z.object({ entityId: z.string().uuid() })), async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id: contractorId } = c.req.param();
  const { entityId } = c.req.valid("json");

  // Validate contractor belongs to tenant (in this env)
  const [contractor] = await db
    .select()
    .from(contractors)
    .where(
      and(
        eq(contractors.id, contractorId),
        eq(contractors.tenantId, tenantId),
        eq(contractors.environment, environment),
      ),
    )
    .limit(1);
  if (!contractor) throw new NotFoundError("Contractor");

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
    return c.json(
      { error: "entity_not_provisioned", message: "Entity is not yet provisioned" },
      422,
    );
  }

  // Check for existing engagement (idempotent) — scoped by env
  const [existingEngagement] = await db
    .select()
    .from(engagements)
    .where(
      and(
        eq(engagements.contractorId, contractorId),
        eq(engagements.entityId, entityId),
        eq(engagements.environment, environment),
      ),
    )
    .limit(1);

  if (existingEngagement) {
    return c.json(toEngagementDTO(existingEngagement, { entityName: entity.name }));
  }

  // Call Wingspan: POST /payments/payee from entity context (env-specific)
  const wingspan = getWingspanClient(environment).withChild(childUserId);

  let wingspanPayee;
  try {
    wingspanPayee = await wingspan.createPayee({
      email: contractor.email,
      payeeExternalId: contractor.externalId,
      status: "Active",
    });
  } catch (err) {
    // 409 = relationship already exists in Wingspan — safe to recover
    if (err instanceof WingspanApiError && err.statusCode === 409) {
      return c.json({ error: "already_exists", message: "Engagement already exists in payment system" }, 409);
    }
    throw err;
  }

  // Extract payerPayeeEngagementId from requirements array
  const engagementId =
    wingspanPayee.requirements?.[0]?.payerPayeeEngagementIds?.[0];

  if (!engagementId) {
    throw new Error("Wingspan did not return a payerPayeeEngagementId — cannot create payables for this contractor+entity pair");
  }

  const [engagement] = await db
    .insert(engagements)
    .values({
      tenantId,
      contractorId,
      entityId,
      wingspanPayerPayeeEngagementId: engagementId,
      wingspanEntityPayeeId: wingspanPayee.payeeId,
      status: "active",
      environment,
    })
    .returning();

  if (!engagement) throw new Error("Failed to save engagement");

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "contractor.engagement.created",
    resourceType: "engagement",
    resourceId: engagement.id,
    metadata: { contractorId, entityId, entityName: entity.name },
    ipAddress: clientIp(c),
  });

  return c.json(toEngagementDTO(engagement, { entityName: entity.name }), 201);
});

contractorRoutes.get("/:id/engagements", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id: contractorId } = c.req.param();

  const [contractor] = await db
    .select({ id: contractors.id })
    .from(contractors)
    .where(
      and(
        eq(contractors.id, contractorId),
        eq(contractors.tenantId, tenantId),
        eq(contractors.environment, environment),
      ),
    )
    .limit(1);
  if (!contractor) throw new NotFoundError("Contractor");

  const rows = await db
    .select({
      id: engagements.id,
      contractorId: engagements.contractorId,
      entityId: engagements.entityId,
      entityName: tenantEntities.name,
      status: engagements.status,
      createdAt: engagements.createdAt,
    })
    .from(engagements)
    .innerJoin(tenantEntities, eq(engagements.entityId, tenantEntities.id))
    .where(and(eq(engagements.contractorId, contractorId), eq(engagements.environment, environment)));

  return c.json(rows.map((r) => toEngagementDTO(r, { entityName: r.entityName })));
});

// ─── Pay now: create payable + immediately trigger entity-wide disbursement ───
//
// Per the underlying processor's API, a "single payable pay" endpoint does not
// exist. The pay-approved sweep operates on the entity's whole pending pool.
// This endpoint composes both calls server-side and surfaces a 409 if other
// pending payables would be unintentionally included, so the caller can
// confirm explicitly.

const payNowLineItemSchema = z.object({
  description: z.string().max(500).optional(),
  amountCents: z.number().int().positive(),
  quantity: z.number().positive().optional(),
  unit: z.string().max(50).optional(),
});

const payNowSchema = z.object({
  entityId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  lineItems: z.array(payNowLineItemSchema).min(1).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  externalReferenceId: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  confirmIncludesOtherPending: z.boolean().optional(),
});

function calculateFee(amountCents: number, feeBps: number, perTxFeeCents: number): number {
  return Math.round(amountCents * (feeBps / 10000)) + perTxFeeCents;
}

contractorRoutes.post(
  "/:id/pay-now",
  zValidator("json", payNowSchema),
  async (c) => {
    const { tenantId, apiKeyId, environment } = c.var.auth;
    const { id: contractorId } = c.req.param();
    const body = c.req.valid("json");
    const idempotencyKey = c.req.header("Idempotency-Key");

    if (!idempotencyKey) {
      throw new ValidationError("Idempotency-Key header is required for pay-now");
    }

    // Idempotency replay check
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ contractorId, environment, ...body }))
      .digest("hex");
    const [existingKey] = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.tenantId, tenantId), eq(idempotencyKeys.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (existingKey?.completedAt && existingKey.responseBody) {
      return c.json(existingKey.responseBody as Record<string, unknown>, (existingKey.responseStatus ?? 200) as 200);
    }
    await db
      .insert(idempotencyKeys)
      .values({
        tenantId,
        idempotencyKey,
        requestPath: `/v1/contractors/${contractorId}/pay-now`,
        requestHash,
        lockedAt: new Date(),
      })
      .onConflictDoNothing();

    // Validate contractor + entity ownership and engagement (in this env)
    const [contractor] = await db
      .select()
      .from(contractors)
      .where(
        and(
          eq(contractors.id, contractorId),
          eq(contractors.tenantId, tenantId),
          eq(contractors.environment, environment),
        ),
      )
      .limit(1);
    if (!contractor) throw new NotFoundError("Contractor");

    const [entity] = await db
      .select()
      .from(tenantEntities)
      .where(
        and(
          eq(tenantEntities.id, body.entityId),
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

    const [engagement] = await db
      .select()
      .from(engagements)
      .where(
        and(
          eq(engagements.tenantId, tenantId),
          eq(engagements.contractorId, contractorId),
          eq(engagements.entityId, body.entityId),
          eq(engagements.environment, environment),
        ),
      )
      .limit(1);
    if (!engagement) {
      throw new ValidationError(
        "No engagement found for this contractor and entity. Attach the contractor to the entity first.",
      );
    }

    // Inspect pending pool for this entity (env-scoped)
    const existingPending = await db
      .select({
        id: payables.id,
        amountCents: payables.amountCents,
        feeAmountCents: payables.feeAmountCents,
        contractorId: payables.contractorId,
        externalReferenceId: payables.externalReferenceId,
        engagementId: payables.engagementId,
        entityId: payables.entityId,
        status: payables.status,
        dueDate: payables.dueDate,
        createdAt: payables.createdAt,
      })
      .from(payables)
      .where(
        and(
          eq(payables.tenantId, tenantId),
          eq(payables.entityId, body.entityId),
          eq(payables.environment, environment),
          eq(payables.status, "pending"),
        ),
      );

    if (existingPending.length > 0 && !body.confirmIncludesOtherPending) {
      const totalOthers = existingPending.reduce((sum, p) => sum + p.amountCents, 0);
      return c.json(
        {
          error: "other_pending_payables",
          message:
            "This entity has other pending payables that would be paid in the same batch. " +
            "Resubmit with confirmIncludesOtherPending=true to proceed.",
          pendingPayables: existingPending.map((p) => toPayableDTO(p)),
          totalAmountCents: totalOthers,
        },
        409,
      );
    }

    // Resolve fees
    const [tenantRow] = await db
      .select({ disbursementFeeBps: tenants.disbursementFeeBps, perTxFeeCents: tenants.perTxFeeCents })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenantRow) throw new NotFoundError("Tenant");

    const feeAmountCents = calculateFee(body.amountCents, tenantRow.disbursementFeeBps, tenantRow.perTxFeeCents);
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = body.dueDate ?? today;
    const lineItems =
      body.lineItems ??
      [
        {
          description: body.description ?? `Payment to ${contractor.firstName ?? ""} ${contractor.lastName ?? ""}`.trim(),
          amountCents: body.amountCents,
        },
      ];

    // 1. Create payable in the payment processor (env-specific child)
    const wingspan = getWingspanClient(environment).withChild(childUserId);
    const processorPayable = await wingspan.createPayable({
      collaboratorId: engagement.wingspanPayerPayeeEngagementId,
      dueDate,
      ...(body.externalReferenceId ? { referenceId: body.externalReferenceId } : {}),
      lineItems: lineItems.map((li) => ({
        totalCost: li.amountCents / 100,
        ...(li.description ? { description: li.description } : {}),
        ...(li.quantity ? { quantity: li.quantity, costPerUnit: li.amountCents / 100 / li.quantity } : {}),
        ...(li.unit ? { unit: li.unit } : {}),
      })),
    });

    const [payable] = await db
      .insert(payables)
      .values({
        tenantId,
        entityId: body.entityId,
        contractorId,
        engagementId: engagement.id,
        externalReferenceId: body.externalReferenceId ?? null,
        amountCents: body.amountCents,
        dueDate,
        feeBps: tenantRow.disbursementFeeBps,
        perTxFeeCents: tenantRow.perTxFeeCents,
        feeAmountCents,
        status: "pending",
        wingspanPayableId: processorPayable.payableId,
        lineItems,
        metadata: {},
        environment,
      })
      .returning();

    if (!payable) throw new Error("Failed to save payable");

    // 2. Sweep all pending payables for the entity (which now includes the new one)
    const sweepIds = [...existingPending.map((p) => p.id), payable.id];
    const totalAmountCents = existingPending.reduce((s, p) => s + p.amountCents, 0) + body.amountCents;
    const totalFeesCents =
      existingPending.reduce((s, p) => s + p.feeAmountCents, 0) + feeAmountCents;

    const [disbursement] = await db
      .insert(disbursements)
      .values({
        tenantId,
        entityId: body.entityId,
        status: "processing",
        totalPayablesCount: sweepIds.length,
        totalAmountCents,
        totalFeesCents,
        environment,
      })
      .returning();
    if (!disbursement) throw new Error("Failed to create disbursement");

    await db
      .update(payables)
      .set({ disbursementId: disbursement.id, status: "processing", updatedAt: new Date() })
      .where(
        and(
          eq(payables.tenantId, tenantId),
          eq(payables.entityId, body.entityId),
          inArray(payables.id, sweepIds),
        ),
      );

    const batchResult = await wingspan.payApproved();
    await db
      .update(disbursements)
      .set({ wingspanBulkBatchId: batchResult.bulkPayrollBatchId })
      .where(eq(disbursements.id, disbursement.id));

    // Audit log for both events
    await logAudit({
      tenantId,
      actorType: "api_key",
      actorId: apiKeyId,
      action: "payable.pay_now",
      resourceType: "payable",
      resourceId: payable.id,
      metadata: {
        contractorId,
        entityId: body.entityId,
        amountCents: body.amountCents,
        includedOtherPending: existingPending.length,
        disbursementId: disbursement.id,
      },
      ipAddress: clientIp(c),
    });
    await logAudit({
      tenantId,
      actorType: "api_key",
      actorId: apiKeyId,
      action: "disbursement.triggered",
      resourceType: "disbursement",
      resourceId: disbursement.id,
      metadata: { entityId: body.entityId, totalPayablesCount: sweepIds.length, totalAmountCents },
      ipAddress: clientIp(c),
    });

    const responseBody = {
      payable: toPayableDTO(payable),
      disbursement: toDisbursementDTO({
        ...disbursement,
        totalAmountCents,
        totalFeesCents,
      }),
      includedPayables: [...existingPending, payable].map((p) => toPayableDTO(p)),
    };

    await db
      .update(idempotencyKeys)
      .set({ responseStatus: 200, responseBody, completedAt: new Date() })
      .where(and(eq(idempotencyKeys.tenantId, tenantId), eq(idempotencyKeys.idempotencyKey, idempotencyKey)));

    return c.json(responseBody, 200);
  },
);

