import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { apiServerGet, ServerApiError } from "@/lib/api-server";
import { DisbursementDetailClient } from "./detail-client";

interface ContractorOnPayable {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  externalId: string;
}

interface PayableInDisbursement {
  id: string;
  contractorId: string;
  amountCents: number;
  status: string;
  externalReferenceId: string | null;
  contractor: ContractorOnPayable | null;
}

interface DisbursementDetail {
  id: string;
  entityId: string;
  status: string;
  totalPayablesCount: number;
  totalAmountCents: number;
  initiatedAt: string;
  completedAt: string | null;
  submittedToProcessor?: boolean;
  payables: PayableInDisbursement[];
}

interface Entity {
  id: string;
  name: string;
}

async function safeGet<T>(path: string): Promise<T | null> {
  try {
    return await apiServerGet<T>(path);
  } catch (err) {
    if (err instanceof ServerApiError) return null;
    throw err;
  }
}

export default async function DisbursementDetailPage({ params }: { params: { id: string } }) {
  const detail = await safeGet<DisbursementDetail>(`/v1/disbursements/${params.id}`);
  if (!detail) notFound();

  const entities = (await safeGet<Entity[]>("/v1/entities")) ?? [];
  const entityName = entities.find((e) => e.id === detail.entityId)?.name ?? "Entity";

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/dashboard/disbursements" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="h-4 w-4" />
        Disbursements
      </Link>
      <DisbursementDetailClient detail={detail} entityName={entityName} />
    </div>
  );
}

export { type DisbursementDetail, type PayableInDisbursement };
