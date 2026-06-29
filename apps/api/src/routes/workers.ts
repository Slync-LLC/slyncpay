import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, count, inArray } from "@slyncpay/db";
import { db, workers, engagements, tenantEntities, tenants, payables, disbursements, idempotencyKeys, worksites, engagementTemplates } from "@slyncpay/db";
import { createHash } from "crypto";
import { encrypt as encryptSecret, decrypt as decryptSecret, ssnLast4 } from "../lib/crypto.js";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError, ConflictError, PlanLimitError, ValidationError } from "../lib/errors.js";
import {
  getWingspanClient,
  getWingspanV3Client,
  wingspanOnboardingUrl,
  wingspanEmbedBaseUrl,
  hasSandboxConfig,
  hasV3Config,
  entityChildUserId,
  entityV3AccountId,
} from "../lib/wingspan.js";
import {
  repairWorkerWingspanUserId,
  syncWorkerToWingspan,
  syncWorkerProfileToWingspan,
} from "../lib/worker-repair.js";
import { runLowFrictionOnboarding } from "../lib/onboarding.js";
import { WingspanApiError } from "@slyncpay/wingspan";
import { PLAN_CONFIG } from "@slyncpay/types";
import type { TenantPlan } from "@slyncpay/types";
import { toWorkerDTO, toEngagementDTO, toPayableDTO, toDisbursementDTO } from "../lib/dto.js";
import { logAudit } from "../lib/audit.js";
import { clientIp } from "../lib/rate-limit.js";

export const workerRoutes = new Hono();
workerRoutes.use("*", authMiddleware);

const createWorkerSchema = z.object({
  externalId: z.string().min(1).max(100),
  email: z.string().email(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
  w9Prefill: z
    .object({
      middleName: z.string().max(100).optional(),
      jobTitle: z.string().max(200).optional(),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfBirth must be YYYY-MM-DD").optional(),
      phone: z.string().max(30).optional(),
      addressLine1: z.string().optional(),
      addressLine2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().length(2).optional(),
      postalCode: z.string().optional(),
      country: z.string().default("US"),
    })
    .optional(),
  ssn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/, "ssn must be 9 digits").optional(),
  // Business (LLC/Corp) contractors. When type is "business", `business` carries
  // the company block; the w9Prefill address is treated as the rep's home
  // address and `business.address` as the business/mailing address.
  contractorType: z.enum(["individual", "business"]).default("individual"),
  business: z
    .object({
      legalBusinessName: z.string().max(200).optional(),
      ein: z.string().regex(/^\d{2}-?\d{7}$/, "ein must be 9 digits").optional(),
      federalTaxClassification: z
        .enum([
          "SoleProprietorship",
          "LlcSingleMember",
          "CorporationS",
          "CorporationC",
          "Partnership",
          "LlcCorporationS",
          "LlcCorporationC",
          "NotForProfitOrganization",
        ])
        .optional(),
      regionOfFormation: z.string().length(2).optional(),
      yearOfFormation: z.string().regex(/^\d{4}$/).optional(),
      phoneNumber: z.string().max(30).optional(),
      email: z.string().email().optional(),
      website: z.string().max(200).optional(),
      industry: z.string().max(100).optional(),
      ownershipPercent: z.string().regex(/^\d{1,3}$/).optional(),
      address: z
        .object({
          addressLine1: z.string().optional(),
          addressLine2: z.string().optional(),
          city: z.string().optional(),
          state: z.string().length(2).optional(),
          postalCode: z.string().optional(),
          country: z.string().default("US"),
        })
        .optional(),
    })
    .optional(),
});

