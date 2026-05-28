import { Hono } from "hono";
import { eq } from "@slyncpay/db";
import { createHmac, timingSafeEqual } from "crypto";
import {
  db,
  webhookInboundEvents,
  engagements,
  workLogs,
  payrolls,
  payStatements,
  workers,
} from "@slyncpay/db";
import { WINGSPAN_WEBHOOK_SECRET } from "../lib/env.js";
import { emitWebhookEvent } from "../lib/webhook-emit.js";

export const webhookRoutes = new Hono();

/**
 * Inbound webhooks from Wingspan. No auth middleware — instead we verify the
 * `X-Wingspan-Signature` HMAC header against WINGSPAN_WEBHOOK_SECRET.
 *
 * Events we care about (from the integration guide):
 *   - PayeeEngagement.Activated / Suspended / Terminated
 *   - Requirement.Completed
 *   - WorkLog.Approved
 *   - Payroll.Approved / Paid
 *   - PayStatement.Issued / Failed
 *   - TaxForm.Delivered
 *
 * Everything else is persisted with status=ignored for audit but no-op.
 */
webhookRoutes.post("/wingspan", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("X-Wingspan-Signature") ?? c.req.header("x-wingspan-signature");

  if (!WINGSPAN_WEBHOOK_SECRET) {
    console.error("[webhooks.wingspan] WINGSPAN_WEBHOOK_SECRET not configured — refusing inbound");
    return c.json({ error: "webhook_not_configured" }, 503);
  }
  if (!signature || !verifySignature(rawBody, signature, WINGSPAN_WEBHOOK_SECRET)) {
    return c.json({ error: "invalid_signature" }, 401);
  }

  let event: WingspanWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!event.eventType || !event.eventId) {
    return c.json({ error: "missing_event_fields" }, 400);
  }

  // Idempotency: write the inbound row first (ON CONFLICT DO NOTHING). If we
  // already have this eventId, return 200 without re-processing.
  const [inserted] = await db
    .insert(webhookInboundEvents)
    .values({
      source: "wingspan",
      eventType: event.eventType,
      wingspanEventId: event.eventId,
      resourceType: event.resourceType ?? null,
      resourceId: event.resourceId ?? null,
      payload: event as unknown as Record<string, unknown>,
      status: "received",
    })
    .onConflictDoNothing({ target: webhookInboundEvents.wingspanEventId })
    .returning();

  if (!inserted) {
    // Already saw this event — idempotent success.
    return c.json({ ok: true, duplicate: true });
  }

  try {
    await dispatchEvent(event);
    await db
      .update(webhookInboundEvents)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(webhookInboundEvents.id, inserted.id));
  } catch (err) {
    console.error(`[webhooks.wingspan] dispatch failed for ${event.eventType}:`, (err as Error).message);
    await db
      .update(webhookInboundEvents)
      .set({ status: "failed", error: (err as Error).message, processedAt: new Date() })
      .where(eq(webhookInboundEvents.id, inserted.id));
    return c.json({ error: "dispatch_failed", message: (err as Error).message }, 500);
  }

  return c.json({ ok: true });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

