import { apiServerGet } from "@/lib/api-server";
import { KeysClient } from "./keys-client";

interface ApiKey {
  id: string;
  keyPrefix: string;
  keyHint: string;
  environment: "live" | "test";
  name: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export default async function ApiKeysPage() {
  let keys: ApiKey[] = [];
  try {
    keys = await apiServerGet<ApiKey[]>("/v1/tenant/api-keys");
  } catch {
    // fall through with empty list
  }

  return <KeysClient initialKeys={keys} />;
}
