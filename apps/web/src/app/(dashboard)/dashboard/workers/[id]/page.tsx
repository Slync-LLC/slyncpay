import { apiServerGet, ServerApiError } from "@/lib/api-server";
import { notFound } from "next/navigation";
import { WorkerDetailClient } from "./detail-client";

type W9Prefill = {
  middleName?: string | null;
  jobTitle?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  country?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
};

type Worker = {
  id: string;
  externalId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  onboardingStatus: string;
  createdAt: string;
  w9SeededData?: W9Prefill | null;
  ssnLast4?: string | null;
};

type Engagement = {
  id: string;
  engagementId: string;
  workerId: string;
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

export default async function WorkerDetailPage({ params }: { params: { id: string } }) {
  const worker = await safeGet<Worker>(`/v1/workers/${params.id}`);
  if (!worker) notFound();

  const [engagementsRaw, entitiesRaw, payablesRaw, onboardingLink] = await Promise.all([
    safeGet<Engagement[]>(`/v1/workers/${params.id}/engagements`),
    safeGet<Entity[]>(`/v1/entities`),
    safeGet<{ data: Payable[] }>(`/v1/payables?workerId=${params.id}&limit=50`),
    worker.onboardingStatus !== "active"
      ? safeGet<OnboardingLink>(`/v1/workers/${params.id}/onboarding-link`)
      : null,
  ]);

  return (
    <WorkerDetailClient
      worker={worker}
      engagements={engagementsRaw ?? []}
      entities={entitiesRaw ?? []}
      payables={payablesRaw?.data ?? []}
      onboardingUrl={onboardingLink?.url ?? null}
      onboardingExpiresAt={onboardingLink?.expiresAt ?? null}
    />
  );
}