workerRoutes.post("/", zValidator("json", createWorkerSchema), async (c) => {
  const { tenantId, environment } = c.var.auth;
  const body = c.req.valid("json");

  // Check plan worker limit
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
  if (planConfig.maxWorkers !== null) {
    const [countResult] = await db
      .select({ value: count() })
      .from(workers)
      .where(and(eq(workers.tenantId, tenantId), eq(workers.environment, environment)));
    const workerCount = countResult?.value ?? 0;

    if (workerCount >= planConfig.maxWorkers) {
      throw new PlanLimitError(
        `Your ${tenant.plan} plan allows a maximum of ${planConfig.maxWorkers} workers.`,
      );
    }
  }

  // Check duplicate externalId (within this env)
  const [existing] = await db
    .select({ id: workers.id })
    .from(workers)
    .where(
      and(
        eq(workers.tenantId, tenantId),
        eq(workers.environment, environment),
        eq(workers.externalId, body.externalId),
      ),
    )
    .limit(1);

  if (existing) throw new ConflictError(`Worker with externalId ${body.externalId} already exists`);

  // Call Wingspan: POST /payments/payee from Payee Bucket context
  const wingspan = getWingspanClient(environment).withChild(payeeBucketUserId);

  // Wingspan's onboarding form pre-fills from payerOwnedData.payeeW9Data, so
  // mirror name + address + ssn there in addition to the top-level fields.
  const w9 = body.w9Prefill;
  const ssnDigits = body.ssn?.replace(/\D/g, "");
  const payeeW9: Record<string, string> = {};
  if (body.firstName) payeeW9["firstName"] = body.firstName;
  if (body.lastName) payeeW9["lastName"] = body.lastName;
  if (w9?.country) payeeW9["country"] = w9.country;
  if (w9?.addressLine1) payeeW9["addressLine1"] = w9.addressLine1;
  if (w9?.addressLine2) payeeW9["addressLine2"] = w9.addressLine2;
  if (w9?.city) payeeW9["city"] = w9.city;
  if (w9?.state) payeeW9["state"] = w9.state;
  if (w9?.postalCode) payeeW9["postalCode"] = w9.postalCode;
  if (ssnDigits) payeeW9["ssn"] = ssnDigits;

  // Persisted prefill blob (workers.w9SeededData): the personal/W-9 fields plus
  // the business block. Stored so re-opening the onboarding link re-seeds. EIN
  // is kept out of here — it's encrypted into workers.einEncrypted.
  const einDigits = body.business?.ein?.replace(/\D/g, "");
  const w9SeededData = {
    ...(body.w9Prefill ?? {}),
    contractorType: body.contractorType,
    ...(body.business
      ? {
          legalBusinessName: body.business.legalBusinessName,
          federalTaxClassification: body.business.federalTaxClassification,
          regionOfFormation: body.business.regionOfFormation,
          yearOfFormation: body.business.yearOfFormation,
          businessPhone: body.business.phoneNumber,
          businessEmail: body.business.email,
          businessWebsite: body.business.website,
          businessIndustry: body.business.industry,
          ownershipPercent: body.business.ownershipPercent,
          businessAddress: body.business.address,
        }
      : {}),
  };

  const wingspanPayee = await wingspan.createPayee({
    email: body.email,
    ...(body.firstName ? { firstName: body.firstName } : {}),
    ...(body.lastName ? { lastName: body.lastName } : {}),
    payeeExternalId: body.externalId,
    status: "Active",
    ...(Object.keys(payeeW9).length ? { payeeW9Data: payeeW9 } : {}),
  });

  // The contractor's Wingspan user id IS the top-level payeeId — there is no
  // user.userId in the response. Use payeeId for every follow-up call.
  const payeeId = wingspanPayee.payeeId;

  // createPayee returns the EXISTING payee when the email is already on file, so
  // a brand-new externalId can map to a payeeId we've already stored. That would
  // trip the unique constraint on wingspan_payee_bucket_payee_id and surface as a
  // raw 500 — guard it with a clear conflict instead.
  const [dupePayee] = await db
    .select({ externalId: workers.externalId })
    .from(workers)
    .where(
      and(
        eq(workers.tenantId, tenantId),
        eq(workers.environment, environment),
        eq(workers.wingspanPayeeBucketPayeeId, payeeId),
      ),
    )
    .limit(1);
  if (dupePayee) {
    throw new ConflictError(
      `This email is already registered to contractor "${dupePayee.externalId}". ` +
        `Use a different email or edit that contractor.`,
    );
  }

  // Detect whether the contractor sits in our org chain. Net-new payees created
  // in the bucket are automatically in it; an email that already exists under
  // another payer is not. The reliable test is an IMPERSONATED read: 200 → in
  // chain (seed the profile), 403 → outside it (skip seeding, let them fill the
  // wizard manually — payables/payments/1099s still work). Per Wingspan recipe.
  let inOrgChain = true;
  try {
    await getWingspanClient(environment).withChild(payeeId).getUser(payeeId);
  } catch (err) {
    if (err instanceof WingspanApiError && err.statusCode === 403) {
      inOrgChain = false;
      console.warn(`[worker-create] ${payeeId} is outside our org chain — skipping profile seed`);
    } else {
      console.error(`[worker-create] org-chain detection failed:`, (err as Error).message);
    }
  }

  // For INDIVIDUALS we also seed the User/Member profile so the fallback wizard
  // pre-fills (e.g. if tax verification needs document review). Business
  // contractors are fully handled by the v2 customer+representative flow below,
  // so they skip the member-profile path.
  const isBusiness = body.contractorType === "business";
  if (inOrgChain && !isBusiness) {
    await syncWorkerProfileToWingspan(
      { firstName: body.firstName, lastName: body.lastName, w9SeededData, ein: einDigits ?? null },
      environment,
      payeeId,
      body.externalId,
    );
  }

  // v2 low-friction onboarding (individual + business): pre-verify identity/tax,
  // certify the W-9, and record consent server-side, so the nurse only touches
  // the embedded payout step.
  let taxStatus: string | null = null;
  if (inOrgChain) {
    const result = await runLowFrictionOnboarding({
      seed: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        w9SeededData,
        ssn: ssnDigits ?? null,
        ein: einDigits ?? null,
      },
      environment,
      payeeId,
      payerId: wingspanPayee.payerId,
      workerIdForLog: body.externalId,
    });
    taxStatus = result.taxStatus;
  }

  // Save worker with Wingspan IDs
  const [worker] = await db
    .insert(workers)
    .values({
      tenantId,
      externalId: body.externalId,
      email: body.email,
      firstName: body.firstName ?? null,
      lastName: body.lastName ?? null,
      // Once tax verifies, the only thing left is the nurse picking a payout
      // method (in the embedded SDK) — reflect that as payout_pending instead of
      // leaving them stuck at "invited". Don't depend on the inbound webhook.
      onboardingStatus: taxStatus?.toLowerCase() === "verified" ? "payout_pending" : "invited",
      wingspanPayeeBucketPayeeId: wingspanPayee.payeeId,
      wingspanUserId: payeeId,
      wingspanPayerId: wingspanPayee.payerId,
      taxVerificationStatus: taxStatus,
      w9ConsentAt: inOrgChain && !isBusiness ? new Date() : null,
      environment,
      metadata: body.metadata ?? {},
      w9SeededData,
      ssnEncrypted: ssnDigits ? encryptSecret(ssnDigits) : null,
      einEncrypted: einDigits ? encryptSecret(einDigits) : null,
    })
    .returning();

  if (!worker) throw new Error("Failed to create worker");

  // Mint a session token for the embedded payout SDK (the supported embed path).
  // The contractor's identity/tax/W-9 are already done server-side, so NurseIO
  // only embeds the payout-method step via @wingspan/embedded-sdk using these.
  // `embeddedOnboardingUrl` is kept as a NON-iframe fallback (new tab / webview)
  // — Wingspan's pages refuse framing. All null if the session call fails.
  let sessionToken: string | null = null;
  let payeeUserId: string | null = null;
  let embedBaseUrl: string | null = null;
  let embeddedOnboardingUrl: string | null = null;
  let embeddedOnboardingExpiresAt: string | null = null;
  try {
    const session = await getWingspanClient(environment).getSessionToken(payeeId);
    sessionToken = session.token;
    payeeUserId = payeeId;
    embedBaseUrl = wingspanEmbedBaseUrl(environment);
    embeddedOnboardingUrl = wingspanOnboardingUrl(environment, session.token);
    embeddedOnboardingExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  } catch {
    // Non-fatal
  }

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "worker.created",
    resourceType: "worker",
    resourceId: worker.id,
    metadata: { email: worker.email, externalId: worker.externalId },
    ipAddress: clientIp(c),
  });

  return c.json(
    {
      ...toWorkerDTO(worker),
      sessionToken,
      payeeId: payeeUserId,
      embedBaseUrl,
      embeddedOnboardingUrl,
      embeddedOnboardingExpiresAt,
    },
    201,
  );
});

