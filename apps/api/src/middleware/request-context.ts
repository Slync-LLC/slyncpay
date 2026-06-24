import type { Context, Next } from "hono";
import { randomUUID } from "node:crypto";
import { runWithRequestContext } from "../lib/request-context.js";

/**
 * Establishes the per-request AsyncLocalStorage context that ties audit-log
 * events to the Wingspan calls they trigger. Runs before auth (which later
 * fills in tenantId/environment via setRequestTenant). An inbound
 * `X-Correlation-Id` is honored so a caller can trace across hops; otherwise a
 * fresh id is minted and echoed back on the response.
 */
export async function requestContextMiddleware(c: Context, next: Next): Promise<void> {
  const correlationId = c.req.header("X-Correlation-Id") ?? randomUUID();
  c.header("X-Correlation-Id", correlationId);
  await runWithRequestContext({ correlationId }, () => next());
}
