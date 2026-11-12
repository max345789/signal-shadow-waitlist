import type { RoleName } from "@/lib/auth/types";
import type { CurrencyCode } from "@/lib/format/currency";
import type {
  DealStageType,
  StageOwnerRole,
  StageStatusValue,
} from "@/lib/domain/deal-stages";
import type {
  EscrowProviderName,
  EscrowStatusValue,
} from "@/lib/escrow/provider";

export type { EscrowProviderName, EscrowStatusValue };

export type DealRoomStatusValue =
  | "ACTIVE"
  | "DISPUTED"
  | "COMPLETED"
  | "CANCELLED"
  | "CLOSED"
  | "WITHDRAWN";
export type OfferStatusValue =
  | "PROPOSED"
  | "COUNTERED"
  | "ACCEPTED"
  | "DECLINED"
  | "WITHDRAWN";
export type ChecklistPhaseValue = "DUE_DILIGENCE" | "TRANSFER";
export type ChecklistStatusValue = "OPEN" | "IN_PROGRESS" | "CONFIRMED";
export type VirusScanStatusValue = "PENDING" | "CLEAN" | "INFECTED";

export type DocumentCategoryValue =
  | "NDA"
  | "PURCHASE_AGREEMENT"
  | "FINANCIAL"
  | "LEGAL"
  | "TECHNICAL"
  | "CUSTOMER"
  | "OTHER";

export interface DealStageView {
  id: string;
  stage: DealStageType;
  ownerRole: StageOwnerRole;
  requiredAction: string;
  status: StageStatusValue;
  completedAt: string | null;
  updatedAt: string;
}

export interface DealMessageView {
  id: string;
  dealRoomId: string;
  senderId: string;
  senderName: string;
  senderRoleLabel: "Buyer" | "Seller" | "Reviewer";
  parentId: string | null;
  body: string;
  createdAt: string;
}

