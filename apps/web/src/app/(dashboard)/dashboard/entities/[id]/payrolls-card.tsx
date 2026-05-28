"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Play } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { createPayroll, previewPayroll, approvePayroll } from "./payrolls-actions";

interface Payroll {
  id: string;
  type: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: string;
  totalEmployeeGrossCents: number;
  totalEmployerTaxCents: number;
  totalNetCents: number;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-50 text-gray-700",
  previewed: "bg-blue-50 text-blue-700",
  approved: "bg-orange-50 text-orange-700",
  processing: "bg-orange-50 text-orange-700",
  paid: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-700",
};

export function PayrollsCard({
  entityId,
  payrolls,
}: {
  entityId: string;
  payrolls: Payroll[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [payDate, setPayDate] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submitCreate() {
    if (!periodStart || !periodEnd || !payDate) {
      setErr("Period start, end, and pay date are required");
      return;
    }
    setErr(null);
    start(async () => {
      const res = await createPayroll({ entityId, periodStart, periodEnd, payDate, type: "regular" });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setOpen(false);
      setPeriodStart("");
      setPeriodEnd("");
      setPayDate("");
      router.refresh();
    });
  }

  function preview(id: string) {
    start(async () => {
      const res = await previewPayroll(id);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  function approve(id: string) {
    if (!confirm("Approve this payroll? This triggers the ACH debit at Wingspan.")) return;
    start(async () => {
      const res = await approvePayroll(id);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold">Payroll runs</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Each run sweeps approved work logs into a pay batch. Preview shows
            totals; approve triggers the ACH debit for gross + employer taxes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          {open ? "Cancel" : "Run payroll"}
        </button>
      </div>

      {open && (
        <div className="rounded-md border border-border p-4 mb-3 space-y-3 bg-muted/20">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Period start</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Period end</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Pay date</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-white"
              />
            </div>
          </div>
          {err && <div className="text-xs text-red-700">{err}</div>}
          <button
            type="button"
            onClick={submitCreate}
            disabled={pending}
            className="bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create payroll"}
          </button>
        </div>
      )}

      {payrolls.length === 0 ? (
        <div className="text-sm text-muted-foreground py-2">No payroll runs yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20 text-xs text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Pay date</th>
              <th className="text-left px-3 py-2 font-medium">Period</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Gross</th>
              <th className="text-right px-3 py-2 font-medium">Net</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payrolls.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">{new Date(p.payDate).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(p.periodStart).toLocaleDateString()} – {new Date(p.periodEnd).toLocaleDateString()}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[p.status] ?? ""}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.totalEmployeeGrossCents)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.totalNetCents)}</td>
                <td className="px-3 py-2 text-right">
                  {p.status === "draft" && (
                    <button
                      type="button"
                      onClick={() => preview(p.id)}
                      disabled={pending}
                      className="text-xs text-primary hover:underline mr-3"
                    >
                      Preview
                    </button>
                  )}
                  {(p.status === "draft" || p.status === "previewed") && (
                    <button
                      type="button"
                      onClick={() => approve(p.id)}
                      disabled={pending}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Play className="h-3 w-3" />
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
