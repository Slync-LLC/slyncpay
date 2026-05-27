import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Building2, Banknote, Clock, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { apiServerGet, ServerApiError } from "@/lib/api-server";

interface Entity {
  id: string;
  name: string;
  einLast4: string | null;
  state: string | null;
  status: string;
  createdAt: string;
}

interface Payable {
  id: string;
  contractorId: string;
  amountCents: number;
  status: string;
  externalReferenceId: string | null;
  createdAt: string;
  dueDate: string;
}

interface Disbursement {
  id: string;
  status: string;
  totalPayablesCount: number;
  totalAmountCents: number;
  initiatedAt: string;
  completedAt: string | null;
}

interface ProvisioningStatus {
  status: string;
  currentStep: string | null;
  stepsCompleted?: unknown;
  lastError?: string | null;
  updatedAt?: string;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  pending: "bg-yellow-50 text-yellow-700",
  suspended: "bg-red-50 text-red-700",
  processing: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  paid: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-700",
  draft: "bg-gray-50 text-gray-700",
  partial: "bg-orange-50 text-orange-700",
};

async function safeGet<T>(path: string): Promise<T | null> {
  try {
    return await apiServerGet<T>(path);
  } catch (err) {
    if (err instanceof ServerApiError) return null;
    throw err;
  }
}

export default async function EntityDetailPage({ params }: { params: { id: string } }) {
  const entity = await safeGet<Entity>(`/v1/entities/${params.id}`);
  if (!entity) notFound();

  const [payablesRes, disbursementsRes, provisioning] = await Promise.all([
    safeGet<{ data: Payable[] }>(`/v1/payables?entityId=${params.id}&limit=10`),
    safeGet<{ data: Disbursement[] }>(`/v1/disbursements?entityId=${params.id}&limit=10`),
    entity.status === "pending"
      ? safeGet<ProvisioningStatus>(`/v1/entities/${params.id}/provisioning-status`)
      : null,
  ]);

  const payables = payablesRes?.data ?? [];
  const disbursements = disbursementsRes?.data ?? [];

  const pendingTotalCents = payables
    .filter((p) => p.status === "pending")
    .reduce((s, p) => s + p.amountCents, 0);
  const pendingCount = payables.filter((p) => p.status === "pending").length;
  const ytdVolumeCents = payables.filter((p) => p.status === "paid").reduce((s, p) => s + p.amountCents, 0);

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/dashboard/entities" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="h-4 w-4" />
        Entities
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{entity.name}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              {entity.einLast4 && (
                <span className="text-xs text-muted-foreground font-mono">EIN {entity.einLast4}</span>
              )}
              {entity.state && <span className="text-xs text-muted-foreground">{entity.state}</span>}
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[entity.status] ?? ""}`}>
                {entity.status === "pending" ? "Provisioning" : entity.status}
              </span>
            </div>
          </div>
        </div>
        {entity.status === "active" && (
          <Link
            href={`/dashboard/disbursements?entity=${entity.id}`}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Banknote className="h-4 w-4" />
            Trigger disbursement
          </Link>
        )}
      </div>

      {entity.status === "pending" && provisioning && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <Clock className="h-4 w-4 text-yellow-700 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-yellow-900 mb-0.5">Provisioning in progress</div>
            <div className="text-yellow-800">
              Current step: <span className="font-mono">{provisioning.currentStep ?? "starting"}</span>. This usually completes in under a minute. Refresh the page to check progress.
            </div>
            {provisioning.lastError && (
              <div className="text-xs text-red-700 mt-2 font-mono">Last error: {provisioning.lastError}</div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Paid volume", value: formatCurrency(ytdVolumeCents) },
            { label: "Pending payables", value: `${formatCurrency(pendingTotalCents)} (${pendingCount})` },
            { label: "Total payables", value: payables.length.toString() },
            { label: "Disbursements", value: disbursements.length.toString() },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border border-border p-4">
              <div className="text-xs text-muted-foreground mb-1">{label}</div>
              <div className="text-lg font-bold">{value}</div>
            </div>
          ))}
        </div>

        {payables.length > 0 && (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <span className="text-sm font-semibold">Recent payables</span>
              <Link href={`/dashboard/payables?entity=${entity.id}`} className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payables.slice(0, 5).map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3.5 font-mono text-xs">{p.externalReferenceId ?? p.id.slice(0, 8)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[p.status] ?? ""}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 text-right text-sm font-medium">{formatCurrency(p.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {disbursements.length > 0 && (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <span className="text-sm font-semibold">Recent disbursements</span>
              <Link href={`/dashboard/disbursements?entity=${entity.id}`} className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Payables</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {disbursements.slice(0, 5).map((d) => (
                  <tr key={d.id}>
                    <td className="px-5 py-3.5 text-sm">{new Date(d.initiatedAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[d.status] ?? ""}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm">{d.totalPayablesCount}</td>
                    <td className="px-5 py-3.5 text-right text-sm font-medium">{formatCurrency(d.totalAmountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {payables.length === 0 && disbursements.length === 0 && entity.status === "active" && (
          <div className="bg-white rounded-xl border border-border p-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-3" />
            <h2 className="text-base font-semibold mb-1">Entity is ready</h2>
            <p className="text-sm text-muted-foreground">
              Add contractors and start creating payables to see activity here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
