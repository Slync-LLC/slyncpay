import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { apiServerGet, ServerApiError } from "@/lib/api-server";

interface PayableInDisbursement {
  id: string;
  contractorId: string;
  amountCents: number;
  status: string;
  externalReferenceId: string | null;
}

interface DisbursementDetail {
  id: string;
  entityId: string;
  status: string;
  totalPayablesCount: number;
  totalAmountCents: number;
  initiatedAt: string;
  completedAt: string | null;
  payables: PayableInDisbursement[];
}

interface Entity {
  id: string;
  name: string;
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-50 text-green-700",
  processing: "bg-blue-50 text-blue-700",
  failed: "bg-red-50 text-red-700",
  partial: "bg-orange-50 text-orange-700",
  paid: "bg-green-50 text-green-700",
  pending: "bg-blue-50 text-blue-700",
};

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

  const isProcessing = detail.status === "processing";

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/dashboard/disbursements" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="h-4 w-4" />
        Disbursements
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold">Disbursement</h1>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[detail.status] ?? ""}`}>
              {detail.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {entityName} · Initiated {new Date(detail.initiatedAt).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground mb-1">Payables</div>
          <div className="text-xl font-bold">{detail.totalPayablesCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground mb-1">Total paid</div>
          <div className="text-xl font-bold">{formatCurrency(detail.totalAmountCents)}</div>
        </div>
      </div>

      {isProcessing && (
        <div className="mb-5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-blue-800">
          <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
          Processing — refresh the page to check status.
        </div>
      )}

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {detail.payables.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No payables linked.
                </td>
              </tr>
            ) : (
              detail.payables.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3.5 font-mono text-xs">{p.externalReferenceId ?? p.id.slice(0, 8)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[p.status] ?? ""}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-medium">{formatCurrency(p.amountCents)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
