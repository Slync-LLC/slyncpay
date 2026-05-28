"use server";

import { redirect } from "next/navigation";
import { apiServerJson, apiServerGet, ServerApiError } from "@/lib/api-server";

interface CreateContractorInput {
  externalId: string;
  email: string;
  firstName: string;
  lastName: string;
  entityId: string;
}

export async function createContractor(input: CreateContractorInput): Promise<
  { ok: true; contractorId: string } | { ok: false; error: string }
> {
  const { entityId, ...contractorBody } = input;
  let contractorId: string;
  try {
    const created = await apiServerJson<{ id: string }>("/v1/contractors", contractorBody);
    contractorId = created.id;
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not reach the server. Please try again." };
  }

  // Attach to the selected entity (creates the engagement). If this fails the
  // contractor is still saved — the user can attach manually from the detail page.
  try {
    await apiServerJson(`/v1/contractors/${contractorId}/engagements`, { entityId });
  } catch (err) {
    const detail = err instanceof ServerApiError ? err.message : "Network error";
    return {
      ok: false,
      error: `Contractor created but couldn't attach to entity: ${detail}. Attach from the contractor detail page.`,
    };
  }

  return { ok: true, contractorId };
}

interface UpdateContractorInput {
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

export async function updateContractor(
  contractorId: string,
  input: UpdateContractorInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiServerJson(`/v1/contractors/${contractorId}`, input, { method: "PATCH" });
    return { ok: true };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}

export async function attachContractorToEntity(
  contractorId: string,
  entityId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiServerJson(`/v1/contractors/${contractorId}/engagements`, { entityId });
    return { ok: true };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}

interface PayNowInput {
  contractorId: string;
  entityId: string;
  amountCents: number;
  description?: string;
  externalReferenceId?: string;
  confirmIncludesOtherPending?: boolean;
}

export async function payContractorNow(input: PayNowInput): Promise<
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
      `/v1/contractors/${input.contractorId}/pay-now`,
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

export async function redirectToContractor(contractorId: string) {
  redirect(`/dashboard/contractors/${contractorId}`);
}

export async function getContractorOnboardingLink(
  contractorId: string,
): Promise<{ ok: true; url: string; expiresAt: string } | { ok: false; error: string }> {
  try {
    const res = await apiServerGet<{ url: string; expiresAt: string }>(
      `/v1/contractors/${contractorId}/onboarding-link`,
    );
    return { ok: true, url: res.url, expiresAt: res.expiresAt };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not fetch onboarding link" };
  }
}
