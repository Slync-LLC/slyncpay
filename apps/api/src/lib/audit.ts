import { db, auditLog } from "@slyncpay/db";

export type AuditActorType = "api_key" | "system" | "admin";

export interface AuditEvent {
  tenantId?: string | null | undefined;
  actorType: AuditActorType;
  actorId: string;
  action: string;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  ipAddress?: string | undefined;
}

/**
 * Append-only audit log writer. Best-effort — failures are logged but do not
 * propagate, so they cannot block the user-facing flow.
 */
export async function logAudit(event: AuditEvent): Promise<void> {
  try {
    await db.insert(auditLog).values({
      tenantId: event.tenantId ?? null,
      actorType: event.actorType,
      actorId: event.actorId,
      action: event.action,
      resourceType: event.resourceType ?? null,
      resourceId: event.resourceId ?? null,
      metadata: event.metadata ?? {},
      ipAddress: event.ipAddress ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to write event:", event.action, (err as Error).message);
  }
}
