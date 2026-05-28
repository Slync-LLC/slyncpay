"use server";

import { revalidatePath } from "next/cache";
import { apiServerJson, ServerApiError } from "@/lib/api-server";

interface CreatePayableInput {
  workerId: string;
  entityId: string;
  externalReferenceId: string;
  dueDate: string;
  amountCents: number;
  lineItems: Array<{ description: string; amountCents: number; quantity?: number }>;
  idempotencyKey: string;
}

export async function createPayable(input: CreatePayableInput): Promise<
  { ok: true; payableId: string } | { ok: false; error: string }
> {
  try {
    const created = await apiServerJson<{ id: string }>(
      "/v1/payables",
      {
        workerId: input.workerId,
        entityId: input.entityId,
        externalReferenceId: input.externalReferenceId,
        dueDate: input.dueDate,
        amountCents: input.amountCents,
        lineItems: input.lineItems,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    revalidatePath("/dashboard/payables");
    return { ok: true, payableId: created.id };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}
