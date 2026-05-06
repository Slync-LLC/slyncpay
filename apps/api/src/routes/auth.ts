import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import bcrypt from "bcrypt";
import { eq } from "@slyncpay/db";
import { db, tenants, apiKeys, provisioningJobs } from "@slyncpay/db";
import { PLAN_CONFIG } from "@slyncpay/types";
import type { TenantPlan } from "@slyncpay/types";
import { generateApiKey } from "../lib/api-keys.js";
import { getTenantSetupQueue } from "../workers/queues.js";
import {
  createTenantSession,
  createOtpChallenge,
  verifyOtpChallenge,
  revokeSession,
  revokeAllSessionsFor,
} from "../lib/sessions.js";
import { issueOtp, verifyOtp } from "../lib/otp.js";
import { validatePassword } from "../lib/password.js";
import { rateLimit, recordFailedLogin, isLockedOut, clearFailedLogins, clientIp } from "../lib/rate-limit.js";
import { logAudit } from "../lib/audit.js";
import { ApiError } from "../lib/errors.js";

const BCRYPT_ROUNDS = 12;
const TENANT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const signupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255).toLowerCase(),
  companyName: z.string().min(1).max(100),
  password: z.string().min(12).max(256),
  plan: z.enum(["starter", "growth", "enterprise"]).default("starter"),
});

const loginSchema = z.object({
  email: z.string().email().max(255).toLowerCase(),
  password: z.string().min(1).max(256),
});

const otpVerifySchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

export const authRoutes = new Hono();

// ─── Signup ───────────────────────────────────────────────────────────────────

authRoutes.post(
  "/signup",
  rateLimit({ windowSeconds: 3600, maxRequests: 5, keyPrefix: "signup" }),
  zValidator("json", signupSchema),
  async (c) => {
    const body = c.req.valid("json");
    const ip = clientIp(c);

    // Enforce password policy
    const policy = validatePassword(body.password);
    if (!policy.ok) {
      return c.json(
        { error: "weak_password", message: "Password does not meet requirements", details: policy.errors },
        422,
      );
    }

    const plan = body.plan as TenantPlan;
    const planConfig = PLAN_CONFIG[plan];

    const slug =
      body.companyName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 50) +
      "-" +
      Math.random().toString(36).slice(2, 7);

    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

    let tenant;
    try {
      const inserted = await db
        .insert(tenants)
        .values({
          name: body.name,
          slug,
          email: body.email,
          status: "provisioning",
          plan,
          disbursementFeeBps: planConfig.disbursementFeeBps,
          perTxFeeCents: planConfig.perTxFeeCents,
          brandingConfig: { name: body.companyName },
          passwordHash,
        })
        .returning();
      tenant = inserted[0];
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("tenants_email_unique") || msg.includes("duplicate key")) {
        // Don't leak which field collided — generic response
        throw new ApiError(409, "signup_failed", "Could not create account with the provided details");
      }
      throw err;
    }

    if (!tenant) throw new Error("Failed to create tenant");

    const generated = await generateApiKey("live");
    await db.insert(apiKeys).values({
      tenantId: tenant.id,
      keyPrefix: generated.prefix,
      keyHash: generated.hash,
      keyHint: generated.hint,
      environment: "live",
      name: "Default Key",
    });

    const [job] = await db
      .insert(provisioningJobs)
      .values({ tenantId: tenant.id, jobType: "tenant_setup", status: "pending" })
      .returning();

    if (!job) throw new Error("Failed to create provisioning job");

    await getTenantSetupQueue().add(
      "tenant-setup",
      { tenantId: tenant.id, provisioningJobId: job.id },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );

    const token = await createTenantSession(
      { tenantId: tenant.id, email: tenant.email, name: tenant.name },
      TENANT_SESSION_TTL_SECONDS,
      { ipAddress: ip, userAgent: c.req.header("User-Agent") ?? undefined },
    );

    await logAudit({
      tenantId: tenant.id,
      actorType: "system",
      actorId: tenant.id,
      action: "tenant.signup",
      resourceType: "tenant",
      resourceId: tenant.id,
      metadata: { plan, email: tenant.email },
      ipAddress: ip,
    });

    return c.json(
      {
        tenantId: tenant.id,
        apiKey: generated.plaintext,
        token,
        status: "provisioning",
      },
      201,
    );
  },
);

// ─── Login (step 1: password) ─────────────────────────────────────────────────

