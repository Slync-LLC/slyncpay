"use server";

import { apiServerJson, ServerApiError } from "@/lib/api-server";

interface CreateWorksiteInput {
  entityId: string;
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  externalId?: string;
}

export async function createWorksite(
  input: CreateWorksiteInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const res = await apiServerJson<{ id: string }>("/v1/worksites", input);
    return { ok: true, id: res.id };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}
