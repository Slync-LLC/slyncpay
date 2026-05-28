import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc } from "@slyncpay/db";
import {
  db,
  worksites,
  tenantEntities,
  stateJurisdictionConfigs,
} from "@slyncpay/db";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import {
  getWingspanV3Client,
  entityV3AccountId,
  hasV3Config,
} from "../lib/wingspan.js";
import { logAudit } from "../lib/audit.js";
import { clientIp } from "../lib/rate-limit.js";

export const worksiteRoutes = new Hono();
worksiteRoutes.use("*", authMiddleware);

const createWorksiteSchema = z.object({
  entityId: z.string().uuid(),
  name: z.string().min(1).max(200),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().length(2).toUpperCase(),
  postalCode: z.string().min(5).max(10),
  country: z.string().length(2).default("US"),
  externalId: z.string().max(200).optional(),
});

function toWorksiteDTO(row: typeof worksites.$inferSelect) {
  return {
    id: row.id,
    entityId: row.entityId,
    name: row.name,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    externalId: row.externalId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

worksiteRoutes.post("/", zValidator("json", createWorksiteSchema), async (c) => {
  const { tenantId, environment } = c.var.auth;
  const body = c.req.valid("json");

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
  if (entity.taxType !== "w2") {
    throw new ValidationError("Worksites are only available on W-2 entities.");
  }

  // Block worksite creation until the state's jurisdiction config is complete.
  const [stateConfig] = await db
    .select()
    .from(stateJurisdictionConfigs)
    .where(
      and(
        eq(stateJurisdictionConfigs.entityId, body.entityId),
        eq(stateJurisdictionConfigs.state, body.state),
        eq(stateJurisdictionConfigs.environment, environment),
      ),
    )
    .limit(1);

  if (!stateConfig || stateConfig.status !== "complete") {
    return c.json(
      {
        error: "state_jurisdiction_incomplete",
        message:
          `State ${body.state} jurisdiction config (withholding/SUTA/PFML/SDI) ` +
          `must be marked complete by an admin before worksites can be created there. ` +
          `Current status: ${stateConfig?.status ?? "not started"}.`,
      },
      409,
    );
  }

  // Push to Wingspan V3 if configured. Best-effort: if V3 isn't set up yet, we
  // still record the worksite locally so the operator can fill it in later.
  let wingspanWorksiteId: string | null = null;
  if (hasV3Config(environment)) {
    const v3AccountId = entityV3AccountId(entity, environment);
    if (v3AccountId) {
      try {
        const remote = await getWingspanV3Client(environment)
          .withAccount(v3AccountId)
          .createWorksite({
            name: body.name,
            address: {
              line1: body.addressLine1,
              ...(body.addressLine2 ? { line2: body.addressLine2 } : {}),
              city: body.city,
              state: body.state,
              postalCode: body.postalCode,
              country: body.country,
            },
            ...(body.externalId ? { externalId: body.externalId } : {}),
          });
        wingspanWorksiteId = remote.worksiteId;
      } catch (err) {
        console.error(
          `[worksite.create] Wingspan V3 createWorksite failed for entity ${entity.id}:`,
          (err as Error).message,
        );
        // Continue with local persist; operator can repair later.
      }
    }
  }

  const [row] = await db
    .insert(worksites)
    .values({
      tenantId,
      entityId: body.entityId,
      name: body.name,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2 ?? null,
      city: body.city,
      state: body.state,
      postalCode: body.postalCode,
      country: body.country,
      externalId: body.externalId ?? null,
      wingspanWorksiteId,
      environment,
    })
    .returning();
  if (!row) throw new Error("Failed to create worksite");

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "worksite.created",
    resourceType: "worksite",
    resourceId: row.id,
    metadata: { entityId: body.entityId, name: body.name, state: body.state },
    ipAddress: clientIp(c),
  });

  return c.json(toWorksiteDTO(row), 201);
});

worksiteRoutes.get("/", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const entityId = c.req.query("entityId");

  const conditions = [
    eq(worksites.tenantId, tenantId),
    eq(worksites.environment, environment),
  ];
  if (entityId) conditions.push(eq(worksites.entityId, entityId));

  const rows = await db
    .select()
    .from(worksites)
    .where(and(...conditions))
    .orderBy(desc(worksites.createdAt));

  return c.json({ data: rows.map(toWorksiteDTO) });
});

worksiteRoutes.delete("/:id", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [row] = await db
    .select()
    .from(worksites)
    .where(
      and(
        eq(worksites.id, id),
        eq(worksites.tenantId, tenantId),
        eq(worksites.environment, environment),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Worksite");

  await db.delete(worksites).where(eq(worksites.id, id));

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "worksite.deleted",
    resourceType: "worksite",
    resourceId: id,
    metadata: { name: row.name },
    ipAddress: clientIp(c),
  });

  return c.json({ ok: true });
});
