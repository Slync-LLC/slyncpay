import { Worker } from "bullmq";
import { eq } from "@slyncpay/db";
import { db, tenantEntities } from "@slyncpay/db";
import { getRedis } from "../lib/redis.js";
import { getWingspanClient, wingspanRootUserId, hasSandboxConfig } from "../lib/wingspan.js";
import { ENTITY_SANDBOX_SETUP_QUEUE } from "./queues.js";

export interface EntitySandboxSetupJobData {
  entityId: string;
  tenantId: string;
}

/**
 * Provisions a tenant entity's sandbox Wingspan child user.
 * Idempotent — exits early if already done.
 */
export function startEntitySandboxSetupWorker(): Worker {
  return new Worker<EntitySandboxSetupJobData>(
    ENTITY_SANDBOX_SETUP_QUEUE,
    async (job) => {
      const { entityId } = job.data;
      if (!hasSandboxConfig()) {
        console.log(`[EntitySandboxSetup] Skipping ${entityId} — sandbox not configured`);
        return;
      }

      const [entity] = await db
        .select()
        .from(tenantEntities)
        .where(eq(tenantEntities.id, entityId))
        .limit(1);
      if (!entity) throw new Error(`Entity ${entityId} not found`);

      if (entity.wingspanChildUserIdSandbox) {
        console.log(`[EntitySandboxSetup] Entity ${entityId} already has sandbox child`);
        return;
      }

      const wingspan = getWingspanClient("test");
      const slug = entity.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const entityEmail = `slyncpay-entity-sandbox-${slug}-${entityId.slice(0, 8)}@internal.slyncpay.com`;

      const childUser = await wingspan.createChildUser(entityEmail, `${entity.name} (Sandbox)`);
      await wingspan.associateChildUser(childUser.userId, wingspanRootUserId("test"));

      await db
        .update(tenantEntities)
        .set({
          wingspanChildUserIdSandbox: childUser.userId,
          wingspanChildUserEmailSandbox: entityEmail,
          updatedAt: new Date(),
        })
        .where(eq(tenantEntities.id, entityId));

      console.log(`[EntitySandboxSetup] Entity ${entityId} sandbox child created: ${childUser.userId}`);
    },
    {
      connection: getRedis(),
    },
  );
}
