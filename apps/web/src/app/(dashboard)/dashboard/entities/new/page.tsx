"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronLeft } from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const schema = z.object({
  name: z.string().min(1, "Required"),
  ein: z.string().regex(/^\d{2}-\d{7}$/, "Format: XX-XXXXXXX"),
  state: z.string().min(2, "Required"),
});

type FormValues = z.infer<typeof schema>;

export default function NewEntityPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setError(null);
    try {
      // TODO: call POST /v1/entities via apiRequest
      await new Promise((r) => setTimeout(r, 800));
      router.push("/dashboard/entities");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-8 max-w-xl">
      <Link href="/dashboard/entities" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="h-4 w-4" />
        Entities
      </Link>

      <h1 className="text-2xl font-bold mb-1">New entity</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Each entity maps to a legal company with its own EIN. Payables and 1099s are filed per entity.
        Setup runs asynchronously — your entity will be ready in under a minute.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5">Legal name</label>
          <input
            {...register("name")}
            placeholder="e.g. Acme Staffing LLC"
            className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">EIN</label>
          <input
            {...register("ein")}
            placeholder="XX-XXXXXXX"
            className="w-full px-3 py-2 text-sm border border-border rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          {errors.ein && <p className="text-xs text-destructive mt-1">{errors.ein.message}</p>}
          <p className="text-xs text-muted-foreground mt-1">Your EIN is encrypted at rest and never exposed via API.</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">State of incorporation</label>
          <select
            {...register("state")}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">Select a state</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {errors.state && <p className="text-xs text-destructive mt-1">{errors.state.message}</p>}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-primary text-primary-foreground px-5 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "Creating..." : "Create entity"}
          </button>
          <Link
            href="/dashboard/entities"
            className="px-5 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
