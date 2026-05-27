"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check } from "lucide-react";
import { updateTenant } from "./actions";

const companySchema = z.object({
  name: z.string().min(1, "Required"),
  website: z.string().url("Enter a valid URL").or(z.literal("")),
  supportEmail: z.string().email("Enter a valid email").or(z.literal("")),
});

type CompanyValues = z.infer<typeof companySchema>;

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter — 1 entity, 50 contractors",
  growth: "Growth — 10 entities, 500 contractors",
  enterprise: "Enterprise — unlimited",
};

export function SettingsForm({
  initial,
}: {
  initial: { name: string; website: string; supportEmail: string; plan: string };
}) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
    reset,
  } = useForm<CompanyValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: initial.name,
      website: initial.website,
      supportEmail: initial.supportEmail,
    },
  });

  async function onSubmit(values: CompanyValues) {
    setError(null);
    const result = await updateTenant({
      name: values.name,
      brandingConfig: {
        ...(values.name ? { name: values.name } : {}),
        ...(values.website ? { url: values.website } : {}),
        ...(values.supportEmail ? { supportEmail: values.supportEmail } : {}),
      },
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    reset(values, { keepValues: true });
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-8">Manage your company profile and preferences.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="bg-white rounded-xl border border-border p-5 space-y-5">
          <h2 className="text-sm font-semibold">Company</h2>
          <div>
            <label className="block text-sm font-medium mb-1.5">Company name</label>
            <input
              {...register("name")}
              className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Website</label>
            <input
              {...register("website")}
              type="url"
              placeholder="https://"
              className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {errors.website && <p className="text-xs text-destructive mt-1">{errors.website.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Support email</label>
            <input
              {...register("supportEmail")}
              type="email"
              className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {errors.supportEmail && <p className="text-xs text-destructive mt-1">{errors.supportEmail.message}</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Plan</h2>
          <div className="text-sm">
            <div className="font-medium capitalize">{initial.plan}</div>
            <div className="text-sm text-muted-foreground mt-0.5">{PLAN_LABEL[initial.plan] ?? ""}</div>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!isDirty || isSubmitting}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-5 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saved && <Check className="h-4 w-4" />}
            {saved ? "Saved" : isSubmitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
