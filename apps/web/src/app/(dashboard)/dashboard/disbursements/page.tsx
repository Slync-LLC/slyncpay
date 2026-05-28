import Link from "next/link";
import { Banknote, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { apiServerGet } from "@/lib/api-server";

interface Disbursement {
  id: string;
  entityId: string;
  status: string;
  totalPayablesCount: number;
  totalAmountCents: number;
  initiatedAt: string;
  completedAt: string | null;
}

interface DisbursementList {
  data: Disbursement[];
  pagination: { page: number; limit: number; total: number; hasMore: boolean };
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
};

export default async function DisbursementsPage() {
  let listResult: DisbursementList = { data: [], pagination: { page: 1, limit: 100, total: 0, hasMore: false } };
  let entities: Entity[] = [];
  try {
    [listResult, entities] = await Promise.all([
      apiServerGet<DisbursementList>("/v1/disbursements?limit=100"),
      apiServerGet<Entity[]>("/v1/entities"),
    ]);
  } catch {
    // empty state
  }

  const { data: disbursements, pagination } = listResult;
  const entitiesById = Object.fromEntries(entities.map((e) => [e.id, e]));

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Disbursements</h1>
          <p className="text-sm text-muted-foreground">
            {pagination.total === 0 ? "No disbursements yet" : `${pagination.total} total`}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {disbursements.length === 0 ? (
          <div className="p-12 text-center">
            <Banknote className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-base font-semibold mb-1">No disbursements yet</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Pay a worker directly from their detail page, or queue payables and disburse a whole entity at once.
            </p>
            <Link
              href="/dashboard/workers"
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Browse workers
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Entity</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Payables</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {disbursements.map((d) => (
                <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5 text-sm">{new Date(d.initiatedAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5 text-sm">{entitiesById[d.entityId]?.name ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[d.status] ?? ""}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm">{d.totalPayablesCount}</td>
                  <td className="px-5 py-3.5 text-right text-sm font-medium">{formatCurrency(d.totalAmountCents)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/dashboard/disbursements/${d.id}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Details <ChevronRight className="h-3 w-3" />
                    </Link>
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
