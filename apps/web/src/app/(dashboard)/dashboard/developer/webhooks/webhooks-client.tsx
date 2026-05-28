"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Webhook, Plus, Trash2, Copy, Check } from "lucide-react";
import { createWebhookEndpoint, deleteWebhookEndpoint } from "./actions";

const EVENT_TYPES = [
  "worker.created",
  "worker.onboarding_complete",
  "payable.created",
  "payable.paid",
  "payable.failed",
  "disbursement.started",
  "disbursement.completed",
  "disbursement.failed",
  "work_log.approved",
  "payroll.approved",
  "payroll.paid",
  "pay_statement.issued",
  "pay_statement.failed",
];

interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  status: "active" | "disabled";
  secretHint: string;
  createdAt: string;
}

export function WebhooksClient({ initial }: { initial: WebhookEndpoint[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; signingSecret: string } | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  function toggleEvent(ev: string) {
    setSelected((s) => (s.includes(ev) ? s.filter((x) => x !== ev) : [...s, ev]));
  }

  function submit() {
    if (!url.trim()) {
      setErr("URL is required");
      return;
    }
    setErr(null);
    start(async () => {
      const res = await createWebhookEndpoint({
        url: url.trim(),
        description: description.trim() || undefined,
        events: selected,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setCreated({ id: res.id, signingSecret: res.signingSecret });
      setUrl("");
      setDescription("");
      setSelected([]);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this webhook endpoint? Future events won't be delivered.")) return;
    start(async () => {
      const res = await deleteWebhookEndpoint(id);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-sm text-muted-foreground">
            Receive event notifications from SlyncPay. Each delivery is signed with HMAC-SHA256
            using the endpoint&apos;s signing secret.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
            setCreated(null);
          }}
          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-3.5 w-3.5" />
          {open ? "Cancel" : "Add endpoint"}
        </button>
      </div>

      {open && !created && (
        <div className="bg-white rounded-xl border border-border p-5 mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-app.com/webhooks/slyncpay"
              className="w-full px-3 py-2 text-sm border border-border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Production webhooks for the billing service"
              className="w-full px-3 py-2 text-sm border border-border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Events</label>
            <p className="text-xs text-muted-foreground mb-2">
              Leave all unchecked to receive every event type.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {EVENT_TYPES.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.includes(ev)} onChange={() => toggleEvent(ev)} />
                  <code className="text-xs">{ev}</code>
                </label>
              ))}
            </div>
          </div>
          {err && <div className="text-sm text-red-700">{err}</div>}
          <div>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Creating…" : "Create endpoint"}
            </button>
          </div>
        </div>
      )}

      {created && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-5 mb-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-sm font-semibold text-yellow-900">Save your signing secret</h2>
              <p className="text-xs text-yellow-800 mt-1">
                Use this to verify the <code className="font-mono">X-Slyncpay-Signature</code> header
                on incoming deliveries. We won&apos;t show it again.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xs bg-white border border-yellow-200 rounded px-3 py-2 break-all">
              {created.signingSecret}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(created.signingSecret);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium border border-yellow-300 rounded-md px-3 py-1.5 hover:bg-yellow-100"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-700" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {initial.length === 0 ? (
          <div className="p-12 text-center">
            <Webhook className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-base font-semibold mb-1">No webhook endpoints yet</h2>
            <p className="text-sm text-muted-foreground">
              Add an endpoint to receive event notifications when things happen — workers onboard,
              payables settle, payrolls process.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">URL</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Events</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Secret</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {initial.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-3 text-sm font-mono break-all">{e.url}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {e.events.length === 0 ? "All events" : `${e.events.length} event${e.events.length === 1 ? "" : "s"}`}
                  </td>
                  <td className="px-5 py-3 text-xs font-mono text-muted-foreground">{e.secretHint}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs ${e.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-600"}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => remove(e.id)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                      aria-label="Delete endpoint"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
