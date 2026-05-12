/**
 * Server-side API client for the tenant dashboard.
 *
 * Reads the tenant session JWT from the `__slyncpay_session` cookie and forwards
 * it as Bearer to the SlyncPay API. Server Components and Server Actions only —
 * never import from a Client Component.
 */

import { cookies } from "next/headers";

const API_BASE = process.env["API_URL"] ?? "https://slyncpay-api.onrender.com";
const SESSION_COOKIE = "__slyncpay_session";

export class ServerApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly error: string,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

export async function apiServerFetch(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<Response> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers ?? {}) as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  return fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
}

export async function apiServerGet<T>(path: string): Promise<T> {
  const res = await apiServerFetch(path);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new ServerApiError(res.status, body.error ?? "unknown", body.message ?? "Request failed", body);
  }
  return (await res.json()) as T;
}

export async function apiServerJson<T>(
  path: string,
  body: unknown,
  init: { method?: string; idempotencyKey?: string } = {},
): Promise<T> {
  const res = await apiServerFetch(path, {
    method: init.method ?? "POST",
    body: JSON.stringify(body),
    ...(init.idempotencyKey ? { idempotencyKey: init.idempotencyKey } : {}),
  });
  const respBody = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new ServerApiError(
      res.status,
      (respBody.error as string) ?? "unknown",
      (respBody.message as string) ?? "Request failed",
      respBody,
    );
  }
  return respBody as T;
}
