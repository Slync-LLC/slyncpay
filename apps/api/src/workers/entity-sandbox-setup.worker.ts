import { Worker } from "bullmq";
import { getRedis } from "../lib/redis.js";
import { ENTITY_SANDBOX_SETUP_QUEUE } from "./queues.js";

export interface EntitySandboxSetupJobData {
  entityId: string;
  tenantId: string;
}

/**
 * No-op worker. Entities are now env-scoped (one row per env) and provisioned
 * directly by entity-setup. Kept around so any in-flight jobs from the old
 * model drain harmlessly.
 */
export function startEntitySandboxSetupWorker(): Worker {
  return new Worker<EntitySandboxSetupJobData>(
    ENTITY_SANDBOX_SETUP_QUEUE,
    async (job) => {
      console.log(`[EntitySandboxSetup] (deprecated) Ignoring job for entity ${job.data.entityId}`);
    },
    {
      connection: getRedis(),
    },
  );
}
