import { Hono } from "hono";
import { eq, and, desc } from "@slyncpay/db";
import { db, payStatements, workers } from "@slyncpay/db";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError } from "../lib/errors.js";

export const payStatementRoutes = new Hono();
payStatementRoutes.use("*", authMiddleware);

function toDTO(row: typeof payStatements.$inferSelect) {
  return {
    id: row.id,
    payrollId: row.payrollId,
    workerId: row.workerId,
    engagementId: row.engagementId,
    grossCents: row.grossCents,
    netCents: row.netCents,
    lineItems: row.lineItems,
    status: row.status,
    correctsPayStatementId: row.correctsPayStatementId,
    createdAt: row.createdAt,
    issuedAt: row.issuedAt,
  };
}

payStatementRoutes.get("/", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const workerId = c.req.query("workerId");
  const payrollId = c.req.query("payrollId");

  const conditions = [
    eq(payStatements.tenantId, tenantId),
    eq(payStatements.environment, environment),
  ];
  if (workerId) conditions.push(eq(payStatements.workerId, workerId));
  if (payrollId) conditions.push(eq(payStatements.payrollId, payrollId));

  const rows = await db
    .select()
    .from(payStatements)
    .where(and(...conditions))
    .orderBy(desc(payStatements.issuedAt));

  const workerIds = Array.from(new Set(rows.map((r) => r.workerId)));
  const workerRows = workerIds.length
    ? await db.select({ id: workers.id, firstName: workers.firstName, lastName: workers.lastName, email: workers.email }).from(workers)
    : [];
  const byId = Object.fromEntries(workerRows.map((w) => [w.id, w]));

  return c.json({
    data: rows.map((r) => ({
      ...toDTO(r),
      worker: byId[r.workerId]
        ? { id: byId[r.workerId]!.id, firstName: byId[r.workerId]!.firstName, lastName: byId[r.workerId]!.lastName, email: byId[r.workerId]!.email }
        : null,
    })),
  });
});

payStatementRoutes.get("/:id", async (c) => {
  const { tenantId, environment } = c.var.auth;
  const { id } = c.req.param();

  const [row] = await db
    .select()
    .from(payStatements)
    .where(
      and(
        eq(payStatements.id, id),
        eq(payStatements.tenantId, tenantId),
        eq(payStatements.environment, environment),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Pay statement");

  return c.json(toDTO(row));
});
