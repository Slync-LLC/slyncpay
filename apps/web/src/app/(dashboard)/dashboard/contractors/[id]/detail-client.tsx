"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ExternalLink, Copy, Check, Mail, Link2, Send, Plus, Monitor, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { attachContractorToEntity, payContractorNow } from "../actions";

type Tab = "overview" | "payments" | "entities" | "1099s";

interface Contractor {
  id: string;
  externalId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  onboardingStatus: string;
  createdAt: string;
}

interface Engagement {
  id: string;
  engagementId: string;
  entityId: string;
  entityName: string | null;
  status: string;
  createdAt: string;
}

interface Entity {
  id: string;
  name: string;
  einLast4: string | null;
  status: string;
}

interface Payable {
  id: string;
  amountCents: number;
  status: string;
  externalReferenceId: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  invited: "bg-yellow-50 text-yellow-700",
  w9_pending: "bg-orange-50 text-orange-700",
  payout_pending: "bg-blue-50 text-blue-700",
  inactive: "bg-gray-50 text-gray-500",
  paid: "bg-green-50 text-green-700",
  pending: "bg-blue-50 text-blue-700",
  processing: "bg-blue-50 text-blue-700",
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
  processing: "Processing",
  failed: "Failed",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function ContractorDetailClient(props: {
  contractor: Contractor;
  engagements: Engagement[];
  entities: Entity[];
  payables: Payable[];
  onboardingUrl: string | null;
}) {
  const { contractor: c, engagements, entities, payables, onboardingUrl } = props;
  const [tab, setTab] = useState<Tab>("overview");
  const [attachOpen, setAttachOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [iframeOpen, setIframeOpen] = useState(false);

  const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;

  const engagedEntityIds = new Set(engagements.map((e) => e.entityId));
  const availableEntities = entities.filter((e) => !engagedEntityIds.has(e.id) && e.status === "active");
  const payableTotalCents = payables.reduce((s, p) => (p.status === "paid" ? s + p.amountCents : s), 0);

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "payments", label: "Payments" },
    { id: "entities", label: "Entities" },
    { id: "1099s", label: "1099s" },
  ];

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/dashboard/contractors" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="h-4 w-4" />
        Contractors
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{fullName}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[c.onboardingStatus] ?? "bg-gray-50 text-gray-500"}`}>
              {STATUS_LABELS[c.onboardingStatus] ?? c.onboardingStatus}
            </span>
            <span className="text-sm text-muted-foreground">Added {new Date(c.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onboardingUrl && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(onboardingUrl);
              }}
              className="flex items-center gap-1.5 text-sm border border-border rounded-md px-3 py-2 hover:bg-muted transition-colors"
            >
              <Link2 className="h-3.5 w-3.5" />
              Copy onboarding link
            </button>
          )}
          {engagements.length > 0 && c.onboardingStatus === "active" && (
            <button
              type="button"
              onClick={() => setPayOpen(true)}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Send className="h-3.5 w-3.5" />
              Pay now
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map(({ id: tabId, label }) => (
          <button
            key={tabId}
            type="button"
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

          {onboardingUrl && (
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setIframeOpen(!iframeOpen)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                  <div className="text-left">
                    <div className="text-sm font-semibold">Embedded onboarding preview</div>
                    <div className="text-xs text-muted-foreground">
                      Drop this URL into an <code className="font-mono bg-muted px-1 rounded">&lt;iframe&gt;</code> in your own app.
                    </div>
                  </div>
                </div>
                {iframeOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {iframeOpen && (
                <div className="border-t border-border p-5 space-y-3">
                  <div className="bg-zinc-950 rounded-md px-3 py-2 text-xs font-mono text-zinc-300 overflow-x-auto">
                    {`<iframe src="${onboardingUrl}" width="600" height="800" allow="clipboard-write"></iframe>`}
                  </div>
                  <iframe
                    src={onboardingUrl}
                    title="Embedded onboarding preview"
                    className="w-full h-[700px] border border-border rounded-md bg-white"
                    allow="clipboard-write"
                  />
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="text-sm font-semibold mb-4">Payment summary</h2>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Total paid</div>
                <div className="text-xl font-bold">{formatCurrency(payableTotalCents)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Payments</div>
                <div className="text-xl font-bold">{payables.length}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Entities</div>
                <div className="text-xl font-bold">{engagements.length}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "payments" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-muted-foreground">
              Each payment creates a payable and immediately processes the disbursement.
            </p>
            {engagements.length > 0 ? (
              <button
                type="button"
                onClick={() => setPayOpen(true)}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Send className="h-3.5 w-3.5" />
                New payment
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">
                Attach to an entity to enable payments.
              </span>
            )}
          </div>
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            {payables.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No payments yet.{" "}
                {engagements.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPayOpen(true)}
                    className="text-primary hover:underline"
                  >
                    Send the first one.
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payables.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3.5 font-mono text-xs">{p.externalReferenceId ?? p.id.slice(0, 8)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[p.status] ?? ""}`}>
                          {STATUS_LABELS[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td className="px-5 py-3.5 text-right text-sm font-medium">{formatCurrency(p.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "entities" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-muted-foreground">
              Attach this contractor to one of your entities to pay them on its behalf.
            </p>
            {availableEntities.length > 0 && (
              <button
                type="button"
                onClick={() => setAttachOpen(true)}
                className="flex items-center gap-1.5 text-sm border border-border rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Attach to entity
              </button>
            )}
          </div>
          {engagements.length === 0 ? (
            <div className="bg-white rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
              Not attached to any entities yet.
            </div>
          ) : (
            <div className="grid gap-3">
              {engagements.map((e) => (
                <div key={e.id} className="bg-white rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{e.entityName ?? "Unnamed entity"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 capitalize">{e.status}</div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-xs text-muted-foreground mb-1">Engagement ID — reference this when creating payables via the API</div>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs bg-muted px-2 py-1 rounded">{e.engagementId}</code>
                      <CopyButton text={e.engagementId} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "1099s" && (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          No 1099s filed yet. 1099-NEC forms are generated automatically at year-end for contractors earning $600+.
        </div>
      )}

      {attachOpen && (
        <AttachEntityModal
          contractorId={c.id}
          available={availableEntities}
          onClose={() => setAttachOpen(false)}
        />
      )}

      {payOpen && (
        <PayNowModal
          contractor={c}
          engagements={engagements}
          onClose={() => setPayOpen(false)}
        />
      )}
    </div>
  );
}

function AttachEntityModal({
  contractorId,
  available,
  onClose,
}: {
  contractorId: string;
  available: Entity[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(available[0]?.id ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (!selected) return;
    setErr(null);
    start(async () => {
      const res = await attachContractorToEntity(contractorId, selected);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold mb-1">Attach to entity</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Each contractor↔entity link creates an <code className="font-mono text-xs">engagementId</code> used on payables.
        </p>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entities available.</p>
        ) : (
          <>
            <label className="block text-sm font-medium mb-1.5">Entity</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {available.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} {e.einLast4 ? `(EIN ${e.einLast4})` : ""}
                </option>
              ))}
            </select>
            {err && <p className="text-xs text-red-600 mt-3">{err}</p>}
          </>
        )}
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !selected}
            className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Attaching…" : "Attach"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PayNowModal({
  contractor,
  engagements,
  onClose,
}: {
  contractor: Contractor;
  engagements: Engagement[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [entityId, setEntityId] = useState(engagements[0]?.entityId ?? "");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ count: number; totalCents: number } | null>(null);
  const [pending, start] = useTransition();

  const fullName = [contractor.firstName, contractor.lastName].filter(Boolean).join(" ") || contractor.email;

  function submit(confirmOthers = false) {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setErr("Enter a valid amount");
      return;
    }
    if (!entityId) {
      setErr("Select an entity");
      return;
    }
    setErr(null);
    start(async () => {
      const res = await payContractorNow({
        contractorId: contractor.id,
        entityId,
        amountCents: cents,
        ...(description ? { description } : {}),
        ...(reference ? { externalReferenceId: reference } : {}),
        ...(confirmOthers ? { confirmIncludesOtherPending: true } : {}),
      });
      if (!res.ok) {
        if (res.needsConfirm) {
          setConfirm({ count: res.pendingCount ?? 0, totalCents: res.pendingTotalCents ?? 0 });
          return;
        }
        setErr(res.error);
        return;
      }
      onClose();
      router.push(`/dashboard/disbursements/${res.disbursementId}`);
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold mb-1">Pay {fullName}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Creates a payable and immediately triggers disbursement for the selected entity.
        </p>

        {confirm ? (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-3 text-sm text-yellow-900 mb-4">
            <p className="font-medium mb-1">Other pending payables will be included</p>
            <p className="text-yellow-800">
              This entity has {confirm.count} other pending payable{confirm.count === 1 ? "" : "s"} totalling{" "}
              <strong>{formatCurrency(confirm.totalCents)}</strong>. They will be paid in the same batch.
            </p>
          </div>
        ) : null}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Entity</label>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              disabled={!!confirm}
              className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-muted"
            >
              {engagements.map((e) => (
                <option key={e.entityId} value={e.entityId}>
                  {e.entityName ?? "Entity"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Amount (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!!confirm}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!!confirm}
              placeholder="What's this for?"
              className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Your reference (optional)</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={!!confirm}
              placeholder="e.g. SHIFT-123"
              className="w-full px-3 py-2 text-sm border border-border rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-muted"
            />
          </div>
        </div>

        {err && <p className="text-sm text-red-600 mt-3">{err}</p>}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          {confirm ? (
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={pending}
              className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Paying…" : "Pay all"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={pending}
              className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Paying…" : "Pay now"}
            </button>
          )}
        </div>

        <a
          href="#"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
