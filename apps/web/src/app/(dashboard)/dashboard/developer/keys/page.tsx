"use client";

import { useState } from "react";
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff, AlertTriangle } from "lucide-react";

interface ApiKey {
  id: string;
  prefix: string;
  hint: string;
  environment: "live" | "test";
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

const MOCK_KEYS: ApiKey[] = [
  { id: "k1", prefix: "spk_live_a3f8b2c9", hint: "...4e2f", environment: "live", createdAt: "2026-04-01T10:00:00Z", lastUsedAt: "2026-04-20T09:00:00Z" },
  { id: "k2", prefix: "spk_test_d9e2f1a7", hint: "...8c3d", environment: "test", createdAt: "2026-04-01T10:00:00Z" },
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

function NewKeyModal({ onClose }: { onClose: () => void }) {
  const [env, setEnv] = useState<"live" | "test">("live");
  const [created, setCreated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);

  async function generate() {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    // Mock — real impl calls POST /v1/api-keys
    setCreated(`spk_${env}_${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold mb-5">Generate API key</h2>

        {created ? (
          <div>
            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Copy this key now — it won't be shown again.
            </div>
            <div className="flex items-center gap-2 bg-zinc-950 rounded-lg px-4 py-3 mb-5">
              <code className="flex-1 text-sm text-zinc-300 font-mono break-all">
                {revealed ? created : created.slice(0, 16) + "•".repeat(24)}
              </code>
              <button onClick={() => setRevealed(!revealed)} className="text-zinc-500 hover:text-zinc-300">
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <CopyButton text={created} />
            </div>
            <button
              onClick={onClose}
              className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              I've copied my key
            </button>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <label className="block text-sm font-medium mb-2">Environment</label>
              <div className="flex gap-2">
                {(["live", "test"] as const).map((e) => (
                  <button
                    key={e}
                    onClick={() => setEnv(e)}
                    className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                      env === e ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {e === "live" ? "🟢 Live" : "🧪 Test"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={generate}
                disabled={loading}
                className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? "Generating..." : "Generate key"}
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

export default function ApiKeysPage() {
  const [showModal, setShowModal] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  return (
    <div className="p-8 max-w-3xl">
      {showModal && <NewKeyModal onClose={() => setShowModal(false)} />}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-sm text-muted-foreground">Authenticate your API requests</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Generate key
        </button>
      </div>

      {/* Quick reference */}
      <div className="bg-zinc-950 rounded-xl p-4 mb-6 text-sm font-mono text-zinc-300">
        <div className="text-zinc-500 mb-1">{"// Authenticate every request"}</div>
        <div>Authorization: Bearer <span className="text-green-400">spk_live_...</span></div>
      </div>

      {/* Key list */}
      <div className="bg-white rounded-xl border border-border divide-y divide-border overflow-hidden">
        {MOCK_KEYS.map((k) => (
          <div key={k.id} className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <Key className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono">{k.prefix}...{k.hint.slice(-4)}</code>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                    k.environment === "live" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
                  }`}>
                    {k.environment}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Created {new Date(k.createdAt).toLocaleDateString()}
                  {k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                </div>
              </div>
            </div>
            <button
              onClick={() => setRevoking(k.id)}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="Revoke key"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Revoke confirmation */}
      {revoking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="font-semibold mb-2">Revoke API key?</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Any integrations using this key will stop working immediately.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRevoking(null)}
                className="flex-1 bg-destructive text-destructive-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Revoke key
              </button>
              <button
                onClick={() => setRevoking(null)}
                className="flex-1 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
