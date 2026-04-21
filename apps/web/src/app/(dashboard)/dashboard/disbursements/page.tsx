"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Banknote, ChevronRight, X, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Disbursement {
  id: string;
  entity: string;
  entityId: string;
  status: "processing" | "completed" | "failed" | "partial";
  payablesCount: number;
  totalAmountCents: number;
  totalFeesCents: number;
  initiatedAt: string;
  completedAt?: string;
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-50 text-green-700",
  processing: "bg-blue-50 text-blue-700",
  failed: "bg-red-50 text-red-700",
  partial: "bg-orange-50 text-orange-700",
};

const MOCK_DISBURSEMENTS: Disbursement[] = [
  { id: "d1", entity: "NurseIO AZ LLC", entityId: "e1", status: "completed", payablesCount: 14, totalAmountCents: 24_500_00, totalFeesCents: 2_210, initiatedAt: "2026-04-15T10:00:00Z", completedAt: "2026-04-15T10:03:22Z" },
  { id: "d2", entity: "NurseIO AZ LLC", entityId: "e1", status: "completed", payablesCount: 11, totalAmountCents: 18_900_00, totalFeesCents: 1_737, initiatedAt: "2026-04-01T09:00:00Z", completedAt: "2026-04-01T09:02:18Z" },
  { id: "d3", entity: "NurseIO CA Inc", entityId: "e2", status: "completed", payablesCount: 8, totalAmountCents: 14_200_00, totalFeesCents: 1_161, initiatedAt: "2026-04-14T14:00:00Z", completedAt: "2026-04-14T14:04:01Z" },
  { id: "d4", entity: "NurseIO CA Inc", entityId: "e2", status: "failed", payablesCount: 6, totalAmountCents: 9_800_00, totalFeesCents: 809, initiatedAt: "2026-03-31T11:00:00Z" },
];

// Pending for the trigger modal
const MOCK_PENDING = {
  e1: { entity: "NurseIO AZ LLC", count: 8, totalCents: 14_200_00 },
  e2: { entity: "NurseIO CA Inc", count: 4, totalCents: 7_800_00 },
};

const MOCK_ENTITIES = [
  { id: "e1", name: "NurseIO AZ LLC" },
  { id: "e2", name: "NurseIO CA Inc" },
];

function TriggerModal({ onClose }: { onClose: () => void }) {
  const [selectedEntity, setSelectedEntity] = useState("e1");
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const pending = MOCK_PENDING[selectedEntity as keyof typeof MOCK_PENDING];

  async function handleTrigger() {
    setConfirming(true);
    await new Promise((r) => setTimeout(r, 1200));
    setDone(true);
    setConfirming(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Trigger disbursement</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <Banknote className="h-6 w-6 text-green-600" />
            </div>
            <p className="font-medium">Disbursement triggered</p>
            <p className="text-sm text-muted-foreground mt-1">
              {pending?.count} payables are being processed. Contractors will be paid shortly.
            </p>
            <button
              onClick={onClose}
              className="mt-5 w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1.5">Entity</label>
              <select
                value={selectedEntity}
                onChange={(e) => setSelectedEntity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {MOCK_ENTITIES.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>

            {pending ? (
              <div className="bg-muted/50 rounded-lg p-4 mb-5 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pending payables</span>
                  <span className="font-medium">{pending.count}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total amount</span>
                  <span className="font-semibold">{formatCurrency(pending.totalCents)}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 mb-5">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                No pending payables for this entity.
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleTrigger}
                disabled={confirming || !pending || pending.count === 0}
                className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {confirming ? "Processing..." : `Pay ${pending?.count ?? 0} contractors`}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function DisbursementsPage() {
  const searchParams = useSearchParams();
  const [showModal, setShowModal] = useState(searchParams.get("modal") === "trigger");

  return (
    <div className="p-8 max-w-5xl">
      {showModal && <TriggerModal onClose={() => setShowModal(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Disbursements</h1>
          <p className="text-sm text-muted-foreground">{MOCK_DISBURSEMENTS.length} batches</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Banknote className="h-4 w-4" />
          Trigger payment
        </button>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Entity</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Payables</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Fees</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {MOCK_DISBURSEMENTS.map((d) => (
              <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3.5 text-sm">
                  {new Date(d.initiatedAt).toLocaleDateString()}
                </td>
                <td className="px-5 py-3.5 text-sm">{d.entity}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[d.status]}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm">{d.payablesCount}</td>
                <td className="px-5 py-3.5 text-right text-sm font-medium">{formatCurrency(d.totalAmountCents)}</td>
                <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">{formatCurrency(d.totalFeesCents)}</td>
                <td className="px-5 py-3.5 text-right">
                  <Link
                    href={`/dashboard/disbursements/${d.id}`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Details <ChevronRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
