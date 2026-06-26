import { WingspanClient, WingspanV3Client } from "@slyncpay/wingspan";
import { env, hasSandboxConfig, hasV3Config } from "./env.js";
import { wingspanCallSink } from "./wingspan-log.js";

export type WingspanEnvironment = "live" | "test";

const clients: Partial<Record<WingspanEnvironment, WingspanClient>> = {};
const v3Clients: Partial<Record<WingspanEnvironment, WingspanV3Client>> = {};

/**
 * Returns a memoized Wingspan root client for the requested environment.
 *
 *   - `live`  → production Wingspan
 *   - `test`  → Wingspan staging (sandbox)
 *
 * Sandbox throws if WINGSPAN_SANDBOX_API_TOKEN / WINGSPAN_SANDBOX_USER_ID
 * are not configured — callers must check `hasSandboxConfig()` first
 * (or catch and surface a 503).
 */
export function getWingspanClient(environment: WingspanEnvironment = "live"): WingspanClient {
  if (clients[environment]) return clients[environment]!;

  if (environment === "test") {
    if (!hasSandboxConfig()) {
      throw new Error(
        "Sandbox is not configured. Set WINGSPAN_SANDBOX_API_TOKEN and WINGSPAN_SANDBOX_USER_ID.",
      );
    }
    clients.test = new WingspanClient({
      apiToken: env.WINGSPAN_SANDBOX_API_TOKEN,
      baseUrl: env.WINGSPAN_SANDBOX_BASE_URL,
      onCall: wingspanCallSink,
    });
    return clients.test;
  }

  clients.live = new WingspanClient({
    apiToken: env.WINGSPAN_LIVE_API_TOKEN,
    baseUrl: env.WINGSPAN_LIVE_BASE_URL,
    onCall: wingspanCallSink,
  });
  return clients.live;
}

/** Root parent user id for the given env (used as the parent for organization associations). */
export function wingspanRootUserId(environment: WingspanEnvironment): string {
  return environment === "test" ? env.WINGSPAN_SANDBOX_USER_ID : env.WINGSPAN_LIVE_USER_ID;
}

/** UI base URL — used to construct the embedded onboarding link. */
export function wingspanUiBaseUrl(environment: WingspanEnvironment): string {
  return environment === "test" ? "https://staging-my.wingspan.app" : "https://my.wingspan.app";
}

/** Full onboarding-wizard deep-link (fallback when tax isn't yet verified). */
export function wingspanOnboardingUrl(environment: WingspanEnvironment, token: string): string {
  return `${wingspanUiBaseUrl(environment)}/member/onboarding?requestingToken=${encodeURIComponent(token)}`;
}

/**
 * Payout-method chooser deep-link. DEPRECATED for embedding — `my.wingspan.app`
 * refuses framing. Kept only as a non-iframe fallback (e.g. open in a new tab).
 * The supported embed is the `@wingspan/embedded-sdk` ManagePayoutMethod
 * component, which uses the session token + wingspanEmbedBaseUrl below.
 */
export function wingspanPayoutChooserUrl(environment: WingspanEnvironment, token: string): string {
  return `${wingspanUiBaseUrl(environment)}/member/settings/payment-methods/add-payout-method/type?requestingToken=${encodeURIComponent(token)}`;
}

/** Embed host for the Wingspan embedded SDK (`Wingspan.init({ baseUrl })`). */
export function wingspanEmbedBaseUrl(environment: WingspanEnvironment): string {
  return environment === "test"
    ? "https://staging-embedded.wingspan.app"
    : "https://embedded.wingspan.app";
}

export { hasSandboxConfig, hasV3Config };

/**
 * Returns a memoized Wingspan **V3** client for the requested environment.
 * V3 is used exclusively for W-2 payroll flows; 1099 keeps using V1 via
 * getWingspanClient(). Caller must scope to a child account via withAccount().
 *
 * Throws if V3 config is missing — callers should `hasV3Config(env)` first.
 */
