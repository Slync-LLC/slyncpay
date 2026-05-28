import { apiServerGet } from "@/lib/api-server";
import { NewPayableForm } from "./form-client";

interface Worker {
  id: string;
  externalId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  onboardingStatus: string;
}

interface Entity {
  id: string;
  name: string;
  status: string;
}

export default async function NewPayablePage() {
  let workers: Worker[] = [];
  let entities: Entity[] = [];

  try {
    const [workerRes, entityRes] = await Promise.all([
      apiServerGet<{ data: Worker[] }>("/v1/workers?limit=200"),
      apiServerGet<Entity[]>("/v1/entities"),
    ]);
    workers = workerRes.data.filter((c) => c.onboardingStatus === "active");
    entities = entityRes.filter((e) => e.status === "active");
  } catch {
    // empty state — form handles gracefully
  }

  return (
    <NewPayableForm
      workers={workers.map((c) => ({
        id: c.id,
        label: `${[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email} (${c.externalId})`,
      }))}
      entities={entities.map((e) => ({ id: e.id, label: e.name }))}
    />
  );
}
