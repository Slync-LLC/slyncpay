import { WingspanClient } from "@slyncpay/wingspan";
import { env } from "./env.js";

let _client: WingspanClient | null = null;

/** Returns the singleton Wingspan root client. */
export function getWingspanClient(): WingspanClient {
  if (!_client) {
    _client = new WingspanClient({
      apiToken: env.WINGSPAN_ROOT_API_TOKEN,
      baseUrl: env.WINGSPAN_BASE_URL,
    });
  }
  return _client;
}