workerRoutes.get("/", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const status = c.req.query("status");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = (page - 1) * limit;

  type WorkerStatus = "invited" | "w9_pending" | "payout_pending" | "active" | "inactive";
  const conditions = [eq(workers.tenantId, tenantId), eq(workers.environment, environment)];
  if (status) {
    conditions.push(eq(workers.onboardingStatus, status as WorkerStatus));
  }

  const rows = await db
    .select()
    .from(workers)
    .where(and(...conditions))
    .orderBy(desc(workers.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ value: count() })
    .from(workers)
    .where(and(...conditions));
  const total = countResult?.value ?? 0;

  return c.json({
    data: rows.map(toWorkerDTO),
    pagination: { page, limit, total, hasMore: offset + rows.length < total },
  });
});

workerRoutes.get("/:id", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [worker] = await db
    .select()
    .from(workers)
    .where(
      and(
        eq(workers.id, id),
        eq(workers.tenantId, tenantId),
        eq(workers.environment, environment),
      ),
    )
    .limit(1);

  if (!worker) throw new NotFoundError("Worker");

  return c.json(toWorkerDTO(withSsnLast4(worker)));
});

function withSsnLast4(c: typeof workers.$inferSelect): Record<string, unknown> {
  if (!c.ssnEncrypted) return { ...c, ssnLast4: null };
  try {
    return { ...c, ssnLast4: ssnLast4(decryptSecret(c.ssnEncrypted)) };
  } catch {
    return { ...c, ssnLast4: null };
  }
}

