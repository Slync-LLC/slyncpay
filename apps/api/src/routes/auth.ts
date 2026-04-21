import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "@slyncpay/db";
import { db, tenants, apiKeys, provisioningJobs } from "@slyncpay/db";
import { PLAN_CONFIG } from "@slyncpay/types";
import type { TenantPlan } from "@slyncpay/types";
import bcrypt from "bcrypt";
import { generateApiKey } from "../lib/api-keys.js";
import { getTenantSetupQueue } from "../workers/queues.js";
import { signSession } from "../lib/jwt.js";

const COOKIE_NAME = "__slyncpay_session";
const BCRYPT_ROUNDS = 12;

const signupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  companyName: z.string().min(1).max(100),
  password: z.string().min(8, "Password must be at least 8 characters"),
  plan: z.enum(["starter", "growth", "enterprise"]).default("starter"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes = new Hono();

authRoutes.post("/signup", zValidator("json", signupSchema), async (c) => {
  const body = c.req.valid("json");
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

  const [tenant] = await db
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

  const token = await signSession({
    sub: tenant.id,
    tenantId: tenant.id,
    email: tenant.email,
    name: tenant.name,
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
});

authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);

  const isValid =
    tenant?.passwordHash ? await bcrypt.compare(password, tenant.passwordHash) : false;

  if (!isValid || !tenant) {
    return c.json({ error: "invalid_credentials", message: "Invalid email or password" }, 401);
  }

  const token = await signSession({
    sub: tenant.id,
    tenantId: tenant.id,
    email: tenant.email,
    name: tenant.name,
  });

  return c.json({ token, tenantId: tenant.id });
});

authRoutes.post("/logout", (c) => {
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  // Verified by middleware — just return from cookie/header if present
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "unauthorized", message: "No session" }, 401);
  }
  return c.json({ ok: true });
});
