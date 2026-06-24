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
