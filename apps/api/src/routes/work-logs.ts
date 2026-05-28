import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc } from "@slyncpay/db";
import { db, workLogs, engagements, workers, worksites, tenantEntities } from "@slyncpay/db";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import {
  getWingspanV3Client,
  entityV3AccountId,
  hasV3Config,
} from "../lib/wingspan.js";
import { logAudit } from "../lib/audit.js";
import { clientIp } from "../lib/rate-limit.js";

export const workLogRoutes = new Hono();
workLogRoutes.use("*", authMiddleware);

const createSchema = z.object({
  workerId: z.string().uuid(),
  engagementId: z.string().uuid(),
  worksiteId: z.string().uuid(),
  periodStart: z.string().datetime({ offset: true }),
  periodEnd: z.string().datetime({ offset: true }),
  quantity: z.number().positive(),
  unit: z.string().default("Hours"),
  rateCents: z.number().int().positive(),
  externalId: z.string().max(200).optional(),
});

function toDTO(row: typeof workLogs.$inferSelect) {
  return {
    id: row.id,
    workerId: row.workerId,
    engagementId: row.engagementId,
    worksiteId: row.worksiteId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    quantity: row.quantity,
    unit: row.unit,
    rateCents: row.rateCents,
    status: row.status,
    externalId: row.externalId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    approvedAt: row.approvedAt,
  };
}

workLogRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const { tenantId, environment } = c.var.auth;
  const body = c.req.valid("json");

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(
      and(
        eq(engagements.id, body.engagementId),
        eq(engagements.tenantId, tenantId),
        eq(engagements.environment, environment),
      ),
    )
    .limit(1);
  if (!engagement) throw new NotFoundError("Engagement");
  if (engagement.type !== "employee") {
    throw new ValidationError("Work logs are only used on W-2 (employee) engagements.");
  }
  if (engagement.workerId !== body.workerId) {
    throw new ValidationError("workerId does not match this engagement.");
  }
  if (engagement.worksiteId && engagement.worksiteId !== body.worksiteId) {
    throw new ValidationError("worksiteId does not match the engagement's worksite.");
  }

  const [worksite] = await db
    .select()
    .from(worksites)
    .where(
      and(
        eq(worksites.id, body.worksiteId),
        eq(worksites.tenantId, tenantId),
        eq(worksites.environment, environment),
      ),
    )
    .limit(1);
  if (!worksite) throw new NotFoundError("Worksite");

  // Push to Wingspan V3 if configured.
  let wingspanWorkLogId: string | null = null;
  if (hasV3Config(environment) && engagement.wingspanV3EngagementId) {
    const [entity] = await db
      .select()
      .from(tenantEntities)
      .where(eq(tenantEntities.id, engagement.entityId))
      .limit(1);
    const v3AccountId = entity ? entityV3AccountId(entity, environment) : null;
    if (v3AccountId) {
      try {
        const remote = await getWingspanV3Client(environment)
          .withAccount(v3AccountId)
          .createWorkLog({
            payeeEngagementId: engagement.wingspanV3EngagementId,
            periodStart: body.periodStart,
            periodEnd: body.periodEnd,
            quantity: body.quantity,
            unit: body.unit,
            rate: body.rateCents / 100,
            ...(body.externalId ? { externalId: body.externalId } : {}),
          });
        wingspanWorkLogId = remote.workLogId;
      } catch (err) {
        console.error(`[work-log.create] Wingspan V3 createWorkLog failed:`, (err as Error).message);
      }
    }
  }

  const [row] = await db
    .insert(workLogs)
    .values({
      tenantId,
      workerId: body.workerId,
      engagementId: body.engagementId,
      worksiteId: body.worksiteId,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      quantity: String(body.quantity),
      unit: body.unit,
      rateCents: body.rateCents,
      status: "draft",
      wingspanWorkLogId,
      externalId: body.externalId ?? null,
      environment,
    })
    .returning();
  if (!row) throw new Error("Failed to create work log");

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "work_log.created",
    resourceType: "work_log",
    resourceId: row.id,
    metadata: { engagementId: body.engagementId, quantity: body.quantity, unit: body.unit },
    ipAddress: clientIp(c),
  });

  return c.json(toDTO(row), 201);
});

