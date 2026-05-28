"use server";

import { apiServerFetch, apiServerJson, ServerApiError } from "@/lib/api-server";

interface CreateInput {
  entityId: string;
  name: string;
  i9Mode: "self_managed" | "wingspan_managed" | "hybrid";
  requirements: Array<{ type: string; label?: string; required?: boolean }>;
}

export async function createEngagementTemplate(
  input: CreateInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const res = await apiServerJson<{ id: string }>("/v1/engagement-templates", input);
    return { ok: true, id: res.id };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}

export async function deleteEngagementTemplate(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await apiServerFetch(`/v1/engagement-templates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: body.message ?? "Failed to delete template" };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}
