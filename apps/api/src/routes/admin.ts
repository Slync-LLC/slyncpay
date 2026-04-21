import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, count, sum, desc } from "@slyncpay/db";
import { db, admins, tenants, contractors, payables, disbursements } from "@slyncpay/db";
import bcrypt from "bcrypt";
import { signAdminSession, signSession } from "../lib/jwt.js";
import { adminAuthMiddleware } from "../middleware/admin-auth.js";
import { ApiError } from "../lib/errors.js";

export const adminRoutes = new Hono();

// ─── Public: Admin login ──────────────────────────────────────────────────────

adminRoutes.post(
  "/login",
  zValidator("json", z.object({ email: z.string().email(), password: z.string().min(1) })),
  async (c) => {
    const { email, password } = c.req.valid("json");

    const [admin] = await db.select().from(admins).where(eq(admins.email, email)).limit(1);

    const valid = admin?.passwordHash ? await bcrypt.compare(password, admin.passwordHash) : false;
    if (!valid || !admin) {
      return c.json({ error: "invalid_credentials", message: "Invalid email or password" }, 401);
    }

    void db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id)).catch(() => {});

    const token = await signAdminSession({ sub: admin.id, adminId: admin.id, email: admin.email, name: admin.name });
    return c.json({ token, adminId: admin.id, name: admin.name });
  },
);

// ─── Protected: all routes below require admin JWT ────────────────────────────

adminRoutes.use("/*", adminAuthMiddleware);

// ─── Tenants ──────────────────────────────────────────────────────────────────

adminRoutes.get("/tenants", async (c) => {
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      email: tenants.email,
      slug: tenants.slug,
      status: tenants.status,
      plan: tenants.plan,
      createdAt: tenants.createdAt,
      provisionedAt: tenants.provisionedAt,
    })
    .from(tenants)
    .orderBy(desc(tenants.createdAt));

  // Attach aggregate counts in a second pass (no lateral join needed for small N)
  const tenantIds = rows.map((r) => r.id);

  const [contractorCounts, payableCounts, disbursementCounts] = await Promise.all([
    tenantIds.length
      ? db
          .select({ tenantId: contractors.tenantId, n: count() })
          .from(contractors)
          .groupBy(contractors.tenantId)
      : [],
    tenantIds.length
      ? db
          .select({ tenantId: payables.tenantId, n: count(), totalCents: sum(payables.amountCents) })
          .from(payables)
          .groupBy(payables.tenantId)
      : [],
    tenantIds.length
      ? db
          .select({ tenantId: disbursements.tenantId, n: count() })
          .from(disbursements)
          .groupBy(disbursements.tenantId)
      : [],
  ]);

  const contractorMap = Object.fromEntries(contractorCounts.map((r) => [r.tenantId, Number(r.n)]));
  const payableMap = Object.fromEntries(payableCounts.map((r) => [r.tenantId, { n: Number(r.n), totalCents: Number(r.totalCents ?? 0) }]));
  const disbMap = Object.fromEntries(disbursementCounts.map((r) => [r.tenantId, Number(r.n)]));

  return c.json(
    rows.map((r) => ({
      ...r,
      contractorsCount: contractorMap[r.id] ?? 0,
      payablesCount: payableMap[r.id]?.n ?? 0,
      payablesTotalCents: payableMap[r.id]?.totalCents ?? 0,
      disbursementsCount: disbMap[r.id] ?? 0,
    })),
  );
});

adminRoutes.get("/tenants/:id", async (c) => {
  const { id } = c.req.param();

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) throw new ApiError(404, "not_found", "Tenant not found");

  const [[contractorsCount], [payablesStats], [disbursementsCount]] = await Promise.all([
    db.select({ n: count() }).from(contractors).where(eq(contractors.tenantId, id)),
    db
      .select({ n: count(), totalCents: sum(payables.amountCents) })
      .from(payables)
      .where(eq(payables.tenantId, id)),
    db.select({ n: count() }).from(disbursements).where(eq(disbursements.tenantId, id)),
  ]);

  return c.json({
    ...tenant,
    passwordHash: undefined,
    stats: {
      contractorsCount: Number(contractorsCount?.n ?? 0),
      payablesCount: Number(payablesStats?.n ?? 0),
      payablesTotalCents: Number(payablesStats?.totalCents ?? 0),
      disbursementsCount: Number(disbursementsCount?.n ?? 0),
    },
  });
});

adminRoutes.post("/tenants/:id/impersonate", async (c) => {
  const { id } = c.req.param();

  const [tenant] = await db
    .select({ id: tenants.id, email: tenants.email, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);

  if (!tenant) throw new ApiError(404, "not_found", "Tenant not found");

  const token = await signSession({
    sub: tenant.id,
    tenantId: tenant.id,
    email: tenant.email,
    name: tenant.name,
  });

  return c.json({ token, tenantId: tenant.id, tenantName: tenant.name });
});

adminRoutes.patch("/tenants/:id/status", async (c) => {
  const { id } = c.req.param();
  const { status } = await c.req.json<{ status: "active" | "suspended" | "cancelled" }>();

  const [updated] = await db
    .update(tenants)
    .set({ status, updatedAt: new Date() })
    .where(eq(tenants.id, id))
    .returning({ id: tenants.id, status: tenants.status });

  if (!updated) throw new ApiError(404, "not_found", "Tenant not found");
  return c.json(updated);
});

// ─── Tenant sub-resources ─────────────────────────────────────────────────────

adminRoutes.get("/tenants/:id/contractors", async (c) => {
  const { id } = c.req.param();
  const rows = await db
    .select()
    .from(contractors)
    .where(eq(contractors.tenantId, id))
    .orderBy(desc(contractors.createdAt));

  return c.json(rows);
});

adminRoutes.get("/tenants/:id/payables", async (c) => {
  const { id } = c.req.param();
  const rows = await db
    .select()
    .from(payables)
    .where(eq(payables.tenantId, id))
    .orderBy(desc(payables.createdAt));

  return c.json(rows);
});

adminRoutes.get("/tenants/:id/disbursements", async (c) => {
  const { id } = c.req.param();
  const rows = await db
    .select()
    .from(disbursements)
    .where(eq(disbursements.tenantId, id))
    .orderBy(desc(disbursements.initiatedAt));

  return c.json(rows);
});
