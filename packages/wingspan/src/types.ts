// ─── Wingspan API response types ─────────────────────────────────────────────
// Based on the NurseIO - Wingspan API Integration Guide v4

export interface WingspanUser {
  userId: string;
  email: string;
  status?: string;
  profile?: {
    preferredName?: string;
  };
}

// POST /users/organization/user response
export interface WingspanCreateChildUserResponse {
  userId: string;
  email: string;
  profile?: {
    preferredName?: string;
  };
}

// POST /users/organization/user/{id}/associate response
export interface WingspanAssociateResponse {
  organizationId: string;
  parentUserId: string;
  childUserId: string;
  inheritanceStrategy: {
    organizationAccountConfig: "Parent" | "None";
    wingspanAccount: "Parent" | "None";
    externalFinancialAccounts: "Parent" | "None";
    wingspanFinancialSettings: "Parent" | "None";
    fundingSource: "Parent" | "None";
    payoutSettings: "Parent" | "None";
  };
}

// POST /payments/payee response
export interface WingspanCreatePayeeResponse {
  payeeId: string;
  payerId: string;
  user: WingspanUser;
  payerOwnedData: {
    payeeExternalId?: string;
    status?: string;
    labels?: Record<string, string>;
  };
  requirements?: Array<{
    payerPayeeEngagementIds: string[];
    requirementType: string;
    status: string;
  }>;
}

// POST /payments/payable response
export interface WingspanCreatePayableResponse {
  payableId: string;
  collaboratorId: string;
  dueDate: string;
  status: string;
  currency: string;
  lineItems: Array<{
    description?: string;
    totalCost: number;
    quantity?: number;
    unit?: string;
    costPerUnit?: number;
    labels?: Record<string, string>;
  }>;
  referenceId?: string;
}

// POST /payments/pay-approved response
export interface WingspanPayApprovedResponse {
  bulkPayrollBatchId: string;
  status: string;
}

// GET /users/organization/user/{id}/session response
export interface WingspanSessionTokenResponse {
  token: string;
  requestingToken: string;
  expiresAt?: string;
}

// PATCH /users/customization/{id} — request body shape
export interface WingspanCustomizationBody {
  branding?: {
    name?: string;
    url?: string;
    primaryLogoUrl?: string;
    secondaryLogoUrl?: string;
  };
  support?: {
    generalSupportEmail?: string;
    payeeSupportEmail?: string;
    documentation?: { generalUrl?: string };
    portal?: { generalUrl?: string };
  };
  terminology?: {
    sendPaymentsContractor?: string;
    sendPaymentsPayable?: string;
    getPaidClient?: string;
  };
  appearance?: {
    colorPrimary?: string;
    borderRadius?: number;
    fontFamily?: string;
    colorText?: string;
    colorBorder?: string;
  };
  organizationSettings?: {
    defaultNewPayeeParentAccountId?: string;
    defaultNewPayerParentAccountId?: string;
  };
}

// POST /payments/custom-fields
export interface WingspanCustomFieldBody {
  name: string;
  key: string;
  type: "String" | "Number" | "Boolean" | "Datetime" | "ValueSet";
  required: boolean;
  resourceType: "Collaborator" | "LineItem" | "Engagement";
}

export interface WingspanCustomFieldResponse extends WingspanCustomFieldBody {
  id: string;
}

export interface WingspanError {
  statusCode: number;
  message: string;
  error?: string;
}
