"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { Users, Search, Plus, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type OnboardingStatus = "invited" | "w9_pending" | "payout_pending" | "active" | "inactive";

interface Contractor {
  id: string;
  externalId: string;
  email: string;
  firstName: string;
  lastName: string;
  onboardingStatus: OnboardingStatus;
  createdAt: string;
}

const STATUS_STYLES: Record<OnboardingStatus, string> = {
  active: "bg-green-50 text-green-700",
  invited: "bg-yellow-50 text-yellow-700",
  w9_pending: "bg-orange-50 text-orange-700",
  payout_pending: "bg-blue-50 text-blue-700",
  inactive: "bg-gray-50 text-gray-500",
};

const STATUS_LABELS: Record<OnboardingStatus, string> = {
  active: "Active",
  invited: "Invited",
  w9_pending: "W-9 Pending",
  payout_pending: "Payout Setup",
  inactive: "Inactive",
};

function StatusBadge({ status }: { status: OnboardingStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// Mock data until API is wired
const MOCK_CONTRACTORS: Contractor[] = [
  { id: "1", externalId: "nurse-001", email: "jane.smith@example.com", firstName: "Jane", lastName: "Smith", onboardingStatus: "active", createdAt: "2026-04-01T10:00:00Z" },
  { id: "2", externalId: "nurse-002", email: "john.doe@example.com", firstName: "John", lastName: "Doe", onboardingStatus: "w9_pending", createdAt: "2026-04-10T14:30:00Z" },
  { id: "3", externalId: "nurse-003", email: "maria.garcia@example.com", firstName: "Maria", lastName: "Garcia", onboardingStatus: "active", createdAt: "2026-03-15T09:00:00Z" },
  { id: "4", externalId: "nurse-004", email: "james.wilson@example.com", firstName: "James", lastName: "Wilson", onboardingStatus: "invited", createdAt: "2026-04-18T11:00:00Z" },
  { id: "5", externalId: "nurse-005", email: "sarah.jones@example.com", firstName: "Sarah", lastName: "Jones", onboardingStatus: "payout_pending", createdAt: "2026-04-12T16:00:00Z" },
];

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "w9_pending", label: "W-9 Pending" },
  { value: "payout_pending", label: "Payout Setup" },
  { value: "invited", label: "Invited" },
  { value: "inactive", label: "Inactive" },
];

export default function ContractorsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const contractors = MOCK_CONTRACTORS.filter((c) => {
    const matchesSearch =
      !search ||
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.externalId.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || c.onboardingStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Contractors</h1>
          <p className="text-sm text-muted-foreground">{MOCK_CONTRACTORS.length} total</p>
        </div>
        <Link
          href="/dashboard/contractors/new"
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Add contractor
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, or ID..."
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
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">External ID</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Added</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contractors.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  {search || statusFilter ? "No contractors match your filters." : "No contractors yet. Add your first contractor to get started."}
                </td>
              </tr>
            ) : (
              contractors.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium">{c.firstName} {c.lastName}</span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{c.email}</td>
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs text-muted-foreground">{c.externalId}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={c.onboardingStatus} />
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/dashboard/contractors/${c.id}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      View <ChevronRight className="h-3 w-3" />
                    </Link>
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
