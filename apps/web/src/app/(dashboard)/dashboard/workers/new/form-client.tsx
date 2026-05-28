"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createWorker } from "../actions";
import { US_STATES, maskSsn, maskPhone, maskZip } from "@/lib/masks";

export function NewWorkerForm({
  entities,
}: {
  entities: Array<{ id: string; name: string; taxType: "1099" | "w2" }>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [classification, setClassification] = useState<"1099" | "w2">("1099");
  const visibleEntities = entities.filter((e) => e.taxType === classification);

  const [externalId, setExternalId] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [ssn, setSsn] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("US");
  const [entityId, setEntityId] = useState(visibleEntities[0]?.id ?? "");

  // When classification flips, reset the selected entity to one matching the new filter.
  if (entityId && !visibleEntities.find((e) => e.id === entityId)) {
    setEntityId(visibleEntities[0]?.id ?? "");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Required fields per Wingspan W-9
    if (!externalId.trim()) return setError("External ID is required");
    if (!email.trim()) return setError("Email is required");
    if (!firstName.trim()) return setError("Legal first name is required");
    if (!lastName.trim()) return setError("Legal last name is required");
    if (!entityId) return setError("Select an entity");

    const ssnDigits = ssn.replace(/\D/g, "");
    if (ssnDigits.length > 0 && ssnDigits.length !== 9) {
      return setError("SSN must be 9 digits");
    }

    const w9Prefill: Record<string, string> = { country: country || "US" };
    if (middleName.trim()) w9Prefill["middleName"] = middleName.trim();
    if (jobTitle.trim()) w9Prefill["jobTitle"] = jobTitle.trim();
    if (dateOfBirth) w9Prefill["dateOfBirth"] = dateOfBirth;
    if (phone.trim()) w9Prefill["phone"] = phone.replace(/\D/g, "");
    if (addressLine1.trim()) w9Prefill["addressLine1"] = addressLine1.trim();
    if (addressLine2.trim()) w9Prefill["addressLine2"] = addressLine2.trim();
    if (city.trim()) w9Prefill["city"] = city.trim();
    if (stateVal) w9Prefill["state"] = stateVal;
    if (postalCode.trim()) w9Prefill["postalCode"] = postalCode.replace(/\D/g, "").slice(0, 5);

    setSubmitting(true);
    const result = await createWorker({
      externalId: externalId.trim(),
      email: email.trim().toLowerCase(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      entityId,
      w9Prefill,
      ...(ssnDigits.length === 9 ? { ssn: ssnDigits } : {}),
    });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.push(`/dashboard/workers/${result.workerId}`);
  }

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/dashboard/workers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="h-4 w-4" />
        Workers
      </Link>

      <h1 className="text-2xl font-bold mb-1">Add worker</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Fill in as much as you have — the values seed the worker&apos;s Wingspan onboarding form so they just confirm and add payout.
      </p>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identity</div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Legal first name" required>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Middle name">
              <input
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Legal last name" required>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="input"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" required>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="External ID" required hint="Your internal id (e.g. nurse-001)">
              <input
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="e.g. nurse-001"
                className="input font-mono"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Job title / occupation">
              <input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Travel nurse"
                className="input"
              />
            </Field>
            <Field label="Date of birth">
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="input"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                placeholder="(555) 555-5555"
                className="input"
              />
            </Field>
            <Field label="SSN" hint="9 digits, encrypted at rest">
              <input
                value={ssn}
                onChange={(e) => setSsn(maskSsn(e.target.value))}
                placeholder="123-45-6789"
                className="input font-mono"
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Personal address</div>

          <Field label="Street address">
            <input
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              className="input"
            />
          </Field>

          <Field label="Street address line 2">
            <input
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              className="input"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="City">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="State">
              <select
                value={stateVal}
                onChange={(e) => setStateVal(e.target.value)}
                className="input"
              >
                <option value="">—</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Zip code">
              <input
                value={postalCode}
                onChange={(e) => setPostalCode(maskZip(e.target.value))}
                placeholder="12345"
                className="input"
              />
            </Field>
          </div>

          <Field label="Country">
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
              className="input"
            />
          </Field>
        </section>

        <section className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Engagement</div>

          <Field label="Worker classification" required hint="Determines which entities can pay this worker. Locked once an engagement is created.">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-start gap-2 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
                <input
                  type="radio"
                  name="classification"
                  value="1099"
                  checked={classification === "1099"}
                  onChange={() => setClassification("1099")}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">1099 Contractor</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">Independent contractor; gets a 1099-NEC.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
                <input
                  type="radio"
                  name="classification"
                  value="w2"
                  checked={classification === "w2"}
                  onChange={() => setClassification("w2")}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">W-2 Employee</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">Employee payroll; gets a W-2. Coming soon.</span>
                </span>
              </label>
            </div>
          </Field>

          {classification === "w2" && (
            <div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-800">
              W-2 payroll is being wired up — you can record the worker against a W-2 entity now, but payments will be unavailable until the W-2 runtime ships.
            </div>
          )}

          <Field label="Entity" required hint="Filtered by the classification above.">
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="input"
            >
              {visibleEntities.length === 0 && (
                <option value="">
                  No active {classification === "w2" ? "W-2" : "1099"} entities — add one in Entities first
                </option>
              )}
              {visibleEntities.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </Field>
        </section>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-primary text-primary-foreground px-5 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "Adding…" : "Add worker"}
          </button>
          <Link
            href="/dashboard/workers"
            className="px-5 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          border: 1px solid hsl(var(--border));
          border-radius: 0.375rem;
          background-color: white;
        }
        :global(.input:focus) {
          outline: none;
          box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
          border-color: hsl(var(--primary));
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {hint && <p className="text-xs text-muted-foreground mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}
