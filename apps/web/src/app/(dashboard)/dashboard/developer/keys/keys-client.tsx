"use client";

import { useState, useTransition } from "react";
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { createApiKey, revokeApiKey } from "./actions";

interface ApiKey {
  id: string;
  keyPrefix: string;
  keyHint: string;
  environment: "live" | "test";
  name: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function NewKeyModal({ onClose }: { onClose: () => void }) {
  const [env, setEnv] = useState<"live" | "test">("live");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [pending, start] = useTransition();

  function generate() {
    setError(null);
    start(async () => {
      const res = await createApiKey({ environment: env, ...(name ? { name } : {}) });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCreated(res.key);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold mb-5">Generate API key</h2>

        {created ? (
          <div>
            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Copy this key now — it won&apos;t be shown again.
            </div>
            <div className="flex items-center gap-2 bg-zinc-950 rounded-lg px-4 py-3 mb-5">
              <code className="flex-1 text-sm text-zinc-300 font-mono break-all">
                {revealed ? created : created.slice(0, 16) + "•".repeat(24)}
              </code>
              <button type="button" onClick={() => setRevealed(!revealed)} className="text-zinc-500 hover:text-zinc-300">
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <CopyButton text={created} />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              I&apos;ve copied my key
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Environment</label>
              <div className="flex gap-2">
                {(["live", "test"] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEnv(e)}
                    className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                      env === e ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {e === "live" ? "Live" : "Sandbox"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {env === "test"
                  ? "Sandbox keys hit a Wingspan staging account. No real money moves."
                  : "Live keys move real money. Treat them like a password."}
              </p>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium mb-1.5">
                Name <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Production server"
                className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={generate}
                disabled={pending}
                className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {pending ? "Generating…" : "Generate key"}
              </button>
              <button
                type="button"
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

function RevokeConfirmModal({ keyId, onClose }: { keyId: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    start(async () => {
      const res = await revokeApiKey(keyId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h2 className="font-semibold mb-2">Revoke API key?</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Any integrations using this key will stop working immediately.
        </p>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="flex-1 bg-destructive text-destructive-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {pending ? "Revoking…" : "Revoke key"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function KeysClient({ initialKeys }: { initialKeys: ApiKey[] }) {
  const [showModal, setShowModal] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const active = initialKeys.filter((k) => !k.revokedAt);
  const revoked = initialKeys.filter((k) => k.revokedAt);

  return (
    <div className="p-8 max-w-3xl">
      {showModal && <NewKeyModal onClose={() => setShowModal(false)} />}
      {revoking && <RevokeConfirmModal keyId={revoking} onClose={() => setRevoking(null)} />}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-sm text-muted-foreground">Authenticate your API requests</p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Generate key
        </button>
      </div>

      <div className="bg-zinc-950 rounded-xl p-4 mb-6 text-sm font-mono text-zinc-300">
        <div className="text-zinc-500 mb-1">{"// Authenticate every request"}</div>
        <div>Authorization: Bearer <span className="text-green-400">spk_live_...</span></div>
      </div>

      {active.length === 0 && revoked.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          No API keys yet. Generate one above.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border divide-y divide-border overflow-hidden">
          {[...active, ...revoked].map((k) => (
            <div key={k.id} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <Key className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">
                      {k.keyPrefix}…{k.keyHint}
                    </code>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                        k.environment === "live" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
                      }`}
                    >
                      {k.environment === "live" ? "Live" : "Sandbox"}
                    </span>
                    {k.revokedAt && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">
                        Revoked
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {k.name ?? "Unnamed key"} · Created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                  </div>
                </div>
              </div>
              {!k.revokedAt && (
                <button
                  type="button"
                  onClick={() => setRevoking(k.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Revoke key"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
