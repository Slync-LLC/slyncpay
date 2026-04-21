import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "@slyncpay/db";
import { db, tenants, apiKeys, provisioningJobs } from "@slyncpay/db";
import { PLAN_CONFIG } from "@slyncpay/types";
import type { TenantPlan } from "@slyncpay/types";
import { generateApiKey } from "../lib/api-keys.js";
import { getTenantSetupQueue } from "../workers/queues.js";

const signupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  companyName: z.string().min(1).max(100),
  plan: z.enum(["starter", "growth", "enterprise"]).default("starter"),
});

export const authRoutes = new Hono();

authRoutes.post("/signup", zValidator("json", signupSchema), async (c) => {
  const body = c.req.valid("json");

  const plan = body.plan as TenantPlan;
  const planConfig = PLAN_CONFIG[plan];

  // Generate a URL-safe slug from company name
  const slug =
    body.companyName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 50) +
    "-" +
    Math.random().toString(36).slice(2, 7);

  // Create tenant
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: body.companyName,
      slug,
      email: body.email,
      status: "provisioning",
      plan,
      disbursementFeeBps: planConfig.disbursementFeeBps,
      perTxFeeCents: planConfig.perTxFeeCents,
      brandingConfig: { name: body.companyName },
    })
    .returning();

  if (!tenant) throw new Error("Failed to create tenant");

  // Generate initial API key
  const generated = await generateApiKey("live");
  await db.insert(apiKeys).values({
    tenantId: tenant.id,
    keyPrefix: generated.prefix,
    keyHash: generated.hash,
    keyHint: generated.hint,
    environment: "live",
    name: "Default Key",
  });

  // Create provisioning job record
  const [job] = await db
    .insert(provisioningJobs)
    .values({
      tenantId: tenant.id,
      jobType: "tenant_setup",
      status: "pending",
    })
    .returning();

  if (!job) throw new Error("Failed to create provisioning job");

  // Enqueue async provisioning (returns immediately)
  await getTenantSetupQueue().add(
    "tenant-setup",
    { tenantId: tenant.id, provisioningJobId: job.id },
    { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
  );

  return c.json(
    {
      tenantId: tenant.id,
      apiKey: generated.plaintext, // shown ONCE — not stored in plaintext
      status: "provisioning",
      message:
        "Account created. Your Wingspan account structure is being provisioned — poll /v1/tenant/provisioning-status.",
    },
    201,
  );
});
