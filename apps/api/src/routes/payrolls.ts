import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, inArray } from "@slyncpay/db";
import {
  db,
  payrolls,
  payStatements,
  workLogs,
  engagements,
  tenantEntities,
} from "@slyncpay/db";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import {
  getWingspanV3Client,
  entityV3AccountId,
  hasV3Config,
} from "../lib/wingspan.js";
import { logAudit } from "../lib/audit.js";
import { clientIp } from "../lib/rate-limit.js";

export const payrollRoutes = new Hono();
payrollRoutes.use("*", authMiddleware);

const createSchema = z.object({
  entityId: z.string().uuid(),
  type: z.enum(["regular", "off_cycle"]).default("regular"),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function toDTO(row: typeof payrolls.$inferSelect) {
  return {
    id: row.id,
    entityId: row.entityId,
    type: row.type,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    payDate: row.payDate,
    status: row.status,
    totalEmployeeGrossCents: row.totalEmployeeGrossCents,
    totalEmployerTaxCents: row.totalEmployerTaxCents,
    totalNetCents: row.totalNetCents,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    approvedAt: row.approvedAt,
    paidAt: row.paidAt,
  };
}

// Create a payroll run from approved work logs in the period.
payrollRoutes.post("/", zValidator("json", createSchema), async (c) => {
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
    throw new ValidationError("Payrolls are only for W-2 entities.");
  }

  // Pull approved + unprocessed work logs in the period for this entity.
  const entityEngagements = await db
    .select({ id: engagements.id, wingspanV3EngagementId: engagements.wingspanV3EngagementId, worksiteId: engagements.worksiteId })
    .from(engagements)
    .where(
      and(
        eq(engagements.entityId, body.entityId),
        eq(engagements.environment, environment),
        eq(engagements.type, "employee"),
      ),
    );

  if (entityEngagements.length === 0) {
    throw new ValidationError("No W-2 engagements found on this entity.");
  }

  let wingspanPayrollId: string | null = null;
  let totals = { gross: 0, employerTax: 0, net: 0 };

  if (hasV3Config(environment)) {
    const v3AccountId = entityV3AccountId(entity, environment);
    if (v3AccountId) {
      try {
        const employeeItems = entityEngagements
          .filter((e) => e.wingspanV3EngagementId && e.worksiteId)
          .map((e) => ({
            payeeEngagementId: e.wingspanV3EngagementId!,
            worksiteId: e.worksiteId!,
          }));
        const remote = await getWingspanV3Client(environment).withAccount(v3AccountId).createPayroll({
          type: body.type === "off_cycle" ? "OffCycle" : "Regular",
          periodStart: body.periodStart,
          periodEnd: body.periodEnd,
          payDate: body.payDate,
          employeeItems,
        });
        wingspanPayrollId = remote.payrollId;
        if (remote.totals) {
          totals = {
            gross: Math.round((remote.totals.employeeGross ?? 0) * 100),
            employerTax: Math.round((remote.totals.employerTaxes ?? 0) * 100),
            net: Math.round((remote.totals.net ?? 0) * 100),
          };
        }
      } catch (err) {
        console.error(`[payroll.create] V3 createPayroll failed:`, (err as Error).message);
      }
    }
  }

  const [row] = await db
    .insert(payrolls)
    .values({
      tenantId,
      entityId: body.entityId,
      type: body.type,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      payDate: body.payDate,
      status: "draft",
      wingspanPayrollId,
      totalEmployeeGrossCents: totals.gross,
      totalEmployerTaxCents: totals.employerTax,
      totalNetCents: totals.net,
      environment,
    })
    .returning();
  if (!row) throw new Error("Failed to create payroll");

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "payroll.created",
    resourceType: "payroll",
    resourceId: row.id,
    metadata: { entityId: body.entityId, periodStart: body.periodStart, periodEnd: body.periodEnd },
    ipAddress: clientIp(c),
  });

  return c.json(toDTO(row), 201);
});

