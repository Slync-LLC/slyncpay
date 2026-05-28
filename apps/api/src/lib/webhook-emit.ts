import { eq, and } from "@slyncpay/db";
import { db, webhookEndpoints, webhookDeliveries } from "@slyncpay/db";
import { randomUUID } from "crypto";
import { getWebhookDeliveryQueue } from "../workers/queues.js";

/**
 * Enqueue a webhook event for delivery to every active endpoint subscribed
 * to this event type. Fire-and-forget — actual HTTP delivery happens in the
 * webhook-delivery worker (workers/webhook-delivery.worker.ts).
 *
 * Best-effort: errors during enqueue are logged but never thrown, so callers
 * (state-change sites) don't have to wrap with try/catch.
 */
export async function emitWebhookEvent(params: {
  tenantId: string;
  eventType: string;
  environment: "live" | "test";
  data: Record<string, unknown>;
}): Promise<void> {
  try {
    const endpoints = await db
      .select()
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.tenantId, params.tenantId), eq(webhookEndpoints.status, "active")));

    const matched = endpoints.filter((e) => {
      const events = (e.events ?? []) as unknown as string[];
      return events.length === 0 || events.includes("*") || events.includes(params.eventType);
    });
    if (matched.length === 0) return;

    const payload = {
      id: randomUUID(),
      eventType: params.eventType,
      createdAt: new Date().toISOString(),
      environment: params.environment,
      data: params.data,
    };

    for (const endpoint of matched) {
      const [row] = await db
        .insert(webhookDeliveries)
        .values({
          tenantId: params.tenantId,
          endpointId: endpoint.id,
          eventType: params.eventType,
          payload,
          status: "pending",
          attemptNumber: 0,
          nextRetryAt: new Date(),
        })
        .returning({ id: webhookDeliveries.id });
      if (!row) continue;
      await getWebhookDeliveryQueue().add(
        "deliver",
        { deliveryId: row.id },
        { attempts: 6, backoff: { type: "exponential", delay: 30_000 } },
      );
    }
  } catch (err) {
    console.error(`[webhook-emit] failed to enqueue ${params.eventType}:`, (err as Error).message);
  }
}
