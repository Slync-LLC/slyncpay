import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

const API_URL = process.env["API_URL"] ?? "https://slyncpay-api.onrender.com";

type Tenant = {
  id: string;
  name: string;
  email: string;
  slug: string;
  status: string;
  plan: string;
  createdAt: string;
  contractorsCount: number;
  payablesCount: number;
  payablesTotalCents: number;
  disbursementsCount: number;
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

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

export default async function AdminTenantsPage() {
  const adminToken = cookies().get("__slyncpay_admin_session")?.value;
  if (!adminToken) redirect("/admin/login");

  const res = await fetch(`${API_URL}/v1/admin/tenants`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    cache: "no-store",
  });

  if (res.status === 401) redirect("/admin/login");

  const tenants: Tenant[] = res.ok ? await res.json() : [];

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Tenants</h1>
        <p className="text-sm text-muted-foreground mt-1">{tenants.length} total across all statuses</p>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tenant</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Plan</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Contractors</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Payables</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Volume</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tenants.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  No tenants yet.
                </td>
              </tr>
            )}
            {tenants.map((t) => (
              <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/admin/tenants/${t.id}`} className="hover:text-primary transition-colors">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.email}</div>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${PLAN_STYLES[t.plan] ?? ""}`}>
                    {t.plan}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[t.status] ?? ""}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{t.contractorsCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">{t.payablesCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(t.payablesTotalCents)}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
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
