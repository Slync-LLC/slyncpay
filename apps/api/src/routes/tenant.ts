import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, lt, lte, gte, sql, like, isNull } from "@slyncpay/db";
import { db, tenants, provisioningJobs, auditLog, apiKeys } from "@slyncpay/db";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError, ApiError } from "../lib/errors.js";
import { getWingspanClient } from "../lib/wingspan.js";
import { logAudit } from "../lib/audit.js";
import { clientIp } from "../lib/rate-limit.js";
import { generateApiKey } from "../lib/api-keys.js";

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

// ─── API key management ───────────────────────────────────────────────────────

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  environment: z.enum(["live", "test"]),
});

tenantRoutes.post(
  "/api-keys",
  zValidator("json", createApiKeySchema),
  async (c) => {
    const { tenantId } = c.var.auth;
    const { name, environment } = c.req.valid("json");

    const generated = await generateApiKey(environment);
    const [inserted] = await db
      .insert(apiKeys)
      .values({
        tenantId,
        keyPrefix: generated.prefix,
        keyHash: generated.hash,
        keyHint: generated.hint,
        environment,
        name: name ?? `${environment === "test" ? "Sandbox" : "Live"} Key`,
      })
      .returning({
        id: apiKeys.id,
        keyPrefix: apiKeys.keyPrefix,
        keyHint: apiKeys.keyHint,
        environment: apiKeys.environment,
        name: apiKeys.name,
        createdAt: apiKeys.createdAt,
      });

    if (!inserted) throw new Error("Failed to create API key");

    await logAudit({
      tenantId,
      actorType: c.var.auth.source === "session" ? "system" : "api_key",
      actorId: c.var.auth.apiKeyId,
      action: "apikey.created",
      resourceType: "api_key",
      resourceId: inserted.id,
      metadata: { environment, name: inserted.name },
      ipAddress: clientIp(c),
    });

    return c.json(
      {
        ...inserted,
        // Plaintext shown ONCE. Caller must store it now.
        key: generated.plaintext,
      },
      201,
    );
  },
);

tenantRoutes.get("/api-keys", async (c) => {
  const { tenantId } = c.var.auth;
  const rows = await db
    .select({
      id: apiKeys.id,
      keyPrefix: apiKeys.keyPrefix,
      keyHint: apiKeys.keyHint,
      environment: apiKeys.environment,
      name: apiKeys.name,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId))
    .orderBy(desc(apiKeys.createdAt));
  return c.json(rows);
});

tenantRoutes.delete("/api-keys/:id", async (c) => {
  const { tenantId } = c.var.auth;
  const { id } = c.req.param();

  // Confirm key belongs to tenant and isn't already revoked
  const [key] = await db
    .select({ id: apiKeys.id, environment: apiKeys.environment, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, tenantId)))
    .limit(1);
  if (!key) throw new NotFoundError("API key");
  if (key.revokedAt) throw new ApiError(409, "already_revoked", "Key is already revoked");

  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)));

  await logAudit({
    tenantId,
    actorType: c.var.auth.source === "session" ? "system" : "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "apikey.revoked",
    resourceType: "api_key",
    resourceId: id,
    metadata: { environment: key.environment },
    ipAddress: clientIp(c),
  });

  return c.json({ ok: true });
});

// ─── Webhook endpoints (outbound) ────────────────────────────────────────────

tenantRoutes.get("/webhook-endpoints", async (c) => {
  const { tenantId } = c.var.auth;
  const { webhookEndpoints } = await import("@slyncpay/db");
  const rows = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.tenantId, tenantId));
  // Never echo the signing secret back; only show a hint.
  return c.json(
    rows.map((r) => ({
      id: r.id,
      url: r.url,
      description: r.description,
      events: r.events,
      status: r.status,
      secretHint: `••••${r.signingSecret.slice(-4)}`,
      createdAt: r.createdAt,
    })),
  );
});

const createEndpointSchema = z.object({
  url: z.string().url(),
  description: z.string().max(200).optional(),
  events: z.array(z.string()).default([]),
});

tenantRoutes.post(
  "/webhook-endpoints",
  zValidator("json", createEndpointSchema),
  async (c) => {
    const { tenantId } = c.var.auth;
    const body = c.req.valid("json");
    const { webhookEndpoints } = await import("@slyncpay/db");
    const { randomBytes } = await import("crypto");
    const signingSecret = `whsec_${randomBytes(32).toString("hex")}`;

    const [row] = await db
      .insert(webhookEndpoints)
      .values({
        tenantId,
        url: body.url,
        description: body.description ?? null,
        events: body.events,
        signingSecret,
      })
      .returning();
    if (!row) throw new Error("Failed to create webhook endpoint");

    await logAudit({
      tenantId,
      actorType: "api_key",
      actorId: c.var.auth.apiKeyId,
      action: "webhook_endpoint.created",
      resourceType: "webhook_endpoint",
      resourceId: row.id,
      metadata: { url: body.url, events: body.events },
      ipAddress: clientIp(c),
    });

    // Show the secret in plaintext exactly once on the create response.
    return c.json(
      {
        id: row.id,
        url: row.url,
        description: row.description,
        events: row.events,
        status: row.status,
        signingSecret,
        createdAt: row.createdAt,
      },
      201,
    );
  },
);

tenantRoutes.delete("/webhook-endpoints/:id", async (c) => {
  const { tenantId } = c.var.auth;
  const { id } = c.req.param();
  const { webhookEndpoints, and } = await import("@slyncpay/db");

  const [row] = await db
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new NotFoundError("Webhook endpoint");

  await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "webhook_endpoint.deleted",
    resourceType: "webhook_endpoint",
    resourceId: id,
    metadata: {},
    ipAddress: clientIp(c),
  });

  return c.json({ ok: true });
});