export interface DocumentViewLogItem {
  id: string;
  viewerId: string;
  viewerName: string;
  viewedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface DealDocumentView {
  id: string;
  dealRoomId: string;
  uploadedById: string;
  uploadedByName: string;
  title: string;
  category: DocumentCategoryValue;
  filename: string;
  mimeType: string;
  version: number;
  virusScanStatus: VirusScanStatusValue;
  watermarkNotice: string;
  viewCount: number;
  views: DocumentViewLogItem[];
  createdAt: string;
}

export interface DealOfferView {
  id: string;
  dealRoomId: string;
  proposerId: string;
  proposerName: string;
  proposerRole: "BUYER" | "SELLER";
  amount: number;
  currency: CurrencyCode;
  termsSummary: string;
  status: OfferStatusValue;
  parentOfferId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DealChecklistItemView {
  id: string;
  dealRoomId: string;
  phase: ChecklistPhaseValue;
  category: string;
  title: string;
  buyerConfirmedAt: string | null;
  sellerConfirmedAt: string | null;
  status: ChecklistStatusValue;
  createdAt: string;
  updatedAt: string;
}

export interface DealAuditLogView {
  id: string;
  actorId: string | null;
  actorName: string;
  entityType: string;
  entityId: string;
  action: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  metadataJson: Record<string, unknown> | null;
  createdAt: string;
}

export interface NdaStatusView {
  buyerSigned: boolean;
  buyerSignerName: string | null;
  buyerSignedAt: string | null;
  sellerSigned: boolean;
  sellerSignerName: string | null;
  sellerSignedAt: string | null;
  completed: boolean;
  completedAt: string | null;
  documentId: string | null;
  templateTitle: string;
  templateLegalNotice: string;
  templateBody: string;
}

export interface PurchaseAgreementStatusView {
  buyerSigned: boolean;
  buyerSignerName: string | null;
  buyerSignedAt: string | null;
  sellerSigned: boolean;
  sellerSignerName: string | null;
  sellerSignedAt: string | null;
  completed: boolean;
  completedAt: string | null;
  documentId: string | null;
  templateTitle: string;
  templateLegalNotice: string;
  templateBody: string;
}

export interface DealEscrowTransactionView {
  id: string;
  dealRoomId: string;
  provider: string;
  externalRef: string;
  amount: number;
  currency: CurrencyCode;
  status: EscrowStatusValue;
  fundedAt: string | null;
  releasedAt: string | null;
  disputeReason: string | null;
  platformHoldsFunds: false;
  createdAt: string;
  updatedAt: string;
}

export type AdminDisputeDecision =
  | "RESUME_TO_IN_REVIEW"
  | "RELEASE_TO_SELLER"
  | "REFUND_TO_BUYER";

export interface AdminDisputeView {
  dealRoomId: string;
  businessId: string;
  businessSlug: string;
  teaserTitle: string;
  sector: string;
  geography: string;
  isSampleData: boolean;
  buyerUserId: string;
  buyerName: string;
  sellerUserId: string;
  sellerName: string;
  currentStage: DealStageType;
  roomStatus: DealRoomStatusValue;
  transferConfirmedCount: number;
  transferTotalCount: number;
  escrow: DealEscrowTransactionView;
  resolutionNote: string | null;
  resolvedAt: string | null;
  updatedAt: string;
}

export interface DealRoomSummary {
  id: string;
  businessId: string;
  businessSlug: string;
  teaserTitle: string;
  sector: string;
  geography: string;
  askingPrice: number;
  currency: CurrencyCode;
  isSampleData: boolean;
  buyerUserId: string;
  buyerName: string;
  sellerUserId: string;
  sellerName: string;
  currentStage: DealStageType;
  status: DealRoomStatusValue;
  latestEscrowStatus?: EscrowStatusValue | null;
  ndaCompleted: boolean;
  ndaSignedAt: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface DealRoomView extends DealRoomSummary {
  viewerRole: "BUYER" | "SELLER" | "ADMIN" | "REVIEWER";
  sensitiveDetailsUnlocked: boolean;
  redactedPlaceholder: string;
  redactedName: string | null;
  redactedDomain: string | null;
  redactedCustomers: string | null;
  dataAccessUnlocked: boolean;
  buyerVerification: {
    identityVerified: boolean;
    proofOfFundsVerified: boolean;
    dataAccessReady: boolean;
    reason: string;
  };
  nda: NdaStatusView;
  purchaseAgreement: PurchaseAgreementStatusView;
  stages: DealStageView[];
  messages: DealMessageView[];
  documents: DealDocumentView[];
  offers: DealOfferView[];
  checklistItems: DealChecklistItemView[];
  escrowTransactions: DealEscrowTransactionView[];
  auditLogs: DealAuditLogView[];
}

export interface RawDealRoomRecord {
  id: string;
  businessId: string;
  businessSlug: string;
  teaserTitle: string;
  sector: string;
  geography: string;
  askingPrice: number;
  currency: CurrencyCode;
  isSampleData: boolean;
  redactedName: string;
  redactedDomain: string;
  redactedCustomers: string | null;
  buyerProfileId: string;
  buyerUserId: string;
  buyerName: string;
  sellerProfileId: string;
  sellerUserId: string;
  sellerName: string;
  currentStage: DealStageType;
  status: DealRoomStatusValue;
  ndaSignedAt: string | null;
  ndaDocumentId: string | null;
  stages: DealStageView[];
  messages: DealMessageView[];
  documents: Array<
    DealDocumentView & {
      storageKey: string;
      watermarkedKey: string | null;
    }
  >;
  offers: DealOfferView[];
  checklistItems: DealChecklistItemView[];
  escrowTransactions: DealEscrowTransactionView[];
  auditLogs: DealAuditLogView[];
  createdAt: string;
  updatedAt: string;
}

export const LEGAL_REVIEW_BADGE = "Needs legal review";

export function buildNdaTemplateText(params: {
  teaserTitle: string;
  sector: string;
  geography: string;
  buyerName: string;
  sellerName: string;
}): string {
  return [
    "MUTUAL NON-DISCLOSURE AGREEMENT (DRAFT PLACEHOLDER — NEEDS LEGAL REVIEW)",
    "",
    "IMPORTANT NOTICE: This template is a placeholder for workflow evaluation only and MUST be reviewed and approved by a qualified lawyer prior to commercial launch.",
    "",
    `1. Parties: Disclosing Party ("Seller"): ${params.sellerName} (representing the "${params.teaserTitle}" listing in ${params.sector}, ${params.geography}) and Receiving Party ("Buyer"): ${params.buyerName}.`,
    "2. Confidential Information: Upon mutual electronic execution, Seller discloses confidential entity name, domain, customer cohorts, source files, and watermarked financial documents strictly for evaluating a potential acquisition.",
    "3. Non-Disclosure & Non-Solicitation: Buyer agrees not to share confidential materials outside verified advisors or solicit Seller's customers or staff for 24 months.",
    "4. Return or Destruction: If discussions end without a transaction, Buyer will delete all downloaded watermarked documents.",
    "5. Governing Law: Subject to jurisdiction review by qualified legal counsel before binding execution.",
  ].join("\n");
}

export function buildPurchaseAgreementTemplateText(params: {
  teaserTitle: string;
  legalEntityName: string | null;
  buyerName: string;
  sellerName: string;
  acceptedOfferLabel: string | null;
}): string {
  return [
    "ASSET & BUSINESS PURCHASE AGREEMENT (DRAFT PLACEHOLDER — NEEDS LEGAL REVIEW)",
    "",
    "IMPORTANT NOTICE: This template is a placeholder for workflow evaluation only and MUST be reviewed and approved by a qualified lawyer prior to commercial launch.",
    "",
    `1. Parties: Seller (${params.sellerName}) and Buyer (${params.buyerName}).`,
    `2. Target Business: ${params.legalEntityName ? `${params.legalEntityName} (${params.teaserTitle})` : params.teaserTitle}.`,
    `3. Purchase Consideration: ${params.acceptedOfferLabel ?? "As agreed in the accepted Deal Room offer"}.`,
    "4. Escrow & Handover: Purchase funds are deposited solely with a licensed third-party escrow provider and released upon two-sided confirmation of the Transfer checklist.",
    "5. Representations & Warranties: Final warranties, tax indemnities, and dispute jurisdiction must be drafted by qualified legal counsel.",
  ].join("\n");
}

export function generateDueDiligenceChecklistForSector(
  sector: string
): Array<{ category: string; title: string }> {
  const normalized = sector.trim().toLowerCase();
  const common: Array<{ category: string; title: string }> = [
    {
      category: "Financial",
      title: "Reconcile trailing 12-month bank deposits against reported revenue",
    },
    {
      category: "Legal",
      title: "Confirm entity good standing, IP assignment, and zero undisclosed liens",
    },
    {
      category: "Operations",
      title: "Verify vendor contracts and key founder handover documentation",
    },
  ];

  if (normalized.includes("saas")) {
    return [
      ...common,
      {
        category: "Technical",
        title: "Audit Git repository ownership, dependencies, and cloud IAM access",
      },
      {
        category: "Revenue",
        title: "Inspect Stripe / Razorpay cohort retention, refunds, and chargeback ratio",
      },
      {
        category: "Privacy",
        title: "Review customer DPAs, privacy policy, and production data encryption",
      },
    ];
  }

  if (normalized.includes("commerce")) {
    return [
      ...common,
      {
        category: "Supply Chain",
        title: "Verify supplier agreements, unit COGS invoices, and 3PL SLA terms",
      },
      {
        category: "Inventory",
        title: "Audit SKU-level return rates, dead stock, and marketplace account health",
      },
      {
        category: "Compliance",
        title: "Confirm GST filings, trademarks, and advertising account ownership",
      },
    ];
  }

  if (normalized.includes("developer")) {
    return [
      ...common,
      {
        category: "Technical",
        title: "Review open-source license compliance and API SLA uptime history",
      },
      {
        category: "Infrastructure",
        title: "Audit CI/CD pipelines, secrets rotation, and multi-region failover",
      },
    ];
  }

  if (normalized.includes("media") || normalized.includes("content")) {
    return [
      ...common,
      {
        category: "Editorial IP",
        title: "Confirm exclusive copyright ownership for archive and contributor contracts",
      },
      {
        category: "Traffic",
        title: "Validate organic search stability, email list deliverability, and sponsor terms",
      },
    ];
  }

  return [
    ...common,
    {
      category: "Marketplace",
      title: "Verify take-rate accounting, payout logs, and supply/demand retention",
    },
    {
      category: "Technical",
      title: "Inspect codebase, hosting accounts, and domain registrar control",
    },
  ];
}

export const TRANSFER_CHECKLIST_CATEGORIES = [
  "Domain",
  "Code repository",
  "Cloud & hosting",
  "Payment accounts",
  "Social handles",
  "Customer data",
  "Vendor contracts",
] as const;

export function generateTransferChecklistItems(): Array<{
  category: string;
  title: string;
}> {
  return [
    {
      category: "Domain",
      title: "Transfer primary domain registrar control, DNS records, and SSL certificates",
    },
    {
      category: "Code repository",
      title: "Transfer Git repositories, organization ownership, CI/CD pipelines, and IP assignment",
    },
    {
      category: "Cloud & hosting",
      title: "Hand over cloud infrastructure, hosting accounts, databases, and environment secrets",
    },
    {
      category: "Payment accounts",
      title: "Migrate payment gateway merchant accounts, payout bank links, and webhook keys",
    },
    {
      category: "Social handles",
      title: "Transfer official social media handles, brand accounts, and community channels",
    },
    {
      category: "Customer data",
      title: "Transfer customer CRM, billing records, and privacy-compliant data export",
    },
    {
      category: "Vendor contracts",
      title: "Assign or novate SaaS tools, supplier agreements, and third-party vendor contracts",
    },
  ];
}

export function areAllTransferChecklistItemsConfirmed(
  items: DealChecklistItemView[]
): boolean {
  const transferItems = items.filter((item) => item.phase === "TRANSFER");
  if (transferItems.length < TRANSFER_CHECKLIST_CATEGORIES.length) {
    return false;
  }
  return transferItems.every(
    (item) =>
      item.status === "CONFIRMED" &&
      Boolean(item.buyerConfirmedAt) &&
      Boolean(item.sellerConfirmedAt)
  );
}

export type EscrowActionInput =
  | {
      action: "INITIATE";
      provider: EscrowProviderName;
      amount?: number;
      currency?: CurrencyCode;
    }
  | {
      action: "FUND";
      escrowId: string;
      fundingReference?: string;
    }
  | {
      action: "START_REVIEW";
      escrowId: string;
    }
  | {
      action: "RELEASE";
      escrowId: string;
    }
  | {
      action: "DISPUTE";
      escrowId: string;
      disputeReason: string;
    };

export function validateEscrowAction(params: {
  input: EscrowActionInput;
  actorRole: "BUYER" | "SELLER" | "ADMIN" | "REVIEWER";
  roomStatus: DealRoomStatusValue;
  currentStage: DealStageType;
  acceptedOffer: DealOfferView | null;
  existingEscrows: DealEscrowTransactionView[];
  checklistItems: DealChecklistItemView[];
}):
  | { ok: true; targetEscrow: DealEscrowTransactionView | null }
  | {
      ok: false;
      code:
        | "FORBIDDEN"
        | "NOT_FOUND"
        | "INVALID_STAGE"
        | "INVALID_STATE"
        | "PREREQUISITE_FAILED";
      reason: string;
    } {
  if (params.actorRole !== "BUYER" && params.actorRole !== "SELLER") {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason:
        "Only Buyer or Seller participants can initiate or act on deal room escrow. Reviewers resolve disputes in the Admin Dispute Queue.",
    };
  }

