import { Worker } from "bullmq";
import { eq } from "@slyncpay/db";
import { db, tenantEntities, provisioningJobs } from "@slyncpay/db";
import { getRedis } from "../lib/redis.js";
import { getWingspanClient, wingspanRootUserId } from "../lib/wingspan.js";
import { ENTITY_SETUP_QUEUE } from "./queues.js";

export interface EntitySetupJobData {
  entityId: string;
  tenantId: string;
  provisioningJobId: string;
}

/**
 * Provisions a tenant entity's Wingspan child user in whichever environment
 * the entity was created in (live or test). Each entity lives in exactly one
 * environment — no more dual provisioning.
 */
export function startEntitySetupWorker(): Worker {
  return new Worker<EntitySetupJobData>(
    ENTITY_SETUP_QUEUE,
    async (job) => {
      const { entityId, provisioningJobId } = job.data;

      const [entity] = await db
        .select()
        .from(tenantEntities)
        .where(eq(tenantEntities.id, entityId))
        .limit(1);
      if (!entity) throw new Error(`Entity ${entityId} not found`);

      const env = entity.environment;
      const wingspan = getWingspanClient(env);

      await db
        .update(provisioningJobs)
        .set({ status: "running", attempts: job.attemptsMade + 1, updatedAt: new Date() })
        .where(eq(provisioningJobs.id, provisioningJobId));

      // Step 1: create entity child user
      let entityChildUserId: string;
      if (entity.wingspanChildUserId) {
        entityChildUserId = entity.wingspanChildUserId;
      } else {
        const slug = entity.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const envSuffix = env === "test" ? "-sb" : "";
        const uniq = Date.now().toString(36);
        const entityEmail = `slyncpay-entity${envSuffix}-${slug}-${entityId.slice(0, 8)}-${uniq}@internal.slyncpay.com`;
        const displayName = env === "test" ? `${entity.name} (Sandbox)` : entity.name;

        const childUser = await wingspan.createChildUser(entityEmail, displayName);
        entityChildUserId = childUser.userId;

        await db
          .update(tenantEntities)
          .set({
            wingspanChildUserId: entityChildUserId,
            wingspanChildUserEmail: entityEmail,
            updatedAt: new Date(),
          })
          .where(eq(tenantEntities.id, entityId));
      }

      // Step 2: associate with the env-specific root parent (idempotent)
      try {
        await wingspan.associateChildUser(entityChildUserId, wingspanRootUserId(env));
      } catch (err) {
        const msg = (err as Error).message ?? "";
        if (!msg.includes("already attached")) throw err;
      }

      // Step 3: mark entity active
      await db
        .update(tenantEntities)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(tenantEntities.id, entityId));

      await db
        .update(provisioningJobs)
        .set({
          status: "completed",
          stepsCompleted: ["create_entity_user", "associate_entity_user", "mark_active"],
          updatedAt: new Date(),
        })
        .where(eq(provisioningJobs.id, provisioningJobId));

      console.log(`[EntitySetup] Entity ${entityId} provisioned in ${env}`);
    },
    {
      connection: getRedis(),
    },
  );
}
