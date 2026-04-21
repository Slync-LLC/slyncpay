import { Worker } from "bullmq";
import { eq } from "@slyncpay/db";
import { db, tenants, provisioningJobs } from "@slyncpay/db";
import { getRedis } from "../lib/redis.js";
import { getWingspanClient } from "../lib/wingspan.js";
import { env } from "../lib/env.js";
import { TENANT_SETUP_QUEUE } from "./queues.js";

export interface TenantSetupJobData {
  tenantId: string;
  provisioningJobId: string;
}

type Step = "create_payee_bucket" | "associate_payee_bucket" | "set_org_config" | "mark_active";

async function checkpoint(
  jobId: string,
  step: Step,
  completed: Step[],
  error?: string,
): Promise<void> {
  await db
    .update(provisioningJobs)
    .set({
      currentStep: step,
      stepsCompleted: completed,
      status: error ? "failed" : "running",
      lastError: error ?? null,
      updatedAt: new Date(),
    })
    .where(eq(provisioningJobs.id, jobId));
}

export function startTenantSetupWorker(): Worker {
  return new Worker<TenantSetupJobData>(
    TENANT_SETUP_QUEUE,
    async (job) => {
      const { tenantId, provisioningJobId } = job.data;
      const wingspan = getWingspanClient();
      const completed: Step[] = [];

      // Fetch the tenant
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

      await db
        .update(provisioningJobs)
        .set({ status: "running", attempts: job.attemptsMade + 1, updatedAt: new Date() })
        .where(eq(provisioningJobs.id, provisioningJobId));

      // ── Step 1: Create Payee Bucket child user ───────────────────────────────
      await checkpoint(provisioningJobId, "create_payee_bucket", completed);

      let payeeBucketUserId: string;

      // If already set (retry after partial failure), skip
      if (tenant.wingspanPayeeBucketUserId) {
        payeeBucketUserId = tenant.wingspanPayeeBucketUserId;
      } else {
        const bucketEmail = `slyncpay-payees-${tenant.slug}@internal.slyncpay.com`;
        const bucketUser = await wingspan.createChildUser(
          bucketEmail,
          `${tenant.name} Payees`,
        );
        payeeBucketUserId = bucketUser.userId;

        await db
          .update(tenants)
          .set({ wingspanPayeeBucketUserId: payeeBucketUserId, updatedAt: new Date() })
          .where(eq(tenants.id, tenantId));
      }

      completed.push("create_payee_bucket");

      // ── Step 2: Associate Payee Bucket with SlyncPay root parent ─────────────
      await checkpoint(provisioningJobId, "associate_payee_bucket", completed);

      await wingspan.associateChildUser(payeeBucketUserId, env.WINGSPAN_ROOT_USER_ID);
      completed.push("associate_payee_bucket");

      // ── Step 3: Set org config (defaultNewPayeeParentAccountId) ─────────────
      await checkpoint(provisioningJobId, "set_org_config", completed);

      await wingspan.updateCustomization(payeeBucketUserId, {
        organizationSettings: {
          defaultNewPayeeParentAccountId: payeeBucketUserId,
        },
      });
      completed.push("set_org_config");

      // ── Step 4: Mark tenant active ───────────────────────────────────────────
      await checkpoint(provisioningJobId, "mark_active", completed);

      await db
        .update(tenants)
        .set({ status: "active", provisionedAt: new Date(), updatedAt: new Date() })
        .where(eq(tenants.id, tenantId));

      await db
        .update(provisioningJobs)
        .set({ status: "completed", stepsCompleted: completed, updatedAt: new Date() })
        .where(eq(provisioningJobs.id, provisioningJobId));

      completed.push("mark_active");
      console.log(`[TenantSetup] Tenant ${tenantId} provisioned successfully`);
    },
    {
      connection: getRedis(),
    },
  );
}
