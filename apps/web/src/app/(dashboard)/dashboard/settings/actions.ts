"use server";

import { revalidatePath } from "next/cache";
import { apiServerJson, ServerApiError } from "@/lib/api-server";

interface UpdateTenantInput {
  name?: string;
  brandingConfig?: {
    name?: string;
    url?: string;
    supportEmail?: string;
  };
}

export async function updateTenant(input: UpdateTenantInput): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await apiServerJson("/v1/tenant", input, { method: "PATCH" });
    revalidatePath("/dashboard/settings");
    return { ok: true };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}