authRoutes.post(
  "/login",
  rateLimit({
    windowSeconds: 900,
    maxRequests: 20,
    keyPrefix: "login-ip",
  }),
  zValidator("json", loginSchema),
  async (c) => {
    const { email, password } = c.req.valid("json");
    const ip = clientIp(c);

    if (await isLockedOut(`tenant:${email}`)) {
      await logAudit({
        actorType: "system",
        actorId: email,
        action: "tenant.login.locked_out",
        ipAddress: ip,
      });
      return c.json(
        { error: "account_locked", message: "Too many failed attempts. Try again in 15 minutes." },
        429,
      );
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
    const valid = tenant?.passwordHash ? await bcrypt.compare(password, tenant.passwordHash) : false;

    if (!valid || !tenant) {
      await recordFailedLogin(`tenant:${email}`);
      await logAudit({
        actorType: "system",
        actorId: email,
        action: "tenant.login.failure",
        ipAddress: ip,
      });
      return c.json({ error: "invalid_credentials", message: "Invalid email or password" }, 401);
    }

    if (tenant.status === "cancelled" || tenant.status === "suspended") {
      await logAudit({
        tenantId: tenant.id,
        actorType: "system",
        actorId: tenant.id,
        action: "tenant.login.inactive",
        ipAddress: ip,
      });
      return c.json({ error: "account_inactive", message: "This account is no longer active" }, 403);
    }

    await clearFailedLogins(`tenant:${email}`);

    // 2FA path
    if (tenant.twoFactorEnabled) {
      const challengeToken = await createOtpChallenge({
        subjectId: tenant.id,
        subjectType: "tenant",
        email: tenant.email,
      });
      const result = await issueOtp({
        identifier: tenant.id,
        identifierType: "tenant",
        purpose: "login_2fa",
        email: tenant.email,
        ipAddress: ip,
      });

      await logAudit({
        tenantId: tenant.id,
        actorType: "system",
        actorId: tenant.id,
        action: "tenant.login.2fa_challenge",
        ipAddress: ip,
        metadata: { delivered: result.delivered },
      });

      return c.json({
        challenge: "2fa_required",
        challengeToken,
        // Only set in dev/log fallback so the user knows to check server logs
        emailDelivered: result.delivered,
      });
    }

    // No 2FA: issue session directly
    const token = await createTenantSession(
      { tenantId: tenant.id, email: tenant.email, name: tenant.name },
      TENANT_SESSION_TTL_SECONDS,
      { ipAddress: ip, userAgent: c.req.header("User-Agent") ?? undefined },
    );

    await logAudit({
      tenantId: tenant.id,
      actorType: "system",
      actorId: tenant.id,
      action: "tenant.login.success",
      ipAddress: ip,
    });

    return c.json({ token, tenantId: tenant.id });
  },
);

// ─── Login (step 2: OTP verification) ─────────────────────────────────────────

authRoutes.post(
  "/login/verify",
  rateLimit({ windowSeconds: 900, maxRequests: 20, keyPrefix: "login-verify-ip" }),
  zValidator("json", otpVerifySchema),
  async (c) => {
    const { challengeToken, code } = c.req.valid("json");
    const ip = clientIp(c);

    let claims;
    try {
      claims = await verifyOtpChallenge(challengeToken);
    } catch {
      return c.json({ error: "invalid_challenge", message: "Challenge expired. Sign in again." }, 401);
    }

    if (claims.subjectType !== "tenant") {
      return c.json({ error: "invalid_challenge", message: "Wrong challenge type" }, 401);
    }

    if (await isLockedOut(`tenant:${claims.email}`)) {
      return c.json({ error: "account_locked", message: "Too many failed attempts." }, 429);
    }

    const result = await verifyOtp({
      identifier: claims.sub,
      identifierType: "tenant",
      purpose: "login_2fa",
      code,
    });

    if (!result.ok) {
      await recordFailedLogin(`tenant:${claims.email}`);
      await logAudit({
        tenantId: claims.sub,
        actorType: "system",
        actorId: claims.sub,
        action: "tenant.login.2fa_failure",
        metadata: { reason: result.error },
        ipAddress: ip,
      });
      return c.json({ error: "invalid_code", message: "Invalid or expired verification code" }, 401);
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, claims.sub)).limit(1);
    if (!tenant) return c.json({ error: "tenant_not_found", message: "Account not found" }, 404);

    if (tenant.status === "cancelled" || tenant.status === "suspended") {
      return c.json({ error: "account_inactive", message: "This account is no longer active" }, 403);
    }

    await clearFailedLogins(`tenant:${claims.email}`);

    const token = await createTenantSession(
      { tenantId: tenant.id, email: tenant.email, name: tenant.name },
      TENANT_SESSION_TTL_SECONDS,
      { ipAddress: ip, userAgent: c.req.header("User-Agent") ?? undefined },
    );

    await logAudit({
      tenantId: tenant.id,
      actorType: "system",
      actorId: tenant.id,
      action: "tenant.login.success",
      metadata: { method: "2fa" },
      ipAddress: ip,
    });

    return c.json({ token, tenantId: tenant.id });
  },
);

// ─── Logout (revokes session server-side) ─────────────────────────────────────

authRoutes.post("/logout", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const { verifyTenantSession } = await import("../lib/sessions.js");
      const claims = await verifyTenantSession(authHeader.slice(7));
      await revokeSession(claims.jti);
      await logAudit({
        tenantId: claims.tenantId,
        actorType: "system",
        actorId: claims.tenantId,
        action: "tenant.logout",
        ipAddress: clientIp(c),
      });
    } catch {
      // Already invalid — just return ok
    }
  }
  return c.json({ ok: true });
});

// ─── Revoke all sessions (e.g. after password change) ────────────────────────

authRoutes.post("/logout-all", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "unauthorized" }, 401);
  }
  try {
    const { verifyTenantSession } = await import("../lib/sessions.js");
    const claims = await verifyTenantSession(authHeader.slice(7));
    await revokeAllSessionsFor(claims.tenantId, "tenant");
    await logAudit({
      tenantId: claims.tenantId,
      actorType: "system",
      actorId: claims.tenantId,
      action: "tenant.logout_all",
      ipAddress: clientIp(c),
    });
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "unauthorized" }, 401);
  }
});
