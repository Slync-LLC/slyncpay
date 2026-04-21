"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Plus, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type PayableStatus = "draft" | "pending" | "processing" | "paid" | "failed" | "cancelled";

interface Payable {
  id: string;
  externalRef: string;
  contractor: string;
  entity: string;
  amountCents: number;
  feeAmountCents: number;
  status: PayableStatus;
  dueDate: string;
  createdAt: string;
}

const STATUS_STYLES: Record<PayableStatus, string> = {
  draft: "bg-gray-50 text-gray-700",
  pending: "bg-blue-50 text-blue-700",
  processing: "bg-purple-50 text-purple-700",
  paid: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-gray-50 text-gray-400",
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "processing", label: "Processing" },
  { value: "draft", label: "Draft" },
  { value: "failed", label: "Failed" },
];

const MOCK_PAYABLES: Payable[] = [
  { id: "p1", externalRef: "SHIFT-9021", contractor: "Jane Smith", entity: "NurseIO AZ LLC", amountCents: 450_00, feeAmountCents: 476, status: "paid", dueDate: "2026-04-19", createdAt: "2026-04-18T09:00:00Z" },
  { id: "p2", externalRef: "SHIFT-9020", contractor: "Maria Garcia", entity: "NurseIO AZ LLC", amountCents: 390_00, feeAmountCents: 412, status: "pending", dueDate: "2026-04-25", createdAt: "2026-04-18T10:00:00Z" },
  { id: "p3", externalRef: "SHIFT-9019", contractor: "Jane Smith", entity: "NurseIO AZ LLC", amountCents: 510_00, feeAmountCents: 538, status: "pending", dueDate: "2026-04-25", createdAt: "2026-04-17T14:00:00Z" },
  { id: "p4", externalRef: "SHIFT-9018", contractor: "John Doe", entity: "NurseIO CA Inc", amountCents: 620_00, feeAmountCents: 652, status: "paid", dueDate: "2026-04-12", createdAt: "2026-04-11T09:00:00Z" },
  { id: "p5", externalRef: "SHIFT-9017", contractor: "Sarah Jones", entity: "NurseIO CA Inc", amountCents: 480_00, feeAmountCents: 506, status: "draft", dueDate: "2026-04-30", createdAt: "2026-04-20T08:00:00Z" },
];

export default function PayablesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const payables = MOCK_PAYABLES.filter((p) => {
    const matchesSearch =
      !search ||
      p.externalRef.toLowerCase().includes(search.toLowerCase()) ||
      p.contractor.toLowerCase().includes(search.toLowerCase()) ||
      p.entity.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingTotal = MOCK_PAYABLES.filter((p) => p.status === "pending").reduce((s, p) => s + p.amountCents, 0);
  const pendingCount = MOCK_PAYABLES.filter((p) => p.status === "pending").length;

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Payables</h1>
          <p className="text-sm text-muted-foreground">{MOCK_PAYABLES.length} total</p>
        </div>
        <Link
          href="/dashboard/payables/new"
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New payable
        </Link>
      </div>

      {/* Pending banner */}
      {pendingCount > 0 && (
        <div className="mb-5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">{pendingCount} pending payables</span> totaling{" "}
            <span className="font-semibold">{formatCurrency(pendingTotal)}</span> are ready for disbursement.
          </p>
          <Link
            href="/dashboard/disbursements?modal=trigger"
            className="text-sm font-medium text-blue-700 hover:text-blue-800 underline"
          >
            Trigger disbursement →
          </Link>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by reference, contractor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div className="flex gap-1">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-white border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Contractor</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Entity</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Due</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payables.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  {search || statusFilter ? "No payables match your filters." : "No payables yet."}
                </td>
              </tr>
            ) : (
              payables.map((p) => (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs">{p.externalRef}</td>
                  <td className="px-5 py-3.5 text-sm">{p.contractor}</td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{p.entity}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[p.status]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{p.dueDate}</td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="text-sm font-medium">{formatCurrency(p.amountCents)}</div>
                    <div className="text-xs text-muted-foreground">+{formatCurrency(p.feeAmountCents)} fee</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
