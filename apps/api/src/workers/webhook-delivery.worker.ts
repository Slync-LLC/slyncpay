import { Worker } from "bullmq";
import { eq } from "@slyncpay/db";
import { db, webhookDeliveries, webhookEndpoints } from "@slyncpay/db";
import { createHmac } from "crypto";
import { WEBHOOK_DELIVERY_QUEUE } from "./queues.js";
import { env } from "../lib/env.js";

interface DeliveryJob {
  deliveryId: string;
}

export function startWebhookDeliveryWorker(): Worker {
  return new Worker<DeliveryJob>(
    WEBHOOK_DELIVERY_QUEUE,
    async (job) => {
      const { deliveryId } = job.data;

      const [row] = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.id, deliveryId))
        .limit(1);
      if (!row) return;
      if (row.status === "delivered" || row.status === "abandoned") return;

      const [endpoint] = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, row.endpointId))
        .limit(1);
      if (!endpoint || endpoint.status !== "active") {
        await db
          .update(webhookDeliveries)
          .set({ status: "abandoned" })
          .where(eq(webhookDeliveries.id, deliveryId));
        return;
      }

      const bodyText = JSON.stringify(row.payload);
      const signature = createHmac("sha256", endpoint.signingSecret).update(bodyText).digest("hex");
      const attempt = (row.attemptNumber ?? 0) + 1;

      let responseStatus: number | null = null;
      let responseBody = "";
      try {
        const res = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Slyncpay-Signature": `v1=${signature}`,
            "X-Slyncpay-Event-Type": row.eventType,
            "X-Slyncpay-Delivery": deliveryId,
            "User-Agent": "slyncpay-webhook/1.0",
          },
          body: bodyText,
          signal: AbortSignal.timeout(15_000),
        });
        responseStatus = res.status;
        try {
          responseBody = (await res.text()).slice(0, 2000);
        } catch {
          // ignore
        }
      } catch (err) {
        responseBody = (err as Error).message.slice(0, 2000);
      }

      const ok = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;
      await db
        .update(webhookDeliveries)
        .set({
          attemptNumber: attempt,
          responseStatus,
          responseBody,
          status: ok ? "delivered" : attempt >= 6 ? "abandoned" : "pending",
          deliveredAt: ok ? new Date() : null,
          nextRetryAt: ok ? null : new Date(Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** (attempt - 1))),
        })
        .where(eq(webhookDeliveries.id, deliveryId));

      if (!ok) {
        // Let BullMQ retry; throw so the next exponential-backoff attempt fires.
        throw new Error(`Webhook delivery ${deliveryId} failed: status=${responseStatus}`);
      }
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 4,
    },
  );
}
