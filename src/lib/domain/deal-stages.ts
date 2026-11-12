/**
 * Baton Connect Room Stages (Change C4)
 *
 * 6 Baton Stages:
 * 1. INTERESTED
 * 2. INTRODUCED (chat open)
 * 3. DETAILS_SHARED
 * 4. OFFER_DISCUSSED
 * 5. CLOSING
 * 6. CLOSED_OR_WITHDRAWN
 *
 * Note: Either person can move the stage, and both see the same tracker.
 * Tracker note: "Stages are set by the buyer and seller. The platform does not check or enforce them."
 */

export const CONNECT_STAGES_ORDER = [
  "INTERESTED",
  "INTRODUCED",
  "DETAILS_SHARED",
  "OFFER_DISCUSSED",
  "CLOSING",
  "CLOSED_OR_WITHDRAWN",
] as const;

export const LEGACY_DEAL_STAGES_ORDER = [
  "INTRO",
  "NDA",
  "DATA_ACCESS",
  "OFFER",
  "DUE_DILIGENCE",
  "ESCROW",
  "TRANSFER",
] as const;

export const DEAL_STAGES_ORDER = LEGACY_DEAL_STAGES_ORDER;

export type ConnectStageType =
  | (typeof CONNECT_STAGES_ORDER)[number]
  | "INTRO"
  | "NDA"
  | "DATA_ACCESS"
  | "OFFER"
  | "DUE_DILIGENCE"
  | "ESCROW"
  | "TRANSFER";

export type DealStageType = ConnectStageType;

export type StageOwnerRole = "BUYER" | "SELLER" | "BOTH" | "ADMIN";
export type StageStatusValue = "COMPLETED" | "ACTIVE" | "PENDING" | "BLOCKED";

export interface ConnectStageDefinition {
  stage: ConnectStageType;
  label: string;
  order: number;
  defaultOwner: StageOwnerRole;
  defaultRequiredAction: string;
}

export type DealStageDefinition = ConnectStageDefinition;

export const CONNECT_STAGE_DEFINITIONS: Record<string, ConnectStageDefinition> = {
  INTERESTED: {
    stage: "INTERESTED",
    label: "Interested",
    order: 1,
    defaultOwner: "BOTH",
    defaultRequiredAction: "Review initial parameters and open direct introduction",
  },
  INTRODUCED: {
    stage: "INTRODUCED",
    label: "Introduced",
    order: 2,
    defaultOwner: "BOTH",
    defaultRequiredAction: "Chat is open; discuss mutual thesis and request full details",
  },
  DETAILS_SHARED: {
    stage: "DETAILS_SHARED",
    label: "Details shared",
    order: 3,
    defaultOwner: "SELLER",
    defaultRequiredAction: "Seller approved request; confidential details unlocked for buyer",
  },
  OFFER_DISCUSSED: {
    stage: "OFFER_DISCUSSED",
    label: "Offer discussed",
    order: 4,
    defaultOwner: "BOTH",
    defaultRequiredAction: "Parties discuss indicative terms and due diligence items directly",
  },
  CLOSING: {
    stage: "CLOSING",
    label: "Closing",
    order: 5,
    defaultOwner: "BOTH",
    defaultRequiredAction: "Direct settlement outside platform via Closing guide",
  },
  CLOSED_OR_WITHDRAWN: {
    stage: "CLOSED_OR_WITHDRAWN",
    label: "Closed or Withdrawn",
    order: 6,
    defaultOwner: "BOTH",
    defaultRequiredAction: "Deal completed or withdrawn by parties",
  },
  // Legacy aliases
  INTRO: {
    stage: "INTRO",
    label: "Intro",
    order: 1,
    defaultOwner: "BOTH",
    defaultRequiredAction: "Confirm mutual fit and request NDA access",
  },
  NDA: {
    stage: "NDA",
    label: "NDA",
    order: 2,
    defaultOwner: "BUYER",
    defaultRequiredAction: "Complete buyer identity check, proof of funds, and e-sign NDA",
  },
  DATA_ACCESS: {
    stage: "DATA_ACCESS",
    label: "Data access",
    order: 3,
    defaultOwner: "SELLER",
    defaultRequiredAction: "Review unlocked identity, customer summary, and financial files",
  },
  OFFER: {
    stage: "OFFER",
    label: "Offer",
    order: 4,
    defaultOwner: "BOTH",
    defaultRequiredAction: "Submit, counter, or accept non-binding/binding offer terms",
  },
  DUE_DILIGENCE: {
    stage: "DUE_DILIGENCE",
    label: "Due diligence",
    order: 5,
    defaultOwner: "BUYER",
    defaultRequiredAction: "Complete technical, financial, and legal checklist items",
  },
  ESCROW: {
    stage: "ESCROW",
    label: "Escrow",
    order: 6,
    defaultOwner: "BUYER",
    defaultRequiredAction: "Fund licensed third-party escrow account",
  },
  TRANSFER: {
    stage: "TRANSFER",
    label: "Transfer",
    order: 7,
    defaultOwner: "BOTH",
    defaultRequiredAction: "Confirm two-sided transfer of domain, code, cloud, and accounts",
  },
};

export const DEAL_STAGE_DEFINITIONS = CONNECT_STAGE_DEFINITIONS;