const updateWorkerSchema = z.object({
  firstName: z.string().max(100).nullish(),
  lastName: z.string().max(100).nullish(),
  metadata: z.record(z.unknown()).optional(),
  onboardingStatus: z.enum(["invited", "w9_pending", "payout_pending", "active", "inactive"]).optional(),
  // Fields seeded into the Wingspan W-9 onboarding form. Stored on
  // workers.w9SeededData and synced to Wingspan on the next onboarding-link
  // request. Wingspan only accepts a subset (address + ssn) — the rest are
  // kept locally for our own records.
  w9Prefill: z
    .object({
      middleName: z.string().max(100).optional(),
      jobTitle: z.string().max(200).optional(),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfBirth must be YYYY-MM-DD").optional(),
      phone: z.string().max(30).optional(),
      country: z.string().length(2).toUpperCase().optional(),
      addressLine1: z.string().max(200).optional(),
      addressLine2: z.string().max(200).optional(),
      city: z.string().max(100).optional(),
      state: z.string().max(50).optional(),
      postalCode: z.string().max(20).optional(),
    })
    .optional(),
  // Plain SSN/ITIN; encrypted before persist, never echoed back.
  ssn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/, "ssn must be 9 digits").nullish(),
});

workerRoutes.patch("/:id", zValidator("json", updateWorkerSchema), async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();
  const body = c.req.valid("json");

  const [existing] = await db
    .select({ id: workers.id, w9SeededData: workers.w9SeededData })
    .from(workers)
    .where(
      and(
        eq(workers.id, id),
        eq(workers.tenantId, tenantId),
        eq(workers.environment, environment),
      ),
    )
    .limit(1);
  if (!existing) throw new NotFoundError("Worker");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.firstName !== undefined) updates["firstName"] = body.firstName ?? null;
  if (body.lastName !== undefined) updates["lastName"] = body.lastName ?? null;
  if (body.metadata !== undefined) updates["metadata"] = body.metadata;
  if (body.onboardingStatus !== undefined) updates["onboardingStatus"] = body.onboardingStatus;
  // Merge (don't overwrite) so a partial prefill update keeps contractorType and
  // any stored business block — important for reseeding stuck workers.
  if (body.w9Prefill !== undefined) {
    const prev = (existing.w9SeededData ?? {}) as Record<string, unknown>;
    updates["w9SeededData"] = { ...prev, ...body.w9Prefill };
  }
  if (body.ssn !== undefined) {
    updates["ssnEncrypted"] = body.ssn ? encryptSecret(body.ssn.replace(/\D/g, "")) : null;
  }

  const [updated] = await db
    .update(workers)
    .set(updates)
    .where(eq(workers.id, id))
    .returning();
  if (!updated) throw new Error("Failed to update worker");

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "worker.updated",
    resourceType: "worker",
    resourceId: id,
    metadata: { fields: Object.keys(updates).filter((k) => k !== "updatedAt") },
    ipAddress: clientIp(c),
  });

  return c.json(toWorkerDTO(withSsnLast4(updated)));
});

workerRoutes.delete("/:id", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [worker] = await db
    .select({ id: workers.id, email: workers.email })
    .from(workers)
    .where(
      and(
        eq(workers.id, id),
        eq(workers.tenantId, tenantId),
        eq(workers.environment, environment),
      ),
    )
    .limit(1);
  if (!worker) throw new NotFoundError("Worker");

  const [[eng], [pay]] = await Promise.all([
    db.select({ n: count() }).from(engagements).where(eq(engagements.workerId, id)),
    db.select({ n: count() }).from(payables).where(eq(payables.workerId, id)),
  ]);
  const refs = Number(eng?.n ?? 0) + Number(pay?.n ?? 0);
  if (refs > 0) {
    return c.json(
      {
        error: "has_references",
        message: "Cannot delete worker with engagements or payables. Mark them inactive instead.",
      },
      409,
    );
  }

  await db.delete(workers).where(eq(workers.id, id));

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "worker.deleted",
    resourceType: "worker",
    resourceId: id,
    metadata: { email: worker.email, environment },
    ipAddress: clientIp(c),
  });

  return c.json({ ok: true });
});

