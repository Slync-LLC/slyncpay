"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, ExternalLink, Copy, Check, Mail, Hash } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type Tab = "overview" | "payments" | "entities" | "1099s";

// Mock — replace with TanStack Query
const MOCK_CONTRACTOR = {
  id: "1",
  externalId: "nurse-001",
  email: "jane.smith@example.com",
  firstName: "Jane",
  lastName: "Smith",
  onboardingStatus: "active" as const,
  createdAt: "2026-04-01T10:00:00Z",
  onboardingLink: "https://app.wingspan.app/onboarding/abc123",
  entities: [
    { id: "e1", name: "NurseIO AZ LLC", ein: "**-*****42" },
    { id: "e2", name: "NurseIO CA Inc", ein: "**-*****89" },
  ],
  payments: [
    { id: "p1", amount: 450_00, status: "paid", date: "2026-04-19", ref: "SHIFT-9021", entity: "NurseIO AZ LLC" },
    { id: "p2", amount: 390_00, status: "paid", date: "2026-04-12", ref: "SHIFT-9020", entity: "NurseIO AZ LLC" },
    { id: "p3", amount: 510_00, status: "paid", date: "2026-03-28", ref: "SHIFT-8990", entity: "NurseIO CA Inc" },
  ],
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  invited: "bg-yellow-50 text-yellow-700",
  w9_pending: "bg-orange-50 text-orange-700",
  payout_pending: "bg-blue-50 text-blue-700",
  inactive: "bg-gray-50 text-gray-500",
  paid: "bg-green-50 text-green-700",
  pending: "bg-blue-50 text-blue-700",
  failed: "bg-red-50 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  invited: "Invited",
  w9_pending: "W-9 Pending",
  payout_pending: "Payout Setup",
  inactive: "Inactive",
  paid: "Paid",
  pending: "Pending",
  failed: "Failed",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function ContractorDetailPage() {
  const { id } = useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const c = MOCK_CONTRACTOR; // replace with useQuery

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "payments", label: "Payments" },
    { id: "entities", label: "Entities" },
    { id: "1099s", label: "1099s" },
  ];

  return (
    <div className="p-8 max-w-4xl">
      {/* Back */}
      <Link href="/dashboard/contractors" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="h-4 w-4" />
        Contractors
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{c.firstName} {c.lastName}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[c.onboardingStatus]}`}>
              {STATUS_LABELS[c.onboardingStatus]}
            </span>
            <span className="text-sm text-muted-foreground">Added {new Date(c.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        {c.onboardingStatus !== "active" && (
          <a
            href={c.onboardingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm border border-border rounded-md px-3 py-2 hover:bg-muted transition-colors"
          >
            Onboarding link <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
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
          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="text-sm font-semibold mb-4">Contact information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Email</div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  {c.email}
                  <CopyButton text={c.email} />
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">External ID</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{c.externalId}</span>
                  <CopyButton text={c.externalId} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="text-sm font-semibold mb-4">Payment summary</h2>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Total paid</div>
                <div className="text-xl font-bold">
                  {formatCurrency(c.payments.reduce((sum, p) => sum + p.amount, 0))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Payments</div>
                <div className="text-xl font-bold">{c.payments.length}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Entities</div>
                <div className="text-xl font-bold">{c.entities.length}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "payments" && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Entity</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {c.payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3.5 font-mono text-xs">{p.ref}</td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{p.entity}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{p.date}</td>
                  <td className="px-5 py-3.5 text-right text-sm font-medium">{formatCurrency(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "entities" && (
        <div className="grid gap-3">
          {c.entities.map((e) => (
            <Link
              key={e.id}
              href={`/dashboard/entities/${e.id}`}
              className="flex items-center justify-between bg-white rounded-xl border border-border p-4 hover:bg-muted/20 transition-colors"
            >
              <div>
                <div className="text-sm font-medium">{e.name}</div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">EIN {e.ein}</div>
              </div>
              <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180" />
            </Link>
          ))}
        </div>
      )}

      {tab === "1099s" && (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          No 1099s filed yet. 1099-NEC forms are generated automatically at year-end for contractors earning $600+.
        </div>
      )}
    </div>
  );
}
