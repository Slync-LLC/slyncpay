import Link from "next/link";
import { Users, Building2, FileText, Banknote } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { apiServerGet, ServerApiError } from "@/lib/api-server";

interface Tenant {
  id: string;
  name: string;
  plan: string;
}

interface Entity {
  id: string;
  status: string;
}

interface Contractor {
  id: string;
  onboardingStatus: string;
}

interface Payable {
  id: string;
  amountCents: number;
  status: string;
  createdAt: string;
}

interface Disbursement {
  id: string;
  status: string;
  initiatedAt: string;
}

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiServerGet<T>(path);
  } catch (err) {
    if (err instanceof ServerApiError) return fallback;
    throw err;
  }
}

function MetricCard({
  title,
  value,
  sub,
  icon: Icon,
  href,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
}) {
  const content = (
    <div className="bg-white rounded-xl border border-border p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{title}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

export default async function DashboardPage() {
  const [tenant, entities, contractorRes, payableRes, disbursementRes] = await Promise.all([
    safeGet<Tenant | null>("/v1/tenant", null),
    safeGet<Entity[]>("/v1/entities", []),
    safeGet<{ data: Contractor[]; pagination: { total: number } }>(
      "/v1/contractors?limit=200",
      { data: [], pagination: { total: 0 } },
    ),
    safeGet<{ data: Payable[]; pagination: { total: number } }>(
      "/v1/payables?limit=200",
      { data: [], pagination: { total: 0 } },
    ),
    safeGet<{ data: Disbursement[]; pagination: { total: number } }>(
      "/v1/disbursements?limit=100",
      { data: [], pagination: { total: 0 } },
    ),
  ]);

  const activeEntities = entities.filter((e) => e.status === "active");
  const activeContractors = contractorRes.data.filter((c) => c.onboardingStatus === "active");
  const pendingPayables = payableRes.data.filter((p) => p.status === "pending");
  const pendingTotalCents = pendingPayables.reduce((s, p) => s + p.amountCents, 0);

  // MTD calc
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const mtdPaidCents = payableRes.data
    .filter((p) => p.status === "paid" && new Date(p.createdAt) >= monthStart)
    .reduce((s, p) => s + p.amountCents, 0);
  const mtdDisbursements = disbursementRes.data.filter((d) => new Date(d.initiatedAt) >= monthStart);

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground">
            {tenant?.name ?? "Your account"} ·{" "}
            {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Paid this month"
          value={formatCurrency(mtdPaidCents)}
          sub={`${mtdDisbursements.length} disbursement${mtdDisbursements.length === 1 ? "" : "s"}`}
          icon={Banknote}
          href="/dashboard/disbursements"
        />
        <MetricCard
          title="Active contractors"
          value={String(activeContractors.length)}
          sub={`${contractorRes.pagination.total} total`}
          icon={Users}
          href="/dashboard/contractors"
        />
        <MetricCard
          title="Active entities"
          value={String(activeEntities.length)}
          sub={`${entities.length} total`}
          icon={Building2}
          href="/dashboard/entities"
        />
        <MetricCard
          title="Pending payables"
          value={String(pendingPayables.length)}
          sub={pendingPayables.length > 0 ? formatCurrency(pendingTotalCents) : "Ready to disburse"}
          icon={FileText}
          href="/dashboard/payables"
        />
      </div>

      {contractorRes.pagination.total === 0 && entities.length === 0 && (
        <div className="bg-white rounded-xl border border-border p-8">
          <h2 className="text-base font-semibold mb-3">Get started</h2>
          <ol className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                1
              </span>
              <div>
                <Link href="/dashboard/entities/new" className="font-medium text-primary hover:underline">
                  Add an entity
                </Link>
                <p className="text-muted-foreground text-xs mt-0.5">
                  One per EIN. Payables and 1099s are filed per entity.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-muted text-muted-foreground text-xs font-semibold flex items-center justify-center">
                2
              </span>
              <div>
                <Link href="/dashboard/contractors/new" className="font-medium hover:underline">
                  Add your first contractor
                </Link>
                <p className="text-muted-foreground text-xs mt-0.5">
                  We&apos;ll send them an embedded onboarding link to complete W-9 + payout setup.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-muted text-muted-foreground text-xs font-semibold flex items-center justify-center">
                3
              </span>
              <div>
                <span className="font-medium">Pay them</span>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Use the &quot;Pay now&quot; button on the contractor detail page, or queue up payables and disburse a batch.
                </p>
              </div>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
