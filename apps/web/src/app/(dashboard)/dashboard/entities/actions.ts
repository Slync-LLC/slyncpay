"use server";

import { revalidatePath } from "next/cache";
import { apiServerJson, ServerApiError } from "@/lib/api-server";

interface CreateEntityInput {
  name: string;
  ein: string;
  state?: string;
}

export async function createEntity(input: CreateEntityInput): Promise<
  { ok: true; entityId: string } | { ok: false; error: string }
> {
  try {
    const created = await apiServerJson<{ id: string }>("/v1/entities", input);
    revalidatePath("/dashboard/entities");
    return { ok: true, entityId: created.id };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}