workLogRoutes.post("/:id/approve", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [row] = await db
    .select()
    .from(workLogs)
    .where(
      and(
        eq(workLogs.id, id),
        eq(workLogs.tenantId, tenantId),
        eq(workLogs.environment, environment),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Work log");
  if (row.status !== "draft") {
    return c.json(toDTO(row));
  }

  // Mirror approval to Wingspan V3 if we recorded the work log there.
  if (row.wingspanWorkLogId && hasV3Config(environment)) {
    const [engagement] = await db
      .select()
      .from(engagements)
      .where(eq(engagements.id, row.engagementId))
      .limit(1);
    const [entity] = engagement
      ? await db.select().from(tenantEntities).where(eq(tenantEntities.id, engagement.entityId)).limit(1)
      : [null];
    const v3AccountId = entity ? entityV3AccountId(entity, environment) : null;
    if (v3AccountId) {
      try {
        await getWingspanV3Client(environment).withAccount(v3AccountId).approveWorkLog(row.wingspanWorkLogId);
      } catch (err) {
        console.error(`[work-log.approve] V3 approveWorkLog failed:`, (err as Error).message);
      }
    }
  }

  const [updated] = await db
    .update(workLogs)
    .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(workLogs.id, id))
    .returning();
  if (!updated) throw new Error("Failed to approve work log");

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "work_log.approved",
    resourceType: "work_log",
    resourceId: id,
    metadata: { engagementId: row.engagementId },
    ipAddress: clientIp(c),
  });

  return c.json(toDTO(updated));
});

workLogRoutes.get("/", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const engagementId = c.req.query("engagementId");
  const workerId = c.req.query("workerId");
  const status = c.req.query("status");

  type WorkLogStatus = "draft" | "approved" | "processed" | "cancelled";
  const conditions = [eq(workLogs.tenantId, tenantId), eq(workLogs.environment, environment)];
  if (engagementId) conditions.push(eq(workLogs.engagementId, engagementId));
  if (workerId) conditions.push(eq(workLogs.workerId, workerId));
  if (status) conditions.push(eq(workLogs.status, status as WorkLogStatus));

  const rows = await db
    .select()
    .from(workLogs)
    .where(and(...conditions))
    .orderBy(desc(workLogs.periodStart));

  // Join workers for display.
  const workerIds = Array.from(new Set(rows.map((r) => r.workerId)));
  const workerRows = workerIds.length
    ? await db.select({ id: workers.id, firstName: workers.firstName, lastName: workers.lastName }).from(workers)
    : [];
  const byId = Object.fromEntries(workerRows.map((w) => [w.id, w]));

  return c.json({
    data: rows.map((r) => ({
      ...toDTO(r),
      worker: byId[r.workerId]
        ? {
            id: byId[r.workerId]!.id,
            firstName: byId[r.workerId]!.firstName,
            lastName: byId[r.workerId]!.lastName,
          }
        : null,
    })),
  });
});

workLogRoutes.delete("/:id", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [row] = await db
    .select()
    .from(workLogs)
    .where(
      and(
        eq(workLogs.id, id),
        eq(workLogs.tenantId, tenantId),
        eq(workLogs.environment, environment),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Work log");
  if (row.status !== "draft") {
    throw new ValidationError("Only draft work logs can be deleted.");
  }

  await db.delete(workLogs).where(eq(workLogs.id, id));

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "work_log.deleted",
    resourceType: "work_log",
    resourceId: id,
    metadata: {},
    ipAddress: clientIp(c),
  });

  return c.json({ ok: true });
});
