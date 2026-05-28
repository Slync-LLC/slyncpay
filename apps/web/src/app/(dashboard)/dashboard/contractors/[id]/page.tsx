import { apiServerGet, ServerApiError } from "@/lib/api-server";
import { notFound } from "next/navigation";
import { ContractorDetailClient } from "./detail-client";

type W9Prefill = {
  country?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
};

type Contractor = {
  id: string;
  externalId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  onboardingStatus: string;
  createdAt: string;
  w9SeededData?: W9Prefill | null;
};

type Engagement = {
  id: string;
  engagementId: string;
  contractorId: string;
  entityId: string;
  entityName: string | null;
  status: string;
  createdAt: string;
};

type Entity = {
  id: string;
  name: string;
  einLast4: string | null;
  status: string;
};

type Payable = {
  id: string;
  amountCents: number;
  status: string;
  externalReferenceId: string | null;
  createdAt: string;
};

type OnboardingLink = { url: string; expiresAt: string };

async function safeGet<T>(path: string): Promise<T | null> {
  try {
    return await apiServerGet<T>(path);
  } catch (err) {
    if (err instanceof ServerApiError && err.statusCode === 404) return null;
    if (err instanceof ServerApiError && err.statusCode >= 400) return null;
    throw err;
  }
}

export default async function ContractorDetailPage({ params }: { params: { id: string } }) {
  const contractor = await safeGet<Contractor>(`/v1/contractors/${params.id}`);
  if (!contractor) notFound();

  const [engagementsRaw, entitiesRaw, payablesRaw, onboardingLink] = await Promise.all([
    safeGet<Engagement[]>(`/v1/contractors/${params.id}/engagements`),
    safeGet<Entity[]>(`/v1/entities`),
    safeGet<{ data: Payable[] }>(`/v1/payables?contractorId=${params.id}&limit=50`),
    contractor.onboardingStatus !== "active"
      ? safeGet<OnboardingLink>(`/v1/contractors/${params.id}/onboarding-link`)
      : null,
  ]);

  return (
    <ContractorDetailClient
      contractor={contractor}
      engagements={engagementsRaw ?? []}
      entities={entitiesRaw ?? []}
      payables={payablesRaw?.data ?? []}
      onboardingUrl={onboardingLink?.url ?? null}
      onboardingExpiresAt={onboardingLink?.expiresAt ?? null}
    />
  );
}