workerRoutes.get("/:id/onboarding-link", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [worker] = await db
    .select()
    .from(workers)
    .where(
      and(
        eq(workers.id, id),
        eq(workers.tenantId, tenantId),
        eq(workers.environment, environment),
      ),
    )
    .limit(1);

  if (!worker) throw new NotFoundError("Worker");

  let userId = worker.wingspanUserId;
  if (!userId) {
    userId = await repairWorkerWingspanUserId(worker, environment);
  }

  if (!userId) {
    return c.json({ error: "not_ready", message: "Worker does not have an onboarding account yet" }, 422);
  }

  // Fast path: once the worker is fully provisioned (Tax verified) we just mint
  // the embed token — re-running the whole onboarding pipeline on every link
  // fetch is what made this endpoint ~10s. We only re-run when NOT yet verified
  // (async prod verification still pending, or a pre-v2 worker being backfilled).
  // syncWorkerToWingspan writes payerOwnedData (TIN); the member-profile seed is
  // only for the individual fallback wizard.
  const isBusiness = (worker.w9SeededData as { contractorType?: string } | null)?.contractorType === "business";
  const provisioned = worker.taxVerificationStatus?.toLowerCase() === "verified";
  if (worker.wingspanPayeeBucketPayeeId && !provisioned) {
    await syncWorkerToWingspan(worker, environment, worker.wingspanPayeeBucketPayeeId);
    if (!isBusiness) {
      await syncWorkerProfileToWingspan(worker, environment, worker.wingspanPayeeBucketPayeeId, worker.id);
    }
    if (worker.wingspanPayerId) {
      const result = await runLowFrictionOnboarding({
        seed: {
          firstName: worker.firstName,
          lastName: worker.lastName,
          email: worker.email,
          w9SeededData: worker.w9SeededData,
          ssnEncrypted: worker.ssnEncrypted,
          einEncrypted: worker.einEncrypted,
        },
        environment,
        payeeId: worker.wingspanPayeeBucketPayeeId,
        payerId: worker.wingspanPayerId,
        workerIdForLog: worker.id,
      });
      if (result.taxStatus && result.taxStatus !== worker.taxVerificationStatus) {
        // Advance invited/w9_pending → payout_pending once tax verifies (don't
        // wait on the inbound webhook). Never downgrade an already-active worker.
        const bump =
          result.taxVerified && (worker.onboardingStatus === "invited" || worker.onboardingStatus === "w9_pending");
        await db
          .update(workers)
          .set({
            taxVerificationStatus: result.taxStatus,
            ...(bump ? { onboardingStatus: "payout_pending" as const } : {}),
            updatedAt: new Date(),
          })
          .where(eq(workers.id, worker.id));
      }
    }
  }

  const session = await getWingspanClient(environment).getSessionToken(userId);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 60 min
  // Non-iframe fallback URL (Wingspan refuses framing — embed via the SDK below).
  const onboardingUrl = wingspanOnboardingUrl(environment, session.token);

  return c.json({
    // Supported embed path: hand these to @wingspan/embedded-sdk on the client.
    sessionToken: session.token,
    payeeId: userId,
    embedBaseUrl: wingspanEmbedBaseUrl(environment),
    expiresAt,
    // Non-iframe fallback (new tab / native webview) — NOT framable.
    embeddedOnboardingUrl: onboardingUrl,
    url: onboardingUrl,
  });
});

// Mark a worker payout-ready (→ active). Call this from the embedded SDK's
// onComplete({ changed: true }) once the nurse has saved a payout method — that
// callback is the reliable signal a method was added. Guarded: we only flip to
// active when tax is already Verified, so a worker can't be marked payable
// before the W-9/TIN check passes.
workerRoutes.post("/:id/payout-method-confirmed", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [worker] = await db
    .select()
    .from(workers)
    .where(and(eq(workers.id, id), eq(workers.tenantId, tenantId), eq(workers.environment, environment)))
    .limit(1);
  if (!worker) throw new NotFoundError("Worker");

  if (worker.taxVerificationStatus?.toLowerCase() !== "verified") {
    return c.json(
      {
        error: "tax_not_verified",
        message:
          "Tax verification is not complete yet — fetch the onboarding link to re-check, then retry once verified.",
        onboardingStatus: worker.onboardingStatus,
        taxVerificationStatus: worker.taxVerificationStatus,
      },
      409,
    );
  }

  const [updated] = await db
    .update(workers)
    .set({ onboardingStatus: "active", updatedAt: new Date() })
    .where(eq(workers.id, id))
    .returning();
  if (!updated) throw new Error("Failed to update worker");

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "worker.payout_method_confirmed",
    resourceType: "worker",
    resourceId: id,
    metadata: {},
    ipAddress: clientIp(c),
  });

  return c.json(toWorkerDTO(withSsnLast4(updated)));
});

