import { Worker } from "bullmq";
import { eq } from "@slyncpay/db";
import { db, tenantEntities, provisioningJobs } from "@slyncpay/db";
import { getRedis } from "../lib/redis.js";
import { getWingspanClient } from "../lib/wingspan.js";
import { env } from "../lib/env.js";
import { ENTITY_SETUP_QUEUE } from "./queues.js";

export interface EntitySetupJobData {
  entityId: string;
  tenantId: string;
  provisioningJobId: string;
}

export function startEntitySetupWorker(): Worker {
  return new Worker<EntitySetupJobData>(
    ENTITY_SETUP_QUEUE,
    async (job) => {
      const { entityId, provisioningJobId } = job.data;
      const wingspan = getWingspanClient();

      const [entity] = await db
        .select()
        .from(tenantEntities)
        .where(eq(tenantEntities.id, entityId))
        .limit(1);
      if (!entity) throw new Error(`Entity ${entityId} not found`);

      await db
        .update(provisioningJobs)
        .set({ status: "running", attempts: job.attemptsMade + 1, updatedAt: new Date() })
        .where(eq(provisioningJobs.id, provisioningJobId));

      // ── Step 1: Create entity child user ─────────────────────────────────────
      let entityChildUserId: string;

      if (entity.wingspanChildUserId) {
        entityChildUserId = entity.wingspanChildUserId;
      } else {
        const slug = entity.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const entityEmail = `slyncpay-entity-${slug}-${entityId.slice(0, 8)}@internal.slyncpay.com`;

        const childUser = await wingspan.createChildUser(entityEmail, entity.name);
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

      // ── Step 2: Associate with root parent ───────────────────────────────────
      await wingspan.associateChildUser(entityChildUserId, env.WINGSPAN_ROOT_USER_ID);

      // ── Step 3: Mark entity active ───────────────────────────────────────────
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

      console.log(`[EntitySetup] Entity ${entityId} provisioned successfully`);
    },
    {
      connection: getRedis(),
    },
  );
}
