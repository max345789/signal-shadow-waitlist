export const DEAL_STAGES_ORDER = [
  "INTRO",
  "NDA",
  "DATA_ACCESS",
  "OFFER",
  "DUE_DILIGENCE",
  "ESCROW",
  "TRANSFER",
] as const;

export type DealStageType = (typeof DEAL_STAGES_ORDER)[number];
export type StageOwnerRole = "BUYER" | "SELLER" | "BOTH" | "ADMIN";
export type StageStatusValue = "COMPLETED" | "ACTIVE" | "PENDING" | "BLOCKED";

export interface DealStageDefinition {
  stage: DealStageType;
  label: string;
  defaultOwner: StageOwnerRole;
  defaultRequiredAction: string;
}

export const DEAL_STAGE_DEFINITIONS: Record<DealStageType, DealStageDefinition> = {
  INTRO: {
    stage: "INTRO",
    label: "Intro",
    defaultOwner: "BOTH",
    defaultRequiredAction: "Confirm mutual fit and request NDA access",
  },
  NDA: {
    stage: "NDA",
    label: "NDA",
    defaultOwner: "BUYER",
    defaultRequiredAction: "Complete buyer identity check, proof of funds, and e-sign NDA",
  },
  DATA_ACCESS: {
    stage: "DATA_ACCESS",
    label: "Data access",
    defaultOwner: "SELLER",
    defaultRequiredAction: "Review unlocked identity, customer summary, and financial files",
  },
  OFFER: {
    stage: "OFFER",
    label: "Offer",
    defaultOwner: "BOTH",
    defaultRequiredAction: "Submit, counter, or accept non-binding/binding offer terms",
  },
  DUE_DILIGENCE: {
    stage: "DUE_DILIGENCE",
    label: "Due diligence",
    defaultOwner: "BUYER",
    defaultRequiredAction: "Complete technical, financial, and legal checklist items",
  },
  ESCROW: {
    stage: "ESCROW",
    label: "Escrow",
    defaultOwner: "BUYER",
    defaultRequiredAction: "Fund licensed third-party escrow account",
  },
  TRANSFER: {
    stage: "TRANSFER",
    label: "Transfer",
    defaultOwner: "BOTH",
    defaultRequiredAction: "Confirm two-sided transfer of domain, code, cloud, and accounts",
  },
};

export const ALLOWED_STAGE_TRANSITIONS: Record<DealStageType, readonly DealStageType[]> = {
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
  fromStage: DealStageType;
  toStage: DealStageType;
  roomStatus?: "ACTIVE" | "DISPUTED" | "COMPLETED" | "CANCELLED";
  ndaSigned: boolean;
  buyerIdentityVerified: boolean;
  buyerProofOfFundsVerified: boolean;
  offerAccepted: boolean;
  escrowFunded: boolean;
}

export interface AuditLogDraft {
  actorId: string;
  dealRoomId: string;
  entityType: "DealRoom";
  entityId: string;
  action: "STAGE_TRANSITION";
  previousState: { stage: DealStageType };
  newState: { stage: DealStageType };
  metadataJson: { actorRole: string };
}

export type StageTransitionResult =
  | { ok: true; nextStage: DealStageType; auditEntry: AuditLogDraft }
  | {
      ok: false;
      code:
        | "INVALID_TRANSITION"
        | "PREREQUISITE_FAILED"
        | "FORBIDDEN"
        | "INVALID_STATE";
      reason: string;
    };

export function validateStageTransition(
  ctx: StageTransitionContext
): StageTransitionResult {
  if (ctx.roomStatus && ctx.roomStatus !== "ACTIVE") {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: `Stage transitions are paused while this deal room is ${ctx.roomStatus.toLowerCase()}.`,
    };
  }

  const allowedTargets = ALLOWED_STAGE_TRANSITIONS[ctx.fromStage];
  if (!allowedTargets.includes(ctx.toStage)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      reason: `Cannot move directly from ${DEAL_STAGE_DEFINITIONS[ctx.fromStage].label} to ${DEAL_STAGE_DEFINITIONS[ctx.toStage].label}.`,
    };
  }

  // Section 6 rule: Buyer identity check + proof of funds + signed NDA required before Data access
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
      entityType: "DealRoom",
      entityId: ctx.dealRoomId,
      action: "STAGE_TRANSITION",
      previousState: { stage: ctx.fromStage },
      newState: { stage: ctx.toStage },
      metadataJson: { actorRole: ctx.actorRole },
    },
  };
}
