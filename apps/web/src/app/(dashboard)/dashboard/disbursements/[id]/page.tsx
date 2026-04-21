"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface PayableResult {
  id: string;
  externalRef: string;
  contractor: string;
  amountCents: number;
  status: "processing" | "paid" | "failed";
}

interface DisbursementDetail {
  id: string;
  entity: string;
  status: "processing" | "completed" | "failed" | "partial";
  payablesCount: number;
  totalAmountCents: number;
  totalFeesCents: number;
  initiatedAt: string;
  completedAt?: string;
  payables: PayableResult[];
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-50 text-green-700",
  processing: "bg-blue-50 text-blue-700",
  failed: "bg-red-50 text-red-700",
  partial: "bg-orange-50 text-orange-700",
  paid: "bg-green-50 text-green-700",
};

const MOCK_DETAIL: DisbursementDetail = {
  id: "d1",
  entity: "NurseIO AZ LLC",
  status: "completed",
  payablesCount: 14,
  totalAmountCents: 24_500_00,
  totalFeesCents: 2_210,
  initiatedAt: "2026-04-15T10:00:00Z",
  completedAt: "2026-04-15T10:03:22Z",
  payables: [
    { id: "p1", externalRef: "SHIFT-9021", contractor: "Jane Smith", amountCents: 450_00, status: "paid" },
    { id: "p2", externalRef: "SHIFT-9015", contractor: "Maria Garcia", amountCents: 390_00, status: "paid" },
    { id: "p3", externalRef: "SHIFT-9014", contractor: "James Wilson", amountCents: 620_00, status: "paid" },
    { id: "p4", externalRef: "SHIFT-9013", contractor: "Sarah Jones", amountCents: 510_00, status: "paid" },
    { id: "p5", externalRef: "SHIFT-9012", contractor: "Jane Smith", amountCents: 480_00, status: "paid" },
  ],
};

export default function DisbursementDetailPage() {
  const { id } = useParams();
  const d = MOCK_DETAIL;
  const isProcessing = d.status === "processing";

  // Simulated polling for in-progress disbursements
  const [pollingCount, setPollingCount] = useState(0);
  useEffect(() => {
    if (!isProcessing) return;
    const interval = setInterval(() => setPollingCount((n) => n + 1), 3000);
    return () => clearInterval(interval);
  }, [isProcessing]);

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/dashboard/disbursements" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="h-4 w-4" />
        Disbursements
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">Batch #{d.id}</h1>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-sm font-medium ${STATUS_STYLES[d.status]}`}>
              {isProcessing && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {d.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{d.entity} · Initiated {new Date(d.initiatedAt).toLocaleString()}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground mb-1">Payables</div>
          <div className="text-xl font-bold">{d.payablesCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground mb-1">Total paid</div>
          <div className="text-xl font-bold">{formatCurrency(d.totalAmountCents)}</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground mb-1">SlyncPay fees</div>
          <div className="text-xl font-bold">{formatCurrency(d.totalFeesCents)}</div>
        </div>
      </div>

      {isProcessing && (
        <div className="mb-5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-blue-800">
          <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
          Processing — checking payment status every 3 seconds…
        </div>
      )}

      {/* Per-payment breakdown */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Per-payment breakdown</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Contractor</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {d.payables.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-3.5 font-mono text-xs">{p.externalRef}</td>
                <td className="px-5 py-3.5 text-sm">{p.contractor}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[p.status]}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right text-sm font-medium">{formatCurrency(p.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