// Preview a payroll — gives totals + per-employee breakdown.
payrollRoutes.post("/:id/preview", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [row] = await db
    .select()
    .from(payrolls)
    .where(
      and(
        eq(payrolls.id, id),
        eq(payrolls.tenantId, tenantId),
        eq(payrolls.environment, environment),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Payroll");

  let updated: typeof row | undefined = undefined;
  if (hasV3Config(environment) && row.wingspanPayrollId) {
    const [entity] = await db
      .select()
      .from(tenantEntities)
      .where(eq(tenantEntities.id, row.entityId))
      .limit(1);
    const v3AccountId = entity ? entityV3AccountId(entity, environment) : null;
    if (v3AccountId) {
      try {
        const remote = await getWingspanV3Client(environment)
          .withAccount(v3AccountId)
          .previewPayroll(row.wingspanPayrollId);
        const next = await db
          .update(payrolls)
          .set({
            status: "previewed",
            totalEmployeeGrossCents: Math.round((remote.totals?.employeeGross ?? 0) * 100),
            totalEmployerTaxCents: Math.round((remote.totals?.employerTaxes ?? 0) * 100),
            totalNetCents: Math.round((remote.totals?.net ?? 0) * 100),
            updatedAt: new Date(),
          })
          .where(eq(payrolls.id, id))
          .returning();
        updated = next[0];
      } catch (err) {
        console.error(`[payroll.preview] V3 previewPayroll failed:`, (err as Error).message);
      }
    }
  }

  return c.json(toDTO(updated ?? row));
});

// Approve a payroll — triggers the actual ACH debit at Wingspan.
payrollRoutes.post("/:id/approve", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [row] = await db
    .select()
    .from(payrolls)
    .where(
      and(
        eq(payrolls.id, id),
        eq(payrolls.tenantId, tenantId),
        eq(payrolls.environment, environment),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Payroll");
  if (row.status === "approved" || row.status === "paid") {
    return c.json(toDTO(row));
  }

  if (hasV3Config(environment) && row.wingspanPayrollId) {
    const [entity] = await db
      .select()
      .from(tenantEntities)
      .where(eq(tenantEntities.id, row.entityId))
      .limit(1);
    const v3AccountId = entity ? entityV3AccountId(entity, environment) : null;
    if (v3AccountId) {
      try {
        await getWingspanV3Client(environment).withAccount(v3AccountId).approvePayroll(row.wingspanPayrollId);
      } catch (err) {
        console.error(`[payroll.approve] V3 approvePayroll failed:`, (err as Error).message);
        throw err;
      }
    }
  }

  const [updated] = await db
    .update(payrolls)
    .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(payrolls.id, id))
    .returning();
  if (!updated) throw new Error("Failed to approve payroll");

  // Mark associated work logs as processed.
  const logsInPeriod = await db
    .select({ id: workLogs.id })
    .from(workLogs)
    .where(
      and(
        eq(workLogs.tenantId, tenantId),
        eq(workLogs.environment, environment),
        eq(workLogs.status, "approved"),
      ),
    );
  if (logsInPeriod.length) {
    await db
      .update(workLogs)
      .set({ status: "processed", updatedAt: new Date() })
      .where(inArray(workLogs.id, logsInPeriod.map((l) => l.id)));
  }

  await logAudit({
    tenantId,
    actorType: "api_key",
    actorId: c.var.auth.apiKeyId,
    action: "payroll.approved",
    resourceType: "payroll",
    resourceId: id,
    metadata: { entityId: row.entityId },
    ipAddress: clientIp(c),
  });

  return c.json(toDTO(updated));
});

payrollRoutes.get("/", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const entityId = c.req.query("entityId");

  const conditions = [eq(payrolls.tenantId, tenantId), eq(payrolls.environment, environment)];
  if (entityId) conditions.push(eq(payrolls.entityId, entityId));

  const rows = await db
    .select()
    .from(payrolls)
    .where(and(...conditions))
    .orderBy(desc(payrolls.payDate));

  return c.json({ data: rows.map(toDTO) });
});

payrollRoutes.get("/:id", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [row] = await db
    .select()
    .from(payrolls)
    .where(
      and(
        eq(payrolls.id, id),
        eq(payrolls.tenantId, tenantId),
        eq(payrolls.environment, environment),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Payroll");

  const statements = await db
    .select()
    .from(payStatements)
    .where(eq(payStatements.payrollId, id));

  return c.json({
    ...toDTO(row),
    payStatements: statements.map((s) => ({
      id: s.id,
      workerId: s.workerId,
      grossCents: s.grossCents,
      netCents: s.netCents,
      status: s.status,
      issuedAt: s.issuedAt,
    })),
  });
});
