import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { apiServerGet, ServerApiError } from "@/lib/api-server";
import { NewWorksiteForm } from "./form-client";

interface Entity {
  id: string;
  name: string;
  state: string | null;
  taxType?: "1099" | "w2";
}

async function safeGet<T>(path: string): Promise<T | null> {
  try {
    return await apiServerGet<T>(path);
  } catch (err) {
    if (err instanceof ServerApiError) return null;
    throw err;
  }
}

export default async function NewWorksitePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { state?: string };
}) {
  const entity = await safeGet<Entity>(`/v1/entities/${params.id}`);
  if (!entity) notFound();

  return (
    <div className="p-8 max-w-xl">
      <Link
        href={`/dashboard/entities/${params.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ChevronLeft className="h-4 w-4" />
        {entity.name}
      </Link>

      <h1 className="text-2xl font-bold mb-1">Add worksite</h1>
      <p className="text-sm text-muted-foreground mb-8">
        One worksite per physical work location. State taxes are driven by the
        worksite&apos;s address — the state&apos;s jurisdiction config
        (withholding, SUTA, PFML/SDI) must be marked complete before a worksite
        can be created there.
      </p>

      {entity.taxType !== "w2" ? (
        <div className="rounded-md bg-orange-50 border border-orange-200 px-4 py-3 text-sm text-orange-700">
          Worksites are only available on W-2 entities. This entity is 1099.
        </div>
      ) : (
        <NewWorksiteForm
          entityId={params.id}
          defaultState={searchParams.state ?? entity.state ?? ""}
        />
      )}
    </div>
  );
}
