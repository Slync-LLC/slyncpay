"use server";

import { redirect } from "next/navigation";
import { apiServerJson, apiServerGet, ServerApiError } from "@/lib/api-server";

interface CreateWorkerInput {
  externalId: string;
  email: string;
  firstName: string;
  lastName: string;
  entityId: string;
  w9Prefill?: Record<string, string>;
  ssn?: string;
  contractorType?: "individual" | "business";
  business?: {
    legalBusinessName?: string;
    ein?: string;
    structure?: string;
    stateOfIncorporation?: string;
    yearOfIncorporation?: string;
    phoneNumber?: string;
    address?: Record<string, string>;
  };
}

export async function createWorker(input: CreateWorkerInput): Promise<
  { ok: true; workerId: string } | { ok: false; error: string }
> {
  const { entityId, ...workerBody } = input;
  let workerId: string;
  try {
    const created = await apiServerJson<{ id: string }>("/v1/workers", workerBody);
    workerId = created.id;
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not reach the server. Please try again." };
  }

  // Attach to the selected entity (creates the engagement). If this fails the
  // worker is still saved — the user can attach manually from the detail page.
  try {
    await apiServerJson(`/v1/workers/${workerId}/engagements`, { entityId });
  } catch (err) {
    const detail = err instanceof ServerApiError ? err.message : "Network error";
    return {
      ok: false,
      error: `Worker created but couldn't attach to entity: ${detail}. Attach from the worker detail page.`,
    };
  }

  return { ok: true, workerId };
}

interface UpdateWorkerInput {
  firstName?: string | null;
  lastName?: string | null;
  onboardingStatus?: "invited" | "w9_pending" | "payout_pending" | "active" | "inactive";
  w9Prefill?: {
    middleName?: string;
    jobTitle?: string;
    dateOfBirth?: string;
    phone?: string;
    country?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  ssn?: string;
}

export async function updateWorker(
  workerId: string,
  input: UpdateWorkerInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiServerJson(`/v1/workers/${workerId}`, input, { method: "PATCH" });
    return { ok: true };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}

export async function attachWorkerToEntity(
  workerId: string,
  entityId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiServerJson(`/v1/workers/${workerId}/engagements`, { entityId });
    return { ok: true };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}

interface PayNowInput {
  workerId: string;
  entityId: string;
  amountCents: number;
  description?: string;
  externalReferenceId?: string;
  confirmIncludesOtherPending?: boolean;
}

export async function payWorkerNow(input: PayNowInput): Promise<
  | { ok: true; disbursementId: string; payableId: string }
  | { ok: false; error: string; needsConfirm?: boolean; pendingCount?: number; pendingTotalCents?: number }
> {
  // Generate a stable idempotency key per call (server-side actions get fresh keys per click)
  const idempotencyKey = crypto.randomUUID();
  try {
    const res = await apiServerJson<{
      payable: { id: string };
      disbursement: { id: string };
    }>(
      `/v1/workers/${input.workerId}/pay-now`,
      {
        entityId: input.entityId,
        amountCents: input.amountCents,
        ...(input.description ? { description: input.description } : {}),
        ...(input.externalReferenceId ? { externalReferenceId: input.externalReferenceId } : {}),
        ...(input.confirmIncludesOtherPending ? { confirmIncludesOtherPending: true } : {}),
      },
      { idempotencyKey },
    );
    return { ok: true, payableId: res.payable.id, disbursementId: res.disbursement.id };
  } catch (err) {
    if (err instanceof ServerApiError) {
      if (err.statusCode === 409 && err.error === "other_pending_payables") {
        const body = err.body as { pendingPayables?: Array<{ amountCents: number }>; totalAmountCents?: number };
        return {
          ok: false,
          error: err.message,
          needsConfirm: true,
          pendingCount: body?.pendingPayables?.length ?? 0,
          pendingTotalCents: body?.totalAmountCents ?? 0,
        };
      }
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Network error" };
  }
}

export async function redirectToWorker(workerId: string) {
  redirect(`/dashboard/workers/${workerId}`);
}

export async function getWorkerOnboardingLink(
  workerId: string,
): Promise<{ ok: true; url: string; expiresAt: string } | { ok: false; error: string }> {
  try {
    const res = await apiServerGet<{ url: string; expiresAt: string }>(
      `/v1/workers/${workerId}/onboarding-link`,
    );
    return { ok: true, url: res.url, expiresAt: res.expiresAt };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not fetch onboarding link" };
  }
}
