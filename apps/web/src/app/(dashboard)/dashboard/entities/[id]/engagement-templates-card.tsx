"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createEngagementTemplate, deleteEngagementTemplate } from "./engagement-templates-actions";

type I9Mode = "self_managed" | "wingspan_managed" | "hybrid";

interface Template {
  id: string;
  entityId: string;
  name: string;
  i9Mode: I9Mode;
  requirements: Array<{ type: string; label?: string; required?: boolean }>;
  createdAt: string;
}

export function EngagementTemplatesCard({
  entityId,
  templates,
}: {
  entityId: string;
  templates: Template[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [i9Mode, setI9Mode] = useState<I9Mode>("self_managed");
  const [needsW4, setNeedsW4] = useState(true);
  const [needsI9, setNeedsI9] = useState(true);
  const [needsLicense, setNeedsLicense] = useState(false);
  const [needsBackground, setNeedsBackground] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) {
      setErr("Name is required");
      return;
    }
    setErr(null);
    const requirements = [
      needsW4 ? { type: "w4", label: "W-4 (federal withholding)" } : null,
      needsI9 ? { type: "i9", label: "I-9 (employment eligibility)" } : null,
      needsLicense ? { type: "license", label: "Professional license" } : null,
      needsBackground ? { type: "background_check", label: "Background check" } : null,
    ].filter(Boolean) as Array<{ type: string; label: string }>;

    start(async () => {
      const res = await createEngagementTemplate({ entityId, name: name.trim(), i9Mode, requirements });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setOpen(false);
      setName("");
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this engagement template?")) return;
    start(async () => {
      const res = await deleteEngagementTemplate(id);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold">Engagement templates</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Bundles the requirements (W-4, I-9, license, background check) every
            worker assigned to a role needs to complete. Pick one when adding a
            W-2 worker; the requirements get attached to their engagement
            automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          {open ? "Cancel" : "Add template"}
        </button>
      </div>

      {open && (
        <div className="rounded-md border border-border p-4 mb-3 space-y-3 bg-muted/20">
          <div>
            <label className="block text-xs font-medium mb-1">Template name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Travel Nurse — AZ"
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">I-9 verification mode</label>
            <select
              value={i9Mode}
              onChange={(e) => setI9Mode(e.target.value as I9Mode)}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-white"
            >
              <option value="self_managed">Self-managed (you complete Part 2)</option>
              <option value="wingspan_managed">Wingspan-managed via Equifax (per-verification fee)</option>
              <option value="hybrid">Hybrid (mix per-worker)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-2">Requirements bundle</label>
            <div className="space-y-1 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={needsW4} onChange={(e) => setNeedsW4(e.target.checked)} />
                W-4 (federal withholding)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={needsI9} onChange={(e) => setNeedsI9(e.target.checked)} />
                I-9 (employment eligibility)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={needsLicense} onChange={(e) => setNeedsLicense(e.target.checked)} />
                Professional license check
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={needsBackground} onChange={(e) => setNeedsBackground(e.target.checked)} />
                Background check
              </label>
            </div>
          </div>
          {err && <div className="text-xs text-red-700">{err}</div>}
          <div>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add template"}
            </button>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="text-sm text-muted-foreground py-2">No engagement templates yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20 text-xs text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">I-9</th>
              <th className="text-left px-3 py-2 font-medium">Requirements</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {templates.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2 font-medium">{t.name}</td>
                <td className="px-3 py-2 text-xs">{t.i9Mode.replace("_", " ")}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {t.requirements.map((r) => r.label ?? r.type).join(", ") || "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                    aria-label="Delete template"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
