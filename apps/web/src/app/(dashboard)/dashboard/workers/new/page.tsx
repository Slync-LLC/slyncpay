import Link from "next/link";
import { ChevronLeft, Building2 } from "lucide-react";
import { apiServerGet } from "@/lib/api-server";
import { NewWorkerForm } from "./form-client";

interface Entity {
  id: string;
  name: string;
  status: string;
  taxType: "1099" | "w2";
}

export default async function NewWorkerPage() {
  let entities: Entity[] = [];
  try {
    entities = await apiServerGet<Entity[]>("/v1/entities");
  } catch {
    // fall through
  }
  const activeEntities = entities.filter((e) => e.status === "active");

  if (activeEntities.length === 0) {
    return (
      <div className="p-8 max-w-xl">
        <Link href="/dashboard/workers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ChevronLeft className="h-4 w-4" />
          Workers
        </Link>

        <h1 className="text-2xl font-bold mb-1">Add worker</h1>
        <p className="text-sm text-muted-foreground mb-8">
          You need at least one active entity before you can add a worker — the worker is attached to an entity so the right legal entity pays them.
        </p>

        <div className="bg-white rounded-xl border border-border p-8 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-base font-semibold mb-1">No active entities</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {entities.length === 0
              ? "Create your first entity to start adding workers."
              : "Wait for your entity to finish provisioning, then come back here."}
          </p>
          <Link
            href="/dashboard/entities/new"
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Add an entity
          </Link>
        </div>
      </div>
    );
  }

  return (
    <NewWorkerForm
      entities={activeEntities.map((e) => ({ id: e.id, name: e.name, taxType: e.taxType }))}
    />
  );
}