  if (params.roomStatus !== "ACTIVE") {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: `Escrow actions are locked while the deal room status is ${params.roomStatus.toLowerCase()}.`,
    };
  }

  if (params.input.action === "INITIATE") {
    if (params.currentStage !== "ESCROW") {
      return {
        ok: false,
        code: "INVALID_STAGE",
        reason: "Advance the deal room to the Escrow stage before initiating third-party escrow.",
      };
    }
    if (!params.acceptedOffer) {
      return {
        ok: false,
        code: "PREREQUISITE_FAILED",
        reason: "An accepted offer is required before initiating third-party escrow.",
      };
    }
    const activeEscrow = params.existingEscrows.find(
      (e) => e.status !== "REFUNDED"
    );
    if (activeEscrow) {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: `An active third-party escrow transaction (${activeEscrow.externalRef}) already exists in this deal room.`,
      };
    }
    if (
      params.input.amount !== undefined &&
      Math.abs(params.input.amount - params.acceptedOffer.amount) > 0.01
    ) {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: "Escrow amount must match the accepted offer amount.",
      };
    }
    if (
      params.input.currency !== undefined &&
      params.input.currency !== params.acceptedOffer.currency
    ) {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: "Escrow currency must match the accepted offer currency.",
      };
    }
    return { ok: true, targetEscrow: null };
  }

  const escrowId = params.input.escrowId;
  const target = params.existingEscrows.find((e) => e.id === escrowId);
  if (!target) {
    return {
      ok: false,
      code: "NOT_FOUND",
      reason: "Escrow transaction not found in this deal room.",
    };
  }

  if (params.input.action === "FUND") {
    if (params.actorRole !== "BUYER") {
      return {
        ok: false,
        code: "FORBIDDEN",
        reason: "Only the Buyer can confirm third-party escrow funding.",
      };
    }
    if (target.status !== "INITIATED") {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: `Cannot confirm funding when escrow status is ${target.status}.`,
      };
    }
    return { ok: true, targetEscrow: target };
  }

  if (params.input.action === "START_REVIEW") {
    if (params.currentStage !== "TRANSFER") {
      return {
        ok: false,
        code: "INVALID_STAGE",
        reason: "Move the deal room to the Transfer stage before marking escrow in review.",
      };
    }
    if (target.status !== "FUNDED") {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: `Escrow must be funded before entering review (current: ${target.status}).`,
      };
    }
    return { ok: true, targetEscrow: target };
  }

  if (params.input.action === "RELEASE") {
    if (params.actorRole !== "BUYER") {
      return {
        ok: false,
        code: "FORBIDDEN",
        reason: "Only the Buyer can authorize escrow release after confirming asset handover.",
      };
    }
    if (params.currentStage !== "TRANSFER") {
      return {
        ok: false,
        code: "INVALID_STAGE",
        reason: "Deal room must be in the Transfer stage to release escrow funds.",
      };
    }
    if (target.status !== "FUNDED" && target.status !== "IN_REVIEW") {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: `Escrow funds cannot be released while status is ${target.status}.`,
      };
    }
    if (!areAllTransferChecklistItemsConfirmed(params.checklistItems)) {
      return {
        ok: false,
        code: "PREREQUISITE_FAILED",
        reason:
          "All 7 asset transfer categories must be confirmed by both Buyer and Seller before releasing escrow.",
      };
    }
    return { ok: true, targetEscrow: target };
  }

  // DISPUTE
  if (
    target.status !== "INITIATED" &&
    target.status !== "FUNDED" &&
    target.status !== "IN_REVIEW"
  ) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: `Cannot flag a dispute on an escrow transaction in ${target.status} state.`,
    };
  }
  return { ok: true, targetEscrow: target };
}