// ─── Engagements (worker ↔ entity) ────────────────────────────────────────

const engagementAttachSchema = z.object({
  entityId: z.string().uuid(),
  // W-2 only — required when the target entity is W-2.
  engagementTemplateId: z.string().uuid().optional(),
  worksiteId: z.string().uuid().optional(),
  jobTitle: z.string().max(200).optional(),
  compensation: z
    .object({
      type: z.enum(["Hourly", "Salary"]),
      amount: z.number().positive(),
      frequency: z.enum(["Hour", "Year"]),
    })
    .optional(),
  paySchedule: z.enum(["Weekly", "Biweekly", "SemiMonthly", "Monthly"]).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD").optional(),
});

workerRoutes.post("/:id/engagements", zValidator("json", engagementAttachSchema), async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id: workerId } = c.req.param();
  const body = c.req.valid("json");
  const { entityId } = body;

  // Validate worker belongs to tenant (in this env)
  const [worker] = await db
    .select()
    .from(workers)
    .where(
      and(
        eq(workers.id, workerId),
        eq(workers.tenantId, tenantId),
        eq(workers.environment, environment),
      ),
    )
    .limit(1);
  if (!worker) throw new NotFoundError("Worker");

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

  // Engagement type is derived from the entity's taxType. Wingspan V3 uses
  // "Contractor" / "Employee" for the same distinction.
  const engagementType: "contractor" | "employee" =
    entity.taxType === "w2" ? "employee" : "contractor";

  // A worker can't simultaneously hold engagements of both types (IRS rule —
  // Wingspan enforces this; we mirror).
  const conflicting = await db
    .select({ id: engagements.id, type: engagements.type, status: engagements.status })
    .from(engagements)
    .where(
      and(
        eq(engagements.workerId, workerId),
        eq(engagements.environment, environment),
      ),
    );
  const conflictingActive = conflicting.find(
    (e) => e.type !== engagementType && e.status === "active",
  );
  if (conflictingActive) {
    return c.json(
      {
        error: "conflicting_classification",
        message:
          `Worker already has an active ${conflictingActive.type === "employee" ? "W-2" : "1099"} ` +
          `engagement; end it before attaching to a ${engagementType === "employee" ? "W-2" : "1099"} entity.`,
      },
      409,
    );
  }

  // W-2 (Employee) engagements run through Wingspan V3.
  if (engagementType === "employee") {
    if (!hasV3Config(environment)) {
      return c.json(
        {
          error: "v3_not_configured",
          message: `Wingspan V3 (W-2) is not configured for ${environment}. Set WINGSPAN_${environment === "test" ? "SANDBOX" : "LIVE"}_V3_API_TOKEN and ..._V3_PARENT_ACCOUNT_ID on the API service.`,
        },
        503,
      );
    }
    if (!body.engagementTemplateId || !body.worksiteId || !body.jobTitle || !body.compensation || !body.paySchedule || !body.startDate) {
      throw new ValidationError(
        "W-2 engagement requires engagementTemplateId, worksiteId, jobTitle, compensation, paySchedule, startDate.",
      );
    }
    const v3AccountId = entityV3AccountId(entity, environment);
    if (!v3AccountId) {
      return c.json(
        {
          error: "v3_account_not_provisioned",
          message: "Entity has no V3 (W-2) child account ID yet. Provision the V3 account first.",
        },
        422,
      );
    }

    // Idempotent: return existing engagement if one already exists.
    const [existing] = await db
      .select()
      .from(engagements)
      .where(
        and(
          eq(engagements.workerId, workerId),
          eq(engagements.entityId, entityId),
          eq(engagements.environment, environment),
        ),
      )
      .limit(1);
    if (existing) {
      return c.json(toEngagementDTO(existing, { entityName: entity.name }));
    }

    // Validate the engagement template + worksite belong to this entity.
    const [templateRow] = await db
      .select()
      .from(engagementTemplates)
      .where(
        and(
          eq(engagementTemplates.id, body.engagementTemplateId),
          eq(engagementTemplates.entityId, entityId),
          eq(engagementTemplates.environment, environment),
        ),
      )
      .limit(1);
    if (!templateRow) throw new ValidationError("engagementTemplateId is not a template for this entity.");

    const [worksiteRow] = await db
      .select()
      .from(worksites)
      .where(
        and(
          eq(worksites.id, body.worksiteId),
          eq(worksites.entityId, entityId),
          eq(worksites.environment, environment),
        ),
      )
      .limit(1);
    if (!worksiteRow) throw new ValidationError("worksiteId is not a worksite for this entity.");

    const v3 = getWingspanV3Client(environment).withAccount(v3AccountId);

    // V3 payee is per-(payer × payee), so each entity has its own. Create one
    // here using the worker's name + email + (optionally) address from w9 seed.
    let v3PayeeId: string;
    try {
      const w9 = (worker.w9SeededData ?? {}) as Record<string, string | undefined>;
      const created = await v3.createPayee({
        firstName: worker.firstName ?? "",
        lastName: worker.lastName ?? "",
        email: worker.email,
        ...(w9["phone"] ? { phone: w9["phone"] } : {}),
        ...(w9["dateOfBirth"] ? { dateOfBirth: w9["dateOfBirth"] } : {}),
        ...(w9["addressLine1"]
          ? {
              address: {
                line1: w9["addressLine1"],
                ...(w9["addressLine2"] ? { line2: w9["addressLine2"] } : {}),
                city: w9["city"] ?? "",
                state: w9["state"] ?? "",
                postalCode: w9["postalCode"] ?? "",
                country: w9["country"] ?? "US",
              },
            }
          : {}),
        externalId: worker.externalId,
      });
      v3PayeeId = created.payeeId;
    } catch (err) {
      console.error(`[w2-engagement] V3 createPayee failed for worker ${worker.id}:`, (err as Error).message);
      throw err;
    }

    let v3EngagementId: string;
    try {
      const eng = await v3.createEmployeeEngagement(v3PayeeId, {
        engagementTemplateId: templateRow.wingspanTemplateId ?? templateRow.id,
        worksiteId: worksiteRow.wingspanWorksiteId ?? worksiteRow.id,
        jobTitle: body.jobTitle,
        compensation: body.compensation,
        paySchedule: body.paySchedule,
        startDate: body.startDate,
      });
      v3EngagementId = eng.engagementId;
    } catch (err) {
      console.error(`[w2-engagement] V3 createEmployeeEngagement failed for payee ${v3PayeeId}:`, (err as Error).message);
      throw err;
    }

    const [engagement] = await db
      .insert(engagements)
      .values({
        tenantId,
        workerId,
        entityId,
        type: "employee",
        status: "active",
        wingspanV3PayeeId: v3PayeeId,
        wingspanV3EngagementId: v3EngagementId,
        engagementTemplateId: body.engagementTemplateId,
        worksiteId: body.worksiteId,
        compensation: body.compensation,
        paySchedule: body.paySchedule,
        jobTitle: body.jobTitle,
        environment,
      })
      .returning();
    if (!engagement) throw new Error("Failed to save engagement");

    await logAudit({
      tenantId,
      actorType: "api_key",
      actorId: c.var.auth.apiKeyId,
      action: "worker.engagement.created",
      resourceType: "engagement",
      resourceId: engagement.id,
      metadata: { workerId, entityId, entityName: entity.name, type: "employee" },
      ipAddress: clientIp(c),
    });

    return c.json(toEngagementDTO(engagement, { entityName: entity.name }), 201);
  }

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
        eq(engagements.workerId, workerId),
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
      email: worker.email,
      ...(worker.firstName ? { firstName: worker.firstName } : {}),
      ...(worker.lastName ? { lastName: worker.lastName } : {}),
      payeeExternalId: worker.externalId,
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
    throw new Error("Wingspan did not return a payerPayeeEngagementId — cannot create payables for this worker+entity pair");
  }

  const [engagement] = await db
    .insert(engagements)
    .values({
      tenantId,
      workerId,
      entityId,
      type: engagementType,
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
    action: "worker.engagement.created",
    resourceType: "engagement",
    resourceId: engagement.id,
    metadata: { workerId, entityId, entityName: entity.name },
    ipAddress: clientIp(c),
  });

  return c.json(toEngagementDTO(engagement, { entityName: entity.name }), 201);
});

