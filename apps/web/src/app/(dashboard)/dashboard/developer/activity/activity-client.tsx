"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { X, Search } from "lucide-react";

export interface ActivityEvent {
  id: string;
  timestamp: string;
  actorType: "api_key" | "system" | "admin" | string;
  actorId: string;
  actorLabel: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  correlationId: string | null;
}

interface WingspanCall {
  id: string;
  timestamp: string;
  apiVersion: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string> | null;
  requestBody: unknown;
  responseStatus: number | null;
  responseBody: unknown;
  wingspanRequestId: string | null;
  durationMs: number;
  error: string | null;
}

/** Reconstruct a copy-pasteable curl from a captured (redacted) call. */
function buildCurl(call: WingspanCall): string {
  const parts = [`curl -X ${call.method} '${call.url}'`];
  for (const [k, v] of Object.entries(call.requestHeaders ?? {})) {
    parts.push(`  -H '${k}: ${v}'`);
  }
  if (call.requestBody !== null && call.requestBody !== undefined) {
    parts.push(`  -d '${JSON.stringify(call.requestBody)}'`);
  }
  return parts.join(" \\\n");
}

const ACTOR_STYLES: Record<string, string> = {
  api_key: "bg-blue-50 text-blue-700",
  system: "bg-gray-50 text-gray-600",
  admin: "bg-purple-50 text-purple-700",
};