const EICAR_SIGNATURE =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

export function scanDocumentContent(
  buffer: Buffer,
  filename: string
): { status: "CLEAN" | "INFECTED"; reason: string | null } {
  const lowerName = filename.trim().toLowerCase();
  const forbiddenExtensions = [".exe", ".bat", ".cmd", ".sh", ".dll", ".ps1", ".vbs"];
  if (forbiddenExtensions.some((ext) => lowerName.endsWith(ext))) {
    return {
      status: "INFECTED",
      reason: "Executable file extensions are blocked by the document virus scanner.",
    };
  }

  // Check PE (MZ) or ELF magic bytes
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return {
      status: "INFECTED",
      reason: "Binary executable signature detected (MZ header).",
    };
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return {
      status: "INFECTED",
      reason: "Binary executable signature detected (ELF header).",
    };
  }

  const textSample = buffer.toString("utf8");
  if (textSample.includes(EICAR_SIGNATURE)) {
    return {
      status: "INFECTED",
      reason: "EICAR antivirus test signature detected; download blocked.",
    };
  }

  if (/<script[\s>]/i.test(textSample)) {
    return {
      status: "INFECTED",
      reason: "Active script payload detected inside document; blocked for safety.",
    };
  }

  return { status: "CLEAN", reason: null };
}

