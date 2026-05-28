"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStateJurisdiction } from "../../actions";
import { US_STATES } from "@/lib/masks";

type EntityOption = { id: string; name: string; environment: string; taxType?: "1099" | "w2" };

export function StateJurisdictionCreate({
  tenantId,
  entities,
}: {
  tenantId: string;
  entities: EntityOption[];
}) {
  const router = useRouter();
  const w2Entities = entities.filter((e) => e.taxType === "w2");
  const [entityId, setEntityId] = useState(w2Entities[0]?.id ?? "");
  const [stateVal, setStateVal] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">(
    w2Entities[0]?.environment === "test" ? "test" : "live",
  );
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (w2Entities.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No W-2 entities. Create one first; state jurisdiction configs are only
        relevant for W-2 payroll.
      </div>
    );
  }

  function submit() {
    if (!entityId || !stateVal) {
      setErr("Entity and state are required");
      return;
    }
    setErr(null);
    start(async () => {
      const res = await createStateJurisdiction(tenantId, {
        entityId,
        state: stateVal,
        environment,
        notes: notes || undefined,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.refresh();
      setStateVal("");
      setNotes("");
    });
  }

  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Add state jurisdiction config
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <select
          value={entityId}
          onChange={(e) => {
            setEntityId(e.target.value);
            const next = w2Entities.find((ent) => ent.id === e.target.value);
            if (next) setEnvironment(next.environment === "test" ? "test" : "live");
          }}
          className="text-xs border border-border rounded px-2 py-1.5 bg-white"
        >
          {w2Entities.map((e) => (
            <option key={e.id} value={e.id}>{e.name} ({e.environment})</option>
          ))}
        </select>
        <select
          value={stateVal}
          onChange={(e) => setStateVal(e.target.value)}
          className="text-xs border border-border rounded px-2 py-1.5 bg-white"
        >
          <option value="">Select state</option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
          ))}
        </select>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="text-xs border border-border rounded px-2 py-1.5 bg-white col-span-2"
        />
      </div>
      <div className="flex items-center justify-between mt-3">
        {err ? <div className="text-xs text-red-700">{err}</div> : <span />}
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}
