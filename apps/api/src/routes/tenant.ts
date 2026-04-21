import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "@slyncpay/db";
import { db, tenants, provisioningJobs } from "@slyncpay/db";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError } from "../lib/errors.js";
import { getWingspanClient } from "../lib/wingspan.js";

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