export type OfferActionInput =
  | {
      action: "PROPOSE";
      amount: number;
      currency: CurrencyCode;
      termsSummary: string;
    }
  | {
      action: "COUNTER";
      offerId: string;
      amount: number;
      currency: CurrencyCode;
      termsSummary: string;
    }
  | {
      action: "ACCEPT" | "DECLINE" | "WITHDRAW";
      offerId: string;
    };

export function validateOfferAction(params: {
  input: OfferActionInput;
  actorId: string;
  actorRole: "BUYER" | "SELLER" | "ADMIN" | "REVIEWER";
  currentStage: DealStageType;
  existingOffers: DealOfferView[];
}):
  | { ok: true; targetOffer: DealOfferView | null }
  | { ok: false; code: "INVALID_STAGE" | "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE"; reason: string } {
  if (params.currentStage !== "OFFER" && params.currentStage !== "DUE_DILIGENCE") {
    return {
      ok: false,
      code: "INVALID_STAGE",
      reason: "Offers can only be submitted or modified once the deal room reaches the Offer stage.",
    };
  }

  if (params.actorRole === "REVIEWER") {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Reviewers cannot propose, counter, or accept commercial offers.",
    };
  }

  if (params.input.action === "PROPOSE") {
    const hasOpenOffer = params.existingOffers.some((o) => o.status === "PROPOSED");
    if (hasOpenOffer) {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: "Respond to or withdraw the active proposed offer before creating another separate offer.",
      };
    }
    return { ok: true, targetOffer: null };
  }

  const offerId = params.input.offerId;
  const target = params.existingOffers.find((o) => o.id === offerId);
  if (!target) {
    return { ok: false, code: "NOT_FOUND", reason: "Offer not found in this deal room." };
  }

  if (target.status !== "PROPOSED") {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: `Cannot ${params.input.action.toLowerCase()} an offer that is already ${target.status.toLowerCase()}.`,
    };
  }

  if (params.input.action === "WITHDRAW") {
    if (target.proposerId !== params.actorId && params.actorRole !== "ADMIN") {
      return {
        ok: false,
        code: "FORBIDDEN",
        reason: "Only the party who proposed this offer can withdraw it.",
      };
    }
    return { ok: true, targetOffer: target };
  }

  // COUNTER, ACCEPT, DECLINE must come from the counterparty (not the proposer)
  if (target.proposerId === params.actorId) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: `You cannot ${params.input.action.toLowerCase()} your own offer; await the counterparty's response.`,
    };
  }

  return { ok: true, targetOffer: target };
}

