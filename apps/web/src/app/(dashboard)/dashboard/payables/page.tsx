import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { apiServerGet } from "@/lib/api-server";

interface Payable {
  id: string;
  entityId: string;
  workerId: string;
  amountCents: number;
  status: string;
  externalReferenceId: string | null;
  dueDate: string;
  createdAt: string;
}

interface PayableList {
  data: Payable[];
  pagination: { page: number; limit: number; total: number; hasMore: boolean };
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-50 text-gray-700",
  pending: "bg-blue-50 text-blue-700",
  processing: "bg-purple-50 text-purple-700",
  paid: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-gray-50 text-gray-400",
};

const FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "processing", label: "Processing" },
  { value: "draft", label: "Draft" },
  { value: "failed", label: "Failed" },
];

export default async function PayablesPage({ searchParams }: { searchParams: { status?: string; entity?: string } }) {
  const qs = new URLSearchParams();
  qs.set("limit", "100");
  if (searchParams.status) qs.set("status", searchParams.status);
  if (searchParams.entity) qs.set("entityId", searchParams.entity);

  let result: PayableList = { data: [], pagination: { page: 1, limit: 100, total: 0, hasMore: false } };
  try {
    result = await apiServerGet<PayableList>(`/v1/payables?${qs.toString()}`);
  } catch {
    // empty state below
  }

  const { data: payables, pagination } = result;
  const pendingCount = payables.filter((p) => p.status === "pending").length;
  const pendingTotal = payables.filter((p) => p.status === "pending").reduce((s, p) => s + p.amountCents, 0);

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Payables</h1>
          <p className="text-sm text-muted-foreground">
            {pagination.total === 0 ? "No payables yet" : `${pagination.total} total`}
          </p>
        </div>
        <Link
          href="/dashboard/payables/new"
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New payable
        </Link>
      </div>

      {pendingCount > 0 && (
        <div className="mb-5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">{pendingCount} pending payables</span> totaling{" "}
            <span className="font-semibold">{formatCurrency(pendingTotal)}</span> ready for disbursement.
          </p>
          <Link
            href="/dashboard/disbursements"
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Disburse →
          </Link>
        </div>
      )}

      <div className="flex items-center gap-1 mb-5">
        {FILTERS.map(({ value, label }) => {
          const active = (searchParams.status ?? "") === value;
          const params = new URLSearchParams(searchParams as Record<string, string>);
          if (value) params.set("status", value);
          else params.delete("status");
          const href = `/dashboard/payables${params.toString() ? "?" + params.toString() : ""}`;
          return (
            <Link
              key={value || "all"}
              href={href}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-white border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {payables.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-base font-semibold mb-1">No payables yet</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Create a payable to schedule a payment to one of your workers.
            </p>
            <Link
              href="/dashboard/payables/new"
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              New payable
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Due</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payables.map((p) => (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs">{p.externalReferenceId ?? p.id.slice(0, 8)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[p.status] ?? ""}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{p.dueDate}</td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="text-sm font-medium">{formatCurrency(p.amountCents)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
