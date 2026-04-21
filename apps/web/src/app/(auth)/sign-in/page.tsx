"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { login } from "../actions";

export default function SignInPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await login(null, formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-border p-8 shadow-sm">
      <h1 className="text-xl font-bold mb-1">Sign in</h1>
      <p className="text-sm text-muted-foreground mb-6">Enter your credentials to access your dashboard.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2">{error}</div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1.5">Email</label>
          <input
            id="email" name="email" type="email" required autoComplete="email"
            className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1.5">Password</label>
          <input
            id="password" name="password" type="password" required autoComplete="current-password"
            className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <button
          type="submit" disabled={isPending}
          className="w-full bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        No account?{" "}
        <Link href="/sign-up" className="text-primary hover:underline">Create one</Link>
      </p>
    </div>
  );
}
