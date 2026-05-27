"use server";

import { revalidatePath } from "next/cache";
import { apiServerJson, apiServerFetch, ServerApiError } from "@/lib/api-server";

export async function createApiKey(input: {
  environment: "live" | "test";
  name?: string;
}): Promise<{ ok: true; key: string; id: string } | { ok: false; error: string }> {
  try {
    const created = await apiServerJson<{ id: string; key: string }>("/v1/tenant/api-keys", input);
    revalidatePath("/dashboard/developer/keys");
    return { ok: true, key: created.key, id: created.id };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}

export async function revokeApiKey(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await apiServerFetch(`/v1/tenant/api-keys/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: body.message ?? "Failed to revoke key" };
    }
    revalidatePath("/dashboard/developer/keys");
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
}
