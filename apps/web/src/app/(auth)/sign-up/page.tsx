"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signUp } from "../actions";

export default function SignUpPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signUp(null, formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-border p-8 shadow-sm">
      <h1 className="text-xl font-bold mb-1">Create your account</h1>
      <p className="text-sm text-muted-foreground mb-6">Get started with contractor payments in minutes.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1.5">Your name</label>
            <input
              id="name" name="name" type="text" required autoComplete="name"
              className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Jane Smith"
            />
          </div>
          <div>
            <label htmlFor="companyName" className="block text-sm font-medium mb-1.5">Company</label>
            <input
              id="companyName" name="companyName" type="text" required
              className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Acme Corp"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1.5">Work email</label>
          <input
            id="email" name="email" type="email" required autoComplete="email"
            className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1.5">Password</label>
          <input
            id="password" name="password" type="password" required minLength={8} autoComplete="new-password"
            className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            placeholder="At least 8 characters"
          />
        </div>

        <button
          type="submit" disabled={isPending}
          className="w-full bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {isPending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-primary hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
