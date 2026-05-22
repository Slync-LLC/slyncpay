"use client";

import { Suspense, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { submitGate } from "./actions";

function GateForm() {
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/";
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await submitGate(null, fd);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2">{error}</div>
      )}
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1.5">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="off"
          className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {pending ? "Unlocking…" : "Continue"}
      </button>
    </form>
  );
}

export default function GatePage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Lock className="h-5 w-5 text-primary" />
          <span className="text-lg font-bold tracking-tight">SlyncPay</span>
        </div>
        <div className="bg-white rounded-xl border border-border p-8 shadow-sm">
          <h1 className="text-base font-semibold mb-1">Restricted access</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Enter the access password to continue.
          </p>
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
            <GateForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