export const ALLOWED_STAGE_TRANSITIONS: Record<string, readonly string[]> = {
  INTERESTED: ["INTRODUCED", "CLOSED_OR_WITHDRAWN"],
  INTRODUCED: ["DETAILS_SHARED", "OFFER_DISCUSSED", "CLOSED_OR_WITHDRAWN"],
  DETAILS_SHARED: ["OFFER_DISCUSSED", "INTRODUCED", "CLOSED_OR_WITHDRAWN"],
  OFFER_DISCUSSED: ["CLOSING", "DETAILS_SHARED", "CLOSED_OR_WITHDRAWN"],
  CLOSING: ["CLOSED_OR_WITHDRAWN", "OFFER_DISCUSSED"],
  CLOSED_OR_WITHDRAWN: ["INTERESTED", "INTRODUCED"],
  // Legacy transitions
  INTRO: ["NDA"],
  NDA: ["DATA_ACCESS"],
  DATA_ACCESS: ["OFFER"],
  OFFER: ["DUE_DILIGENCE", "DATA_ACCESS"],
  DUE_DILIGENCE: ["ESCROW", "OFFER"],
  ESCROW: ["TRANSFER"],
  TRANSFER: [],
};

export interface StageTransitionContext {
  dealRoomId: string;
  actorId: string;
  actorRole: "BUYER" | "SELLER" | "ADMIN" | "REVIEWER";
  fromStage: ConnectStageType;
  toStage: ConnectStageType;
  roomStatus?:
    | "ACTIVE"
    | "DISPUTED"
    | "COMPLETED"
    | "CANCELLED"
    | "CLOSED"
    | "WITHDRAWN";
  ndaSigned?: boolean;
  buyerIdentityVerified?: boolean;
  buyerProofOfFundsVerified?: boolean;
  offerAccepted?: boolean;
  escrowFunded?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}

export interface AuditLogDraft {
  actorId: string;
  dealRoomId: string;
  entityType: "ConnectRoom" | "DealRoom";
  entityId: string;
  action: "STAGE_TRANSITION";
  previousState: { stage: ConnectStageType };
  newState: { stage: ConnectStageType };
  metadataJson: { actorRole: string };
}

export type StageTransitionResult =
  | { ok: true; nextStage: ConnectStageType; auditEntry: AuditLogDraft }
  | {
      ok: false;
      code:
        | "INVALID_TRANSITION"
        | "PREREQUISITE_FAILED"
        | "FORBIDDEN"
        | "INVALID_STATE";
      reason: string;
    };

/**
 * Validates a stage transition.
 * Supports Baton 6 stages as well as legacy transitions.
 */
export function validateStageTransition(
  ctx: StageTransitionContext
): StageTransitionResult {
  if (ctx.roomStatus && ctx.roomStatus !== "ACTIVE") {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: `Stage transitions are paused while this Connect room is ${ctx.roomStatus.toLowerCase()}.`,
    };
  }

  const allowedTargets = ALLOWED_STAGE_TRANSITIONS[ctx.fromStage];
  if (!allowedTargets || !allowedTargets.includes(ctx.toStage)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      reason: `Cannot move directly from ${CONNECT_STAGE_DEFINITIONS[ctx.fromStage]?.label || ctx.fromStage} to ${CONNECT_STAGE_DEFINITIONS[ctx.toStage]?.label || ctx.toStage}.`,
    };
  }

  // Legacy prerequisite checks if transitioning between legacy stages
  if (ctx.toStage === "DATA_ACCESS" && ctx.fromStage === "NDA") {
    if (!ctx.ndaSigned) {
      return {
        ok: false,
        code: "PREREQUISITE_FAILED",
        reason: "Both parties must complete NDA signature before unlocking Data access.",
      };
    }
    if (!ctx.buyerIdentityVerified || !ctx.buyerProofOfFundsVerified) {
      return {
        ok: false,
        code: "PREREQUISITE_FAILED",
        reason: "Buyer identity check and proof of funds must be verified before Data access.",
      };
    }
  }

  if (ctx.toStage === "DUE_DILIGENCE" && !ctx.offerAccepted) {
    return {
      ok: false,
      code: "PREREQUISITE_FAILED",
      reason: "An offer must be accepted before moving to Due diligence.",
    };
  }

  if (ctx.toStage === "ESCROW" && !ctx.offerAccepted) {
    return {
      ok: false,
      code: "PREREQUISITE_FAILED",
      reason: "An accepted offer is required before opening third-party Escrow.",
    };
  }

  if (ctx.toStage === "TRANSFER" && !ctx.escrowFunded) {
    return {
      ok: false,
      code: "PREREQUISITE_FAILED",
      reason: "Third-party escrow must be funded before asset Transfer begins.",
    };
  }

  return {
    ok: true,
    nextStage: ctx.toStage,
    auditEntry: {
      actorId: ctx.actorId,
      dealRoomId: ctx.dealRoomId,
      entityType: "ConnectRoom",
      entityId: ctx.dealRoomId,
      action: "STAGE_TRANSITION",
      previousState: { stage: ctx.fromStage },
      newState: { stage: ctx.toStage },
      metadataJson: { actorRole: ctx.actorRole },
    },
  };
}
