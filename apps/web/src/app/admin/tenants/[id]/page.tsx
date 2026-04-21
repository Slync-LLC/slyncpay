import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { impersonateTenant, updateTenantStatus } from "../../actions";
import { ArrowLeft, LogIn } from "lucide-react";

const API_URL = process.env["API_URL"] ?? "https://slyncpay-api.onrender.com";

type Tenant = {
  id: string;
  name: string;
  email: string;
  slug: string;
  status: string;
  plan: string;
  disbursementFeeBps: number;
  perTxFeeCents: number;
  wingspanPayeeBucketUserId: string | null;
  createdAt: string;
  provisionedAt: string | null;
  stats: {
    contractorsCount: number;
    payablesCount: number;
    payablesTotalCents: number;
    disbursementsCount: number;
  };
};

type Contractor = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  onboardingStatus: string;
  createdAt: string;
};

type Payable = {
  id: string;
  amountCents: number;
  status: string;
  externalReferenceId: string | null;
  createdAt: string;
  paidAt: string | null;
};

type Disbursement = {
  id: string;
  status: string;
  totalPayablesCount: number;
  totalAmountCents: number;
  initiatedAt: string;
  completedAt: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  provisioning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  suspended: "bg-red-500/10 text-red-400 border-red-500/20",
  cancelled: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  paid: "bg-green-500/10 text-green-400 border-green-500/20",
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  draft: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
  completed: "bg-green-500/10 text-green-400 border-green-500/20",
  processing: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  invited: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  w9_pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  payout_pending: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-xl font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const adminToken = cookies().get("__slyncpay_admin_session")?.value;
  if (!adminToken) redirect("/admin/login");

  const tab = searchParams.tab ?? "overview";

  const [tenantRes, ...tabRes] = await Promise.all([
    fetch(`${API_URL}/v1/admin/tenants/${params.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      cache: "no-store",
    }),
    tab === "contractors"
      ? fetch(`${API_URL}/v1/admin/tenants/${params.id}/contractors`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          cache: "no-store",
        })
      : null,
    tab === "payables"
      ? fetch(`${API_URL}/v1/admin/tenants/${params.id}/payables`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          cache: "no-store",
        })
      : null,
    tab === "disbursements"
      ? fetch(`${API_URL}/v1/admin/tenants/${params.id}/disbursements`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          cache: "no-store",
        })
      : null,
  ]);

  if (tenantRes.status === 401) redirect("/admin/login");
  if (!tenantRes.ok) redirect("/admin/tenants");

  const tenant: Tenant = await tenantRes.json();
  const contractorsData: Contractor[] = tab === "contractors" && tabRes[0]?.ok ? await tabRes[0].json() : [];
  const payablesData: Payable[] = tab === "payables" && tabRes[1]?.ok ? await tabRes[1].json() : [];
  const disbursementsData: Disbursement[] = tab === "disbursements" && tabRes[2]?.ok ? await tabRes[2].json() : [];

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "contractors", label: `Contractors (${tenant.stats.contractorsCount})` },
    { id: "payables", label: `Payables (${tenant.stats.payablesCount})` },
    { id: "disbursements", label: `Disbursements (${tenant.stats.disbursementsCount})` },
  ];

  const impersonateWithId = impersonateTenant.bind(null, tenant.id, tenant.name);

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/tenants" className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-zinc-100">{tenant.name}</h1>
          <p className="text-sm text-zinc-500">{tenant.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium capitalize ${STATUS_STYLES[tenant.status] ?? ""}`}>
            {tenant.status}
          </span>
          <form action={impersonateWithId}>
            <button
              type="submit"
              className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            >
              <LogIn className="h-3.5 w-3.5" />
              Impersonate
            </button>
          </form>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-zinc-800">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/admin/tenants/${params.id}?tab=${t.id}`}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-orange-400 text-orange-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Overview tab */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Contractors" value={tenant.stats.contractorsCount} />
            <StatCard label="Payables" value={tenant.stats.payablesCount} />
            <StatCard label="Total Volume" value={fmt(tenant.stats.payablesTotalCents)} />
            <StatCard label="Disbursements" value={tenant.stats.disbursementsCount} />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3 text-sm">
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Account details</h2>
            {[
              ["Tenant ID", tenant.id],
              ["Slug", tenant.slug],
              ["Plan", tenant.plan],
              ["Fee (bps)", tenant.disbursementFeeBps],
              ["Per-tx fee", `${tenant.perTxFeeCents}¢`],
              ["Wingspan Payee Bucket", tenant.wingspanPayeeBucketUserId ?? "—"],
              ["Created", new Date(tenant.createdAt).toLocaleString()],
              ["Provisioned", tenant.provisionedAt ? new Date(tenant.provisionedAt).toLocaleString() : "—"],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between gap-4">
                <span className="text-zinc-500">{label}</span>
                <span className="text-zinc-200 font-mono text-xs text-right break-all">{String(value)}</span>
              </div>
            ))}
          </div>

          {/* Status management */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Manage status</h2>
            <div className="flex gap-2">
              {(["active", "suspended", "cancelled"] as const).map((s) => {
                const action = updateTenantStatus.bind(null, tenant.id, s);
                return (
                  <form key={s} action={action}>
                    <button
                      type="submit"
                      disabled={tenant.status === s}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors capitalize"
                    >
                      Set {s}
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Contractors tab */}
      {tab === "contractors" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {contractorsData.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-600">No contractors.</td></tr>
              )}
              {contractorsData.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 text-zinc-200">{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-4 py-3 text-zinc-400">{c.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded border text-xs capitalize ${STATUS_STYLES[c.onboardingStatus] ?? ""}`}>
                      {c.onboardingStatus.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payables tab */}
      {tab === "payables" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Reference</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {payablesData.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-600">No payables.</td></tr>
              )}
              {payablesData.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{p.externalReferenceId ?? p.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-right text-zinc-200 font-medium">{fmt(p.amountCents)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded border text-xs capitalize ${STATUS_STYLES[p.status] ?? ""}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Disbursements tab */}
      {tab === "disbursements" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">ID</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Payables</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Initiated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {disbursementsData.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-600">No disbursements.</td></tr>
              )}
              {disbursementsData.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{d.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-right text-zinc-300">{d.totalPayablesCount}</td>
                  <td className="px-4 py-3 text-right text-zinc-200 font-medium">{fmt(d.totalAmountCents)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded border text-xs capitalize ${STATUS_STYLES[d.status] ?? ""}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(d.initiatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