interface WingspanWebhookEvent {
  eventId: string;
  eventType: string; // e.g. "PayeeEngagement.Activated"
  resourceType?: string;
  resourceId?: string;
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

function verifySignature(body: string, header: string, secret: string): boolean {
  // Wingspan format: hex-encoded HMAC-SHA256 over the raw body. Tolerate the
  // common `t=…,v1=…` Stripe-style prefix too in case Wingspan uses it.
  const v1Match = /v1=([A-Fa-f0-9]+)/.exec(header);
  const provided = (v1Match?.[1] ?? header).trim();
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

async function dispatchEvent(event: WingspanWebhookEvent): Promise<void> {
  const type = event.eventType;
  const data = event.data ?? {};

  switch (type) {
    case "PayeeEngagement.Activated":
    case "PayeeEngagement.Updated": {
      const v3EngagementId = data["engagementId"] as string | undefined;
      const status = data["status"] as string | undefined;
      if (v3EngagementId && status) {
        const next = status.toLowerCase() === "active" ? "active" : "pending";
        await db
          .update(engagements)
          .set({ status: next, updatedAt: new Date() })
          .where(eq(engagements.wingspanV3EngagementId, v3EngagementId));
      }
      return;
    }
    case "PayeeEngagement.Suspended":
    case "PayeeEngagement.Terminated": {
      const v3EngagementId = data["engagementId"] as string | undefined;
      if (v3EngagementId) {
        await db
          .update(engagements)
          .set({ status: "inactive", updatedAt: new Date() })
          .where(eq(engagements.wingspanV3EngagementId, v3EngagementId));
      }
      return;
    }
    case "Requirement.Completed": {
      // Generally tied to onboarding milestones — flip the worker's onboarding
      // status forward if Wingspan signals registration / payout / W-9 done.
      const v3PayeeId = data["payeeId"] as string | undefined;
      const reqType = String(data["requirementType"] ?? "").toLowerCase();
      if (!v3PayeeId) return;
      const [eng] = await db
        .select({ id: engagements.id, workerId: engagements.workerId })
        .from(engagements)
        .where(eq(engagements.wingspanV3PayeeId, v3PayeeId))
        .limit(1);
      if (!eng) return;
      // Hint at status advancement; final "active" comes from PayeeEngagement.Activated.
      const next =
        reqType.includes("payout") || reqType.includes("bank")
          ? "payout_pending"
          : reqType.includes("tax") || reqType.includes("w-9") || reqType.includes("w-4")
          ? "w9_pending"
          : null;
      if (next) {
        await db
          .update(workers)
          .set({ onboardingStatus: next as "w9_pending" | "payout_pending", updatedAt: new Date() })
          .where(eq(workers.id, eng.workerId));
      }
      return;
    }
    case "WorkLog.Approved": {
      const wsWorkLogId = data["workLogId"] as string | undefined;
      if (wsWorkLogId) {
        await db
          .update(workLogs)
          .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
          .where(eq(workLogs.wingspanWorkLogId, wsWorkLogId));
      }
      return;
    }
    case "Payroll.Approved": {
      const wsPayrollId = data["payrollId"] as string | undefined;
      if (wsPayrollId) {
        await db
          .update(payrolls)
          .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
          .where(eq(payrolls.wingspanPayrollId, wsPayrollId));
      }
      return;
    }
    case "Payroll.Paid": {
      const wsPayrollId = data["payrollId"] as string | undefined;
      if (wsPayrollId) {
        await db
          .update(payrolls)
          .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
          .where(eq(payrolls.wingspanPayrollId, wsPayrollId));
      }
      return;
    }
    case "PayStatement.Issued":
    case "PayStatement.Failed": {
      const wsPayrollId = data["payrollId"] as string | undefined;
      const wsPayStmtId = data["payStatementId"] as string | undefined;
      const v3EngagementId = data["payeeEngagementId"] as string | undefined;
      if (!wsPayStmtId || !wsPayrollId || !v3EngagementId) return;

      const [payroll] = await db
        .select({ id: payrolls.id, tenantId: payrolls.tenantId, environment: payrolls.environment })
        .from(payrolls)
        .where(eq(payrolls.wingspanPayrollId, wsPayrollId))
        .limit(1);
      if (!payroll) return;

      const [eng] = await db
        .select({ id: engagements.id, workerId: engagements.workerId })
        .from(engagements)
        .where(eq(engagements.wingspanV3EngagementId, v3EngagementId))
        .limit(1);
      if (!eng) return;

      const gross = Math.round(Number(data["gross"] ?? 0) * 100);
      const net = Math.round(Number(data["net"] ?? 0) * 100);
      const lineItems = (data["lineItems"] as unknown[]) ?? [];
      const issued = type === "PayStatement.Issued";

      await db
        .insert(payStatements)
        .values({
          tenantId: payroll.tenantId,
          payrollId: payroll.id,
          workerId: eng.workerId,
          engagementId: eng.id,
          grossCents: gross,
          netCents: net,
          lineItems,
          status: issued ? "issued" : "failed",
          wingspanPayStatementId: wsPayStmtId,
          environment: payroll.environment,
          issuedAt: issued ? new Date() : null,
        })
        .onConflictDoNothing({ target: payStatements.wingspanPayStatementId });
      return;
    }
    case "TaxForm.Delivered":
      // Year-end forms surface in the "Tax Forms" tab via a separate fetch;
      // nothing to persist locally right now.
      return;
    default:
      // Record as ignored — visible in webhook_inbound_events for debugging.
      return;
  }
}