export function resolveDealRoomViewerRole(params: {
  userId: string;
  roles: RoleName[];
  buyerUserId: string;
  sellerUserId: string;
}): "BUYER" | "SELLER" | "ADMIN" | "REVIEWER" | null {
  if (params.userId === params.buyerUserId && params.roles.includes("BUYER")) {
    return "BUYER";
  }
  if (params.userId === params.sellerUserId && params.roles.includes("SELLER")) {
    return "SELLER";
  }
  if (params.roles.includes("ADMIN")) {
    return "ADMIN";
  }
  if (params.roles.includes("REVIEWER")) {
    return "REVIEWER";
  }
  return null;
}

export function extractSignatureStateFromAuditLogs(params: {
  auditLogs: DealAuditLogView[];
  ndaSignedAt: string | null;
  ndaDocumentId: string | null;
  buyerName: string;
  sellerName: string;
  teaserTitle: string;
  sector: string;
  geography: string;
  legalEntityName: string | null;
  acceptedOfferLabel: string | null;
}): {
  nda: NdaStatusView;
  purchaseAgreement: PurchaseAgreementStatusView;
} {
  // Audit logs can be newest-first or oldest-first; sort chronologically oldest -> newest
  const chronological = [...params.auditLogs].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  let buyerNdaName: string | null = null;
  let buyerNdaAt: string | null = null;
  let sellerNdaName: string | null = null;
  let sellerNdaAt: string | null = null;

  let buyerPaName: string | null = null;
  let buyerPaAt: string | null = null;
  let sellerPaName: string | null = null;
  let sellerPaAt: string | null = null;
  let paCompletedAt: string | null = null;
  let paDocumentId: string | null = null;

  for (const log of chronological) {
    const meta = log.metadataJson ?? {};
    if (log.action === "NDA_BUYER_SIGNED") {
      buyerNdaName =
        typeof meta.signerName === "string" ? meta.signerName : log.actorName;
      buyerNdaAt = log.createdAt;
    } else if (log.action === "NDA_SELLER_SIGNED") {
      sellerNdaName =
        typeof meta.signerName === "string" ? meta.signerName : log.actorName;
      sellerNdaAt = log.createdAt;
    } else if (log.action === "PURCHASE_AGREEMENT_BUYER_SIGNED") {
      buyerPaName =
        typeof meta.signerName === "string" ? meta.signerName : log.actorName;
      buyerPaAt = log.createdAt;
    } else if (log.action === "PURCHASE_AGREEMENT_SELLER_SIGNED") {
      sellerPaName =
        typeof meta.signerName === "string" ? meta.signerName : log.actorName;
      sellerPaAt = log.createdAt;
    } else if (log.action === "PURCHASE_AGREEMENT_COMPLETED") {
      paCompletedAt = log.createdAt;
      paDocumentId =
        typeof meta.documentId === "string" ? meta.documentId : null;
    }
  }

  const ndaCompleted = Boolean(params.ndaSignedAt);

  return {
    nda: {
      buyerSigned: Boolean(buyerNdaAt) || ndaCompleted,
      buyerSignerName: buyerNdaName ?? (ndaCompleted ? params.buyerName : null),
      buyerSignedAt: buyerNdaAt ?? params.ndaSignedAt,
      sellerSigned: Boolean(sellerNdaAt) || ndaCompleted,
      sellerSignerName: sellerNdaName ?? (ndaCompleted ? params.sellerName : null),
      sellerSignedAt: sellerNdaAt ?? params.ndaSignedAt,
      completed: ndaCompleted,
      completedAt: params.ndaSignedAt,
      documentId: params.ndaDocumentId,
      templateTitle: "Mutual Non-Disclosure Agreement",
      templateLegalNotice: LEGAL_REVIEW_BADGE,
      templateBody: buildNdaTemplateText({
        teaserTitle: params.teaserTitle,
        sector: params.sector,
        geography: params.geography,
        buyerName: params.buyerName,
        sellerName: params.sellerName,
      }),
    },
    purchaseAgreement: {
      buyerSigned: Boolean(buyerPaAt) || Boolean(paCompletedAt),
      buyerSignerName: buyerPaName,
      buyerSignedAt: buyerPaAt,
      sellerSigned: Boolean(sellerPaAt) || Boolean(paCompletedAt),
      sellerSignerName: sellerPaName,
      sellerSignedAt: sellerPaAt,
      completed: Boolean(paCompletedAt),
      completedAt: paCompletedAt,
      documentId: paDocumentId,
      templateTitle: "Asset & Business Purchase Agreement",
      templateLegalNotice: LEGAL_REVIEW_BADGE,
      templateBody: buildPurchaseAgreementTemplateText({
        teaserTitle: params.teaserTitle,
        legalEntityName: params.legalEntityName,
        buyerName: params.buyerName,
        sellerName: params.sellerName,
        acceptedOfferLabel: params.acceptedOfferLabel,
      }),
    },
  };
}

