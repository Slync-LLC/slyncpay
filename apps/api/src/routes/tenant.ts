import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, lt, lte, gte, sql, like } from "@slyncpay/db";
import { db, tenants, provisioningJobs, auditLog, apiKeys } from "@slyncpay/db";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError } from "../lib/errors.js";
import { getWingspanClient } from "../lib/wingspan.js";
import { logAudit } from "../lib/audit.js";
import { clientIp } from "../lib/rate-limit.js";

export const tenantRoutes = new Hono();
tenantRoutes.use("*", authMiddleware);

tenantRoutes.get("/", async (c) => {
  const { tenantId } = c.var.auth;
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new NotFoundError("Tenant");

  return c.json({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    email: tenant.email,
    status: tenant.status,
    plan: tenant.plan,
    disbursementFeeBps: tenant.disbursementFeeBps,
    perTxFeeCents: tenant.perTxFeeCents,
    brandingConfig: tenant.brandingConfig,
    createdAt: tenant.createdAt,
    provisionedAt: tenant.provisionedAt,
  });
});

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  brandingConfig: z
    .object({
      name: z.string().optional(),
      url: z.string().url().optional(),
      primaryLogoUrl: z.string().url().optional(),
      secondaryLogoUrl: z.string().url().optional(),
      colorPrimary: z.string().optional(),
      borderRadius: z.number().int().min(0).max(24).optional(),
      fontFamily: z.string().optional(),
      colorText: z.string().optional(),
      colorBorder: z.string().optional(),
      supportEmail: z.string().email().optional(),
      payeeSupportEmail: z.string().email().optional(),
      terminology: z
        .object({
          contractor: z.string().optional(),
          payable: z.string().optional(),
          company: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

tenantRoutes.patch("/", zValidator("json", patchSchema), async (c) => {
  const { tenantId } = c.var.auth;
  const body = c.req.valid("json");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) updates["name"] = body.name;
  if (body.brandingConfig) updates["brandingConfig"] = body.brandingConfig;

  const [updated] = await db
    .update(tenants)
    .set(updates)
    .where(eq(tenants.id, tenantId))
    .returning();

  if (!updated) throw new NotFoundError("Tenant");

  // If branding config changed, sync to Wingspan
  if (body.brandingConfig && updated.wingspanPayeeBucketUserId) {
    const bc = body.brandingConfig;
    const wingspan = getWingspanClient();

    await wingspan.updateCustomization(updated.wingspanPayeeBucketUserId, {
      ...(bc.name || bc.url || bc.primaryLogoUrl
        ? {
            branding: {
              ...(bc.name ? { name: bc.name } : {}),
              ...(bc.url ? { url: bc.url } : {}),
              ...(bc.primaryLogoUrl ? { primaryLogoUrl: bc.primaryLogoUrl } : {}),
              ...(bc.secondaryLogoUrl ? { secondaryLogoUrl: bc.secondaryLogoUrl } : {}),
            },
          }
        : {}),
      ...(bc.supportEmail || bc.payeeSupportEmail
        ? {
            support: {
              ...(bc.supportEmail ? { generalSupportEmail: bc.supportEmail } : {}),
              ...(bc.payeeSupportEmail ? { payeeSupportEmail: bc.payeeSupportEmail } : {}),
              ...(bc.url ? { documentation: { generalUrl: bc.url }, portal: { generalUrl: bc.url } } : {}),
            },
          }
        : {}),
      ...(bc.terminology
        ? {
            terminology: {
              ...(bc.terminology.contractor ? { sendPaymentsContractor: bc.terminology.contractor } : {}),
              ...(bc.terminology.payable ? { sendPaymentsPayable: bc.terminology.payable } : {}),
              ...(bc.terminology.company ? { getPaidClient: bc.terminology.company } : {}),
            },
          }
        : {}),
      ...(bc.colorPrimary || bc.borderRadius !== undefined || bc.fontFamily
        ? {
            appearance: {
              ...(bc.colorPrimary ? { colorPrimary: bc.colorPrimary } : {}),
              ...(bc.borderRadius !== undefined ? { borderRadius: bc.borderRadius } : {}),
              ...(bc.fontFamily ? { fontFamily: bc.fontFamily } : {}),
              ...(bc.colorText ? { colorText: bc.colorText } : {}),
              ...(bc.colorBorder ? { colorBorder: bc.colorBorder } : {}),
            },
          }
        : {}),
    });
  }

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "tenant.updated",
    resourceType: "tenant",
    resourceId: tenantId,
    metadata: {
      ...(body.name ? { nameChanged: true } : {}),
      ...(body.brandingConfig ? { brandingChanged: true } : {}),
    },
    ipAddress: clientIp(c),
  });

  return c.json({ id: updated.id, name: updated.name, brandingConfig: updated.brandingConfig });
});

tenantRoutes.get("/provisioning-status", async (c) => {
  const { tenantId } = c.var.auth;

  const [job] = await db
    .select()
    .from(provisioningJobs)
    .where(eq(provisioningJobs.tenantId, tenantId))
    .orderBy(provisioningJobs.createdAt)
    .limit(1);

  if (!job) {
    return c.json({ status: "not_started", stepsCompleted: [], currentStep: null });
  }

  return c.json({
    status: job.status,
    currentStep: job.currentStep,
    stepsCompleted: job.stepsCompleted,
    lastError: job.lastError,
    updatedAt: job.updatedAt,
  });
});

// ─── Activity log ─────────────────────────────────────────────────────────────

const activityLogQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  action: z.string().max(100).optional(),
  actorId: z.string().max(200).optional(),
  resourceType: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

function humanizeActor(opts: {
  actorType: string;
  actorId: string;
  keyNamesById: Record<string, { name: string | null; keyHint: string | null }>;
}): string {
  if (opts.actorType === "system") return "Dashboard session";
  if (opts.actorType === "admin") return "SlyncPay support";
  if (opts.actorType === "api_key") {
    if (opts.actorId.startsWith("session:")) return "Dashboard session";
    const meta = opts.keyNamesById[opts.actorId];
    if (meta) {
      const name = meta.name ?? "API key";
      const hint = meta.keyHint ? ` (…${meta.keyHint})` : "";
      return `${name}${hint}`;
    }
    return "API key";
  }
  return opts.actorType;
}

tenantRoutes.get(
  "/activity-log",
  zValidator("query", activityLogQuerySchema),
  async (c) => {
    const { tenantId } = c.var.auth;
    const q = c.req.valid("query");

    const conditions = [eq(auditLog.tenantId, tenantId)];
    if (q.from) conditions.push(gte(auditLog.createdAt, new Date(q.from)));
    if (q.to) conditions.push(lte(auditLog.createdAt, new Date(q.to)));
    if (q.action) conditions.push(like(auditLog.action, `%${q.action}%`));
    if (q.actorId) conditions.push(eq(auditLog.actorId, q.actorId));
    if (q.resourceType) conditions.push(eq(auditLog.resourceType, q.resourceType));
    if (q.cursor) {
      // Cursor format: ISO timestamp + "|" + id; rows strictly older than cursor
      const [tsRaw] = q.cursor.split("|");
      if (tsRaw) conditions.push(lt(auditLog.createdAt, new Date(tsRaw)));
    }

    // Fetch limit+1 to detect more
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const sliced = hasMore ? rows.slice(0, q.limit) : rows;

    // Resolve API key labels for any api_key actors
    const apiKeyIds = Array.from(
      new Set(
        sliced
          .filter((r) => r.actorType === "api_key" && !r.actorId.startsWith("session:"))
          .map((r) => r.actorId),
      ),
    );
    const keyMetaRows = apiKeyIds.length
      ? await db
          .select({ id: apiKeys.id, name: apiKeys.name, keyHint: apiKeys.keyHint })
          .from(apiKeys)
          .where(sql`${apiKeys.id} = ANY(${apiKeyIds})`)
      : [];
    const keyNamesById: Record<string, { name: string | null; keyHint: string | null }> = {};
    for (const k of keyMetaRows) {
      keyNamesById[k.id] = { name: k.name, keyHint: k.keyHint };
    }

    const events = sliced.map((r) => ({
      id: String(r.id),
      timestamp: r.createdAt,
      actorType: r.actorType,
      actorId: r.actorId,
      actorLabel: humanizeActor({ actorType: r.actorType, actorId: r.actorId, keyNamesById }),
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      metadata: r.metadata,
      ipAddress: r.ipAddress,
    }));

    const last = sliced[sliced.length - 1];
    const nextCursor = hasMore && last ? `${(last.createdAt as Date).toISOString()}|${last.id}` : null;

    return c.json({ events, nextCursor });
  },
);
