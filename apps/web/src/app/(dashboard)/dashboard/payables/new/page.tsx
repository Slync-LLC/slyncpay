"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

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
  idempotencyKey: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

// Mock options — replace with TanStack Query
const MOCK_CONTRACTORS = [
  { id: "c1", label: "Jane Smith (nurse-001)" },
  { id: "c2", label: "John Doe (nurse-002)" },
  { id: "c3", label: "Maria Garcia (nurse-003)" },
];
const MOCK_ENTITIES = [
  { id: "e1", label: "NurseIO AZ LLC" },
  { id: "e2", label: "NurseIO CA Inc" },
];

// 0.8% disbursement fee + $0.25 per-tx (Starter plan)
function calcFee(amountCents: number): number {
  return Math.round(amountCents * 0.008) + 25;
}

export default function NewPayablePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      idempotencyKey: crypto.randomUUID(),
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
    try {
      // TODO: POST /v1/payables with Idempotency-Key header
      await new Promise((r) => setTimeout(r, 800));
      router.push("/dashboard/payables");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Contractor + Entity */}
        <div className="bg-white rounded-xl border border-border p-5 space-y-4">
          <h2 className="text-sm font-semibold">Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Contractor</label>
              <select
                {...register("contractorId")}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">Select contractor</option>
                {MOCK_CONTRACTORS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
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
                {MOCK_ENTITIES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
              {errors.entityId && <p className="text-xs text-destructive mt-1">{errors.entityId.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Reference ID</label>
              <input
                {...register("externalReferenceId")}
                placeholder="e.g. SHIFT-9022"
                className="w-full px-3 py-2 text-sm border border-border rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              {errors.externalReferenceId && <p className="text-xs text-destructive mt-1">{errors.externalReferenceId.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Due date</label>
              <input
                {...register("dueDate")}
                type="date"
                className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              {errors.dueDate && <p className="text-xs text-destructive mt-1">{errors.dueDate.message}</p>}
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Line items</h2>
            <button
              type="button"
              onClick={() => append({ description: "", quantity: 1, unitAmountCents: 0 })}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add line
            </button>
          </div>

          <div className="space-y-3">
            {fields.map((field, i) => (
              <div key={field.id} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-start">
                <div>
                  <input
                    {...register(`lineItems.${i}.description`)}
                    placeholder="Description"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  {errors.lineItems?.[i]?.description && (
                    <p className="text-xs text-destructive mt-1">{errors.lineItems[i]?.description?.message}</p>
                  )}
                </div>
                <div>
                  <input
                    {...register(`lineItems.${i}.quantity`)}
                    type="number"
                    placeholder="Qty"
                    min={1}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <input
                      {...register(`lineItems.${i}.unitAmountCents`)}
                      type="number"
                      placeholder="0.00"
                      step="1"
                      min={1}
                      className="w-full pl-6 pr-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">in cents</p>
                </div>
                <button
                  type="button"
                  onClick={() => fields.length > 1 && remove(i)}
                  disabled={fields.length === 1}
                  className="mt-2 text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {errors.lineItems?.root && (
            <p className="text-xs text-destructive mt-2">{errors.lineItems.root.message}</p>
          )}

          {/* Total */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatCurrency(totalCents)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">SlyncPay fee (0.8% + $0.25)</span>
              <span className="text-muted-foreground">{formatCurrency(calcFee(totalCents))}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-border">
              <span>Contractor receives</span>
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
            disabled={submitting || totalCents === 0}
            className="bg-primary text-primary-foreground px-5 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "Creating..." : "Create payable"}
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
