import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, count } from "@slyncpay/db";
import { db, contractors, engagements, tenantEntities, tenants } from "@slyncpay/db";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError, ConflictError, PlanLimitError } from "../lib/errors.js";
import { getWingspanClient } from "../lib/wingspan.js";
import { WingspanApiError } from "@slyncpay/wingspan";
import { PLAN_CONFIG } from "@slyncpay/types";
import type { TenantPlan } from "@slyncpay/types";

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
  const { tenantId } = c.var.auth;
  const body = c.req.valid("json");

  // Check plan contractor limit
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new NotFoundError("Tenant");
  if (!tenant.wingspanPayeeBucketUserId) {
    return c.json({ error: "provisioning_incomplete", message: "Tenant provisioning is not yet complete. Poll /v1/tenant/provisioning-status." }, 503);
  }

  const planConfig = PLAN_CONFIG[tenant.plan as TenantPlan];
  if (planConfig.maxContractors !== null) {
    const [countResult] = await db
      .select({ value: count() })
      .from(contractors)
      .where(eq(contractors.tenantId, tenantId));
    const contractorCount = countResult?.value ?? 0;

    if (contractorCount >= planConfig.maxContractors) {
      throw new PlanLimitError(
        `Your ${tenant.plan} plan allows a maximum of ${planConfig.maxContractors} contractors.`,
      );
    }
  }

  // Check duplicate externalId
  const [existing] = await db
    .select({ id: contractors.id })
    .from(contractors)
    .where(and(eq(contractors.tenantId, tenantId), eq(contractors.externalId, body.externalId)))
    .limit(1);

  if (existing) throw new ConflictError(`Contractor with externalId ${body.externalId} already exists`);

  // Call Wingspan: POST /payments/payee from Payee Bucket context
  const wingspan = getWingspanClient().withChild(tenant.wingspanPayeeBucketUserId);

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
      metadata: body.metadata ?? {},
      w9SeededData: body.w9Prefill ?? null,
    })
    .returning();

  if (!contractor) throw new Error("Failed to create contractor");

  // Get a session token for immediate onboarding link
  let onboardingUrl: string | null = null;
  try {
    const session = await getWingspanClient().getSessionToken(wingspanPayee.user.userId);
    const baseUi =
      process.env["WINGSPAN_BASE_URL"]?.includes("staging")
        ? "https://staging-my.wingspan.app"
        : "https://my.wingspan.app";
    onboardingUrl = `${baseUi}/member/onboarding?requestingToken=${session.requestingToken}`;
  } catch {
    // Non-fatal — tenant can fetch a fresh link via GET /contractors/:id/onboarding-link
  }

  return c.json(
    {
      id: contractor.id,
      externalId: contractor.externalId,
      email: contractor.email,
      firstName: contractor.firstName,
      lastName: contractor.lastName,
      onboardingStatus: contractor.onboardingStatus,
      wingspanUserId: contractor.wingspanUserId,
      onboardingUrl,
      createdAt: contractor.createdAt,
    },
    201,
  );
});

contractorRoutes.get("/", async (c) => {
  const { tenantId } = c.var.auth;
  const status = c.req.query("status");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = (page - 1) * limit;

  type ContractorStatus = "invited" | "w9_pending" | "payout_pending" | "active" | "inactive";
  const conditions = [eq(contractors.tenantId, tenantId)];
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
    data: rows.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      onboardingStatus: r.onboardingStatus,
      createdAt: r.createdAt,
    })),
    pagination: { page, limit, total, hasMore: offset + rows.length < total },
  });
});

contractorRoutes.get("/:id", async (c) => {
  const { tenantId } = c.var.auth;
  const { id } = c.req.param();

  const [contractor] = await db
    .select()
    .from(contractors)
    .where(and(eq(contractors.id, id), eq(contractors.tenantId, tenantId)))
    .limit(1);

  if (!contractor) throw new NotFoundError("Contractor");

  return c.json({
    id: contractor.id,
    externalId: contractor.externalId,
    email: contractor.email,
    firstName: contractor.firstName,
    lastName: contractor.lastName,
    onboardingStatus: contractor.onboardingStatus,
    wingspanUserId: contractor.wingspanUserId,
    metadata: contractor.metadata,
    createdAt: contractor.createdAt,
    updatedAt: contractor.updatedAt,
  });
});

