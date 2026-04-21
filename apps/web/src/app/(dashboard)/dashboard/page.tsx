"use client";

import { useAuth } from "@clerk/nextjs";
import { formatCurrency } from "@/lib/utils";
import { Users, Building2, FileText, Banknote, TrendingUp, ArrowUpRight } from "lucide-react";
import Link from "next/link";

// Metric card component
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

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

// Status badge
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-50 text-green-700",
    invited: "bg-yellow-50 text-yellow-700",
    pending: "bg-blue-50 text-blue-700",
    paid: "bg-green-50 text-green-700",
    processing: "bg-blue-50 text-blue-700",
    failed: "bg-red-50 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? "bg-gray-50 text-gray-700"}`}>
      {status}
    </span>
  );
}

// Mock data — replace with TanStack Query API calls
const mockMetrics = {
  totalPaidMtdCents: 124500_00,
  activeContractors: 47,
  pendingPayablesCount: 12,
  pendingPayablesCents: 18_200_00,
  disbursementsThisMonth: 8,
};

const mockActivity = [
  { id: "1", type: "payable.paid", label: "Jane Smith paid", amount: 450_00, time: "2 min ago", status: "paid" },
  { id: "2", type: "contractor.created", label: "John Doe onboarded", amount: null, time: "14 min ago", status: "invited" },
  { id: "3", type: "disbursement.completed", label: "NurseIO AZ batch settled", amount: 12_400_00, time: "1 hr ago", status: "paid" },
  { id: "4", type: "payable.created", label: "Payable created — SHIFT-9021", amount: 390_00, time: "2 hr ago", status: "pending" },
  { id: "5", type: "payable.created", label: "Payable created — SHIFT-9020", amount: 510_00, time: "3 hr ago", status: "pending" },
];

export default function DashboardPage() {
  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground">April 2026</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard/payables/new"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + New payable
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Total paid (MTD)"
          value={formatCurrency(mockMetrics.totalPaidMtdCents)}
          sub="This month"
          icon={TrendingUp}
        />
        <MetricCard
          title="Active contractors"
          value={mockMetrics.activeContractors.toString()}
          sub="Fully onboarded"
          icon={Users}
          href="/dashboard/contractors"
        />
        <MetricCard
          title="Pending payables"
          value={formatCurrency(mockMetrics.pendingPayablesCents)}
          sub={`${mockMetrics.pendingPayablesCount} payables ready`}
          icon={FileText}
          href="/dashboard/payables"
        />
        <MetricCard
          title="Disbursements"
          value={mockMetrics.disbursementsThisMonth.toString()}
          sub="This month"
          icon={Banknote}
          href="/dashboard/disbursements"
        />
      </div>

      {/* Activity feed */}
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm">Recent activity</h2>
          <span className="text-xs text-muted-foreground">Last 24 hours</span>
        </div>
        <div className="divide-y divide-border">
          {mockActivity.map((event) => (
            <div key={event.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <StatusBadge status={event.status} />
                <span className="text-sm">{event.label}</span>
              </div>
              <div className="flex items-center gap-4">
                {event.amount && (
                  <span className="text-sm font-medium">{formatCurrency(event.amount)}</span>
                )}
                <span className="text-xs text-muted-foreground">{event.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        {[
          { label: "Add contractor", href: "/dashboard/contractors?modal=new", icon: Users },
          { label: "Add entity", href: "/dashboard/entities?modal=new", icon: Building2 },
          { label: "Trigger disbursement", href: "/dashboard/disbursements?modal=trigger", icon: Banknote },
        ].map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 bg-white border border-border rounded-lg px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            {label}
            <ArrowUpRight className="h-3 w-3 text-muted-foreground ml-auto" />
          </Link>
        ))}
      </div>
    </div>
  );
}
