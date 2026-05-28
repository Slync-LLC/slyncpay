"use client";

import { useState, useTransition } from "react";
import { updateStateJurisdiction } from "../../actions";

type Status = "pending" | "in_progress" | "complete";

export function StateJurisdictionRow({
  id,
  status: initial,
  notes: initialNotes,
}: {
  id: string;
  status: Status;
  notes: string | null;
}) {
  const [status, setStatus] = useState<Status>(initial);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function update(next: Status) {
    setErr(null);
    setStatus(next);
    start(async () => {
      const res = await updateStateJurisdiction(id, { status: next, notes: notes || undefined });
      if (!res.ok) setErr(res.error);
    });
  }

  function saveNotes() {
    setErr(null);
    start(async () => {
      const res = await updateStateJurisdiction(id, { status, notes });
      if (!res.ok) setErr(res.error);
    });
  }

  return (
    <td className="px-4 py-3 align-top space-y-2">
      <select
        value={status}
        onChange={(e) => update(e.target.value as Status)}
        disabled={pending}
        className="text-xs border border-border rounded px-2 py-1 bg-white"
      >
        <option value="pending">pending</option>
        <option value="in_progress">in_progress</option>
        <option value="complete">complete</option>
      </select>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={saveNotes}
        placeholder="Notes (registration confirmation numbers, SUTA rate, etc.)"
        className="block w-full text-xs border border-border rounded px-2 py-1 bg-white h-16"
      />
      {err && <div className="text-xs text-red-700">{err}</div>}
    </td>
  );
}
