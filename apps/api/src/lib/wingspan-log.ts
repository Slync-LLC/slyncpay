import { db, wingspanApiLog } from "@slyncpay/db";
import type { WingspanCallLog } from "@slyncpay/wingspan";
import { getRequestContext } from "./request-context.js";

const REDACTED = "[REDACTED]";

/**
 * Object keys whose values are masked before persisting. Matched
 * case-insensitively against the key name (substring), so e.g. `payeeW9Data.ssn`
 * and `socialSecurityNumber` both match "ssn". Keep this list conservative —
 * it's the only thing standing between Wingspan PII and our database.
 */
const SENSITIVE_KEY_PATTERNS = [
  "ssn",
  "socialsecurity",
  "taxid",
  "tin",
  "ein",
  "token",
  "password",
  "secret",
  "authorization",
  "accountnumber",
  "routingnumber",
  "bankaccount",
  "dateofbirth",
  "dob",
  "apikey",
];

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => k.includes(p));
}

/** Recursively mask sensitive values while preserving overall structure. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = isSensitiveKey(k) ? REDACTED : v;
  }
  return out;
}

/**
 * Sink wired into every Wingspan client. Reads the active request context for
 * correlation/tenant, redacts secrets, and persists fire-and-forget so logging
 * never blocks or breaks the originating call.
 */
export function wingspanCallSink(entry: WingspanCallLog): void {
  const ctx = getRequestContext();

  void db
    .insert(wingspanApiLog)
    .values({
      tenantId: ctx?.tenantId ?? null,
      correlationId: ctx?.correlationId ?? null,
      environment: ctx?.environment ?? null,
      apiVersion: entry.apiVersion,
      method: entry.method,
      url: entry.url,
      requestHeaders: redactHeaders(entry.requestHeaders),
      requestBody: entry.requestBody === undefined ? null : redact(entry.requestBody),
      responseStatus: entry.responseStatus,
      responseBody: entry.responseBody === undefined ? null : redact(entry.responseBody),
      wingspanRequestId: entry.requestId ?? null,
      durationMs: Math.round(entry.durationMs),
      error: entry.error ?? null,
    })
    .catch((err: unknown) => {
      console.error("[wingspan-log] failed to persist call:", (err as Error).message);
    });
}
