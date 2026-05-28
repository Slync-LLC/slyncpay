import { WingspanClient } from "@slyncpay/wingspan";
import { env, hasSandboxConfig } from "./env.js";

export type WingspanEnvironment = "live" | "test";

const clients: Partial<Record<WingspanEnvironment, WingspanClient>> = {};

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
    });
    return clients.test;
  }

  clients.live = new WingspanClient({
    apiToken: env.WINGSPAN_LIVE_API_TOKEN,
    baseUrl: env.WINGSPAN_LIVE_BASE_URL,
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

export { hasSandboxConfig };

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
