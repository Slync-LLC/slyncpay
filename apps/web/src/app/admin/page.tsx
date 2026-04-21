import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, FileText, Banknote, Building2, DollarSign, UserCheck, TrendingUp } from "lucide-react";

const API_URL = process.env["API_URL"] ?? "https://slyncpay-api.onrender.com";

type Stats = {
  tenants: {
    total: number;
    active: number;
    provisioning: number;
    suspended: number;
    cancelled: number;
    newThisMonth: number;
  };
  contractors: number;
  entities: number;
  payables: { count: number; totalCents: number; feesCents: number };
  disbursements: { count: number; totalCents: number };
  recentTenants: Array<{
    id: string;
    name: string;
    email: string;
    plan: string;
    status: string;
    createdAt: string;
  }>;
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  provisioning: "bg-yellow-100 text-yellow-700",
  suspended: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

const PLAN_STYLES: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700",
  growth: "bg-blue-100 text-blue-700",
  enterprise: "bg-purple-100 text-purple-700",
};

function formatDollars(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

function Kpi({
  label,
  value,
  sublabel,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {sublabel && <div className="text-xs text-muted-foreground mt-1">{sublabel}</div>}
    </div>
  );
}

export default async function AdminDashboardPage() {
  const adminToken = cookies().get("__slyncpay_admin_session")?.value;
  if (!adminToken) redirect("/admin/login");

  const res = await fetch(`${API_URL}/v1/admin/stats`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    cache: "no-store",
  });

  if (res.status === 401) redirect("/admin/login");
  if (!res.ok) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-destructive mt-4">Failed to load platform stats.</p>
      </div>
    );
  }

  const stats: Stats = await res.json();

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Platform overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time stats across all SlyncPay tenants.</p>
      </div>

      {/* Top row: big KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Kpi
          label="Active Tenants"
          value={stats.tenants.active}
          sublabel={`${stats.tenants.newThisMonth} new this month`}
          icon={Users}
        />
        <Kpi label="Contractors" value={stats.contractors.toLocaleString()} icon={UserCheck} />
        <Kpi
          label="Payment Volume"
          value={formatDollars(stats.payables.totalCents)}
          sublabel={`${stats.payables.count.toLocaleString()} payables`}
          icon={DollarSign}
        />
        <Kpi
          label="SlyncPay Revenue"
          value={formatDollars(stats.payables.feesCents)}
          sublabel="From tenant fees"
          icon={TrendingUp}
        />
      </div>

      {/* Second row: secondary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Kpi label="Disbursements" value={stats.disbursements.count.toLocaleString()} icon={Banknote} />
        <Kpi
          label="Disbursed Volume"
          value={formatDollars(stats.disbursements.totalCents)}
          icon={Banknote}
        />
        <Kpi label="Entities (EINs)" value={stats.entities.toLocaleString()} icon={Building2} />
        <Kpi
          label="Total Payables"
          value={stats.payables.count.toLocaleString()}
          icon={FileText}
        />
      </div>

      {/* Tenant status breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white border border-border rounded-xl p-5">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Tenants by status
          </h2>
          <div className="space-y-2">
            {[
              ["Active", stats.tenants.active, "bg-green-500"],
              ["Provisioning", stats.tenants.provisioning, "bg-yellow-500"],
              ["Suspended", stats.tenants.suspended, "bg-red-500"],
              ["Cancelled", stats.tenants.cancelled, "bg-gray-400"],
            ].map(([label, value, color]) => {
              const pct = stats.tenants.total ? (Number(value) / stats.tenants.total) * 100 : 0;
              return (
                <div key={String(label)} className="flex items-center gap-3 text-sm">
                  <div className="w-20 text-muted-foreground">{label}</div>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${color as string}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-8 text-right tabular-nums text-foreground font-medium">{Number(value)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-border rounded-xl p-5">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Financial summary
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Gross payables volume</dt>
              <dd className="font-medium">{formatDollars(stats.payables.totalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Disbursements paid out</dt>
              <dd className="font-medium">{formatDollars(stats.disbursements.totalCents)}</dd>
            </div>
            <div className="flex justify-between pt-2 border-t border-border">
              <dt className="text-muted-foreground">SlyncPay fees collected</dt>
              <dd className="font-semibold text-primary">{formatDollars(stats.payables.feesCents)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Recent tenants */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-medium">Recent signups</h2>
          <Link href="/admin/tenants" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {stats.recentTenants.length === 0 && (
              <tr>
                <td className="px-5 py-6 text-center text-muted-foreground text-sm">No tenants yet.</td>
              </tr>
            )}
            {stats.recentTenants.map((t) => (
              <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-5 py-3">
                  <Link href={`/admin/tenants/${t.id}`} className="hover:text-primary transition-colors">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.email}</div>
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${PLAN_STYLES[t.plan] ?? ""}`}>
                    {t.plan}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[t.status] ?? ""}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">
                  {new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