// PATCH /v1/workers/:id/engagements/:engagementId/tax-elections — proxy to
// Wingspan V3. Only meaningful for W-2 engagements.
workerRoutes.patch("/:id/engagements/:engagementId/tax-elections", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id: workerId, engagementId } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(
      and(
        eq(engagements.id, engagementId),
        eq(engagements.workerId, workerId),
        eq(engagements.tenantId, tenantId),
        eq(engagements.environment, environment),
      ),
    )
    .limit(1);
  if (!engagement) throw new NotFoundError("Engagement");
  if (engagement.type !== "employee") {
    throw new ValidationError("Tax elections are only collected on W-2 engagements.");
  }
  if (!engagement.wingspanV3PayeeId || !engagement.wingspanV3EngagementId) {
    throw new ValidationError("Engagement is missing V3 IDs.");
  }
  if (!hasV3Config(environment)) {
    return c.json({ error: "v3_not_configured", message: "Wingspan V3 is not configured." }, 503);
  }

  const [entity] = await db
    .select()
    .from(tenantEntities)
    .where(eq(tenantEntities.id, engagement.entityId))
    .limit(1);
  const v3AccountId = entity ? entityV3AccountId(entity, environment) : null;
  if (!v3AccountId) return c.json({ error: "v3_account_not_provisioned" }, 422);

  await getWingspanV3Client(environment)
    .withAccount(v3AccountId)
    .patchTaxElections(engagement.wingspanV3PayeeId, engagement.wingspanV3EngagementId, body);

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "worker.tax_elections.updated",
    resourceType: "engagement",
    resourceId: engagementId,
    metadata: { workerId },
    ipAddress: clientIp(c),
  });

  return c.json({ ok: true });
});

