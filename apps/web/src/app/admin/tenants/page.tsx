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
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  provisioning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  suspended: "bg-red-500/10 text-red-400 border-red-500/20",
  cancelled: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const PLAN_STYLES: Record<string, string> = {
  starter: "bg-zinc-500/10 text-zinc-400",
  growth: "bg-blue-500/10 text-blue-400",
  enterprise: "bg-purple-500/10 text-purple-400",
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
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Tenants</h1>
        <p className="text-sm text-zinc-500 mt-1">{tenants.length} total</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Tenant</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Plan</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Contractors</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Payables</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Volume</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {tenants.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-600 text-sm">
                  No tenants yet.
                </td>
              </tr>
            )}
            {tenants.map((t) => (
              <tr key={t.id} className="hover:bg-zinc-800/50 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/admin/tenants/${t.id}`} className="hover:text-orange-400 transition-colors">
                    <div className="font-medium text-zinc-200">{t.name}</div>
                    <div className="text-xs text-zinc-500">{t.email}</div>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${PLAN_STYLES[t.plan] ?? ""}`}>
                    {t.plan}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium capitalize ${STATUS_STYLES[t.status] ?? ""}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-zinc-300">{t.contractorsCount}</td>
                <td className="px-4 py-3 text-right text-zinc-300">{t.payablesCount}</td>
                <td className="px-4 py-3 text-right text-zinc-300">{fmt(t.payablesTotalCents)}</td>
                <td className="px-4 py-3 text-zinc-500 text-xs">
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
