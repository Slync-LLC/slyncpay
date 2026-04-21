"use client";

import { useState } from "react";
import { Webhook, Plus, Trash2, Copy, Check, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

const EVENT_TYPES = [
  "contractor.created",
  "contractor.onboarding_complete",
  "payable.created",
  "payable.paid",
  "payable.failed",
  "disbursement.started",
  "disbursement.completed",
  "disbursement.failed",
];

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  status: "active" | "disabled";
  createdAt: string;
  lastDeliveryAt?: string;
  lastDeliveryStatus?: "success" | "failure";
}

const MOCK_WEBHOOKS: WebhookEndpoint[] = [
  {
    id: "wh1",
    url: "https://api.nurseio.com/webhooks/slyncpay",
    events: ["payable.paid", "disbursement.completed", "disbursement.failed"],
    status: "active",
    createdAt: "2026-04-01T10:00:00Z",
    lastDeliveryAt: "2026-04-20T09:02:11Z",
    lastDeliveryStatus: "success",
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function NewWebhookModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [allEvents, setAllEvents] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleEvent(event: string) {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  }

  async function handleCreate() {
    if (!url || !url.startsWith("https://")) {
      setError("URL must start with https://");
      return;
    }
    setLoading(true);
    setError("");
    await new Promise((r) => setTimeout(r, 800));
    // Mock secret — real impl calls POST /v1/webhooks
    setCreated(`whsec_${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-5">Add webhook endpoint</h2>

        {created ? (
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Webhook created. Use this signing secret to verify event payloads via HMAC-SHA256.
            </p>
            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Save this secret now — it won't be shown again.
            </div>
            <div className="flex items-center gap-2 bg-zinc-950 rounded-lg px-4 py-3 mb-5">
              <code className="flex-1 text-sm text-zinc-300 font-mono break-all">{created}</code>
              <CopyButton text={created} />
            </div>
            <button
              onClick={onClose}
              className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1.5">Endpoint URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-server.com/webhooks/slyncpay"
                className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              {error && <p className="text-xs text-destructive mt-1">{error}</p>}
            </div>

            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Events to listen to</label>
                <button
                  onClick={() => setAllEvents(!allEvents)}
                  className="text-xs text-primary hover:underline"
                >
                  {allEvents ? "Select specific events" : "Send all events"}
                </button>
              </div>
              {!allEvents && (
                <div className="border border-border rounded-md divide-y divide-border">
                  {EVENT_TYPES.map((event) => (
                    <label key={event} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30">
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(event)}
                        onChange={() => toggleEvent(event)}
                        className="rounded border-border"
                      />
                      <span className="text-sm font-mono">{event}</span>
                    </label>
                  ))}
                </div>
              )}
              {allEvents && (
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  All events will be sent to this endpoint.
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? "Creating..." : "Create endpoint"}
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

export default function WebhooksPage() {
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="p-8 max-w-3xl">
      {showModal && <NewWebhookModal onClose={() => setShowModal(false)} />}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-sm text-muted-foreground">Receive real-time event notifications</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Add endpoint
        </button>
      </div>

      {/* Docs callout */}
      <div className="bg-muted/50 border border-border rounded-xl p-4 mb-6 text-sm">
        <p className="font-medium mb-1">Verifying webhook signatures</p>
        <p className="text-muted-foreground">
          Every payload is signed with HMAC-SHA256 using your endpoint's signing secret.
          Verify the <code className="text-xs bg-muted px-1 py-0.5 rounded">SlyncPay-Signature</code> header before processing events.
        </p>
      </div>

      {/* Endpoints */}
      {MOCK_WEBHOOKS.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <Webhook className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm text-muted-foreground">No webhook endpoints yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {MOCK_WEBHOOKS.map((wh) => (
            <div key={wh.id} className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${wh.status === "active" ? "bg-green-500" : "bg-gray-400"}`} />
                  <div className="min-w-0">
                    <code className="text-sm font-mono truncate block">{wh.url}</code>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {wh.events.length} events · Added {new Date(wh.createdAt).toLocaleDateString()}
                      {wh.lastDeliveryAt && ` · Last delivery ${new Date(wh.lastDeliveryAt).toLocaleDateString()}`}
                      {wh.lastDeliveryStatus && (
                        <span className={`ml-1 ${wh.lastDeliveryStatus === "success" ? "text-green-600" : "text-red-600"}`}>
                          ({wh.lastDeliveryStatus})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setExpanded(expanded === wh.id ? null : wh.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {expanded === wh.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <button className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {expanded === wh.id && (
                <div className="border-t border-border px-5 py-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Subscribed events</p>
                  <div className="flex flex-wrap gap-1.5">
                    {wh.events.map((e) => (
                      <span key={e} className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-xs font-mono">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
