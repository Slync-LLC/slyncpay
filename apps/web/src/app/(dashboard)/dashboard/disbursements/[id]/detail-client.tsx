"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { DisbursementDetail, PayableInDisbursement } from "./page";

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-50 text-green-700",
  processing: "bg-blue-50 text-blue-700",
  failed: "bg-red-50 text-red-700",
  partial: "bg-orange-50 text-orange-700",
  paid: "bg-green-50 text-green-700",
  pending: "bg-blue-50 text-blue-700",
  cancelled: "bg-gray-50 text-gray-500",
};

function contractorLabel(c: PayableInDisbursement["contractor"]): string {
  if (!c) return "—";
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : c.email;
}

export function DisbursementDetailClient({
  detail,
  entityName,
}: {
  detail: DisbursementDetail;
  entityName: string;
}) {
  const router = useRouter();
  const isProcessing = detail.status === "processing";

  useEffect(() => {
    if (!isProcessing) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [isProcessing, router]);

  return (
    <>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Disbursement</h1>
          <p className="text-sm text-muted-foreground font-mono mt-0.5">{detail.id}</p>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium capitalize ${
            STATUS_STYLES[detail.status] ?? ""
          }`}
        >
          {isProcessing && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
          {detail.status}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-border rounded-lg px-4 py-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Entity</div>
          <div className="text-sm font-medium">{entityName}</div>
        </div>
        <div className="bg-white border border-border rounded-lg px-4 py-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total</div>
          <div className="text-sm font-medium">{formatCurrency(detail.totalAmountCents)}</div>
        </div>
        <div className="bg-white border border-border rounded-lg px-4 py-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Payables</div>
          <div className="text-sm font-medium">{detail.totalPayablesCount}</div>
        </div>
        <div className="bg-white border border-border rounded-lg px-4 py-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Initiated</div>
          <div className="text-sm font-medium">{new Date(detail.initiatedAt).toLocaleString()}</div>
        </div>
      </div>

      {isProcessing && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg px-4 py-3 mb-6 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Processing through Wingspan — this page refreshes automatically.
        </div>
      )}

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <h2 className="text-sm font-semibold">Payables in this disbursement</h2>
        </div>
        {detail.payables.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No payables.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Contractor
                </th>
                <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Reference
                </th>
                <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {detail.payables.map((p) => (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 text-sm">
                    <div className="font-medium">{contractorLabel(p.contractor)}</div>
                    {p.contractor?.email && (
                      <div className="text-xs text-muted-foreground">{p.contractor.email}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm font-mono text-muted-foreground">
                    {p.externalReferenceId ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                        STATUS_STYLES[p.status] ?? ""
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-medium">
                    {formatCurrency(p.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
