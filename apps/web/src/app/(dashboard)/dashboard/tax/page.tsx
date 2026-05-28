import { apiServerGet, ServerApiError } from "@/lib/api-server";
import { TaxFormsClient } from "./tax-forms-client";

interface Entity {
  id: string;
  name: string;
  taxType?: "1099" | "w2";
}

interface Worker {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface Payable {
  id: string;
  entityId: string;
  workerId: string;
  amountCents: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

interface PayStatement {
  id: string;
  payrollId: string;
  workerId: string;
  engagementId: string;
  grossCents: number;
  netCents: number;
  status: string;
  issuedAt: string | null;
}

interface Engagement {
  id: string;
  workerId: string;
  entityId: string;
  type: "contractor" | "employee";
}

async function safeGet<T>(path: string): Promise<T | null> {
  try {
    return await apiServerGet<T>(path);
  } catch (err) {
    if (err instanceof ServerApiError) return null;
    throw err;
  }
}

export default async function TaxFormsPage({
  searchParams,
}: {
  searchParams: { year?: string; entity?: string; type?: string };
}) {
  const year = parseInt(searchParams.year ?? `${new Date().getFullYear()}`, 10);

  const [entitiesRaw, workersRaw, payablesRaw, payStatementsRaw, engagementsListRaw] = await Promise.all([
    safeGet<Entity[]>("/v1/entities"),
    safeGet<{ data: Worker[] }>("/v1/workers?limit=500"),
    safeGet<{ data: Payable[] }>("/v1/payables?status=paid&limit=500"),
    safeGet<{ data: PayStatement[] }>("/v1/pay-statements"),
    // No tenant-list-all-engagements endpoint yet; aggregating below uses
    // worker+entity from payables and pay statements anyway.
    Promise.resolve<{ data: Engagement[] } | null>(null),
  ]);

  const entities = entitiesRaw ?? [];
  const workers = workersRaw?.data ?? [];
  const payables = payablesRaw?.data ?? [];
  const payStatements = payStatementsRaw?.data ?? [];

  // Aggregate per (worker, entity, taxType, year)
  type Row = {
    key: string;
    workerId: string;
    workerName: string;
    workerEmail: string;
    entityId: string;
    entityName: string;
    taxType: "1099" | "w2";
    year: number;
    totalCents: number;
    formType: "1099-NEC" | "W-2" | null;
    eligible: boolean;
  };

  const workerById = Object.fromEntries(workers.map((w) => [w.id, w]));
  const entityById = Object.fromEntries(entities.map((e) => [e.id, e]));
  const rows = new Map<string, Row>();

  function workerLabel(w: Worker | undefined): string {
    if (!w) return "Unknown worker";
    const name = [w.firstName, w.lastName].filter(Boolean).join(" ").trim();
    return name.length > 0 ? name : w.email;
  }

  for (const p of payables) {
    const paidAt = p.paidAt ?? p.createdAt;
    const py = new Date(paidAt).getFullYear();
    if (py !== year) continue;
    const entity = entityById[p.entityId];
    const taxType = entity?.taxType ?? "1099";
    if (taxType !== "1099") continue; // 1099 payables only on 1099 entities
    const key = `${p.workerId}:${p.entityId}:1099:${py}`;
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        workerId: p.workerId,
        workerName: workerLabel(workerById[p.workerId]),
        workerEmail: workerById[p.workerId]?.email ?? "",
        entityId: p.entityId,
        entityName: entity?.name ?? "Unknown entity",
        taxType: "1099",
        year: py,
        totalCents: 0,
        formType: null,
        eligible: false,
      });
    }
    rows.get(key)!.totalCents += p.amountCents;
  }

  for (const s of payStatements) {
    if (s.status !== "issued") continue;
    const ts = s.issuedAt;
    if (!ts) continue;
    const py = new Date(ts).getFullYear();
    if (py !== year) continue;
    // Find entity via worker's engagements — not available directly here, so
    // use payStatement.engagementId only if needed. As a pragmatic fallback,
    // collapse to one row per worker for now.
    const key = `${s.workerId}:w2:${py}`;
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        workerId: s.workerId,
        workerName: workerLabel(workerById[s.workerId]),
        workerEmail: workerById[s.workerId]?.email ?? "",
        entityId: "",
        entityName: "(see engagement)",
        taxType: "w2",
        year: py,
        totalCents: 0,
        formType: "W-2",
        eligible: true,
      });
    }
    rows.get(key)!.totalCents += s.grossCents;
  }

  // Finalize: 1099-NEC eligibility (>= $600), form type label.
  for (const r of rows.values()) {
    if (r.taxType === "1099") {
      r.eligible = r.totalCents >= 60_000;
      r.formType = r.eligible ? "1099-NEC" : null;
    }
  }

  const allRows = Array.from(rows.values()).sort((a, b) => b.totalCents - a.totalCents);

  const eligibleEntities = entities.map((e) => ({ id: e.id, name: e.name, taxType: e.taxType ?? "1099" }));

  // Render with the year + filters baked into the URL.
  return (
    <TaxFormsClient
      year={year}
      rows={allRows.map((r) => ({
        key: r.key,
        workerId: r.workerId,
        workerName: r.workerName,
        workerEmail: r.workerEmail,
        entityId: r.entityId,
        entityName: r.entityName,
        taxType: r.taxType,
        year: r.year,
        totalCents: r.totalCents,
        formType: r.formType,
        eligible: r.eligible,
      }))}
      entities={eligibleEntities}
      filters={{
        entity: searchParams.entity ?? "",
        type: (searchParams.type as "all" | "1099" | "w2" | undefined) ?? "all",
        year,
      }}
    />
  );
}