workerRoutes.get("/:id/engagements", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id: workerId } = c.req.param();

  const [worker] = await db
    .select({ id: workers.id })
    .from(workers)
    .where(
      and(
        eq(workers.id, workerId),
        eq(workers.tenantId, tenantId),
        eq(workers.environment, environment),
      ),
    )
    .limit(1);
  if (!worker) throw new NotFoundError("Worker");

  const rows = await db
    .select({
      id: engagements.id,
      workerId: engagements.workerId,
      entityId: engagements.entityId,
      entityName: tenantEntities.name,
      status: engagements.status,
      createdAt: engagements.createdAt,
    })
    .from(engagements)
    .innerJoin(tenantEntities, eq(engagements.entityId, tenantEntities.id))
    .where(and(eq(engagements.workerId, workerId), eq(engagements.environment, environment)));

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

workerRoutes.post(
  "/:id/pay-now",
  zValidator("json", payNowSchema),
  async (c) => {
    const { tenantId, apiKeyId, environment } = c.var.auth;
    const { id: workerId } = c.req.param();
    const body = c.req.valid("json");
    const idempotencyKey = c.req.header("Idempotency-Key");

    if (!idempotencyKey) {
      throw new ValidationError("Idempotency-Key header is required for pay-now");
    }

    // Idempotency replay check
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ workerId, environment, ...body }))
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
        requestPath: `/v1/workers/${workerId}/pay-now`,
        requestHash,
        lockedAt: new Date(),
      })
      .onConflictDoNothing();

    // Validate worker + entity ownership and engagement (in this env)
    const [worker] = await db
      .select()
      .from(workers)
      .where(
        and(
          eq(workers.id, workerId),
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
          eq(engagements.workerId, workerId),
          eq(engagements.entityId, body.entityId),
          eq(engagements.environment, environment),
        ),
      )
      .limit(1);
    if (!engagement) {
      throw new ValidationError(
        "No engagement found for this worker and entity. Attach the worker to the entity first.",
      );
    }

    if (engagement.type === "employee") {
      return c.json(
        {
          error: "w2_not_implemented",
          message:
            "W-2 payroll integration is in progress — pay-now is unavailable for employee engagements. " +
            "Use the upcoming /v1/payrolls flow once W-2 ships.",
        },
        501,
      );
    }

    // Inspect pending pool for this entity (env-scoped)
    const existingPending = await db
      .select({
        id: payables.id,
        amountCents: payables.amountCents,
        feeAmountCents: payables.feeAmountCents,
        workerId: payables.workerId,
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
          description: body.description ?? `Payment to ${worker.firstName ?? ""} ${worker.lastName ?? ""}`.trim(),
          amountCents: body.amountCents,
        },
      ];

    // 1. Create payable in the payment processor (env-specific child)
    const wingspan = getWingspanClient(environment).withChild(childUserId);
    if (!engagement.wingspanPayerPayeeEngagementId) {
      throw new Error("1099 engagement is missing wingspanPayerPayeeEngagementId — data is inconsistent");
    }
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

    // Approve immediately so the upcoming pay-approved sweep picks it up.
    try {
      await wingspan.approvePayable(processorPayable.payableId);
    } catch (err) {
      console.error(`[pay-now] Failed to approve ${processorPayable.payableId}:`, (err as Error).message);
    }

    const [payable] = await db
      .insert(payables)
      .values({
        tenantId,
        entityId: body.entityId,
        workerId,
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
        workerId,
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

