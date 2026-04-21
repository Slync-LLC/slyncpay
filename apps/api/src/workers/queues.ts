import { Queue } from "bullmq";
import { getRedis } from "../lib/redis.js";

export const TENANT_SETUP_QUEUE = "tenant-setup";
export const ENTITY_SETUP_QUEUE = "entity-setup";
export const WEBHOOK_DELIVERY_QUEUE = "webhook-delivery";

const JOB_DEFAULTS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
};

let tenantSetupQueue: Queue | null = null;
let entitySetupQueue: Queue | null = null;
let webhookDeliveryQueue: Queue | null = null;

export function getTenantSetupQueue(): Queue {
  if (!tenantSetupQueue) {
    tenantSetupQueue = new Queue(TENANT_SETUP_QUEUE, {
      connection: getRedis(),
      defaultJobOptions: JOB_DEFAULTS,
    });
  }
  return tenantSetupQueue;
}

export function getEntitySetupQueue(): Queue {
  if (!entitySetupQueue) {
    entitySetupQueue = new Queue(ENTITY_SETUP_QUEUE, {
      connection: getRedis(),
      defaultJobOptions: JOB_DEFAULTS,
    });
  }
  return entitySetupQueue;
}

export function getWebhookDeliveryQueue(): Queue {
  if (!webhookDeliveryQueue) {
    webhookDeliveryQueue = new Queue(WEBHOOK_DELIVERY_QUEUE, {
      connection: getRedis(),
      defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 2000 } },
    });
  }
  return webhookDeliveryQueue;
}