export function sanitizeDealRoomForViewer(
  raw: RawDealRoomRecord,
  viewerRole: "BUYER" | "SELLER" | "ADMIN" | "REVIEWER",
  buyerVerification: {
    identityVerified: boolean;
    proofOfFundsVerified: boolean;
    dataAccessReady: boolean;
    reason: string;
  }
): DealRoomView {
  const ndaCompleted = Boolean(raw.ndaSignedAt);
  const sensitiveDetailsUnlocked =
    viewerRole === "SELLER" ||
    viewerRole === "ADMIN" ||
    viewerRole === "REVIEWER" ||
    ndaCompleted;

  const dataAccessStageReached =
    raw.currentStage === "DATA_ACCESS" ||
    raw.currentStage === "OFFER" ||
    raw.currentStage === "DUE_DILIGENCE" ||
    raw.currentStage === "ESCROW" ||
    raw.currentStage === "TRANSFER";

  const dataAccessUnlocked =
    viewerRole === "SELLER" ||
    viewerRole === "ADMIN" ||
    viewerRole === "REVIEWER" ||
    (ndaCompleted && dataAccessStageReached && buyerVerification.dataAccessReady);

  // Filter confidential non-NDA documents from Buyer until Data Access is unlocked
  const ndaDocIds = new Set(
    raw.documents.filter((d) => d.category === "NDA").map((d) => d.id)
  );

  const visibleDocuments = raw.documents
    .filter((doc) => {
      if (doc.category === "NDA") return true;
      return dataAccessUnlocked;
    })
    .map((doc) => ({
      id: doc.id,
      dealRoomId: doc.dealRoomId,
      uploadedById: doc.uploadedById,
      uploadedByName: doc.uploadedByName,
      title: doc.title,
      category: doc.category,
      filename: doc.filename,
      mimeType: doc.mimeType,
      version: doc.version,
      virusScanStatus: doc.virusScanStatus,
      watermarkNotice: doc.watermarkNotice,
      viewCount: doc.viewCount,
      views: doc.views,
      createdAt: doc.createdAt,
    }));

  const redactedLogText = "[Redacted until Data access unlocked]";
  const visibleAuditLogs: DealAuditLogView[] = dataAccessUnlocked
    ? raw.auditLogs
    : raw.auditLogs.map((entry) => {
        if (
          entry.action !== "DOCUMENT_UPLOADED" &&
          entry.action !== "DOCUMENT_SCAN_INFECTED" &&
          entry.action !== "DOCUMENT_VIEWED"
        ) {
          return entry;
        }
        const docIdFromState =
          entry.newState && typeof entry.newState.documentId === "string"
            ? entry.newState.documentId
            : entry.entityType === "Document"
              ? entry.entityId
              : null;
        const categoryFromState =
          entry.newState && typeof entry.newState.category === "string"
            ? entry.newState.category
            : null;
        if (categoryFromState === "NDA" || (docIdFromState && ndaDocIds.has(docIdFromState))) {
          return entry;
        }
        return {
          ...entry,
          newState: entry.newState
            ? {
                ...entry.newState,
                ...(typeof entry.newState.title === "string"
                  ? { title: redactedLogText }
                  : {}),
              }
            : null,
          metadataJson: entry.metadataJson
            ? {
                ...entry.metadataJson,
                ...(typeof entry.metadataJson.filename === "string"
                  ? { filename: redactedLogText }
                  : {}),
              }
            : null,
        };
      });

  const acceptedOffer = raw.offers.find((o) => o.status === "ACCEPTED") ?? null;
  const acceptedOfferLabel = acceptedOffer
    ? `${acceptedOffer.currency} ${acceptedOffer.amount.toLocaleString("en-IN")}`
    : null;

  const { nda, purchaseAgreement } = extractSignatureStateFromAuditLogs({
    auditLogs: raw.auditLogs,
    ndaSignedAt: raw.ndaSignedAt,
    ndaDocumentId: raw.ndaDocumentId,
    buyerName: raw.buyerName,
    sellerName: raw.sellerName,
    teaserTitle: raw.teaserTitle,
    sector: raw.sector,
    geography: raw.geography,
    legalEntityName: sensitiveDetailsUnlocked ? raw.redactedName : null,
    acceptedOfferLabel,
  });

  const escrowTransactions = raw.escrowTransactions ?? [];
  const latestEscrowStatus = escrowTransactions[0]?.status ?? null;

  return {
    id: raw.id,
    businessId: raw.businessId,
    businessSlug: raw.businessSlug,
    teaserTitle: raw.teaserTitle,
    sector: raw.sector,
    geography: raw.geography,
    askingPrice: raw.askingPrice,
    currency: raw.currency,
    isSampleData: raw.isSampleData,
    buyerUserId: raw.buyerUserId,
    buyerName: raw.buyerName,
    sellerUserId: raw.sellerUserId,
    sellerName: raw.sellerName,
    currentStage: raw.currentStage,
    status: raw.status,
    latestEscrowStatus,
    ndaCompleted,
    ndaSignedAt: raw.ndaSignedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    viewerRole,
    sensitiveDetailsUnlocked,
    redactedPlaceholder: "Redacted until NDA is signed",
    redactedName: sensitiveDetailsUnlocked ? raw.redactedName : null,
    redactedDomain: sensitiveDetailsUnlocked ? raw.redactedDomain : null,
    redactedCustomers: sensitiveDetailsUnlocked ? raw.redactedCustomers : null,
    dataAccessUnlocked,
    buyerVerification,
    nda,
    purchaseAgreement,
    stages: raw.stages,
    messages: raw.messages,
    documents: visibleDocuments,
    offers: raw.offers,
    checklistItems: raw.checklistItems,
    escrowTransactions,
    auditLogs: visibleAuditLogs,
  };
}
