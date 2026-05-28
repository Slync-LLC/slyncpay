"use server";

import { apiServerFetch, apiServerJson, ServerApiError } from "@/lib/api-server";

interface CreateInput {
  url: string;
  description?: string;
  events: string[];
}

export async function createWebhookEndpoint(
  input: CreateInput,
): Promise<{ ok: true; id: string; signingSecret: string } | { ok: false; error: string }> {
  try {
    const res = await apiServerJson<{ id: string; signingSecret: string }>(
      "/v1/tenant/webhook-endpoints",
      input,
    );
    return { ok: true, id: res.id, signingSecret: res.signingSecret };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}

export async function deleteWebhookEndpoint(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await apiServerFetch(`/v1/tenant/webhook-endpoints/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: body.message ?? "Delete failed" };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}
