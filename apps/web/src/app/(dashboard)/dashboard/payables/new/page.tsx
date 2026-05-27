import { apiServerGet } from "@/lib/api-server";
import { NewPayableForm } from "./form-client";

interface Contractor {
  id: string;
  externalId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface Entity {
  id: string;
  name: string;
  status: string;
}

export default async function NewPayablePage() {
  let contractors: Contractor[] = [];
  let entities: Entity[] = [];

  try {
    const [contractorRes, entityRes] = await Promise.all([
      apiServerGet<{ data: Contractor[] }>("/v1/contractors?limit=200"),
      apiServerGet<Entity[]>("/v1/entities"),
    ]);
    contractors = contractorRes.data;
    entities = entityRes.filter((e) => e.status === "active");
  } catch {
    // empty state — form handles gracefully
  }

  return (
    <NewPayableForm
      contractors={contractors.map((c) => ({
        id: c.id,
        label: `${[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email} (${c.externalId})`,
      }))}
      entities={entities.map((e) => ({ id: e.id, label: e.name }))}
    />
  );
}
