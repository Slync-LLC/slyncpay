import { apiServerGet } from "@/lib/api-server";
import { ActivityClient, type ActivityEvent } from "./activity-client";

const KNOWN_ACTIONS = [
  "tenant.signup",
  "tenant.login.success",
  "tenant.login.failure",
  "tenant.updated",
  "worker.created",
  "worker.engagement.created",
  "entity.created",
  "payable.created",
  "payable.pay_now",
  "disbursement.triggered",
  "admin.tenant.impersonate",
  "admin.tenant.status_change",
];

interface ActivityResponse {
  events: ActivityEvent[];
  nextCursor: string | null;
}

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; action?: string; resourceType?: string; cursor?: string };
}) {
  const qs = new URLSearchParams();
  if (searchParams.from) qs.set("from", searchParams.from);
  if (searchParams.to) qs.set("to", searchParams.to);
  if (searchParams.action) qs.set("action", searchParams.action);
  if (searchParams.resourceType) qs.set("resourceType", searchParams.resourceType);
  if (searchParams.cursor) qs.set("cursor", searchParams.cursor);
  qs.set("limit", "50");

  let data: ActivityResponse = { events: [], nextCursor: null };
  try {
    data = await apiServerGet<ActivityResponse>(`/v1/tenant/activity-log?${qs.toString()}`);
  } catch {
    // surfaces as empty state — error is shown by the client component if needed
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Activity log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every action on your account — useful for debugging integrations and audit reviews.
        </p>
      </div>
      <ActivityClient
        initialEvents={data.events}
        initialNextCursor={data.nextCursor}
        knownActions={KNOWN_ACTIONS}
        filters={{
          from: searchParams.from ?? "",
          to: searchParams.to ?? "",
          action: searchParams.action ?? "",
          resourceType: searchParams.resourceType ?? "",
        }}
      />
    </div>
  );
}
