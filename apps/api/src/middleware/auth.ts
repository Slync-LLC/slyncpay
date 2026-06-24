import type { Context, Next } from "hono";
import { createHash } from "crypto";
import { eq, and, isNull } from "@slyncpay/db";
import { db } from "@slyncpay/db";
import { apiKeys, tenants } from "@slyncpay/db";
import { getRedis } from "../lib/redis.js";
import { verifyApiKey, extractPrefix } from "../lib/api-keys.js";
import { UnauthorizedError } from "../lib/errors.js";
import { verifyTenantSession } from "../lib/sessions.js";
import { setRequestTenant } from "../lib/request-context.js";

const CACHE_TTL_SECONDS = 60;

export interface AuthContext {
  tenantId: string;
  apiKeyId: string; // For session-auth callers, this is "session:<jti>"
  environment: "live" | "test";
  source: "api_key" | "session";
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

export async function authMiddleware(c: Context, next: Next): Promise<void> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or invalid Authorization header");
  }

  const rawToken = authHeader.slice(7);

  // Tenant session JWT (dashboard) — used by Next.js server components
  if (!rawToken.startsWith("spk_")) {
    try {
      const claims = await verifyTenantSession(rawToken);
      const [tenant] = await db
        .select({ status: tenants.status })
        .from(tenants)
        .where(eq(tenants.id, claims.tenantId))
        .limit(1);
      if (!tenant || tenant.status === "cancelled" || tenant.status === "suspended") {
        throw new UnauthorizedError("Tenant account is not active");
      }

      // Dashboard mode header — defaults to live; only test|live accepted
      const modeHeader = c.req.header("X-Slyncpay-Mode");
      const environment: "live" | "test" =
        modeHeader === "test" ? "test" : "live";

      c.set("auth", {
        tenantId: claims.tenantId,
        apiKeyId: `session:${claims.jti}`,
        environment,
        source: "session",
      });
      setRequestTenant(claims.tenantId, environment);
      await next();
      return;
    } catch {
      throw new UnauthorizedError("Invalid session token");
    }
  }

  const rawKey = rawToken;

  // Fast cache check — avoids bcrypt on every request
  const cacheKey = `auth:${createHash("sha256").update(rawKey).digest("hex")}`;
  const redis = getRedis();
  const cached = await redis.get(cacheKey);

  if (cached) {
    const parsed = JSON.parse(cached) as AuthContext;
    c.set("auth", parsed);
    setRequestTenant(parsed.tenantId, parsed.environment);
    await next();
    return;
  }

  // Slow path: DB lookup + bcrypt verify
  const prefix = extractPrefix(rawKey);
  const [keyRow] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyPrefix, prefix), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!keyRow) {
    throw new UnauthorizedError("Invalid API key");
  }

  // Check expiry
  if (keyRow.expiresAt && keyRow.expiresAt < new Date()) {
    throw new UnauthorizedError("API key expired");
  }

  const valid = await verifyApiKey(rawKey, keyRow.keyHash);
  if (!valid) {
    throw new UnauthorizedError("Invalid API key");
  }

  // Verify tenant is active
  const [tenant] = await db
    .select({ status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, keyRow.tenantId))
    .limit(1);

  if (!tenant || tenant.status === "cancelled" || tenant.status === "suspended") {
    throw new UnauthorizedError("Tenant account is not active");
  }

  const authCtx: AuthContext = {
    tenantId: keyRow.tenantId,
    apiKeyId: keyRow.id,
    environment: keyRow.environment,
    source: "api_key",
  };

  // Cache for 60s
  await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(authCtx));

  // Update last_used_at async (fire-and-forget, non-blocking)
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRow.id))
    .catch(() => {});

  c.set("auth", authCtx);
  setRequestTenant(authCtx.tenantId, authCtx.environment);
  await next();
}