export function ActivityClient(props: {
  initialEvents: ActivityEvent[];
  initialNextCursor: string | null;
  knownActions: string[];
  filters: { from: string; to: string; action: string; resourceType: string };
}) {
  const { initialEvents, initialNextCursor, knownActions, filters } = props;
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [events, setEvents] = useState<ActivityEvent[]>(initialEvents);
  const [cursor, setCursor] = useState<string | null>(initialNextCursor);
  const [selected, setSelected] = useState<ActivityEvent | null>(null);
  const [pending, start] = useTransition();
  const [loadingMore, setLoadingMore] = useState(false);
  const [calls, setCalls] = useState<WingspanCall[]>([]);
  const [callsLoading, setCallsLoading] = useState(false);

  // When an event is opened, load the Wingspan calls captured under its
  // correlation id (the calls that event triggered).
  useEffect(() => {
    if (!selected?.correlationId) {
      setCalls([]);
      return;
    }
    let cancelled = false;
    setCallsLoading(true);
    setCalls([]);
    fetch(`/api/wingspan-calls-proxy?correlationId=${encodeURIComponent(selected.correlationId)}`)
      .then((res) => (res.ok ? res.json() : { calls: [] }))
      .then((body: { calls: WingspanCall[] }) => {
        if (!cancelled) setCalls(body.calls ?? []);
      })
      .catch(() => {
        if (!cancelled) setCalls([]);
      })
      .finally(() => {
        if (!cancelled) setCallsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  function updateFilters(patch: Partial<typeof filters>) {
    const params = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, String(v));
      else params.delete(k);
    }
    params.delete("cursor");
    start(() => router.push(`${pathname}?${params.toString()}`));
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    const params = new URLSearchParams(sp);
    params.set("cursor", cursor);
    const res = await fetch(`/api/activity-log-proxy?${params.toString()}`);
    if (!res.ok) {
      setLoadingMore(false);
      return;
    }
    const body = (await res.json()) as { events: ActivityEvent[]; nextCursor: string | null };
    setEvents((prev) => [...prev, ...body.events]);
    setCursor(body.nextCursor);
    setLoadingMore(false);
  }

  return (
    <>
      {/* Filters */}
      <div className="bg-white rounded-xl border border-border p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">From</label>
          <input
            type="datetime-local"
            value={filters.from ? filters.from.slice(0, 16) : ""}
            onChange={(e) =>
              updateFilters({ from: e.target.value ? new Date(e.target.value).toISOString() : "" })
            }
            className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">To</label>
          <input
            type="datetime-local"
            value={filters.to ? filters.to.slice(0, 16) : ""}
            onChange={(e) =>
              updateFilters({ to: e.target.value ? new Date(e.target.value).toISOString() : "" })
            }
            className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Action</label>
          <select
            value={filters.action}
            onChange={(e) => updateFilters({ action: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">All actions</option>
            {knownActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Resource type</label>
          <select
            value={filters.resourceType}
            onChange={(e) => updateFilters({ resourceType: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">All types</option>
            {["worker", "engagement", "payable", "disbursement", "entity", "tenant"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {pending ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Search className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
            No activity matches these filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Time</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Resource</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{e.action}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {e.resourceType ? (
                      <>
                        {e.resourceType}
                        {e.resourceId ? <span className="ml-1 font-mono">{e.resourceId.slice(0, 8)}…</span> : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ACTOR_STYLES[e.actorType] ?? ""}`}>
                      {e.actorLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{e.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {cursor && (
        <div className="flex justify-center mt-4">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full p-6 max-h-[80vh] overflow-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold font-mono">{selected.action}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(selected.timestamp).toLocaleString()} · {selected.actorLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
              {[
                ["Resource type", selected.resourceType ?? "—"],
                ["Resource ID", selected.resourceId ?? "—"],
                ["Actor type", selected.actorType],
                ["Actor ID", selected.actorId],
                ["IP address", selected.ipAddress ?? "—"],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-mono text-xs break-all">{String(v)}</dd>
                </div>
              ))}
            </dl>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Metadata</h4>
              <pre className="bg-muted rounded-md p-3 text-xs overflow-auto">
                {JSON.stringify(selected.metadata ?? {}, null, 2)}
              </pre>
            </div>

            {/* Wingspan API calls triggered by this event */}
            <div className="mt-6">
              <h4 className="text-xs font-medium text-muted-foreground mb-2">
                Wingspan API calls
                {calls.length > 0 ? (
                  <span className="ml-1 text-muted-foreground">({calls.length})</span>
                ) : null}
              </h4>

              {callsLoading ? (
                <p className="text-xs text-muted-foreground">Loading calls…</p>
              ) : !selected.correlationId ? (
                <p className="text-xs text-muted-foreground">
                  No correlation id on this event — calls cannot be traced.
                </p>
              ) : calls.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No Wingspan calls were captured for this event.
                </p>
              ) : (
                <div className="space-y-4">
                  {calls.map((call) => {
                    const ok =
                      call.error === null &&
                      call.responseStatus !== null &&
                      call.responseStatus < 400;
                    return (
                      <div key={call.id} className="border border-border rounded-md overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 text-xs">
                          <span className="font-mono font-semibold">{call.method}</span>
                          <span
                            className={`inline-flex px-1.5 py-0.5 rounded font-medium ${
                              ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                            }`}
                          >
                            {call.responseStatus ?? "ERR"}
                          </span>
                          <span className="font-mono text-muted-foreground truncate flex-1">
                            {call.url.replace(/^https?:\/\/[^/]+/, "")}
                          </span>
                          <span className="text-muted-foreground whitespace-nowrap">
                            {call.apiVersion} · {call.durationMs}ms
                          </span>
                        </div>
                        <div className="p-3 space-y-3">
                          {call.error ? (
                            <div className="text-xs text-red-700 font-mono">{call.error}</div>
                          ) : null}
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                              Request (curl)
                            </div>
                            <pre className="bg-muted rounded-md p-3 text-xs overflow-auto whitespace-pre">
                              {buildCurl(call)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                              Response
                              {call.wingspanRequestId ? (
                                <span className="ml-1 font-mono normal-case">
                                  ({call.wingspanRequestId})
                                </span>
                              ) : null}
                            </div>
                            <pre className="bg-muted rounded-md p-3 text-xs overflow-auto">
                              {call.responseBody === null || call.responseBody === undefined
                                ? "—"
                                : JSON.stringify(call.responseBody, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
