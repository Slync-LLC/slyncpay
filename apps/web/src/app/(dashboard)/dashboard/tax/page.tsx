"use client";

import { useState } from "react";
import { Receipt, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface TaxRecord {
  contractorId: string;
  contractor: string;
  entity: string;
  year: number;
  totalPaidCents: number;
  status: "not_filed" | "filed" | "corrected";
}

const MOCK_TAX: TaxRecord[] = [
  { contractorId: "c1", contractor: "Jane Smith", entity: "NurseIO AZ LLC", year: 2025, totalPaidCents: 48_200_00, status: "filed" },
  { contractorId: "c3", contractor: "Maria Garcia", entity: "NurseIO AZ LLC", year: 2025, totalPaidCents: 31_500_00, status: "filed" },
  { contractorId: "c4", contractor: "James Wilson", entity: "NurseIO CA Inc", year: 2025, totalPaidCents: 22_800_00, status: "filed" },
  { contractorId: "c2", contractor: "John Doe", entity: "NurseIO CA Inc", year: 2025, totalPaidCents: 9_400_00, status: "not_filed" },
];

const STATUS_STYLES: Record<string, string> = {
  filed: "bg-green-50 text-green-700",
  not_filed: "bg-yellow-50 text-yellow-700",
  corrected: "bg-blue-50 text-blue-700",
};

const YEARS = [2025, 2024];

export default function TaxPage() {
  const [year, setYear] = useState(2025);
  const records = MOCK_TAX.filter((r) => r.year === year);
  const eligibleCount = records.filter((r) => r.totalPaidCents >= 60_000).length;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">1099s</h1>
          <p className="text-sm text-muted-foreground">1099-NEC filed for contractors earning $600+</p>
        </div>
        <div className="flex gap-2">
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                year === y
                  ? "bg-primary text-primary-foreground"
                  : "bg-white border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground mb-1">Total contractors</div>
          <div className="text-xl font-bold">{records.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground mb-1">1099-NEC eligible ($600+)</div>
          <div className="text-xl font-bold">{eligibleCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground mb-1">Filed</div>
          <div className="text-xl font-bold">{records.filter((r) => r.status === "filed").length}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Contractor</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Entity</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Total paid</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {records.map((r) => (
              <tr key={`${r.contractorId}-${r.entity}`} className="hover:bg-muted/20">
                <td className="px-5 py-3.5 text-sm font-medium">{r.contractor}</td>
                <td className="px-5 py-3.5 text-sm text-muted-foreground">{r.entity}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                    {r.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right text-sm font-medium">{formatCurrency(r.totalPaidCents)}</td>
                <td className="px-5 py-3.5 text-right">
                  {r.status === "filed" && (
                    <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <Download className="h-3.5 w-3.5" /> PDF
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        1099-NEC forms are automatically generated and e-filed for all eligible contractors at year-end through Wingspan's tax filing service.
      </p>
    </div>
  );
}
