function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

// Live (production) Wingspan: prefer new WINGSPAN_LIVE_* vars; fall back to legacy WINGSPAN_ROOT_*.
const wingspanLiveApiToken =
  process.env["WINGSPAN_LIVE_API_TOKEN"] ?? required("WINGSPAN_ROOT_API_TOKEN");
const wingspanLiveUserId =
  process.env["WINGSPAN_LIVE_USER_ID"] ?? required("WINGSPAN_ROOT_USER_ID");
const wingspanLiveBaseUrl =
  process.env["WINGSPAN_LIVE_BASE_URL"] ??
  process.env["WINGSPAN_BASE_URL"] ??
  "https://api.wingspan.app";

// Sandbox: all optional — if missing, sandbox features return 503 at request time.
const wingspanSandboxApiToken = process.env["WINGSPAN_SANDBOX_API_TOKEN"] ?? "";
const wingspanSandboxUserId = process.env["WINGSPAN_SANDBOX_USER_ID"] ?? "";
const wingspanSandboxBaseUrl =
  process.env["WINGSPAN_SANDBOX_BASE_URL"] ?? "https://stagingapi.wingspan.app";

// V3 (W-2) — separate token slots so the W-2 tenant can use different
// credentials. Each falls back to the V1 token if unset, since V3 hits the
// same host with a different path prefix.
const wingspanLiveV3ApiToken =
  process.env["WINGSPAN_LIVE_V3_API_TOKEN"] ?? wingspanLiveApiToken;
const wingspanLiveV3BaseUrl =
  process.env["WINGSPAN_LIVE_V3_BASE_URL"] ?? wingspanLiveBaseUrl;
const wingspanLiveV3ParentAccountId =
  process.env["WINGSPAN_LIVE_V3_PARENT_ACCOUNT_ID"] ?? "";
const wingspanSandboxV3ApiToken =
  process.env["WINGSPAN_SANDBOX_V3_API_TOKEN"] ?? wingspanSandboxApiToken;
const wingspanSandboxV3BaseUrl =
  process.env["WINGSPAN_SANDBOX_V3_BASE_URL"] ?? wingspanSandboxBaseUrl;
const wingspanSandboxV3ParentAccountId =
  process.env["WINGSPAN_SANDBOX_V3_PARENT_ACCOUNT_ID"] ?? "";

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  REDIS_URL: process.env["REDIS_URL"] ?? "redis://localhost:6379",

  // Legacy names — keep around so old code paths compile during the rollout
  WINGSPAN_ROOT_API_TOKEN: wingspanLiveApiToken,
  WINGSPAN_ROOT_USER_ID: wingspanLiveUserId,
  WINGSPAN_BASE_URL: wingspanLiveBaseUrl,

  // Per-environment Wingspan configuration
  WINGSPAN_LIVE_API_TOKEN: wingspanLiveApiToken,
  WINGSPAN_LIVE_USER_ID: wingspanLiveUserId,
  WINGSPAN_LIVE_BASE_URL: wingspanLiveBaseUrl,
  WINGSPAN_SANDBOX_API_TOKEN: wingspanSandboxApiToken,
  WINGSPAN_SANDBOX_USER_ID: wingspanSandboxUserId,
  WINGSPAN_SANDBOX_BASE_URL: wingspanSandboxBaseUrl,

  // V3 (W-2)
  WINGSPAN_LIVE_V3_API_TOKEN: wingspanLiveV3ApiToken,
  WINGSPAN_LIVE_V3_BASE_URL: wingspanLiveV3BaseUrl,
  WINGSPAN_LIVE_V3_PARENT_ACCOUNT_ID: wingspanLiveV3ParentAccountId,
  WINGSPAN_SANDBOX_V3_API_TOKEN: wingspanSandboxV3ApiToken,
  WINGSPAN_SANDBOX_V3_BASE_URL: wingspanSandboxV3BaseUrl,
  WINGSPAN_SANDBOX_V3_PARENT_ACCOUNT_ID: wingspanSandboxV3ParentAccountId,

  PORT: parseInt(process.env["PORT"] ?? "3001", 10),
  API_SECRET: process.env["API_SECRET"] ?? "dev-secret",
  EIN_ENCRYPTION_KEY: required("EIN_ENCRYPTION_KEY"),
  JWT_SECRET: required("JWT_SECRET"),
  RESEND_API_KEY: process.env["RESEND_API_KEY"] ?? "",
  RESEND_FROM_EMAIL: process.env["RESEND_FROM_EMAIL"] ?? "SlyncPay <onboarding@resend.dev>",
} as const;

export function hasSandboxConfig(): boolean {
  return Boolean(env.WINGSPAN_SANDBOX_API_TOKEN && env.WINGSPAN_SANDBOX_USER_ID);
}

/** True only if V3 (W-2) is wired up for the requested env. */
export function hasV3Config(environment: "live" | "test"): boolean {
  if (environment === "test") {
    return Boolean(env.WINGSPAN_SANDBOX_V3_API_TOKEN && env.WINGSPAN_SANDBOX_V3_PARENT_ACCOUNT_ID);
  }
  return Boolean(env.WINGSPAN_LIVE_V3_API_TOKEN && env.WINGSPAN_LIVE_V3_PARENT_ACCOUNT_ID);
}

// Shared secret Wingspan signs inbound webhooks with. Set this in the Wingspan
// dashboard and as WINGSPAN_WEBHOOK_SECRET on the API service.
export const WINGSPAN_WEBHOOK_SECRET = process.env["WINGSPAN_WEBHOOK_SECRET"] ?? "";
