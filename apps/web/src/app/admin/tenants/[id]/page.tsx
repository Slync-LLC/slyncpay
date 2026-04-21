import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { impersonateTenant, updateTenantStatus } from "../../actions";
import { DeleteTenantButton } from "./delete-button";
import { ArrowLeft, LogIn, DollarSign, Users, FileText, Banknote, Building2, Key } from "lucide-react";

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
    feesCollectedCents: number;
    disbursementsCount: number;
    entitiesCount: number;
    apiKeysCount: number;
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

type Entity = {
  id: string;
  name: string;
  ein: string | null;
  state: string | null;
  status: string;
  wingspanChildUserId: string | null;
  createdAt: string;
};

type ApiKey = {
  id: string;
  keyPrefix: string;
  keyHint: string;
  environment: string;
  name: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  provisioning: "bg-yellow-100 text-yellow-700",
  suspended: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
  paid: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  draft: "bg-gray-100 text-gray-600",
  failed: "bg-red-100 text-red-700",
  completed: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  invited: "bg-gray-100 text-gray-600",
  w9_pending: "bg-yellow-100 text-yellow-700",
  payout_pending: "bg-orange-100 text-orange-700",
  inactive: "bg-gray-100 text-gray-600",
};

const PLAN_STYLES: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700",
  growth: "bg-blue-100 text-blue-700",
  enterprise: "bg-purple-100 text-purple-700",
};

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-xl font-semibold">{value}</div>
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
  const headers = { Authorization: `Bearer ${adminToken}` };

  const [tenantRes, contractorsRes, payablesRes, disbursementsRes, entitiesRes, apiKeysRes] = await Promise.all([
    fetch(`${API_URL}/v1/admin/tenants/${params.id}`, { headers, cache: "no-store" }),
    tab === "contractors"
      ? fetch(`${API_URL}/v1/admin/tenants/${params.id}/contractors`, { headers, cache: "no-store" })
      : null,
    tab === "payables"
      ? fetch(`${API_URL}/v1/admin/tenants/${params.id}/payables`, { headers, cache: "no-store" })
      : null,
    tab === "disbursements"
      ? fetch(`${API_URL}/v1/admin/tenants/${params.id}/disbursements`, { headers, cache: "no-store" })
      : null,
    tab === "entities"
      ? fetch(`${API_URL}/v1/admin/tenants/${params.id}/entities`, { headers, cache: "no-store" })
      : null,
    tab === "api-keys"
      ? fetch(`${API_URL}/v1/admin/tenants/${params.id}/api-keys`, { headers, cache: "no-store" })
      : null,
  ]);

  if (tenantRes.status === 401) redirect("/admin/login");
  if (!tenantRes.ok) redirect("/admin/tenants");

  const tenant: Tenant = await tenantRes.json();
  const contractorsData: Contractor[] = contractorsRes?.ok ? await contractorsRes.json() : [];
  const payablesData: Payable[] = payablesRes?.ok ? await payablesRes.json() : [];
  const disbursementsData: Disbursement[] = disbursementsRes?.ok ? await disbursementsRes.json() : [];
  const entitiesData: Entity[] = entitiesRes?.ok ? await entitiesRes.json() : [];
  const apiKeysData: ApiKey[] = apiKeysRes?.ok ? await apiKeysRes.json() : [];

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "contractors", label: `Contractors (${tenant.stats.contractorsCount})` },
    { id: "entities", label: `Entities (${tenant.stats.entitiesCount})` },
    { id: "payables", label: `Payables (${tenant.stats.payablesCount})` },
    { id: "disbursements", label: `Disbursements (${tenant.stats.disbursementsCount})` },
    { id: "api-keys", label: `API Keys (${tenant.stats.apiKeysCount})` },
  ];

  const impersonateWithId = impersonateTenant.bind(null, tenant.id, tenant.name);

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/tenants" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{tenant.name}</h1>
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[tenant.status] ?? ""}`}>
              {tenant.status}
            </span>
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${PLAN_STYLES[tenant.plan] ?? ""}`}>
              {tenant.plan}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{tenant.email}</p>
        </div>
        <form action={impersonateWithId}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground hover:opacity-90 transition-opacity px-3 py-1.5 rounded-md text-xs font-medium"
          >
            <LogIn className="h-3.5 w-3.5" />
            Impersonate
          </button>
        </form>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/admin/tenants/${params.id}?tab=${t.id}`}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
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
            <Kpi label="Contractors" value={tenant.stats.contractorsCount} icon={Users} />
            <Kpi label="Entities" value={tenant.stats.entitiesCount} icon={Building2} />
            <Kpi label="Payables" value={tenant.stats.payablesCount} icon={FileText} />
            <Kpi label="Disbursements" value={tenant.stats.disbursementsCount} icon={Banknote} />
            <Kpi label="Payment Volume" value={fmt(tenant.stats.payablesTotalCents)} icon={DollarSign} />
            <Kpi label="Fees We Collected" value={fmt(tenant.stats.feesCollectedCents)} icon={DollarSign} />
            <Kpi label="API Keys" value={tenant.stats.apiKeysCount} icon={Key} />
            <Kpi
              label="Plan fees"
              value={`${(tenant.disbursementFeeBps / 100).toFixed(2)}% + ${tenant.perTxFeeCents}¢`}
              icon={DollarSign}
            />
          </div>

          {/* Account details */}
          <div className="bg-white border border-border rounded-xl p-5 space-y-3 text-sm">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Account details</h2>
            {[
              ["Tenant ID", tenant.id],
              ["Slug", tenant.slug],
              ["Plan", tenant.plan],
              ["Disbursement fee (bps)", tenant.disbursementFeeBps],
              ["Per-transaction fee", `${tenant.perTxFeeCents}¢`],
              ["Wingspan Payee Bucket", tenant.wingspanPayeeBucketUserId ?? "—"],
              ["Created", new Date(tenant.createdAt).toLocaleString()],
              ["Provisioned", tenant.provisionedAt ? new Date(tenant.provisionedAt).toLocaleString() : "—"],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono text-xs text-right break-all">{String(value)}</span>
              </div>
            ))}
          </div>

          {/* Status management */}
          <div className="bg-white border border-border rounded-xl p-5">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Manage status</h2>
            <div className="flex gap-2">
              {(["active", "suspended", "cancelled"] as const).map((s) => {
                const action = updateTenantStatus.bind(null, tenant.id, s);
                return (
                  <form key={s} action={action}>
                    <button
                      type="submit"
                      disabled={tenant.status === s}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border border-border text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors capitalize"
                    >
                      Set {s}
                    </button>
                  </form>
                );
              })}
            </div>
          </div>

          {/* Danger zone */}
          <div className="bg-white border border-red-200 rounded-xl p-5">
            <h2 className="text-xs font-medium text-red-700 uppercase tracking-wider mb-1">Danger zone</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Only deletes empty tenants. Tenants with data must be cancelled.
            </p>
            <DeleteTenantButton tenantId={tenant.id} tenantName={tenant.name} />
          </div>
        </div>
      )}

      {/* Contractors tab */}
      {tab === "contractors" && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contractorsData.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No contractors.</td></tr>
              )}
              {contractorsData.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs capitalize ${STATUS_STYLES[c.onboardingStatus] ?? ""}`}>
                      {c.onboardingStatus.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Entities tab */}
      {tab === "entities" && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">EIN</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">State</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Wingspan ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entitiesData.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No entities.</td></tr>
              )}
              {entitiesData.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{e.ein ? "••••••" + e.ein.slice(-4) : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.state ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs capitalize ${STATUS_STYLES[e.status] ?? ""}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{e.wingspanChildUserId ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(e.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payables tab */}
      {tab === "payables" && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payablesData.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No payables.</td></tr>
              )}
              {payablesData.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.externalReferenceId ?? p.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{fmt(p.amountCents)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs capitalize ${STATUS_STYLES[p.status] ?? ""}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Disbursements tab */}
      {tab === "disbursements" && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">ID</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Payables</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Initiated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {disbursementsData.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No disbursements.</td></tr>
              )}
              {disbursementsData.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{d.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{d.totalPayablesCount}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{fmt(d.totalAmountCents)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs capitalize ${STATUS_STYLES[d.status] ?? ""}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(d.initiatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* API Keys tab */}
      {tab === "api-keys" && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Key</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Env</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Last used</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {apiKeysData.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No API keys.</td></tr>
              )}
              {apiKeysData.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-3">{k.name ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{k.keyPrefix}…{k.keyHint}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs capitalize ${k.environment === "live" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                      {k.environment}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(k.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs ${k.revokedAt ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                      {k.revokedAt ? "Revoked" : "Active"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
