"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Building2, Users, Banknote } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type Tab = "overview" | "payables" | "disbursements" | "contractors";

const MOCK_ENTITY = {
  id: "e1",
  name: "NurseIO AZ LLC",
  ein: "**-*****42",
  state: "AZ",
  status: "active" as const,
  bankConnected: true,
  contractorCount: 32,
  mtdVolumeCents: 89_400_00,
  ytdVolumeCents: 312_000_00,
  pendingPayablesCents: 14_200_00,
  pendingPayablesCount: 8,
  recentDisbursements: [
    { id: "d1", status: "completed", totalCents: 24_500_00, count: 14, date: "2026-04-15" },
    { id: "d2", status: "completed", totalCents: 18_900_00, count: 11, date: "2026-04-01" },
    { id: "d3", status: "completed", totalCents: 22_100_00, count: 13, date: "2026-03-15" },
  ],
  recentPayables: [
    { id: "p1", ref: "SHIFT-9021", contractor: "Jane Smith", amountCents: 450_00, status: "paid", date: "2026-04-19" },
    { id: "p2", ref: "SHIFT-9020", contractor: "Maria Garcia", amountCents: 390_00, status: "pending", date: "2026-04-18" },
    { id: "p3", ref: "SHIFT-9019", contractor: "Jane Smith", amountCents: 510_00, status: "pending", date: "2026-04-17" },
  ],
};

const DISBURSEMENT_STATUS: Record<string, string> = {
  completed: "bg-green-50 text-green-700",
  processing: "bg-blue-50 text-blue-700",
  failed: "bg-red-50 text-red-700",
  partial: "bg-orange-50 text-orange-700",
};

const PAYABLE_STATUS: Record<string, string> = {
  paid: "bg-green-50 text-green-700",
  pending: "bg-blue-50 text-blue-700",
  draft: "bg-gray-50 text-gray-700",
  failed: "bg-red-50 text-red-700",
};

export default function EntityDetailPage() {
  const { id } = useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const e = MOCK_ENTITY;

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "payables", label: "Payables" },
    { id: "disbursements", label: "Disbursements" },
    { id: "contractors", label: "Contractors" },
  ];

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/dashboard/entities" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="h-4 w-4" />
        Entities
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{e.name}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground font-mono">EIN {e.ein}</span>
              <span className="text-xs text-muted-foreground">{e.state}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">Active</span>
            </div>
          </div>
        </div>
        <Link
          href={`/dashboard/disbursements?modal=trigger&entity=${e.id}`}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Banknote className="h-4 w-4" />
          Trigger disbursement
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map(({ id: tabId, label }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === tabId
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "MTD volume", value: formatCurrency(e.mtdVolumeCents) },
              { label: "YTD volume", value: formatCurrency(e.ytdVolumeCents) },
              { label: "Pending payables", value: `${formatCurrency(e.pendingPayablesCents)} (${e.pendingPayablesCount})` },
              { label: "Contractors", value: e.contractorCount.toString() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-border p-4">
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <div className="text-lg font-bold">{value}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="text-sm font-semibold mb-3">Bank account</h2>
            {e.bankConnected ? (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Connected
              </div>
            ) : (
              <button className="text-sm text-primary font-medium hover:underline">Connect bank account via Plaid →</button>
            )}
          </div>
        </div>
      )}

      {tab === "payables" && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <span className="text-sm font-semibold">Recent payables</span>
            <Link href={`/dashboard/payables?entity=${e.id}`} className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Contractor</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {e.recentPayables.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3.5 font-mono text-xs">{p.ref}</td>
                  <td className="px-5 py-3.5 text-sm">{p.contractor}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PAYABLE_STATUS[p.status]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-medium">{formatCurrency(p.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "disbursements" && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
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
              {e.recentDisbursements.map((d) => (
                <tr key={d.id} className="hover:bg-muted/20 transition-colors cursor-pointer">
                  <td className="px-5 py-3.5 text-sm">{d.date}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${DISBURSEMENT_STATUS[d.status]}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm">{d.count} payables</td>
                  <td className="px-5 py-3.5 text-right text-sm font-medium">{formatCurrency(d.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "contractors" && (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          {e.contractorCount} contractors have engagements with this entity.{" "}
          <Link href="/dashboard/contractors" className="text-primary hover:underline">View all contractors →</Link>
        </div>
      )}
    </div>
  );
}
