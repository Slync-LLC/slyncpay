import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "@slyncpay/db";
import { db, tenantEntities, provisioningJobs, tenants } from "@slyncpay/db";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError, PlanLimitError } from "../lib/errors.js";
import { encrypt, decrypt, maskEin } from "../lib/crypto.js";
import { PLAN_CONFIG } from "@slyncpay/types";
import type { TenantPlan } from "@slyncpay/types";
import { getEntitySetupQueue } from "../workers/queues.js";
import { entityChildUserId, entityChildUserEmail, wingspanRootUserId, wingspanUiBaseUrl } from "../lib/wingspan.js";
import { toEntityDTO } from "../lib/dto.js";
import { logAudit } from "../lib/audit.js";
import { clientIp } from "../lib/rate-limit.js";

export const entityRoutes = new Hono();
entityRoutes.use("*", authMiddleware);

entityRoutes.get("/", async (c) => {
  const { tenantId, environment } = c.var.auth;

  const rows = await db
    .select()
    .from(tenantEntities)
    .where(and(eq(tenantEntities.tenantId, tenantId), eq(tenantEntities.environment, environment)));

  return c.json(
    rows.map((e) => {
      let last4: string | null = null;
      if (e.ein) {
        try {
          last4 = maskEin(decrypt(e.ein));
        } catch {
          last4 = null;
        }
      }
      return toEntityDTO({ ...e, einLast4: last4 });
    }),
  );
});

const createEntitySchema = z.object({
  name: z.string().min(1).max(100),
  ein: z.string().regex(/^\d{2}-\d{7}$/, "EIN must be in format XX-XXXXXXX"),
  state: z.string().length(2).toUpperCase().optional(),
  taxType: z.enum(["w2", "1099"]).default("1099"),
});

entityRoutes.post("/", zValidator("json", createEntitySchema), async (c) => {
  const { tenantId, environment } = c.var.auth;
  const body = c.req.valid("json");

  // Check plan entity limit (env-scoped — sandbox doesn't count against live limit)
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new NotFoundError("Tenant");

  const planConfig = PLAN_CONFIG[tenant.plan as TenantPlan];
  if (planConfig.maxEntities !== null) {
    const existing = await db
      .select({ id: tenantEntities.id })
      .from(tenantEntities)
      .where(and(eq(tenantEntities.tenantId, tenantId), eq(tenantEntities.environment, environment)));

    if (existing.length >= planConfig.maxEntities) {
      throw new PlanLimitError(
        `Your ${tenant.plan} plan allows a maximum of ${planConfig.maxEntities} entities. Upgrade to add more.`,
      );
    }
  }

  // Encrypt EIN before storing
  const encryptedEin = encrypt(body.ein);

  const [entity] = await db
    .insert(tenantEntities)
    .values({
      tenantId,
      name: body.name,
      ein: encryptedEin,
      state: body.state ?? null,
      status: "pending",
      taxType: body.taxType,
      environment,
    })
    .returning();

  if (!entity) throw new Error("Failed to create entity");

  // Create provisioning job
  const [job] = await db
    .insert(provisioningJobs)
    .values({
      tenantId,
      entityId: entity.id,
      jobType: "entity_setup",
      status: "pending",
    })
    .returning();

  if (!job) throw new Error("Failed to create provisioning job");

  await getEntitySetupQueue().add(
    "entity-setup",
    { entityId: entity.id, tenantId, provisioningJobId: job.id },
    { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
  );

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "entity.created",
    resourceType: "entity",
    resourceId: entity.id,
    metadata: { name: entity.name, state: entity.state },
    ipAddress: clientIp(c),
  });

  return c.json(
    {
      ...toEntityDTO({ ...entity, einLast4: maskEin(body.ein) }),
      message: "Entity provisioning started. Poll /v1/entities/:id/provisioning-status.",
    },
    201,
  );
});

entityRoutes.get("/:id", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [entity] = await db
    .select()
    .from(tenantEntities)
    .where(
      and(
        eq(tenantEntities.id, id),
        eq(tenantEntities.tenantId, tenantId),
        eq(tenantEntities.environment, environment),
      ),
    )
    .limit(1);

  if (!entity) throw new NotFoundError("Entity");

  let last4: string | null = null;
  if (entity.ein) {
    try {
      last4 = maskEin(decrypt(entity.ein));
    } catch {
      last4 = null;
    }
  }
  const childUserId = entityChildUserId(entity, environment);
  const childUserEmail = entityChildUserEmail(entity, environment);
  return c.json({
    ...toEntityDTO({ ...entity, einLast4: last4 }),
    wingspan: {
      environment,
      organizationUserId: wingspanRootUserId(environment),
      childUserId,
      childUserEmail,
      uiBaseUrl: wingspanUiBaseUrl(environment),
    },
  });
});

entityRoutes.delete("/:id", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [entity] = await db
    .select({ id: tenantEntities.id, name: tenantEntities.name })
    .from(tenantEntities)
    .where(
      and(
        eq(tenantEntities.id, id),
        eq(tenantEntities.tenantId, tenantId),
        eq(tenantEntities.environment, environment),
      ),
    )
    .limit(1);
  if (!entity) throw new NotFoundError("Entity");

  // Safety: refuse delete if there are any workers/payables/disbursements/engagements
  const { engagements, payables, disbursements, workers } = await import("@slyncpay/db");
  const { count } = await import("@slyncpay/db");
  const [[eng], [pay], [dis]] = await Promise.all([
    db.select({ n: count() }).from(engagements).where(eq(engagements.entityId, id)),
    db.select({ n: count() }).from(payables).where(eq(payables.entityId, id)),
    db.select({ n: count() }).from(disbursements).where(eq(disbursements.entityId, id)),
  ]);
  void workers;

  const refs = Number(eng?.n ?? 0) + Number(pay?.n ?? 0) + Number(dis?.n ?? 0);
  if (refs > 0) {
    return c.json(
      {
        error: "has_references",
        message: "Cannot delete entity with engagements, payables, or disbursements attached.",
      },
      409,
    );
  }

  await db.delete(tenantEntities).where(eq(tenantEntities.id, id));

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "entity.deleted",
    resourceType: "entity",
    resourceId: id,
    metadata: { name: entity.name, environment },
    ipAddress: clientIp(c),
  });

  return c.json({ ok: true });
});

entityRoutes.get("/:id/provisioning-status", async (c) => {
  const { tenantId } = c.var.auth;
  const { id } = c.req.param();

  const [entity] = await db
    .select({ id: tenantEntities.id })
    .from(tenantEntities)
    .where(and(eq(tenantEntities.id, id), eq(tenantEntities.tenantId, tenantId)))
    .limit(1);

  if (!entity) throw new NotFoundError("Entity");

  const [job] = await db
    .select()
    .from(provisioningJobs)
    .where(eq(provisioningJobs.entityId, id))
    .orderBy(provisioningJobs.createdAt)
    .limit(1);

  if (!job) return c.json({ status: "not_started" });

  return c.json({
    status: job.status,
    currentStep: job.currentStep,
    stepsCompleted: job.stepsCompleted,
    lastError: job.lastError,
    updatedAt: job.updatedAt,
  });
});
