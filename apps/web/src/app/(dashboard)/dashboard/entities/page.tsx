"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Plus, ChevronRight, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Entity {
  id: string;
  name: string;
  ein: string; // masked
  state: string;
  status: "provisioning" | "active" | "inactive";
  contractorCount: number;
  mtdVolumeCents: number;
  bankConnected: boolean;
}

// Mock — replace with TanStack Query
const MOCK_ENTITIES: Entity[] = [
  { id: "e1", name: "NurseIO AZ LLC", ein: "**-*****42", state: "AZ", status: "active", contractorCount: 32, mtdVolumeCents: 89_400_00, bankConnected: true },
  { id: "e2", name: "NurseIO CA Inc", ein: "**-*****89", state: "CA", status: "active", contractorCount: 15, mtdVolumeCents: 35_100_00, bankConnected: true },
  { id: "e3", name: "NurseIO TX Corp", ein: "**-*****11", state: "TX", status: "provisioning", contractorCount: 0, mtdVolumeCents: 0, bankConnected: false },
];

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  provisioning: "bg-yellow-50 text-yellow-700",
  inactive: "bg-gray-50 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  provisioning: "Provisioning",
  inactive: "Inactive",
};

export default function EntitiesPage() {
  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Entities</h1>
          <p className="text-sm text-muted-foreground">{MOCK_ENTITIES.length} legal entities</p>
        </div>
        <Link
          href="/dashboard/entities/new"
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New entity
        </Link>
      </div>

      {/* Entity cards */}
      <div className="grid gap-3">
        {MOCK_ENTITIES.map((e) => (
          <Link
            key={e.id}
            href={`/dashboard/entities/${e.id}`}
            className="flex items-center justify-between bg-white rounded-xl border border-border p-5 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{e.name}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[e.status]}`}>
                    {STATUS_LABELS[e.status]}
                  </span>
                  {!e.bankConnected && e.status === "active" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700">
                      <AlertCircle className="h-3 w-3" /> Bank not connected
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-muted-foreground font-mono">EIN {e.ein}</span>
                  <span className="text-xs text-muted-foreground">{e.state}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-10">
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-0.5">MTD volume</div>
                <div className="text-sm font-semibold">{formatCurrency(e.mtdVolumeCents)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-0.5">Contractors</div>
                <div className="text-sm font-semibold">{e.contractorCount}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
