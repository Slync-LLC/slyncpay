import { apiServerGet, ServerApiError } from "@/lib/api-server";
import { WebhooksClient } from "./webhooks-client";

interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  status: "active" | "disabled";
  secretHint: string;
  createdAt: string;
}

async function safeGet<T>(path: string): Promise<T | null> {
  try {
    return await apiServerGet<T>(path);
  } catch (err) {
    if (err instanceof ServerApiError) return null;
    throw err;
  }
}

export default async function WebhooksPage() {
  const endpoints = (await safeGet<WebhookEndpoint[]>("/v1/tenant/webhook-endpoints")) ?? [];

  return <WebhooksClient initial={endpoints} />;
}
