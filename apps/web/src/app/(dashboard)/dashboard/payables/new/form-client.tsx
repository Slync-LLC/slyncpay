"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { createPayable } from "../actions";

const lineItemSchema = z.object({
  description: z.string().min(1, "Required"),
  quantity: z.coerce.number().positive("Must be > 0"),
  unitAmountCents: z.coerce.number().int().positive("Must be > 0"),
});

const schema = z.object({
  contractorId: z.string().min(1, "Required"),
  entityId: z.string().min(1, "Required"),
  externalReferenceId: z.string().min(1, "Required"),
  dueDate: z.string().min(1, "Required"),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item required"),
});

type FormValues = z.infer<typeof schema>;

export function NewPayableForm({
  contractors,
  entities,
}: {
  contractors: Array<{ id: string; label: string }>;
  entities: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      lineItems: [{ description: "", quantity: 1, unitAmountCents: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });
  const lineItems = watch("lineItems");
  const totalCents = lineItems.reduce(
    (sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unitAmountCents) || 0),
    0,
  );

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setError(null);
    const result = await createPayable({
      contractorId: values.contractorId,
      entityId: values.entityId,
      externalReferenceId: values.externalReferenceId,
      dueDate: values.dueDate,
      amountCents: totalCents,
      lineItems: values.lineItems.map((li) => ({
        description: li.description,
        amountCents: Number(li.quantity) * Number(li.unitAmountCents),
        quantity: Number(li.quantity),
      })),
      idempotencyKey,
    });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.push(`/dashboard/payables`);
  }

  const canSubmit = contractors.length > 0 && entities.length > 0;

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/dashboard/payables" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="h-4 w-4" />
        Payables
      </Link>

      <h1 className="text-2xl font-bold mb-1">New payable</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Create a payable for a contractor. It will be included in the next disbursement for the selected entity.
      </p>

      {!canSubmit && (
        <div className="mb-6 rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
          {contractors.length === 0 && (
            <p>
              No contractors yet. <Link href="/dashboard/contractors/new" className="underline font-medium">Add one</Link> first.
            </p>
          )}
          {entities.length === 0 && (
            <p>
              No active entities. <Link href="/dashboard/entities/new" className="underline font-medium">Add one</Link> first.
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Contractor</label>
            <select
              {...register("contractorId")}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Select contractor</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            {errors.contractorId && <p className="text-xs text-destructive mt-1">{errors.contractorId.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Entity</label>
            <select
              {...register("entityId")}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Select entity</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
            {errors.entityId && <p className="text-xs text-destructive mt-1">{errors.entityId.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Your reference</label>
            <input
              {...register("externalReferenceId")}
              placeholder="e.g. SHIFT-9021"
              className="w-full px-3 py-2 text-sm border border-border rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {errors.externalReferenceId && <p className="text-xs text-destructive mt-1">{errors.externalReferenceId.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Due date</label>
            <input
              type="date"
              {...register("dueDate")}
              className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {errors.dueDate && <p className="text-xs text-destructive mt-1">{errors.dueDate.message}</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium">Line items</label>
            <button
              type="button"
              onClick={() => append({ description: "", quantity: 1, unitAmountCents: 0 })}
              className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
            >
              <Plus className="h-3 w-3" />
              Add line
            </button>
          </div>
          <div className="space-y-2">
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-[1fr_80px_120px_32px] gap-2">
                <input
                  {...register(`lineItems.${idx}.description`)}
                  placeholder="Description"
                  className="px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <input
                  {...register(`lineItems.${idx}.quantity`, { valueAsNumber: true })}
                  type="number"
                  step="0.01"
                  placeholder="Qty"
                  className="px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <input
                  {...register(`lineItems.${idx}.unitAmountCents`, { valueAsNumber: true })}
                  type="number"
                  placeholder="Unit ¢"
                  className="px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  disabled={fields.length === 1}
                  className="flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex justify-between text-sm font-semibold">
              <span>Total</span>
              <span>{formatCurrency(totalCents)}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="bg-primary text-primary-foreground px-5 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "Creating…" : "Create payable"}
          </button>
          <Link
            href="/dashboard/payables"
            className="px-5 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