export function getWingspanV3Client(environment: WingspanEnvironment = "live"): WingspanV3Client {
  if (v3Clients[environment]) return v3Clients[environment]!;

  if (!hasV3Config(environment)) {
    throw new Error(
      `Wingspan V3 (W-2) is not configured for ${environment}. Set ` +
        `WINGSPAN_${environment === "test" ? "SANDBOX" : "LIVE"}_V3_API_TOKEN and ` +
        `WINGSPAN_${environment === "test" ? "SANDBOX" : "LIVE"}_V3_PARENT_ACCOUNT_ID.`,
    );
  }

  if (environment === "test") {
    v3Clients.test = new WingspanV3Client({
      apiToken: env.WINGSPAN_SANDBOX_V3_API_TOKEN,
      baseUrl: env.WINGSPAN_SANDBOX_V3_BASE_URL,
      onCall: wingspanCallSink,
    });
    return v3Clients.test;
  }

  v3Clients.live = new WingspanV3Client({
    apiToken: env.WINGSPAN_LIVE_V3_API_TOKEN,
    baseUrl: env.WINGSPAN_LIVE_V3_BASE_URL,
    onCall: wingspanCallSink,
  });
  return v3Clients.live;
}

/** Parent (organization) V3 account ID for the requested env. */
export function wingspanV3ParentAccountId(environment: WingspanEnvironment): string {
  return environment === "test"
    ? env.WINGSPAN_SANDBOX_V3_PARENT_ACCOUNT_ID
    : env.WINGSPAN_LIVE_V3_PARENT_ACCOUNT_ID;
}

// ─── V3 platform onboarding (PREVIEW, flag-gated) ────────────────────────────

/** V3 organization id for the platform onboarding endpoints. */
export function wingspanV3OrgId(environment: WingspanEnvironment): string {
  return environment === "test" ? env.WINGSPAN_SANDBOX_V3_ORG_ID : env.WINGSPAN_LIVE_V3_ORG_ID;
}

/**
 * A V3 client authenticated with the PLATFORM token (for `/v3/platform/*`).
 * Not memoized — the platform flow is preview-only and low-volume.
 */
export function getWingspanV3PlatformClient(environment: WingspanEnvironment): WingspanV3Client {
  return new WingspanV3Client({
    apiToken:
      environment === "test"
        ? env.WINGSPAN_SANDBOX_V3_PLATFORM_TOKEN
        : env.WINGSPAN_LIVE_V3_PLATFORM_TOKEN,
    baseUrl: environment === "test" ? env.WINGSPAN_SANDBOX_V3_BASE_URL : env.WINGSPAN_LIVE_V3_BASE_URL,
    onCall: wingspanCallSink,
  });
}

/**
 * True only when the v3 onboarding flag is on AND the platform token, org id,
 * and parent account id are configured. The flag is off in production until v3
 * is GA (~mid-July).
 */
export function hasV3OnboardingConfig(environment: WingspanEnvironment): boolean {
  if (!env.WINGSPAN_V3_ONBOARDING) return false;
  const token =
    environment === "test"
      ? env.WINGSPAN_SANDBOX_V3_PLATFORM_TOKEN
      : env.WINGSPAN_LIVE_V3_PLATFORM_TOKEN;
  return Boolean(token && wingspanV3OrgId(environment) && wingspanV3ParentAccountId(environment));
}

/** Returns the entity's V3 child account ID for the requested env, or null. */
export function entityV3AccountId(
  entity: {
    wingspanV3AccountId: string | null;
    wingspanV3AccountIdSandbox: string | null;
  },
  environment: WingspanEnvironment,
): string | null {
  return environment === "test" ? entity.wingspanV3AccountIdSandbox : entity.wingspanV3AccountId;
}

/**
 * Returns the correct Wingspan child user ID for an entity in the requested
 * environment, handling legacy entities created before the env-scope refactor.
 *
 * Newer entities (post-refactor) live in one env and store their ID in
 * `wingspanChildUserId`. Legacy entities (created by the old dual-provisioning
 * worker) keep the LIVE id in `wingspanChildUserId` and the SANDBOX id in
 * `wingspanChildUserIdSandbox`.
 */
export function entityChildUserId(
  entity: {
    wingspanChildUserId: string | null;
    wingspanChildUserIdSandbox: string | null;
  },
  environment: WingspanEnvironment,
): string | null {
  if (environment === "test" && entity.wingspanChildUserIdSandbox) {
    return entity.wingspanChildUserIdSandbox;
  }
  return entity.wingspanChildUserId;
}

/** Counterpart of entityChildUserId for the auto-generated child user email. */
export function entityChildUserEmail(
  entity: {
    wingspanChildUserEmail: string | null;
    wingspanChildUserEmailSandbox: string | null;
  },
  environment: WingspanEnvironment,
): string | null {
  if (environment === "test" && entity.wingspanChildUserEmailSandbox) {
    return entity.wingspanChildUserEmailSandbox;
  }
  return entity.wingspanChildUserEmail;
}
