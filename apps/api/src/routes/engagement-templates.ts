import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc } from "@slyncpay/db";
import { db, engagementTemplates, tenantEntities } from "@slyncpay/db";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { logAudit } from "../lib/audit.js";
import { clientIp } from "../lib/rate-limit.js";

export const engagementTemplateRoutes = new Hono();
engagementTemplateRoutes.use("*", authMiddleware);

const requirementSchema = z.object({
  type: z.enum(["w4", "i9", "license", "background_check", "custom"]),
  label: z.string().max(200).optional(),
  required: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

const createSchema = z.object({
  entityId: z.string().uuid(),
  name: z.string().min(1).max(200),
  i9Mode: z.enum(["self_managed", "wingspan_managed", "hybrid"]).default("self_managed"),
  requirements: z.array(requirementSchema).default([]),
});

function toDTO(row: typeof engagementTemplates.$inferSelect) {
  return {
    id: row.id,
    entityId: row.entityId,
    name: row.name,
    i9Mode: row.i9Mode,
    requirements: row.requirements,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

engagementTemplateRoutes.post("/", zValidator("json", createSchema), async (c) => {
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
    throw new ValidationError("Engagement templates are only used on W-2 entities.");
  }

  const [row] = await db
    .insert(engagementTemplates)
    .values({
      tenantId,
      entityId: body.entityId,
      name: body.name,
      i9Mode: body.i9Mode,
      requirements: body.requirements,
      environment,
    })
    .returning();
  if (!row) throw new Error("Failed to create engagement template");

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "engagement_template.created",
    resourceType: "engagement_template",
    resourceId: row.id,
    metadata: { entityId: body.entityId, name: body.name, i9Mode: body.i9Mode },
    ipAddress: clientIp(c),
  });

  return c.json(toDTO(row), 201);
});

engagementTemplateRoutes.get("/", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const entityId = c.req.query("entityId");

  const conditions = [
    eq(engagementTemplates.tenantId, tenantId),
    eq(engagementTemplates.environment, environment),
  ];
  if (entityId) conditions.push(eq(engagementTemplates.entityId, entityId));

  const rows = await db
    .select()
    .from(engagementTemplates)
    .where(and(...conditions))
    .orderBy(desc(engagementTemplates.createdAt));

  return c.json({ data: rows.map(toDTO) });
});

engagementTemplateRoutes.delete("/:id", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [row] = await db
    .select()
    .from(engagementTemplates)
    .where(
      and(
        eq(engagementTemplates.id, id),
        eq(engagementTemplates.tenantId, tenantId),
        eq(engagementTemplates.environment, environment),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Engagement template");

  await db.delete(engagementTemplates).where(eq(engagementTemplates.id, id));

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "engagement_template.deleted",
    resourceType: "engagement_template",
    resourceId: id,
    metadata: { name: row.name },
    ipAddress: clientIp(c),
  });

  return c.json({ ok: true });
});
