"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { US_STATES, maskZip } from "@/lib/masks";
import { createWorksite } from "../actions";

export function NewWorksiteForm({
  entityId,
  defaultState,
}: {
  entityId: string;
  defaultState: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState(defaultState);
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("US");
  const [externalId, setExternalId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Name is required");
    if (!addressLine1.trim()) return setError("Address is required");
    if (!city.trim()) return setError("City is required");
    if (!stateVal) return setError("State is required");
    if (postalCode.replace(/\D/g, "").length < 5) return setError("Zip code is required");

    setSubmitting(true);
    const res = await createWorksite({
      entityId,
      name: name.trim(),
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2.trim() || undefined,
      city: city.trim(),
      state: stateVal,
      postalCode: postalCode.replace(/\D/g, "").slice(0, 5),
      country,
      externalId: externalId.trim() || undefined,
    });
    if (!res.ok) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    router.push(`/dashboard/entities/${entityId}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-1.5">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Riverside General"
          className="w-full px-3 py-2 text-sm border border-border rounded-md"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Street address</label>
        <input
          value={addressLine1}
          onChange={(e) => setAddressLine1(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded-md"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Address line 2 (optional)</label>
        <input
          value={addressLine2}
          onChange={(e) => setAddressLine2(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded-md"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1.5">City</label>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">State</label>
          <select
            value={stateVal}
            onChange={(e) => setStateVal(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-white"
          >
            <option value="">—</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Zip</label>
          <input
            value={postalCode}
            onChange={(e) => setPostalCode(maskZip(e.target.value))}
            placeholder="12345"
            className="w-full px-3 py-2 text-sm border border-border rounded-md"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">External ID (optional)</label>
        <p className="text-xs text-muted-foreground mb-1.5">Your internal identifier (e.g. location-218).</p>
        <input
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded-md font-mono"
        />
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
          {submitting ? "Adding…" : "Add worksite"}
        </button>
        <Link
          href={`/dashboard/entities/${entityId}`}
          className="px-5 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
