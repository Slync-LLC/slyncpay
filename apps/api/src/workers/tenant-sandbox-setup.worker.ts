import { Worker } from "bullmq";
import { eq } from "@slyncpay/db";
import { db, tenants } from "@slyncpay/db";
import { getRedis } from "../lib/redis.js";
import { getWingspanClient, wingspanRootUserId, hasSandboxConfig } from "../lib/wingspan.js";
import { enterRequestContext } from "../lib/request-context.js";
import { TENANT_SANDBOX_SETUP_QUEUE } from "./queues.js";

export interface TenantSandboxSetupJobData {
  tenantId: string;
}

/**
 * Provisions a tenant's sandbox Wingspan account.
 * Mirrors the steps in tenant-setup.worker.ts but writes to the *_sandbox columns
 * and uses the sandbox Wingspan client. Idempotent — bails out if already done.
 */
export function startTenantSandboxSetupWorker(): Worker {
  return new Worker<TenantSandboxSetupJobData>(
    TENANT_SANDBOX_SETUP_QUEUE,
    async (job) => {
      const { tenantId } = job.data;
      enterRequestContext({ tenantId, environment: "test" });
      if (!hasSandboxConfig()) {
        console.log(`[TenantSandboxSetup] Skipping ${tenantId} — sandbox not configured`);
        return;
      }

      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

      if (tenant.wingspanPayeeBucketUserIdSandbox) {
        console.log(`[TenantSandboxSetup] Tenant ${tenantId} already has sandbox payee bucket`);
      } else {
        const wingspan = getWingspanClient("test");
        // Append a unique suffix so retries (after Wingspan-side failures) get a
        // fresh email. Wingspan rejects re-use of an email that's already taken.
        const uniq = Date.now().toString(36);
        const bucketEmail = `slyncpay-payees-sandbox-${tenant.slug}-${uniq}@internal.slyncpay.com`;
        const bucketUser = await wingspan.createChildUser(bucketEmail, `${tenant.name} Payees (Sandbox)`);
        const payeeBucketUserId = bucketUser.userId;

        try {
          await wingspan.associateChildUser(payeeBucketUserId, wingspanRootUserId("test"));
        } catch (err) {
          const msg = (err as Error).message ?? "";
          if (!msg.includes("already attached")) throw err;
        }
        await wingspan.withChild(payeeBucketUserId).updateCustomization(payeeBucketUserId, {
          organizationSettings: {
            defaultNewPayeeParentAccountId: payeeBucketUserId,
          },
        });

        await db
          .update(tenants)
          .set({ wingspanPayeeBucketUserIdSandbox: payeeBucketUserId, updatedAt: new Date() })
          .where(eq(tenants.id, tenantId));

        console.log(`[TenantSandboxSetup] Tenant ${tenantId} sandbox payee bucket created: ${payeeBucketUserId}`);
      }
    },
    {
      connection: getRedis(),
    },
  );
}
