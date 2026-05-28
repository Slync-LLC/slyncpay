import Link from "next/link";
import { Users, Plus, ChevronRight } from "lucide-react";
import { apiServerGet } from "@/lib/api-server";
import { OnboardingLinkButton } from "./onboarding-link-button";

interface Contractor {
  id: string;
  externalId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  onboardingStatus: string;
  createdAt: string;
}

interface ContractorList {
  data: Contractor[];
  pagination: { page: number; limit: number; total: number; hasMore: boolean };
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  invited: "bg-yellow-50 text-yellow-700",
  w9_pending: "bg-orange-50 text-orange-700",
  payout_pending: "bg-blue-50 text-blue-700",
  inactive: "bg-gray-50 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  invited: "Invited",
  w9_pending: "W-9 Pending",
  payout_pending: "Payout Setup",
  inactive: "Inactive",
};

export default async function ContractorsPage({ searchParams }: { searchParams: { status?: string } }) {
  const qs = new URLSearchParams();
  qs.set("limit", "100");
  if (searchParams.status) qs.set("status", searchParams.status);

  let result: ContractorList = { data: [], pagination: { page: 1, limit: 100, total: 0, hasMore: false } };
  try {
    result = await apiServerGet<ContractorList>(`/v1/contractors?${qs.toString()}`);
  } catch {
    // empty state below
  }

  const { data: contractors, pagination } = result;

  const FILTERS = [
    { value: "", label: "All" },
    { value: "active", label: "Active" },
    { value: "w9_pending", label: "W-9 Pending" },
    { value: "payout_pending", label: "Payout Setup" },
    { value: "invited", label: "Invited" },
    { value: "inactive", label: "Inactive" },
  ];

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Contractors</h1>
          <p className="text-sm text-muted-foreground">
            {pagination.total === 0 ? "No contractors yet" : `${pagination.total} total`}
          </p>
        </div>
        <Link
          href="/dashboard/contractors/new"
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Add contractor
        </Link>
      </div>

      <div className="flex items-center gap-1 mb-5">
        {FILTERS.map(({ value, label }) => {
          const active = (searchParams.status ?? "") === value;
          const href = value ? `/dashboard/contractors?status=${value}` : "/dashboard/contractors";
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
        {contractors.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-base font-semibold mb-1">No contractors yet</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {searchParams.status ? "None match this filter." : "Add your first contractor to get started."}
            </p>
            {!searchParams.status && (
              <Link
                href="/dashboard/contractors/new"
                className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                Add contractor
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">External ID</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Added</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contractors.map((c) => {
                const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";
                return (
                  <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-medium">{fullName}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{c.email}</td>
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs text-muted-foreground">{c.externalId}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[c.onboardingStatus] ?? "bg-gray-50 text-gray-500"}`}>
                        {STATUS_LABELS[c.onboardingStatus] ?? c.onboardingStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-4">
                        <OnboardingLinkButton
                          contractorId={c.id}
                          contractorEmail={c.email}
                          disabled={c.onboardingStatus === "active" || c.onboardingStatus === "inactive"}
                        />
                        <Link
                          href={`/dashboard/contractors/${c.id}`}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          View <ChevronRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
