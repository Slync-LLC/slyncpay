import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Per-request context carried implicitly through the async call chain. Lets the
 * Wingspan client sink and the audit logger stamp the same `correlationId`
 * (and tenant/environment) without threading args through every call site.
 *
 * The store object is mutable on purpose: middleware creates it with a fresh
 * correlationId before auth runs, then auth fills in tenantId/environment.
 */
export interface RequestContext {
  correlationId: string;
  tenantId: string | null;
  environment: "live" | "test" | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` within a fresh request context. Returns whatever `fn` returns. */
export function runWithRequestContext<T>(
  init: Partial<RequestContext>,
  fn: () => T,
): T {
  const ctx: RequestContext = {
    correlationId: init.correlationId ?? randomUUID(),
    tenantId: init.tenantId ?? null,
    environment: init.environment ?? null,
  };
  return storage.run(ctx, fn);
}

/**
 * Establish a context for the remainder of the current async execution without
 * a callback wrapper. Intended for queue-worker processors: call once at the top
 * of the job handler so the job's Wingspan calls + audit events are correlated.
 */
export function enterRequestContext(init: Partial<RequestContext>): void {
  storage.enterWith({
    correlationId: init.correlationId ?? randomUUID(),
    tenantId: init.tenantId ?? null,
    environment: init.environment ?? null,
  });
}

/** The active context, or undefined if running outside any request/job. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Convenience: the active correlation id, or null. */
export function getCorrelationId(): string | null {
  return storage.getStore()?.correlationId ?? null;
}

/** Fill in tenant/environment on the active context once auth has resolved. */
export function setRequestTenant(tenantId: string, environment: "live" | "test"): void {
  const ctx = storage.getStore();
  if (ctx) {
    ctx.tenantId = tenantId;
    ctx.environment = environment;
  }
}
