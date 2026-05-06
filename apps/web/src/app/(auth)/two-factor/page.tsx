"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { verifyLoginOtp } from "../actions";

function TwoFactorForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const devMode = searchParams.get("dev") === "1";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await verifyLoginOtp(null, formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <>
      {devMode && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded-md px-3 py-2 mb-4">
          Email delivery is not configured. The code was logged on the API server — check the Render logs.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2">{error}</div>}

        <div>
          <label htmlFor="code" className="block text-sm font-medium mb-1.5">
            Verification code
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            autoComplete="one-time-code"
            autoFocus
            className="w-full px-3 py-2 text-center text-lg tracking-[0.5em] font-mono border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            placeholder="000000"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {isPending ? "Verifying…" : "Verify"}
        </button>
      </form>
    </>
  );
}

export default function TenantTwoFactorPage() {
  return (
    <div className="bg-white rounded-xl border border-border p-8 shadow-sm">
      <h1 className="text-xl font-bold mb-1">Verify your identity</h1>
      <p className="text-sm text-muted-foreground mb-6">
        We sent a 6-digit code to your email. Enter it below to finish signing in.
      </p>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <TwoFactorForm />
      </Suspense>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Didn&apos;t get a code?{" "}
        <Link href="/sign-in" className="text-primary hover:underline">
          Try again
        </Link>
      </p>
    </div>
  );
}
