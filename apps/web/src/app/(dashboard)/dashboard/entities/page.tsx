import Link from "next/link";
import { Building2, Plus, ChevronRight } from "lucide-react";
import { apiServerGet } from "@/lib/api-server";

interface Entity {
  id: string;
  name: string;
  einLast4: string | null;
  state: string | null;
  status: string;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  pending: "bg-yellow-50 text-yellow-700",
  suspended: "bg-gray-50 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending: "Provisioning",
  suspended: "Suspended",
};

export default async function EntitiesPage() {
  let entities: Entity[] = [];
  try {
    entities = await apiServerGet<Entity[]>("/v1/entities");
  } catch {
    // empty state below
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Entities</h1>
          <p className="text-sm text-muted-foreground">
            {entities.length === 0 ? "No entities yet" : `${entities.length} legal entit${entities.length === 1 ? "y" : "ies"}`}
          </p>
        </div>
        <Link
          href="/dashboard/entities/new"
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New entity
        </Link>
      </div>

      {entities.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-base font-semibold mb-1">No entities yet</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            An entity is a legal entity (one per EIN) that pays contractors. Add your first one to start.
          </p>
          <Link
            href="/dashboard/entities/new"
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Add an entity
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {entities.map((e) => (
            <Link
              key={e.id}
              href={`/dashboard/entities/${e.id}`}
              className="flex items-center justify-between bg-white rounded-xl border border-border p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{e.name}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[e.status] ?? ""}`}>
                      {STATUS_LABELS[e.status] ?? e.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {e.einLast4 && <span className="text-xs text-muted-foreground font-mono">EIN {e.einLast4}</span>}
                    {e.state && <span className="text-xs text-muted-foreground">{e.state}</span>}
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