contractorRoutes.get("/:id/onboarding-link", async (c) => {
  const { tenantId } = c.var.auth;
  const { id } = c.req.param();

  const [contractor] = await db
    .select({ wingspanUserId: contractors.wingspanUserId })
    .from(contractors)
    .where(and(eq(contractors.id, id), eq(contractors.tenantId, tenantId)))
    .limit(1);

  if (!contractor) throw new NotFoundError("Contractor");
  if (!contractor.wingspanUserId) {
    return c.json({ error: "not_ready", message: "Contractor does not have a Wingspan account yet" }, 422);
  }

  const session = await getWingspanClient().getSessionToken(contractor.wingspanUserId);
  const baseUi =
    process.env["WINGSPAN_BASE_URL"]?.includes("staging")
      ? "https://staging-my.wingspan.app"
      : "https://my.wingspan.app";

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 60 min

  return c.json({
    url: `${baseUi}/member/onboarding?requestingToken=${session.requestingToken}`,
    expiresAt,
  });
});

// ─── Engagements (contractor ↔ entity) ────────────────────────────────────────

contractorRoutes.post("/:id/engagements", zValidator("json", z.object({ entityId: z.string().uuid() })), async (c) => {
  const { tenantId } = c.var.auth;
  const { id: contractorId } = c.req.param();
  const { entityId } = c.req.valid("json");

  // Validate contractor belongs to tenant
  const [contractor] = await db
    .select()
    .from(contractors)
    .where(and(eq(contractors.id, contractorId), eq(contractors.tenantId, tenantId)))
    .limit(1);
  if (!contractor) throw new NotFoundError("Contractor");

  // Validate entity belongs to tenant and is active
  const [entity] = await db
    .select()
    .from(tenantEntities)
    .where(and(eq(tenantEntities.id, entityId), eq(tenantEntities.tenantId, tenantId)))
    .limit(1);
  if (!entity) throw new NotFoundError("Entity");
  if (!entity.wingspanChildUserId) {
    return c.json({ error: "entity_not_provisioned", message: "Entity is not yet provisioned" }, 422);
  }

  // Check for existing engagement (idempotent)
  const [existingEngagement] = await db
    .select()
    .from(engagements)
    .where(
      and(
        eq(engagements.contractorId, contractorId),
        eq(engagements.entityId, entityId),
      ),
    )
    .limit(1);

  if (existingEngagement) {
    return c.json({
      id: existingEngagement.id,
      contractorId,
      entityId,
      wingspanPayerPayeeEngagementId: existingEngagement.wingspanPayerPayeeEngagementId,
      status: existingEngagement.status,
      createdAt: existingEngagement.createdAt,
    });
  }

  // Call Wingspan: POST /payments/payee from entity context
  const wingspan = getWingspanClient().withChild(entity.wingspanChildUserId);

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
    })
    .returning();

  if (!engagement) throw new Error("Failed to save engagement");

  return c.json(
    {
      id: engagement.id,
      contractorId,
      entityId,
      wingspanPayerPayeeEngagementId: engagement.wingspanPayerPayeeEngagementId,
      status: engagement.status,
      createdAt: engagement.createdAt,
    },
    201,
  );
});

contractorRoutes.get("/:id/engagements", async (c) => {
  const { tenantId } = c.var.auth;
  const { id: contractorId } = c.req.param();

  const [contractor] = await db
    .select({ id: contractors.id })
    .from(contractors)
    .where(and(eq(contractors.id, contractorId), eq(contractors.tenantId, tenantId)))
    .limit(1);
  if (!contractor) throw new NotFoundError("Contractor");

  const rows = await db
    .select({
      id: engagements.id,
      entityId: engagements.entityId,
      entityName: tenantEntities.name,
      status: engagements.status,
      createdAt: engagements.createdAt,
    })
    .from(engagements)
    .innerJoin(tenantEntities, eq(engagements.entityId, tenantEntities.id))
    .where(eq(engagements.contractorId, contractorId));

  return c.json(rows);
});
