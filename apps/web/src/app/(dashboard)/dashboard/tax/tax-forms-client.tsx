"use client";

import { useMemo, useState } from "react";
import { Receipt, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Row {
  key: string;
  workerId: string;
  workerName: string;
  workerEmail: string;
  entityId: string;
  entityName: string;
  taxType: "1099" | "w2";
  year: number;
  totalCents: number;
  formType: "1099-NEC" | "W-2" | null;
  eligible: boolean;
}

interface EntityOption {
  id: string;
  name: string;
  taxType: "1099" | "w2";
}

interface Filters {
  entity: string;
  type: "all" | "1099" | "w2";
  year: number;
}

const TYPE_BADGE: Record<"1099" | "w2", string> = {
  "1099": "bg-blue-50 text-blue-700",
  w2: "bg-purple-50 text-purple-700",
};

export function TaxFormsClient({
  year,
  rows,
  entities,
  filters,
}: {
  year: number;
  rows: Row[];
  entities: EntityOption[];
  filters: Filters;
}) {
  const [entityFilter, setEntityFilter] = useState(filters.entity);
  const [typeFilter, setTypeFilter] = useState<Filters["type"]>(filters.type);
  const [yearFilter, setYearFilter] = useState(filters.year);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (entityFilter && r.entityId !== entityFilter) return false;
        if (typeFilter !== "all" && r.taxType !== typeFilter) return false;
        return true;
      }),
    [rows, entityFilter, typeFilter],
  );

  const totals = useMemo(() => {
    let workers = new Set<string>();
    let eligible1099 = 0;
    let w2Workers = 0;
    let totalPaid = 0;
    for (const r of filtered) {
      workers.add(r.workerId);
      totalPaid += r.totalCents;
      if (r.taxType === "1099" && r.eligible) eligible1099 += 1;
      if (r.taxType === "w2") w2Workers += 1;
    }
    return {
      workers: workers.size,
      eligible1099,
      w2Workers,
      totalPaid,
    };
  }, [filtered]);

  const years = [year, year - 1, year - 2];

  function updateFilters(next: Partial<Filters>) {
    const params = new URLSearchParams();
    const entity = next.entity ?? entityFilter;
    const type = next.type ?? typeFilter;
    const y = next.year ?? yearFilter;
    if (entity) params.set("entity", entity);
    if (type !== "all") params.set("type", type);
    if (y !== new Date().getFullYear()) params.set("year", String(y));
    const qs = params.toString();
    window.location.search = qs ? `?${qs}` : "";
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Tax Forms</h1>
          <p className="text-sm text-muted-foreground">
            1099-NEC for contractors (paid $600+) and W-2 for employees, generated at year-end through Wingspan.
          </p>
        </div>
        <div className="flex gap-2">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => {
                setYearFilter(y);
                updateFilters({ year: y });
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                yearFilter === y
                  ? "bg-primary text-primary-foreground"
                  : "bg-white border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-border p-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 border border-border rounded-md p-1 bg-muted/20">
          {(["all", "1099", "w2"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTypeFilter(t);
                updateFilters({ type: t });
              }}
              className={`px-3 py-1 text-xs font-medium rounded ${
                typeFilter === t ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "all" ? "All" : t === "1099" ? "1099 Contractors" : "W-2 Employees"}
            </button>
          ))}
        </div>
        <select
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value);
            updateFilters({ entity: e.target.value });
          }}
          className="text-sm border border-border rounded-md px-3 py-1.5 bg-white"
        >
          <option value="">All entities</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.taxType === "w2" ? "W-2" : "1099"})
            </option>
          ))}
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground mb-1">Workers in scope</div>
          <div className="text-xl font-bold">{totals.workers}</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground mb-1">1099-NEC eligible ($600+)</div>
          <div className="text-xl font-bold">{totals.eligible1099}</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground mb-1">W-2 workers paid</div>
          <div className="text-xl font-bold">{totals.w2Workers}</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground mb-1">Total paid</div>
          <div className="text-xl font-bold">{formatCurrency(totals.totalPaid)}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-base font-semibold mb-1">No tax forms for {yearFilter} yet</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Forms are generated automatically at year-end through Wingspan once disbursements
              are paid. This page populates as payables settle and pay statements issue.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Worker</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Entity</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Form</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Earnings</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.key} className="hover:bg-muted/20">
                  <td className="px-5 py-3.5">
                    <div className="text-sm font-medium">{r.workerName}</div>
                    <div className="text-xs text-muted-foreground">{r.workerEmail}</div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{r.entityName}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_BADGE[r.taxType]}`}>
                      {r.taxType === "w2" ? "W-2" : "1099"}
                    </span>
                    {r.formType && (
                      <span className="ml-1.5 text-xs text-muted-foreground">{r.formType}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {r.taxType === "1099" && !r.eligible ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-500">
                        Under threshold
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700">
                        Pending year-end
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-medium tabular-nums">
                    {formatCurrency(r.totalCents)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground/40 cursor-not-allowed"
                      title="Available once Wingspan delivers the form"
                    >
                      <Download className="h-3.5 w-3.5" /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        1099-NEC and W-2 forms are auto-generated and e-filed through Wingspan at year-end. PDF
        downloads light up here once the forms arrive (via the
        <code className="font-mono mx-1">TaxForm.Delivered</code> webhook).
      </p>
    </div>
  );
}
