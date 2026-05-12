/**
 * Tenant-facing response mappers.
 *
 * Every tenant API response goes through one of these before c.json() so we
 * never leak underlying payment-processor identifiers (currently Wingspan).
 *
 * Rules:
 *   - Internal DB columns named `wingspan_*` MUST NOT appear in tenant output.
 *   - The contractor↔entity engagement (formerly exposed as
 *     `wingspanPayerPayeeEngagementId`) is surfaced as `engagementId` —
 *     SlyncPay's own UUID, which is what tenants reference on payables.
 *   - DB column names stay as-is internally; admin endpoints still see them.
 */

// ─── Types (loose) ────────────────────────────────────────────────────────────

type AnyRow = Record<string, unknown>;

export interface ContractorDTO {
  id: string;
  externalId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  onboardingStatus: string;
  metadata?: unknown;
  w9SeededData?: unknown;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export interface EngagementDTO {
  id: string;
  contractorId: string;
  entityId: string;
  engagementId: string; // SlyncPay's UUID — used on payables
  status: string;
  entityName?: string | null;
  createdAt: Date | string;
}

export interface EntityDTO {
  id: string;
  name: string;
  einLast4: string | null;
  state: string | null;
  status: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export interface PayableDTO {
  id: string;
  entityId: string;
  contractorId: string;
  engagementId?: string;
  externalReferenceId: string | null;
  amountCents: number;
  feeBps?: number;
  perTxFeeCents?: number;
  feeAmountCents: number;
  status: string;
  lineItems?: unknown;
  dueDate: string;
  disbursementId?: string | null;
  createdAt: Date | string;
  updatedAt?: Date | string;
  paidAt?: Date | string | null;
}

export interface DisbursementDTO {
  id: string;
  entityId: string;
  status: string;
  totalPayablesCount: number;
  totalAmountCents: number;
  totalFeesCents: number;
  initiatedAt: Date | string;
  completedAt?: Date | string | null;
  failureReason?: string | null;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function toContractorDTO(r: AnyRow): ContractorDTO {
  return {
    id: r["id"] as string,
    externalId: r["externalId"] as string,
    email: r["email"] as string,
    firstName: (r["firstName"] as string | null) ?? null,
    lastName: (r["lastName"] as string | null) ?? null,
    onboardingStatus: r["onboardingStatus"] as string,
    ...(r["metadata"] !== undefined ? { metadata: r["metadata"] } : {}),
    ...(r["w9SeededData"] !== undefined ? { w9SeededData: r["w9SeededData"] } : {}),
    createdAt: r["createdAt"] as Date | string,
    ...(r["updatedAt"] !== undefined ? { updatedAt: r["updatedAt"] as Date | string } : {}),
  };
}

export function toEngagementDTO(
  r: AnyRow,
  opts: { entityName?: string | null } = {},
): EngagementDTO {
  return {
    id: r["id"] as string,
    contractorId: r["contractorId"] as string,
    entityId: r["entityId"] as string,
    engagementId: r["id"] as string, // intentional: tenant-facing ID === SlyncPay UUID
    status: r["status"] as string,
    ...(opts.entityName !== undefined ? { entityName: opts.entityName } : {}),
    createdAt: r["createdAt"] as Date | string,
  };
}

export function toEntityDTO(r: AnyRow): EntityDTO {
  return {
    id: r["id"] as string,
    name: r["name"] as string,
    einLast4: (r["einLast4"] as string | null) ?? null,
    state: (r["state"] as string | null) ?? null,
    status: r["status"] as string,
    createdAt: r["createdAt"] as Date | string,
    ...(r["updatedAt"] !== undefined ? { updatedAt: r["updatedAt"] as Date | string } : {}),
  };
}

export function toPayableDTO(r: AnyRow): PayableDTO {
  return {
    id: r["id"] as string,
    entityId: r["entityId"] as string,
    contractorId: r["contractorId"] as string,
    ...(r["engagementId"] !== undefined ? { engagementId: r["engagementId"] as string } : {}),
    externalReferenceId: (r["externalReferenceId"] as string | null) ?? null,
    amountCents: r["amountCents"] as number,
    ...(r["feeBps"] !== undefined ? { feeBps: r["feeBps"] as number } : {}),
    ...(r["perTxFeeCents"] !== undefined ? { perTxFeeCents: r["perTxFeeCents"] as number } : {}),
    feeAmountCents: r["feeAmountCents"] as number,
    status: r["status"] as string,
    ...(r["lineItems"] !== undefined ? { lineItems: r["lineItems"] } : {}),
    dueDate: r["dueDate"] as string,
    ...(r["disbursementId"] !== undefined ? { disbursementId: r["disbursementId"] as string | null } : {}),
    createdAt: r["createdAt"] as Date | string,
    ...(r["updatedAt"] !== undefined ? { updatedAt: r["updatedAt"] as Date | string } : {}),
    ...(r["paidAt"] !== undefined ? { paidAt: r["paidAt"] as Date | string | null } : {}),
  };
}

export function toDisbursementDTO(r: AnyRow): DisbursementDTO {
  return {
    id: r["id"] as string,
    entityId: r["entityId"] as string,
    status: r["status"] as string,
    totalPayablesCount: r["totalPayablesCount"] as number,
    totalAmountCents: Number(r["totalAmountCents"] ?? 0),
    totalFeesCents: Number(r["totalFeesCents"] ?? 0),
    initiatedAt: r["initiatedAt"] as Date | string,
    ...(r["completedAt"] !== undefined ? { completedAt: r["completedAt"] as Date | string | null } : {}),
    ...(r["failureReason"] !== undefined ? { failureReason: (r["failureReason"] as string | null) ?? null } : {}),
  };
}
