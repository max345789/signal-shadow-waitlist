import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";
import { canEnterDealRoom, canReviewAdminQueue } from "@/lib/auth/permissions";
import type { AuthSession } from "@/lib/auth/types";
import {
  DEAL_STAGES_ORDER,
  DEAL_STAGE_DEFINITIONS,
  validateStageTransition,
  type DealStageType,
} from "@/lib/domain/deal-stages";
import {
  LEGAL_REVIEW_BADGE,
  buildNdaTemplateText,
  buildPurchaseAgreementTemplateText,
  extractSignatureStateFromAuditLogs,
  generateDueDiligenceChecklistForSector,
  generateTransferChecklistItems,
  resolveDealRoomViewerRole,
  sanitizeDealRoomForViewer,
  scanDocumentContent,
  validateEscrowAction,
  validateOfferAction,
  type AdminDisputeDecision,
  type AdminDisputeView,
  type DealRoomSummary,
  type DealRoomView,
  type DocumentCategoryValue,
  type EscrowActionInput,
  type EscrowProviderName,
  type EscrowStatusValue,
  type OfferActionInput,
  type RawDealRoomRecord,
} from "@/lib/domain/deal-room";
import {
  confirmThirdPartyEscrowFunding,
  flagThirdPartyEscrowDispute,
  initiateThirdPartyEscrow,
  releaseThirdPartyEscrowFunds,
  resolveThirdPartyEscrowDispute,
  transitionThirdPartyEscrowReview,
} from "@/lib/escrow/provider";
import { hasActiveBuyerDataAccessVerification } from "@/lib/domain/verification";
import type { CurrencyCode } from "@/lib/format/currency";
import { getLocalListingsStoreForVerification } from "@/lib/listings/store";
import { getLocalVerificationStore } from "@/lib/verification/local-store";
import { reconcileExpiredVerifications } from "@/lib/verification/store";
import {
  getLocalDealRoomsStore,
  hasLocalBuyerSignedNdaForBusiness,
} from "@/lib/deal-rooms/local-store";
import { publishDealRoomEvent } from "@/lib/deal-rooms/realtime";
import {
  readPrivateDocumentBytes,
  signDocumentDownloadToken,
  storePrivateDocumentAndWatermark,
  verifyDocumentDownloadToken,
} from "@/lib/deal-rooms/vault";
import {
  ChecklistPhase as PrismaChecklistPhase,
  ChecklistStatus as PrismaChecklistStatus,
  CurrencyCode as PrismaCurrencyCode,
  DealRoomStatus as PrismaDealRoomStatus,
  DealStageType as PrismaDealStageType,
  EscrowStatus as PrismaEscrowStatus,
  OfferStatus as PrismaOfferStatus,
  Prisma,
  StageOwner as PrismaStageOwner,
  StageStatus as PrismaStageStatus,
  VerificationType as PrismaVerificationType,
  VirusScanStatus as PrismaVirusScanStatus,
} from "@prisma/client";

export type DealRoomOperationFailure = {
  ok: false;
  code:
    | "UNAUTHENTICATED"
    | "TWO_FACTOR_REQUIRED"
    | "TWO_FACTOR_EXPIRED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "INVALID_STATE"
    | "INVALID_STAGE"
    | "INVALID_TRANSITION"
    | "PREREQUISITE_FAILED"
    | "INFECTED";
  reason: string;
};

export type DealRoomOperationResult<T> =
  | { ok: true; data: T }
  | DealRoomOperationFailure;

function inferFilenameFromStorageKey(storageKey: string): string {
  const base = storageKey.split("/").pop() ?? "document.txt";
  const doubleDashMatch = base.match(
    /--[0-9a-f]{12}--(?:watermarked--)?(.+)$/i
  );
  if (doubleDashMatch?.[1]) {
    return doubleDashMatch[1];
  }
  const hexNonceMatch = base.match(/-[0-9a-f]{12}-(?:watermarked-)?(.+)$/i);
  if (hexNonceMatch?.[1]) {
    return hexNonceMatch[1];
  }
  const parts = base.split("-");
  if (parts.length >= 3) {
    if (parts[2] === "watermarked" && parts.length >= 4) {
      return parts.slice(3).join("-");
    }
    return parts[parts.length - 1] ?? base;
  }
  return base;
}

function inferMimeTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "text/plain";
}

function parseJsonRecord(val: unknown): Record<string, unknown> | null {
  if (!val || typeof val !== "object" || Array.isArray(val)) return null;
  return val as Record<string, unknown>;
}

const PRISMA_DEAL_ROOM_INCLUDE = {
  business: {
    select: {
      id: true,
      slug: true,
      teaserTitle: true,
      sector: true,
      geography: true,
      askingPrice: true,
      currency: true,
      isSampleData: true,
      redactedName: true,
      redactedDomain: true,
      redactedCustomers: true,
    },
  },
  buyerProfile: {
    include: {
      user: { select: { id: true, name: true } },
    },
  },
  sellerProfile: {
    include: {
      user: { select: { id: true, name: true } },
    },
  },
  stages: true,
  messages: {
    include: {
      sender: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  documents: {
    include: {
      uploadedBy: { select: { id: true, name: true } },
      views: {
        include: {
          viewer: { select: { id: true, name: true } },
        },
        orderBy: { viewedAt: "desc" as const },
      },
    },
    orderBy: [{ createdAt: "desc" as const }, { version: "desc" as const }],
  },
  offers: {
    include: {
      proposer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" as const },
  },
  checklistItems: {
    orderBy: { createdAt: "asc" as const },
  },
  escrowTransactions: {
    orderBy: { createdAt: "desc" as const },
  },
  auditLogs: {
    include: {
      actor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" as const },
  },
} satisfies Prisma.DealRoomInclude;

type PrismaDealRoomFull = Prisma.DealRoomGetPayload<{
  include: typeof PRISMA_DEAL_ROOM_INCLUDE;
}>;

function mapPrismaDealRoomToRaw(row: PrismaDealRoomFull): RawDealRoomRecord {
  const stageIndex = new Map(DEAL_STAGES_ORDER.map((s, idx) => [s, idx]));
  const sortedStages = [...row.stages].sort(
    (a, b) =>
      (stageIndex.get(a.stage) ?? 99) - (stageIndex.get(b.stage) ?? 99)
  );

  return {
    id: row.id,
    businessId: row.business.id,
    businessSlug: row.business.slug,
    teaserTitle: row.business.teaserTitle,
    sector: row.business.sector,
    geography: row.business.geography,
    askingPrice: Number(row.business.askingPrice),
    currency: row.business.currency as CurrencyCode,
    isSampleData: row.business.isSampleData,
    redactedName: row.business.redactedName,
    redactedDomain: row.business.redactedDomain,
    redactedCustomers: row.business.redactedCustomers,
    buyerProfileId: row.buyerProfileId,
    buyerUserId: row.buyerProfile.user.id,
    buyerName: row.buyerProfile.user.name,
    sellerProfileId: row.sellerProfileId,
    sellerUserId: row.sellerProfile.user.id,
    sellerName: row.sellerProfile.user.name,
    currentStage: row.currentStage as DealStageType,
    status: row.status,
    ndaSignedAt: row.ndaSignedAt ? row.ndaSignedAt.toISOString() : null,
    ndaDocumentId: row.ndaDocumentId,
    stages: sortedStages.map((s) => ({
      id: s.id,
      stage: s.stage as DealStageType,
      ownerRole: s.ownerRole,
      requiredAction: s.requiredAction,
      status: s.status,
      completedAt: s.completedAt ? s.completedAt.toISOString() : null,
      updatedAt: s.updatedAt.toISOString(),
    })),
    messages: row.messages.map((m) => ({
      id: m.id,
      dealRoomId: m.dealRoomId,
      senderId: m.senderId,
      senderName: m.sender.name,
      senderRoleLabel:
        m.senderId === row.buyerProfile.user.id
          ? "Buyer"
          : m.senderId === row.sellerProfile.user.id
            ? "Seller"
            : "Reviewer",
      parentId: m.parentId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
    documents: row.documents.map((d) => {
      const filename = inferFilenameFromStorageKey(d.storageKey);
      return {
        id: d.id,
        dealRoomId: d.dealRoomId,
        uploadedById: d.uploadedById,
        uploadedByName: d.uploadedBy.name,
        title: d.title,
        category: d.category as DocumentCategoryValue,
        filename,
        mimeType: inferMimeTypeFromFilename(filename),
        storageKey: d.storageKey,
        watermarkedKey: d.watermarkedKey,
        version: d.version,
        virusScanStatus: d.virusScanStatus,
        watermarkNotice:
          d.virusScanStatus === "INFECTED"
            ? "BLOCKED BY VIRUS SCANNER"
            : `CONFIDENTIAL — Deal Room ${row.id} — Uploaded by ${d.uploadedBy.name}`,
        viewCount: d.views.length,
        views: d.views.map((v) => ({
          id: v.id,
          viewerId: v.viewerId,
          viewerName: v.viewer.name,
          viewedAt: v.viewedAt.toISOString(),
          ipAddress: v.ipAddress,
          userAgent: v.userAgent,
        })),
        createdAt: d.createdAt.toISOString(),
      };
    }),
    offers: row.offers.map((o) => ({
      id: o.id,
      dealRoomId: o.dealRoomId,
      proposerId: o.proposerId,
      proposerName: o.proposer.name,
      proposerRole:
        o.proposerId === row.sellerProfile.user.id ? "SELLER" : "BUYER",
      amount: Number(o.amount),
      currency: o.currency as CurrencyCode,
      termsSummary: o.termsSummary,
      status: o.status,
      parentOfferId: o.parentOfferId,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    })),
    checklistItems: row.checklistItems.map((c) => ({
      id: c.id,
      dealRoomId: c.dealRoomId,
      phase: c.phase,
      category: c.category,
      title: c.title,
      buyerConfirmedAt: c.buyerConfirmedAt
        ? c.buyerConfirmedAt.toISOString()
        : null,
      sellerConfirmedAt: c.sellerConfirmedAt
        ? c.sellerConfirmedAt.toISOString()
        : null,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    escrowTransactions: (row.escrowTransactions ?? []).map((e) => ({
      id: e.id,
      dealRoomId: e.dealRoomId,
      provider: e.provider,
      externalRef: e.externalRef,
      amount: Number(e.amount),
      currency: e.currency as CurrencyCode,
      status: e.status as EscrowStatusValue,
      fundedAt: e.fundedAt ? e.fundedAt.toISOString() : null,
      releasedAt: e.releasedAt ? e.releasedAt.toISOString() : null,
      disputeReason: e.disputeReason,
      platformHoldsFunds: false,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
    auditLogs: row.auditLogs.map((a) => ({
      id: a.id,
      actorId: a.actorId,
      actorName: a.actor?.name ?? "System",
      entityType: a.entityType,
      entityId: a.entityId,
      action: a.action,
      previousState: parseJsonRecord(a.previousState),
      newState: parseJsonRecord(a.newState),
      metadataJson: parseJsonRecord(a.metadataJson),
      createdAt: a.createdAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getBuyerVerificationReadiness(
  buyerUserId: string,
  now: Date = new Date()
): Promise<{
  identityVerified: boolean;
  proofOfFundsVerified: boolean;
  dataAccessReady: boolean;
  reason: string;
}> {
  await reconcileExpiredVerifications(now);

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const rows = await prisma.verification.findMany({
      where: {
        userId: buyerUserId,
        type: {
          in: [
            PrismaVerificationType.IDENTITY,
            PrismaVerificationType.PROOF_OF_FUNDS,
          ],
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    const identity =
      rows.find((v) => v.type === PrismaVerificationType.IDENTITY) ?? null;
    const pof =
      rows.find((v) => v.type === PrismaVerificationType.PROOF_OF_FUNDS) ?? null;
    const res = hasActiveBuyerDataAccessVerification({
      identity,
      proofOfFunds: pof,
      now,
    });
    return {
      identityVerified: res.identityEvaluated.isVerified,
      proofOfFundsVerified: res.proofOfFundsEvaluated.isVerified,
      dataAccessReady: res.allowed,
      reason: res.reason,
    };
  }

  const store = getLocalVerificationStore();
  const identity =
    store.verifications
      .filter((v) => v.userId === buyerUserId && v.type === "IDENTITY")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  const pof =
    store.verifications
      .filter((v) => v.userId === buyerUserId && v.type === "PROOF_OF_FUNDS")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  const res = hasActiveBuyerDataAccessVerification({
    identity,
    proofOfFunds: pof,
    now,
  });
  return {
    identityVerified: res.identityEvaluated.isVerified,
    proofOfFundsVerified: res.proofOfFundsEvaluated.isVerified,
    dataAccessReady: res.allowed,
    reason: res.reason,
  };
}

function buildInitialStages(dealRoomId: string, nowIso: string) {
  return DEAL_STAGES_ORDER.map((stage, idx) => {
    const def = DEAL_STAGE_DEFINITIONS[stage];
    return {
      id: `${dealRoomId}-stg-${stage.toLowerCase()}`,
      stage,
      ownerRole: def.defaultOwner,
      requiredAction: def.defaultRequiredAction,
      status: idx === 0 ? ("ACTIVE" as const) : ("PENDING" as const),
      completedAt: null,
      updatedAt: nowIso,
    };
  });
}

function enforceDealRoomAccess(
  session: AuthSession | null,
  participants: { buyerUserId: string; sellerUserId: string },
  now: Date = new Date()
):
  | { ok: true; viewerRole: "BUYER" | "SELLER" | "ADMIN" | "REVIEWER" }
  | DealRoomOperationFailure {
  const perm = canEnterDealRoom(session, participants, { now });
  if (!perm.allowed) {
    return {
      ok: false,
      code: perm.code,
      reason: perm.reason,
    };
  }
  const viewerRole = resolveDealRoomViewerRole({
    userId: session!.userId,
    roles: session!.roles,
    buyerUserId: participants.buyerUserId,
    sellerUserId: participants.sellerUserId,
  });
  if (!viewerRole) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "You are not an authorized participant in this deal room.",
    };
  }
  return { ok: true, viewerRole };
}

async function fetchRawDealRoomById(
  dealRoomId: string
): Promise<RawDealRoomRecord | null> {
  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const row = await prisma.dealRoom.findUnique({
      where: { id: dealRoomId },
      include: PRISMA_DEAL_ROOM_INCLUDE,
    });
    return row ? mapPrismaDealRoomToRaw(row) : null;
  }

  return getLocalDealRoomsStore().find((r) => r.id === dealRoomId) ?? null;
}

export async function hasBuyerSignedNdaForBusiness(
  businessId: string,
  userId: string | null
): Promise<boolean> {
  if (!userId) return false;
  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const room = await prisma.dealRoom.findFirst({
      where: {
        businessId,
        buyerProfile: { userId },
        ndaSignedAt: { not: null },
      },
      select: { id: true },
    });
    return Boolean(room);
  }
  return hasLocalBuyerSignedNdaForBusiness(businessId, userId);
}

export async function listDealRoomsForUser(
  session: AuthSession | null
): Promise<DealRoomOperationResult<DealRoomSummary[]>> {
  if (!session) {
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      reason: "Sign in and verify 2FA to view your deal rooms.",
    };
  }
  if (!session.twoFactorEnabled || !session.twoFactorVerifiedAt) {
    return {
      ok: false,
      code: "TWO_FACTOR_REQUIRED",
      reason: "Two-factor authentication is mandatory before accessing deal rooms.",
    };
  }
  const verifiedAt = new Date(session.twoFactorVerifiedAt);
  if (
    Number.isNaN(verifiedAt.getTime()) ||
    Date.now() - verifiedAt.getTime() > 12 * 60 * 60 * 1000
  ) {
    return {
      ok: false,
      code: "TWO_FACTOR_EXPIRED",
      reason: "Your two-factor verification session has expired. Verify again to continue.",
    };
  }

  const isStaff =
    session.roles.includes("ADMIN") || session.roles.includes("REVIEWER");

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const rows = await prisma.dealRoom.findMany({
      where: isStaff
        ? undefined
        : {
            OR: [
              { buyerProfile: { userId: session.userId } },
              { sellerProfile: { userId: session.userId } },
            ],
          },
      include: {
        business: {
          select: {
            id: true,
            slug: true,
            teaserTitle: true,
            sector: true,
            geography: true,
            askingPrice: true,
            currency: true,
            isSampleData: true,
          },
        },
        buyerProfile: {
          include: { user: { select: { id: true, name: true } } },
        },
        sellerProfile: {
          include: { user: { select: { id: true, name: true } } },
        },
        escrowTransactions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        businessId: r.business.id,
        businessSlug: r.business.slug,
        teaserTitle: r.business.teaserTitle,
        sector: r.business.sector,
        geography: r.business.geography,
        askingPrice: Number(r.business.askingPrice),
        currency: r.business.currency as CurrencyCode,
        isSampleData: r.business.isSampleData,
        buyerUserId: r.buyerProfile.user.id,
        buyerName: r.buyerProfile.user.name,
        sellerUserId: r.sellerProfile.user.id,
        sellerName: r.sellerProfile.user.name,
        currentStage: r.currentStage as DealStageType,
        status: r.status,
        latestEscrowStatus:
          (r.escrowTransactions?.[0]?.status as EscrowStatusValue | undefined) ??
          null,
        ndaCompleted: Boolean(r.ndaSignedAt),
        ndaSignedAt: r.ndaSignedAt ? r.ndaSignedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }

  const rooms = getLocalDealRoomsStore()
    .filter(
      (r) =>
        isStaff ||
        r.buyerUserId === session.userId ||
        r.sellerUserId === session.userId
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((r) => ({
      id: r.id,
      businessId: r.businessId,
      businessSlug: r.businessSlug,
      teaserTitle: r.teaserTitle,
      sector: r.sector,
      geography: r.geography,
      askingPrice: r.askingPrice,
      currency: r.currency,
      isSampleData: r.isSampleData,
      buyerUserId: r.buyerUserId,
      buyerName: r.buyerName,
      sellerUserId: r.sellerUserId,
      sellerName: r.sellerName,
      currentStage: r.currentStage,
      status: r.status,
      latestEscrowStatus: r.escrowTransactions?.[0]?.status ?? null,
      ndaCompleted: Boolean(r.ndaSignedAt),
      ndaSignedAt: r.ndaSignedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

  return { ok: true, data: rooms };
}

export async function createOrOpenDealRoom(
  businessId: string,
  session: AuthSession | null
): Promise<DealRoomOperationResult<DealRoomView>> {
  if (!session) {
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      reason: "Sign in and verify 2FA to open a deal room.",
    };
  }
  if (!session.roles.includes("BUYER") && !session.roles.includes("ADMIN")) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "A Buyer account is required to initiate a deal room on a listing.",
    };
  }
  if (!session.twoFactorEnabled || !session.twoFactorVerifiedAt) {
    return {
      ok: false,
      code: "TWO_FACTOR_REQUIRED",
      reason: "Two-factor authentication is mandatory before entering any deal room.",
    };
  }
  const verifiedAt = new Date(session.twoFactorVerifiedAt);
  if (
    Number.isNaN(verifiedAt.getTime()) ||
    Date.now() - verifiedAt.getTime() > 12 * 60 * 60 * 1000
  ) {
    return {
      ok: false,
      code: "TWO_FACTOR_EXPIRED",
      reason: "Your two-factor verification session has expired. Verify again to continue.",
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const biz = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        sellerProfile: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    if (!biz) {
      return { ok: false, code: "NOT_FOUND", reason: "Listing not found." };
    }
    if (biz.status !== "APPROVED") {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: "Deal rooms can only be opened on Admin-approved listings.",
      };
    }
    if (biz.sellerProfile.userId === session.userId) {
      return {
        ok: false,
        code: "FORBIDDEN",
        reason: "Sellers cannot open a buyer deal room on their own listing.",
      };
    }

    const buyerProfile = await prisma.buyerProfile.upsert({
      where: { userId: session.userId },
      update: {},
      create: {
        userId: session.userId,
        preferredCurrency: biz.currency,
      },
    });

    const existing = await prisma.dealRoom.findUnique({
      where: {
        businessId_buyerProfileId: {
          businessId: biz.id,
          buyerProfileId: buyerProfile.id,
        },
      },
      include: PRISMA_DEAL_ROOM_INCLUDE,
    });

    if (existing) {
      const raw = mapPrismaDealRoomToRaw(existing);
      const access = enforceDealRoomAccess(session, raw, now);
      if (!access.ok) return access;
      const buyerVer = await getBuyerVerificationReadiness(raw.buyerUserId, now);
      return {
        ok: true,
        data: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
      };
    }

    const checklistTemplates = generateDueDiligenceChecklistForSector(biz.sector);
    const created = await prisma.$transaction(async (tx) => {
      const room = await tx.dealRoom.create({
        data: {
          businessId: biz.id,
          buyerProfileId: buyerProfile.id,
          sellerProfileId: biz.sellerProfileId,
          currentStage: PrismaDealStageType.INTRO,
          status: PrismaDealRoomStatus.ACTIVE,
          stages: {
            create: DEAL_STAGES_ORDER.map((stage, idx) => {
              const def = DEAL_STAGE_DEFINITIONS[stage];
              return {
                stage: stage as PrismaDealStageType,
                ownerRole: def.defaultOwner as PrismaStageOwner,
                requiredAction: def.defaultRequiredAction,
                status:
                  idx === 0
                    ? PrismaStageStatus.ACTIVE
                    : PrismaStageStatus.PENDING,
              };
            }),
          },
          checklistItems: {
            create: checklistTemplates.map((item) => ({
              phase: PrismaChecklistPhase.DUE_DILIGENCE,
              category: item.category,
              title: item.title,
              status: PrismaChecklistStatus.OPEN,
            })),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          dealRoomId: room.id,
          entityType: "DealRoom",
          entityId: room.id,
          action: "DEAL_ROOM_CREATED",
          previousState: Prisma.JsonNull,
          newState: { currentStage: "INTRO", status: "ACTIVE" },
          metadataJson: {
            businessId: biz.id,
            sector: biz.sector,
            checklistGeneratedCount: checklistTemplates.length,
          },
        },
      });

      await tx.notification.create({
        data: {
          userId: biz.sellerProfile.userId,
          type: "DEAL_ROOM_OPENED",
          title: `New deal room opened for ${biz.teaserTitle}`,
          body: `${session.name} initiated a deal room in the Intro stage.`,
          actionUrl: `/deals/${room.id}`,
        },
      });

      return tx.dealRoom.findUniqueOrThrow({
        where: { id: room.id },
        include: PRISMA_DEAL_ROOM_INCLUDE,
      });
    });

    publishDealRoomEvent(created.id, "DEAL_ROOM_CREATED");
    const raw = mapPrismaDealRoomToRaw(created);
    const buyerVer = await getBuyerVerificationReadiness(raw.buyerUserId, now);
    const viewerRole = resolveDealRoomViewerRole({
      userId: session.userId,
      roles: session.roles,
      buyerUserId: raw.buyerUserId,
      sellerUserId: raw.sellerUserId,
    })!;
    return {
      ok: true,
      data: sanitizeDealRoomForViewer(raw, viewerRole, buyerVer),
    };
  }

  // Local-dev store
  const listings = getLocalListingsStoreForVerification();
  const biz = listings.find((b) => b.id === businessId);
  if (!biz) {
    return { ok: false, code: "NOT_FOUND", reason: "Listing not found." };
  }
  if (biz.status !== "APPROVED") {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "Deal rooms can only be opened on Admin-approved listings.",
    };
  }
  if (biz.sellerUserId === session.userId) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Sellers cannot open a buyer deal room on their own listing.",
    };
  }

  const rooms = getLocalDealRoomsStore();
  const existing = rooms.find(
    (r) => r.businessId === biz.id && r.buyerUserId === session.userId
  );
  if (existing) {
    const access = enforceDealRoomAccess(session, existing, now);
    if (!access.ok) return access;
    const buyerVer = await getBuyerVerificationReadiness(existing.buyerUserId, now);
    return {
      ok: true,
      data: sanitizeDealRoomForViewer(existing, access.viewerRole, buyerVer),
    };
  }

  const roomId = `deal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const checklistTemplates = generateDueDiligenceChecklistForSector(biz.sector);
  const newRoom: RawDealRoomRecord = {
    id: roomId,
    businessId: biz.id,
    businessSlug: biz.slug,
    teaserTitle: biz.teaserTitle,
    sector: biz.sector,
    geography: biz.geography,
    askingPrice: biz.askingPrice,
    currency: biz.currency,
    isSampleData: biz.isSampleData,
    redactedName: biz.redactedName,
    redactedDomain: biz.redactedDomain,
    redactedCustomers: biz.redactedCustomers,
    buyerProfileId: `buyer-profile-${session.userId}`,
    buyerUserId: session.userId,
    buyerName: session.name,
    sellerProfileId: biz.sellerProfileId,
    sellerUserId: biz.sellerUserId,
    sellerName: biz.sellerDisplayLabel,
    currentStage: "INTRO",
    status: "ACTIVE",
    ndaSignedAt: null,
    ndaDocumentId: null,
    stages: buildInitialStages(roomId, nowIso),
    messages: [],
    documents: [],
    offers: [],
    checklistItems: checklistTemplates.map((item, idx) => ({
      id: `${roomId}-chk-${idx + 1}`,
      dealRoomId: roomId,
      phase: "DUE_DILIGENCE",
      category: item.category,
      title: item.title,
      buyerConfirmedAt: null,
      sellerConfirmedAt: null,
      status: "OPEN",
      createdAt: nowIso,
      updatedAt: nowIso,
    })),
    escrowTransactions: [],
    auditLogs: [
      {
        id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        actorId: session.userId,
        actorName: session.name,
        entityType: "DealRoom",
        entityId: roomId,
        action: "DEAL_ROOM_CREATED",
        previousState: null,
        newState: { currentStage: "INTRO", status: "ACTIVE" },
        metadataJson: {
          businessId: biz.id,
          sector: biz.sector,
          checklistGeneratedCount: checklistTemplates.length,
        },
        createdAt: nowIso,
      },
    ],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  rooms.unshift(newRoom);
  publishDealRoomEvent(roomId, "DEAL_ROOM_CREATED");

  const buyerVer = await getBuyerVerificationReadiness(newRoom.buyerUserId, now);
  const viewerRole = resolveDealRoomViewerRole({
    userId: session.userId,
    roles: session.roles,
    buyerUserId: newRoom.buyerUserId,
    sellerUserId: newRoom.sellerUserId,
  })!;
  return {
    ok: true,
    data: sanitizeDealRoomForViewer(newRoom, viewerRole, buyerVer),
  };
}

export async function getDealRoomForViewer(
  dealRoomId: string,
  session: AuthSession | null
): Promise<DealRoomOperationResult<DealRoomView>> {
  const now = new Date();
  const raw = await fetchRawDealRoomById(dealRoomId);
  if (!raw) {
    return { ok: false, code: "NOT_FOUND", reason: "Deal room not found." };
  }

  const access = enforceDealRoomAccess(session, raw, now);
  if (!access.ok) return access;

  const buyerVer = await getBuyerVerificationReadiness(raw.buyerUserId, now);
  return {
    ok: true,
    data: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
  };
}

export async function transitionDealRoomStage(
  dealRoomId: string,
  toStage: DealStageType,
  session: AuthSession | null
): Promise<DealRoomOperationResult<DealRoomView>> {
  const now = new Date();
  const nowIso = now.toISOString();
  const raw = await fetchRawDealRoomById(dealRoomId);
  if (!raw) {
    return { ok: false, code: "NOT_FOUND", reason: "Deal room not found." };
  }

  const access = enforceDealRoomAccess(session, raw, now);
  if (!access.ok) return access;

  if (access.viewerRole !== "BUYER" && access.viewerRole !== "SELLER") {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Only Buyer or Seller participants can transition deal stages.",
    };
  }

  const buyerVer = await getBuyerVerificationReadiness(raw.buyerUserId, now);
  const offerAccepted = raw.offers.some((o) => o.status === "ACCEPTED");

  if (
    access.viewerRole === "BUYER" &&
    (toStage === "OFFER" ||
      toStage === "DUE_DILIGENCE" ||
      toStage === "ESCROW" ||
      toStage === "TRANSFER") &&
    !buyerVer.dataAccessReady
  ) {
    return {
      ok: false,
      code: "PREREQUISITE_FAILED",
      reason:
        "Active Buyer identity check and Proof of Funds are required before advancing commercial deal stages.",
    };
  }

  let escrowFunded = false;
  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const funded = await prisma.escrowTransaction.findFirst({
      where: {
        dealRoomId: raw.id,
        status: { in: ["FUNDED", "IN_REVIEW", "RELEASED"] },
      },
      select: { id: true },
    });
    escrowFunded = Boolean(funded);
  } else {
    escrowFunded = raw.escrowTransactions.some((e) =>
      ["FUNDED", "IN_REVIEW", "RELEASED"].includes(e.status)
    );
  }

  const validation = validateStageTransition({
    dealRoomId: raw.id,
    actorId: session!.userId,
    actorRole: access.viewerRole,
    fromStage: raw.currentStage,
    toStage,
    roomStatus: raw.status,
    ndaSigned: Boolean(raw.ndaSignedAt),
    buyerIdentityVerified: buyerVer.identityVerified,
    buyerProofOfFundsVerified: buyerVer.proofOfFundsVerified,
    offerAccepted,
    escrowFunded,
  });

  if (!validation.ok) {
    return {
      ok: false,
      code: validation.code,
      reason: validation.reason,
    };
  }

  const toIdx = DEAL_STAGES_ORDER.indexOf(toStage);
  const needsTransferChecklist =
    toStage === "TRANSFER" &&
    !raw.checklistItems.some((c) => c.phase === "TRANSFER");
  const transferTemplates = needsTransferChecklist
    ? generateTransferChecklistItems()
    : [];

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const updated = await prisma.$transaction(async (tx) => {
      await tx.dealRoom.update({
        where: { id: raw.id },
        data: { currentStage: toStage as PrismaDealStageType },
      });

      for (let i = 0; i < DEAL_STAGES_ORDER.length; i++) {
        const stg = DEAL_STAGES_ORDER[i]!;
        const nextStatus =
          i < toIdx
            ? PrismaStageStatus.COMPLETED
            : i === toIdx
              ? PrismaStageStatus.ACTIVE
              : PrismaStageStatus.PENDING;
        await tx.dealStage.updateMany({
          where: { dealRoomId: raw.id, stage: stg as PrismaDealStageType },
          data: {
            status: nextStatus,
            completedAt: i < toIdx ? now : null,
          },
        });
      }

      if (transferTemplates.length > 0) {
        await tx.checklistItem.createMany({
          data: transferTemplates.map((item) => ({
            dealRoomId: raw.id,
            phase: PrismaChecklistPhase.TRANSFER,
            category: item.category,
            title: item.title,
            status: PrismaChecklistStatus.OPEN,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: session!.userId,
          dealRoomId: raw.id,
          entityType: validation.auditEntry.entityType,
          entityId: validation.auditEntry.entityId,
          action: validation.auditEntry.action,
          previousState: validation.auditEntry.previousState as Prisma.InputJsonValue,
          newState: validation.auditEntry.newState as Prisma.InputJsonValue,
          metadataJson: {
            ...validation.auditEntry.metadataJson,
            ...(transferTemplates.length > 0
              ? { transferChecklistGeneratedCount: transferTemplates.length }
              : {}),
          } as Prisma.InputJsonValue,
        },
      });

      return tx.dealRoom.findUniqueOrThrow({
        where: { id: raw.id },
        include: PRISMA_DEAL_ROOM_INCLUDE,
      });
    });

    publishDealRoomEvent(raw.id, "STAGE_UPDATED");
    const nextRaw = mapPrismaDealRoomToRaw(updated);
    return {
      ok: true,
      data: sanitizeDealRoomForViewer(nextRaw, access.viewerRole, buyerVer),
    };
  }

  raw.currentStage = toStage;
  raw.updatedAt = nowIso;
  raw.stages = raw.stages.map((s) => {
    const idx = DEAL_STAGES_ORDER.indexOf(s.stage);
    if (idx < toIdx) {
      return {
        ...s,
        status: "COMPLETED",
        completedAt: s.completedAt ?? nowIso,
        updatedAt: nowIso,
      };
    }
    if (idx === toIdx) {
      return {
        ...s,
        status: "ACTIVE",
        completedAt: null,
        updatedAt: nowIso,
      };
    }
    return {
      ...s,
      status: "PENDING",
      completedAt: null,
      updatedAt: nowIso,
    };
  });

  if (transferTemplates.length > 0) {
    transferTemplates.forEach((item, idx) => {
      raw.checklistItems.push({
        id: `${raw.id}-xfer-${idx + 1}`,
        dealRoomId: raw.id,
        phase: "TRANSFER",
        category: item.category,
        title: item.title,
        buyerConfirmedAt: null,
        sellerConfirmedAt: null,
        status: "OPEN",
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    });
  }

  raw.auditLogs.unshift({
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    actorId: session!.userId,
    actorName: session!.name,
    entityType: validation.auditEntry.entityType,
    entityId: validation.auditEntry.entityId,
    action: validation.auditEntry.action,
    previousState: validation.auditEntry.previousState,
    newState: validation.auditEntry.newState,
    metadataJson: {
      ...validation.auditEntry.metadataJson,
      ...(transferTemplates.length > 0
        ? { transferChecklistGeneratedCount: transferTemplates.length }
        : {}),
    },
    createdAt: nowIso,
  });

  publishDealRoomEvent(raw.id, "STAGE_UPDATED");
  return {
    ok: true,
    data: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
  };
}

export async function signDealRoomNda(
  dealRoomId: string,
  input: { signerName: string; acceptedTerms: true },
  session: AuthSession | null
): Promise<DealRoomOperationResult<DealRoomView>> {
  const now = new Date();
  const nowIso = now.toISOString();
  const raw = await fetchRawDealRoomById(dealRoomId);
  if (!raw) {
    return { ok: false, code: "NOT_FOUND", reason: "Deal room not found." };
  }

  const access = enforceDealRoomAccess(session, raw, now);
  if (!access.ok) return access;

  if (access.viewerRole !== "BUYER" && access.viewerRole !== "SELLER") {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Only the Buyer or Seller participant can sign the deal room NDA.",
    };
  }

  if (raw.ndaSignedAt) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "The Mutual NDA has already been executed by both parties.",
    };
  }

  const sigState = extractSignatureStateFromAuditLogs({
    auditLogs: raw.auditLogs,
    ndaSignedAt: raw.ndaSignedAt,
    ndaDocumentId: raw.ndaDocumentId,
    buyerName: raw.buyerName,
    sellerName: raw.sellerName,
    teaserTitle: raw.teaserTitle,
    sector: raw.sector,
    geography: raw.geography,
    legalEntityName: null,
    acceptedOfferLabel: null,
  });

  if (access.viewerRole === "BUYER" && sigState.nda.buyerSigned) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "Buyer signature has already been recorded on this NDA.",
    };
  }
  if (access.viewerRole === "SELLER" && sigState.nda.sellerSigned) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "Seller counter-signature has already been recorded on this NDA.",
    };
  }

  const actionName =
    access.viewerRole === "BUYER" ? "NDA_BUYER_SIGNED" : "NDA_SELLER_SIGNED";
  const willCompleteNda =
    (access.viewerRole === "BUYER" && sigState.nda.sellerSigned) ||
    (access.viewerRole === "SELLER" && sigState.nda.buyerSigned);

  const buyerVer = await getBuyerVerificationReadiness(raw.buyerUserId, now);

  let executedDocId: string | null = null;
  let storedVault: Awaited<
    ReturnType<typeof storePrivateDocumentAndWatermark>
  > | null = null;

  if (willCompleteNda) {
    executedDocId = `nda-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const executedContent = [
      buildNdaTemplateText({
        teaserTitle: raw.teaserTitle,
        sector: raw.sector,
        geography: raw.geography,
        buyerName: raw.buyerName,
        sellerName: raw.sellerName,
      }),
      "",
      "--- ELECTRONIC EXECUTION RECORD ---",
      `Buyer Signer: ${access.viewerRole === "BUYER" ? input.signerName : sigState.nda.buyerSignerName ?? raw.buyerName}`,
      `Buyer Signed At: ${access.viewerRole === "BUYER" ? nowIso : sigState.nda.buyerSignedAt ?? nowIso}`,
      `Seller Signer: ${access.viewerRole === "SELLER" ? input.signerName : sigState.nda.sellerSignerName ?? raw.sellerName}`,
      `Seller Signed At: ${access.viewerRole === "SELLER" ? nowIso : sigState.nda.sellerSignedAt ?? nowIso}`,
      `Status: EXECUTED (${LEGAL_REVIEW_BADGE})`,
    ].join("\n");

    storedVault = await storePrivateDocumentAndWatermark({
      dealRoomId: raw.id,
      documentId: executedDocId,
      filename: "executed-mutual-nda.txt",
      mimeType: "text/plain",
      contentBuffer: Buffer.from(executedContent, "utf8"),
      uploaderLabel: session!.name,
      scanStatus: "CLEAN",
    });
  }

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const updated = await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorId: session!.userId,
          dealRoomId: raw.id,
          entityType: "DealRoom",
          entityId: raw.id,
          action: actionName,
          previousState: { ndaSignedAt: null },
          newState: {
            signerRole: access.viewerRole,
            signedAt: nowIso,
          },
          metadataJson: {
            signerName: input.signerName,
            legalNotice: LEGAL_REVIEW_BADGE,
            method: "ELECTRONIC_SIGNATURE",
          },
        },
      });

      if (willCompleteNda && storedVault && executedDocId) {
        const doc = await tx.document.create({
          data: {
            dealRoomId: raw.id,
            uploadedById: session!.userId,
            title: `Executed Mutual NDA (${LEGAL_REVIEW_BADGE})`,
            category: "NDA",
            storageKey: storedVault.storageKey,
            watermarkedKey: storedVault.watermarkedKey,
            version: 1,
            virusScanStatus: PrismaVirusScanStatus.CLEAN,
          },
        });

        await tx.dealRoom.update({
          where: { id: raw.id },
          data: {
            ndaSignedAt: now,
            ndaDocumentId: doc.id,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: session!.userId,
            dealRoomId: raw.id,
            entityType: "DealRoom",
            entityId: raw.id,
            action: "NDA_COMPLETED",
            previousState: { ndaSignedAt: null },
            newState: { ndaSignedAt: nowIso, ndaDocumentId: doc.id },
            metadataJson: {
              redactionUnlocked: true,
              legalNotice: LEGAL_REVIEW_BADGE,
            },
          },
        });
      }

      return tx.dealRoom.findUniqueOrThrow({
        where: { id: raw.id },
        include: PRISMA_DEAL_ROOM_INCLUDE,
      });
    });

    publishDealRoomEvent(raw.id, "NDA_UPDATED");
    return {
      ok: true,
      data: sanitizeDealRoomForViewer(
        mapPrismaDealRoomToRaw(updated),
        access.viewerRole,
        buyerVer
      ),
    };
  }

  raw.updatedAt = nowIso;
  raw.auditLogs.unshift({
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    actorId: session!.userId,
    actorName: session!.name,
    entityType: "DealRoom",
    entityId: raw.id,
    action: actionName,
    previousState: { ndaSignedAt: null },
    newState: { signerRole: access.viewerRole, signedAt: nowIso },
    metadataJson: {
      signerName: input.signerName,
      legalNotice: LEGAL_REVIEW_BADGE,
      method: "ELECTRONIC_SIGNATURE",
    },
    createdAt: nowIso,
  });

  if (willCompleteNda && storedVault && executedDocId) {
    raw.ndaSignedAt = nowIso;
    raw.ndaDocumentId = executedDocId;
    raw.documents.unshift({
      id: executedDocId,
      dealRoomId: raw.id,
      uploadedById: session!.userId,
      uploadedByName: session!.name,
      title: `Executed Mutual NDA (${LEGAL_REVIEW_BADGE})`,
      category: "NDA",
      filename: storedVault.safeFilename,
      mimeType: "text/plain",
      storageKey: storedVault.storageKey,
      watermarkedKey: storedVault.watermarkedKey,
      version: 1,
      virusScanStatus: "CLEAN",
      watermarkNotice: storedVault.watermarkNotice,
      viewCount: 0,
      views: [],
      createdAt: nowIso,
    });
    raw.auditLogs.unshift({
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      actorId: session!.userId,
      actorName: session!.name,
      entityType: "DealRoom",
      entityId: raw.id,
      action: "NDA_COMPLETED",
      previousState: { ndaSignedAt: null },
      newState: { ndaSignedAt: nowIso, ndaDocumentId: executedDocId },
      metadataJson: {
        redactionUnlocked: true,
        legalNotice: LEGAL_REVIEW_BADGE,
      },
      createdAt: nowIso,
    });
  }

  publishDealRoomEvent(raw.id, "NDA_UPDATED");
  return {
    ok: true,
    data: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
  };
}

export async function signPurchaseAgreement(
  dealRoomId: string,
  input: { signerName: string; acceptedTerms: true },
  session: AuthSession | null
): Promise<DealRoomOperationResult<DealRoomView>> {
  const now = new Date();
  const nowIso = now.toISOString();
  const raw = await fetchRawDealRoomById(dealRoomId);
  if (!raw) {
    return { ok: false, code: "NOT_FOUND", reason: "Deal room not found." };
  }

  const access = enforceDealRoomAccess(session, raw, now);
  if (!access.ok) return access;

  if (access.viewerRole !== "BUYER" && access.viewerRole !== "SELLER") {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Only the Buyer or Seller participant can sign the purchase agreement.",
    };
  }

  const acceptedOffer = raw.offers.find((o) => o.status === "ACCEPTED") ?? null;
  if (!acceptedOffer) {
    return {
      ok: false,
      code: "PREREQUISITE_FAILED",
      reason: "An offer must be accepted before executing the Purchase Agreement.",
    };
  }

  const sigState = extractSignatureStateFromAuditLogs({
    auditLogs: raw.auditLogs,
    ndaSignedAt: raw.ndaSignedAt,
    ndaDocumentId: raw.ndaDocumentId,
    buyerName: raw.buyerName,
    sellerName: raw.sellerName,
    teaserTitle: raw.teaserTitle,
    sector: raw.sector,
    geography: raw.geography,
    legalEntityName: raw.redactedName,
    acceptedOfferLabel: `${acceptedOffer.currency} ${acceptedOffer.amount.toLocaleString("en-IN")}`,
  });

  if (sigState.purchaseAgreement.completed) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "The Purchase Agreement has already been executed by both parties.",
    };
  }
  if (access.viewerRole === "BUYER" && sigState.purchaseAgreement.buyerSigned) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "Buyer signature is already recorded on the Purchase Agreement.",
    };
  }
  if (access.viewerRole === "SELLER" && sigState.purchaseAgreement.sellerSigned) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "Seller counter-signature is already recorded on the Purchase Agreement.",
    };
  }

  const actionName =
    access.viewerRole === "BUYER"
      ? "PURCHASE_AGREEMENT_BUYER_SIGNED"
      : "PURCHASE_AGREEMENT_SELLER_SIGNED";
  const willComplete =
    (access.viewerRole === "BUYER" && sigState.purchaseAgreement.sellerSigned) ||
    (access.viewerRole === "SELLER" && sigState.purchaseAgreement.buyerSigned);

  const buyerVer = await getBuyerVerificationReadiness(raw.buyerUserId, now);

  let docId: string | null = null;
  let storedVault: Awaited<
    ReturnType<typeof storePrivateDocumentAndWatermark>
  > | null = null;

  if (willComplete) {
    docId = `pa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const content = [
      buildPurchaseAgreementTemplateText({
        teaserTitle: raw.teaserTitle,
        legalEntityName: raw.redactedName,
        buyerName: raw.buyerName,
        sellerName: raw.sellerName,
        acceptedOfferLabel: `${acceptedOffer.currency} ${acceptedOffer.amount.toLocaleString("en-IN")}`,
      }),
      "",
      "--- ELECTRONIC EXECUTION RECORD ---",
      `Buyer Signer: ${access.viewerRole === "BUYER" ? input.signerName : sigState.purchaseAgreement.buyerSignerName ?? raw.buyerName}`,
      `Seller Signer: ${access.viewerRole === "SELLER" ? input.signerName : sigState.purchaseAgreement.sellerSignerName ?? raw.sellerName}`,
      `Executed At: ${nowIso}`,
      `Status: EXECUTED (${LEGAL_REVIEW_BADGE})`,
    ].join("\n");

    storedVault = await storePrivateDocumentAndWatermark({
      dealRoomId: raw.id,
      documentId: docId,
      filename: "executed-purchase-agreement.txt",
      mimeType: "text/plain",
      contentBuffer: Buffer.from(content, "utf8"),
      uploaderLabel: session!.name,
      scanStatus: "CLEAN",
    });
  }

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const updated = await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorId: session!.userId,
          dealRoomId: raw.id,
          entityType: "DealRoom",
          entityId: raw.id,
          action: actionName,
          previousState: { purchaseAgreementCompleted: false },
          newState: { signerRole: access.viewerRole, signedAt: nowIso },
          metadataJson: {
            signerName: input.signerName,
            legalNotice: LEGAL_REVIEW_BADGE,
          },
        },
      });

      if (willComplete && storedVault) {
        const doc = await tx.document.create({
          data: {
            dealRoomId: raw.id,
            uploadedById: session!.userId,
            title: `Executed Purchase Agreement (${LEGAL_REVIEW_BADGE})`,
            category: "PURCHASE_AGREEMENT",
            storageKey: storedVault.storageKey,
            watermarkedKey: storedVault.watermarkedKey,
            version: 1,
            virusScanStatus: PrismaVirusScanStatus.CLEAN,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: session!.userId,
            dealRoomId: raw.id,
            entityType: "DealRoom",
            entityId: raw.id,
            action: "PURCHASE_AGREEMENT_COMPLETED",
            previousState: { purchaseAgreementCompleted: false },
            newState: { purchaseAgreementCompleted: true, documentId: doc.id },
            metadataJson: {
              documentId: doc.id,
              legalNotice: LEGAL_REVIEW_BADGE,
            },
          },
        });
      }

      return tx.dealRoom.findUniqueOrThrow({
        where: { id: raw.id },
        include: PRISMA_DEAL_ROOM_INCLUDE,
      });
    });

    publishDealRoomEvent(raw.id, "AGREEMENT_UPDATED");
    return {
      ok: true,
      data: sanitizeDealRoomForViewer(
        mapPrismaDealRoomToRaw(updated),
        access.viewerRole,
        buyerVer
      ),
    };
  }

  raw.updatedAt = nowIso;
  raw.auditLogs.unshift({
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    actorId: session!.userId,
    actorName: session!.name,
    entityType: "DealRoom",
    entityId: raw.id,
    action: actionName,
    previousState: { purchaseAgreementCompleted: false },
    newState: { signerRole: access.viewerRole, signedAt: nowIso },
    metadataJson: {
      signerName: input.signerName,
      legalNotice: LEGAL_REVIEW_BADGE,
    },
    createdAt: nowIso,
  });

  if (willComplete && storedVault && docId) {
    raw.documents.unshift({
      id: docId,
      dealRoomId: raw.id,
      uploadedById: session!.userId,
      uploadedByName: session!.name,
      title: `Executed Purchase Agreement (${LEGAL_REVIEW_BADGE})`,
      category: "PURCHASE_AGREEMENT",
      filename: storedVault.safeFilename,
      mimeType: "text/plain",
      storageKey: storedVault.storageKey,
      watermarkedKey: storedVault.watermarkedKey,
      version: 1,
      virusScanStatus: "CLEAN",
      watermarkNotice: storedVault.watermarkNotice,
      viewCount: 0,
      views: [],
      createdAt: nowIso,
    });
    raw.auditLogs.unshift({
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      actorId: session!.userId,
      actorName: session!.name,
      entityType: "DealRoom",
      entityId: raw.id,
      action: "PURCHASE_AGREEMENT_COMPLETED",
      previousState: { purchaseAgreementCompleted: false },
      newState: { purchaseAgreementCompleted: true, documentId: docId },
      metadataJson: { documentId: docId, legalNotice: LEGAL_REVIEW_BADGE },
      createdAt: nowIso,
    });
  }

  publishDealRoomEvent(raw.id, "AGREEMENT_UPDATED");
  return {
    ok: true,
    data: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
  };
}

export async function postDealRoomMessage(
  dealRoomId: string,
  input: { body: string; parentId?: string | null },
  session: AuthSession | null
): Promise<DealRoomOperationResult<DealRoomView>> {
  const now = new Date();
  const nowIso = now.toISOString();
  const raw = await fetchRawDealRoomById(dealRoomId);
  if (!raw) {
    return { ok: false, code: "NOT_FOUND", reason: "Deal room not found." };
  }

  const access = enforceDealRoomAccess(session, raw, now);
  if (!access.ok) return access;

  if (input.parentId) {
    const parentExists = raw.messages.some((m) => m.id === input.parentId);
    if (!parentExists) {
      return {
        ok: false,
        code: "NOT_FOUND",
        reason: "Parent thread message not found in this deal room.",
      };
    }
  }

  const buyerVer = await getBuyerVerificationReadiness(raw.buyerUserId, now);

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const updated = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          dealRoomId: raw.id,
          senderId: session!.userId,
          parentId: input.parentId ?? null,
          body: input.body.trim(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session!.userId,
          dealRoomId: raw.id,
          entityType: "Message",
          entityId: msg.id,
          action: "MESSAGE_POSTED",
          previousState: Prisma.JsonNull,
          newState: { parentId: msg.parentId },
          metadataJson: {
            preview: msg.body.slice(0, 80),
          },
        },
      });

      return tx.dealRoom.findUniqueOrThrow({
        where: { id: raw.id },
        include: PRISMA_DEAL_ROOM_INCLUDE,
      });
    });

    publishDealRoomEvent(raw.id, "MESSAGE_CREATED");
    return {
      ok: true,
      data: sanitizeDealRoomForViewer(
        mapPrismaDealRoomToRaw(updated),
        access.viewerRole,
        buyerVer
      ),
    };
  }

  const msgId = `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  raw.messages.push({
    id: msgId,
    dealRoomId: raw.id,
    senderId: session!.userId,
    senderName: session!.name,
    senderRoleLabel:
      access.viewerRole === "BUYER"
        ? "Buyer"
        : access.viewerRole === "SELLER"
          ? "Seller"
          : "Reviewer",
    parentId: input.parentId ?? null,
    body: input.body.trim(),
    createdAt: nowIso,
  });
  raw.updatedAt = nowIso;
  raw.auditLogs.unshift({
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    actorId: session!.userId,
    actorName: session!.name,
    entityType: "Message",
    entityId: msgId,
    action: "MESSAGE_POSTED",
    previousState: null,
    newState: { parentId: input.parentId ?? null },
    metadataJson: { preview: input.body.trim().slice(0, 80) },
    createdAt: nowIso,
  });

  publishDealRoomEvent(raw.id, "MESSAGE_CREATED");
  return {
    ok: true,
    data: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
  };
}

export async function uploadDealRoomDocument(
  dealRoomId: string,
  input: {
    title: string;
    category: Exclude<DocumentCategoryValue, "NDA" | "PURCHASE_AGREEMENT">;
    filename: string;
    mimeType: string;
    contentBuffer: Buffer;
  },
  session: AuthSession | null
): Promise<DealRoomOperationResult<DealRoomView>> {
  const now = new Date();
  const nowIso = now.toISOString();
  const raw = await fetchRawDealRoomById(dealRoomId);
  if (!raw) {
    return { ok: false, code: "NOT_FOUND", reason: "Deal room not found." };
  }

  const access = enforceDealRoomAccess(session, raw, now);
  if (!access.ok) return access;

  if (access.viewerRole !== "BUYER" && access.viewerRole !== "SELLER") {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Only Buyer or Seller participants can upload files to the deal room vault.",
    };
  }

  if (raw.currentStage === "INTRO" || raw.currentStage === "NDA") {
    return {
      ok: false,
      code: "INVALID_STAGE",
      reason:
        "Confidential documents can only be uploaded once NDA and verification unlock Data access.",
    };
  }

  const buyerVer = await getBuyerVerificationReadiness(raw.buyerUserId, now);
  if (access.viewerRole === "BUYER" && !buyerVer.dataAccessReady) {
    return {
      ok: false,
      code: "PREREQUISITE_FAILED",
      reason:
        "Active Buyer KYC and Proof of Funds are required to upload documents to the data room.",
    };
  }

  if (input.contentBuffer.byteLength === 0) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "Uploaded document cannot be empty.",
    };
  }
  if (input.contentBuffer.byteLength > 5 * 1024 * 1024) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "Document exceeds maximum 5 MB upload size.",
    };
  }

  const scanResult = scanDocumentContent(input.contentBuffer, input.filename);
  const existingVersions = raw.documents
    .filter(
      (d) =>
        d.title.toLowerCase() === input.title.trim().toLowerCase() &&
        d.category === input.category
    )
    .map((d) => d.version);
  const nextVersion =
    existingVersions.length > 0 ? Math.max(...existingVersions) + 1 : 1;

  const docId = `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const vaultRes = await storePrivateDocumentAndWatermark({
    dealRoomId: raw.id,
    documentId: docId,
    filename: input.filename,
    mimeType: input.mimeType,
    contentBuffer: input.contentBuffer,
    uploaderLabel: session!.name,
    scanStatus: scanResult.status,
  });

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const updated = await prisma.$transaction(async (tx) => {
      const createdDoc = await tx.document.create({
        data: {
          dealRoomId: raw.id,
          uploadedById: session!.userId,
          title: input.title.trim(),
          category: input.category,
          storageKey: vaultRes.storageKey,
          watermarkedKey: vaultRes.watermarkedKey,
          version: nextVersion,
          virusScanStatus: scanResult.status as PrismaVirusScanStatus,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session!.userId,
          dealRoomId: raw.id,
          entityType: "Document",
          entityId: createdDoc.id,
          action:
            scanResult.status === "INFECTED"
              ? "DOCUMENT_SCAN_INFECTED"
              : "DOCUMENT_UPLOADED",
          previousState: Prisma.JsonNull,
          newState: {
            title: createdDoc.title,
            category: createdDoc.category,
            version: nextVersion,
            virusScanStatus: scanResult.status,
          },
          metadataJson: {
            filename: vaultRes.safeFilename,
            scanReason: scanResult.reason,
          },
        },
      });

      return tx.dealRoom.findUniqueOrThrow({
        where: { id: raw.id },
        include: PRISMA_DEAL_ROOM_INCLUDE,
      });
    });

    publishDealRoomEvent(raw.id, "DOCUMENT_CREATED");
    if (scanResult.status === "INFECTED") {
      return {
        ok: false,
        code: "INFECTED",
        reason: scanResult.reason ?? "Uploaded file flagged by virus scanner.",
      };
    }

    return {
      ok: true,
      data: sanitizeDealRoomForViewer(
        mapPrismaDealRoomToRaw(updated),
        access.viewerRole,
        buyerVer
      ),
    };
  }

  raw.documents.unshift({
    id: docId,
    dealRoomId: raw.id,
    uploadedById: session!.userId,
    uploadedByName: session!.name,
    title: input.title.trim(),
    category: input.category,
    filename: vaultRes.safeFilename,
    mimeType: input.mimeType,
    storageKey: vaultRes.storageKey,
    watermarkedKey: vaultRes.watermarkedKey,
    version: nextVersion,
    virusScanStatus: scanResult.status,
    watermarkNotice: vaultRes.watermarkNotice,
    viewCount: 0,
    views: [],
    createdAt: nowIso,
  });
  raw.updatedAt = nowIso;
  raw.auditLogs.unshift({
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    actorId: session!.userId,
    actorName: session!.name,
    entityType: "Document",
    entityId: docId,
    action:
      scanResult.status === "INFECTED"
        ? "DOCUMENT_SCAN_INFECTED"
        : "DOCUMENT_UPLOADED",
    previousState: null,
    newState: {
      title: input.title.trim(),
      category: input.category,
      version: nextVersion,
      virusScanStatus: scanResult.status,
    },
    metadataJson: {
      filename: vaultRes.safeFilename,
      scanReason: scanResult.reason,
    },
    createdAt: nowIso,
  });

  publishDealRoomEvent(raw.id, "DOCUMENT_CREATED");

  if (scanResult.status === "INFECTED") {
    return {
      ok: false,
      code: "INFECTED",
      reason: scanResult.reason ?? "Uploaded file flagged by virus scanner.",
    };
  }

  return {
    ok: true,
    data: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
  };
}

export async function createSignedDocumentDownloadUrl(
  dealRoomId: string,
  documentId: string,
  session: AuthSession | null
): Promise<DealRoomOperationResult<{ signedUrl: string; expiresInSeconds: number }>> {
  const now = new Date();
  const raw = await fetchRawDealRoomById(dealRoomId);
  if (!raw) {
    return { ok: false, code: "NOT_FOUND", reason: "Deal room not found." };
  }

  const access = enforceDealRoomAccess(session, raw, now);
  if (!access.ok) return access;

  const doc = raw.documents.find((d) => d.id === documentId);
  if (!doc) {
    return { ok: false, code: "NOT_FOUND", reason: "Document not found." };
  }

  if (doc.virusScanStatus !== "CLEAN") {
    return {
      ok: false,
      code: "INFECTED",
      reason: "This document did not pass virus scanning and cannot be downloaded.",
    };
  }

  if (doc.category !== "NDA") {
    const buyerVer = await getBuyerVerificationReadiness(raw.buyerUserId, now);
    const dataAccessReached =
      raw.currentStage !== "INTRO" && raw.currentStage !== "NDA";
    if (
      access.viewerRole === "BUYER" &&
      (!raw.ndaSignedAt || !dataAccessReached || !buyerVer.dataAccessReady)
    ) {
      return {
        ok: false,
        code: "PREREQUISITE_FAILED",
        reason:
          "Active KYC, Proof of Funds, executed NDA, and Data access stage are required to download confidential documents.",
      };
    }
  }

  const expiresInSeconds = 300;
  const token = await signDocumentDownloadToken(
    {
      dealRoomId: raw.id,
      documentId: doc.id,
      viewerId: session!.userId,
    },
    expiresInSeconds
  );

  return {
    ok: true,
    data: {
      signedUrl: `/api/deal-rooms/${raw.id}/documents/${doc.id}/download?token=${encodeURIComponent(token)}`,
      expiresInSeconds,
    },
  };
}

export async function downloadWatermarkedDocument(params: {
  dealRoomId: string;
  documentId: string;
  token: string;
  session: AuthSession | null;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<
  DealRoomOperationResult<{
    bytes: Buffer;
    filename: string;
    mimeType: string;
    watermarkNotice: string;
  }>
> {
  const now = new Date();
  const nowIso = now.toISOString();

  const verifiedToken = await verifyDocumentDownloadToken(params.token);
  if (
    !verifiedToken ||
    verifiedToken.dealRoomId !== params.dealRoomId ||
    verifiedToken.documentId !== params.documentId
  ) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Invalid or expired signed document download URL.",
    };
  }

  const raw = await fetchRawDealRoomById(params.dealRoomId);
  if (!raw) {
    return { ok: false, code: "NOT_FOUND", reason: "Deal room not found." };
  }

  const access = enforceDealRoomAccess(params.session, raw, now);
  if (!access.ok) return access;

  if (verifiedToken.viewerId !== params.session!.userId) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Signed document token belongs to a different user session.",
    };
  }

  const doc = raw.documents.find((d) => d.id === params.documentId);
  if (!doc) {
    return { ok: false, code: "NOT_FOUND", reason: "Document not found." };
  }

  if (doc.virusScanStatus !== "CLEAN") {
    return {
      ok: false,
      code: "INFECTED",
      reason: "Infected or unscanned documents cannot be downloaded.",
    };
  }

  if (doc.category !== "NDA") {
    const buyerVer = await getBuyerVerificationReadiness(raw.buyerUserId, now);
    const dataAccessReached =
      raw.currentStage !== "INTRO" && raw.currentStage !== "NDA";
    if (
      access.viewerRole === "BUYER" &&
      (!raw.ndaSignedAt || !dataAccessReached || !buyerVer.dataAccessReady)
    ) {
      return {
        ok: false,
        code: "PREREQUISITE_FAILED",
        reason: "Data access prerequisites are no longer satisfied.",
      };
    }
  }

  const bytes = await readPrivateDocumentBytes({
    storageKey: doc.storageKey,
    watermarkedKey: doc.watermarkedKey,
    fallbackText: `${doc.watermarkNotice}\n\nDocument: ${doc.title} (v${doc.version})`,
  });

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    await prisma.$transaction(async (tx) => {
      const view = await tx.documentView.create({
        data: {
          documentId: doc.id,
          viewerId: params.session!.userId,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: params.session!.userId,
          dealRoomId: raw.id,
          entityType: "DocumentView",
          entityId: view.id,
          action: "DOCUMENT_VIEWED",
          previousState: Prisma.JsonNull,
          newState: {
            documentId: doc.id,
            title: doc.title,
            version: doc.version,
          },
          metadataJson: {
            viewerName: params.session!.name,
            ipAddress: params.ipAddress,
          },
        },
      });
    });
  } else {
    const viewId = `dview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    doc.views.unshift({
      id: viewId,
      viewerId: params.session!.userId,
      viewerName: params.session!.name,
      viewedAt: nowIso,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
    doc.viewCount = doc.views.length;
    raw.auditLogs.unshift({
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      actorId: params.session!.userId,
      actorName: params.session!.name,
      entityType: "DocumentView",
      entityId: viewId,
      action: "DOCUMENT_VIEWED",
      previousState: null,
      newState: {
        documentId: doc.id,
        title: doc.title,
        version: doc.version,
      },
      metadataJson: {
        viewerName: params.session!.name,
        ipAddress: params.ipAddress,
      },
      createdAt: nowIso,
    });
  }

  publishDealRoomEvent(raw.id, "DOCUMENT_VIEWED");

  return {
    ok: true,
    data: {
      bytes,
      filename: doc.filename,
      mimeType: doc.mimeType,
      watermarkNotice: `${doc.watermarkNotice} — Viewed by ${params.session!.name}`,
    },
  };
}

export async function handleDealRoomOfferAction(
  dealRoomId: string,
  input: OfferActionInput,
  session: AuthSession | null
): Promise<DealRoomOperationResult<DealRoomView>> {
  const now = new Date();
  const nowIso = now.toISOString();
  const raw = await fetchRawDealRoomById(dealRoomId);
  if (!raw) {
    return { ok: false, code: "NOT_FOUND", reason: "Deal room not found." };
  }

  const access = enforceDealRoomAccess(session, raw, now);
  if (!access.ok) return access;

  const validation = validateOfferAction({
    input,
    actorId: session!.userId,
    actorRole: access.viewerRole,
    currentStage: raw.currentStage,
    existingOffers: raw.offers,
  });

  if (!validation.ok) {
    return {
      ok: false,
      code: validation.code,
      reason: validation.reason,
    };
  }

  const buyerVer = await getBuyerVerificationReadiness(raw.buyerUserId, now);

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const updated = await prisma.$transaction(async (tx) => {
      if (input.action === "PROPOSE") {
        const created = await tx.offer.create({
          data: {
            dealRoomId: raw.id,
            proposerId: session!.userId,
            amount: input.amount,
            currency: input.currency as PrismaCurrencyCode,
            termsSummary: input.termsSummary.trim(),
            status: PrismaOfferStatus.PROPOSED,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: session!.userId,
            dealRoomId: raw.id,
            entityType: "Offer",
            entityId: created.id,
            action: "OFFER_PROPOSED",
            previousState: Prisma.JsonNull,
            newState: {
              amount: input.amount,
              currency: input.currency,
              status: "PROPOSED",
            },
            metadataJson: { termsSummary: input.termsSummary.trim() },
          },
        });
      } else if (input.action === "COUNTER") {
        await tx.offer.update({
          where: { id: input.offerId },
          data: { status: PrismaOfferStatus.COUNTERED },
        });
        const counter = await tx.offer.create({
          data: {
            dealRoomId: raw.id,
            proposerId: session!.userId,
            amount: input.amount,
            currency: input.currency as PrismaCurrencyCode,
            termsSummary: input.termsSummary.trim(),
            status: PrismaOfferStatus.PROPOSED,
            parentOfferId: input.offerId,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: session!.userId,
            dealRoomId: raw.id,
            entityType: "Offer",
            entityId: counter.id,
            action: "OFFER_COUNTERED",
            previousState: { parentOfferId: input.offerId, status: "PROPOSED" },
            newState: {
              amount: input.amount,
              currency: input.currency,
              status: "PROPOSED",
            },
            metadataJson: { termsSummary: input.termsSummary.trim() },
          },
        });
      } else {
        const nextStatus =
          input.action === "ACCEPT"
            ? PrismaOfferStatus.ACCEPTED
            : input.action === "DECLINE"
              ? PrismaOfferStatus.DECLINED
              : PrismaOfferStatus.WITHDRAWN;
        const actionAudit =
          input.action === "ACCEPT"
            ? "OFFER_ACCEPTED"
            : input.action === "DECLINE"
              ? "OFFER_DECLINED"
              : "OFFER_WITHDRAWN";

        await tx.offer.update({
          where: { id: input.offerId },
          data: { status: nextStatus },
        });

        await tx.auditLog.create({
          data: {
            actorId: session!.userId,
            dealRoomId: raw.id,
            entityType: "Offer",
            entityId: input.offerId,
            action: actionAudit,
            previousState: { status: "PROPOSED" },
            newState: { status: nextStatus },
            metadataJson: {
              amount: validation.targetOffer?.amount ?? null,
              currency: validation.targetOffer?.currency ?? null,
            },
          },
        });
      }

      return tx.dealRoom.findUniqueOrThrow({
        where: { id: raw.id },
        include: PRISMA_DEAL_ROOM_INCLUDE,
      });
    });

    publishDealRoomEvent(raw.id, "OFFER_UPDATED");
    return {
      ok: true,
      data: sanitizeDealRoomForViewer(
        mapPrismaDealRoomToRaw(updated),
        access.viewerRole,
        buyerVer
      ),
    };
  }

  // Local-dev store
  const proposerRole: "BUYER" | "SELLER" =
    session!.userId === raw.sellerUserId ? "SELLER" : "BUYER";

  if (input.action === "PROPOSE") {
    const offerId = `offer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    raw.offers.unshift({
      id: offerId,
      dealRoomId: raw.id,
      proposerId: session!.userId,
      proposerName: session!.name,
      proposerRole,
      amount: input.amount,
      currency: input.currency,
      termsSummary: input.termsSummary.trim(),
      status: "PROPOSED",
      parentOfferId: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    raw.auditLogs.unshift({
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      actorId: session!.userId,
      actorName: session!.name,
      entityType: "Offer",
      entityId: offerId,
      action: "OFFER_PROPOSED",
      previousState: null,
      newState: {
        amount: input.amount,
        currency: input.currency,
        status: "PROPOSED",
      },
      metadataJson: { termsSummary: input.termsSummary.trim() },
      createdAt: nowIso,
    });
  } else if (input.action === "COUNTER") {
    const parent = raw.offers.find((o) => o.id === input.offerId);
    if (parent) {
      parent.status = "COUNTERED";
      parent.updatedAt = nowIso;
    }
    const counterId = `offer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    raw.offers.unshift({
      id: counterId,
      dealRoomId: raw.id,
      proposerId: session!.userId,
      proposerName: session!.name,
      proposerRole,
      amount: input.amount,
      currency: input.currency,
      termsSummary: input.termsSummary.trim(),
      status: "PROPOSED",
      parentOfferId: input.offerId,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    raw.auditLogs.unshift({
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      actorId: session!.userId,
      actorName: session!.name,
      entityType: "Offer",
      entityId: counterId,
      action: "OFFER_COUNTERED",
      previousState: { parentOfferId: input.offerId, status: "PROPOSED" },
      newState: {
        amount: input.amount,
        currency: input.currency,
        status: "PROPOSED",
      },
      metadataJson: { termsSummary: input.termsSummary.trim() },
      createdAt: nowIso,
    });
  } else {
    const target = raw.offers.find((o) => o.id === input.offerId);
    const nextStatus =
      input.action === "ACCEPT"
        ? "ACCEPTED"
        : input.action === "DECLINE"
          ? "DECLINED"
          : "WITHDRAWN";
    const actionAudit =
      input.action === "ACCEPT"
        ? "OFFER_ACCEPTED"
        : input.action === "DECLINE"
          ? "OFFER_DECLINED"
          : "OFFER_WITHDRAWN";
    if (target) {
      target.status = nextStatus;
      target.updatedAt = nowIso;
    }
    raw.auditLogs.unshift({
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      actorId: session!.userId,
      actorName: session!.name,
      entityType: "Offer",
      entityId: input.offerId,
      action: actionAudit,
      previousState: { status: "PROPOSED" },
      newState: { status: nextStatus },
      metadataJson: {
        amount: validation.targetOffer?.amount ?? null,
        currency: validation.targetOffer?.currency ?? null,
      },
      createdAt: nowIso,
    });
  }

  raw.updatedAt = nowIso;
  publishDealRoomEvent(raw.id, "OFFER_UPDATED");
  return {
    ok: true,
    data: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
  };
}

export async function updateDealRoomChecklistItem(
  dealRoomId: string,
  input: { itemId: string; action: "CONFIRM" | "SET_IN_PROGRESS" | "REOPEN" },
  session: AuthSession | null
): Promise<DealRoomOperationResult<DealRoomView>> {
  const now = new Date();
  const nowIso = now.toISOString();
  const raw = await fetchRawDealRoomById(dealRoomId);
  if (!raw) {
    return { ok: false, code: "NOT_FOUND", reason: "Deal room not found." };
  }

  const access = enforceDealRoomAccess(session, raw, now);
  if (!access.ok) return access;

  if (raw.status !== "ACTIVE") {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: `Checklist confirmations are paused while the deal room status is ${raw.status.toLowerCase()}.`,
    };
  }

  const item = raw.checklistItems.find((c) => c.id === input.itemId);
  if (!item) {
    return {
      ok: false,
      code: "NOT_FOUND",
      reason: "Checklist item not found in this deal room.",
    };
  }

  if (item.phase === "TRANSFER" && raw.currentStage !== "TRANSFER") {
    return {
      ok: false,
      code: "INVALID_STAGE",
      reason: "Transfer checklist items can only be confirmed once the deal room reaches the Transfer stage.",
    };
  }

  if (access.viewerRole !== "BUYER" && access.viewerRole !== "SELLER") {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Only Buyer or Seller participants can update checklist confirmations.",
    };
  }

  let nextBuyerAt = item.buyerConfirmedAt;
  let nextSellerAt = item.sellerConfirmedAt;
  let nextStatus = item.status;

  if (input.action === "CONFIRM") {
    if (access.viewerRole === "BUYER") nextBuyerAt = nowIso;
    if (access.viewerRole === "SELLER") nextSellerAt = nowIso;
    nextStatus =
      nextBuyerAt && nextSellerAt
        ? "CONFIRMED"
        : "IN_PROGRESS";
  } else if (input.action === "SET_IN_PROGRESS") {
    nextStatus = "IN_PROGRESS";
  } else {
    if (access.viewerRole === "BUYER") nextBuyerAt = null;
    if (access.viewerRole === "SELLER") nextSellerAt = null;
    nextStatus = nextBuyerAt || nextSellerAt ? "IN_PROGRESS" : "OPEN";
  }

  const buyerVer = await getBuyerVerificationReadiness(raw.buyerUserId, now);

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const updated = await prisma.$transaction(async (tx) => {
      await tx.checklistItem.update({
        where: { id: item.id },
        data: {
          buyerConfirmedAt: nextBuyerAt ? new Date(nextBuyerAt) : null,
          sellerConfirmedAt: nextSellerAt ? new Date(nextSellerAt) : null,
          status: nextStatus as PrismaChecklistStatus,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session!.userId,
          dealRoomId: raw.id,
          entityType: "ChecklistItem",
          entityId: item.id,
          action: "CHECKLIST_ITEM_UPDATED",
          previousState: { status: item.status },
          newState: { status: nextStatus },
          metadataJson: {
            title: item.title,
            actorRole: access.viewerRole,
            action: input.action,
          },
        },
      });

      return tx.dealRoom.findUniqueOrThrow({
        where: { id: raw.id },
        include: PRISMA_DEAL_ROOM_INCLUDE,
      });
    });

    publishDealRoomEvent(raw.id, "CHECKLIST_UPDATED");
    return {
      ok: true,
      data: sanitizeDealRoomForViewer(
        mapPrismaDealRoomToRaw(updated),
        access.viewerRole,
        buyerVer
      ),
    };
  }

  const prevStatus = item.status;
  item.buyerConfirmedAt = nextBuyerAt;
  item.sellerConfirmedAt = nextSellerAt;
  item.status = nextStatus;
  item.updatedAt = nowIso;
  raw.updatedAt = nowIso;
  raw.auditLogs.unshift({
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    actorId: session!.userId,
    actorName: session!.name,
    entityType: "ChecklistItem",
    entityId: item.id,
    action: "CHECKLIST_ITEM_UPDATED",
    previousState: { status: prevStatus },
    newState: { status: nextStatus },
    metadataJson: {
      title: item.title,
      actorRole: access.viewerRole,
      action: input.action,
    },
    createdAt: nowIso,
  });

  publishDealRoomEvent(raw.id, "CHECKLIST_UPDATED");
  return {
    ok: true,
    data: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
  };
}

function buildAdminDisputeViewFromRaw(raw: RawDealRoomRecord): AdminDisputeView | null {
  const disputeEscrow =
    raw.escrowTransactions.find((e) => e.status === "DISPUTED") ??
    raw.escrowTransactions.find(
      (e) =>
        e.disputeReason !== null ||
        e.status === "REFUNDED" ||
        raw.auditLogs.some((a) => a.action === "DISPUTE_RESOLVED")
    ) ??
    null;

  if (!disputeEscrow) {
    return null;
  }

  const transferItems = raw.checklistItems.filter((c) => c.phase === "TRANSFER");
  const transferConfirmedCount = transferItems.filter(
    (c) => c.status === "CONFIRMED" && c.buyerConfirmedAt && c.sellerConfirmedAt
  ).length;

  const resolvedAudit = raw.auditLogs.find((a) => a.action === "DISPUTE_RESOLVED");
  const resolutionNote =
    resolvedAudit?.metadataJson &&
    typeof resolvedAudit.metadataJson.resolutionNote === "string"
      ? resolvedAudit.metadataJson.resolutionNote
      : null;

  return {
    dealRoomId: raw.id,
    businessId: raw.businessId,
    businessSlug: raw.businessSlug,
    teaserTitle: raw.teaserTitle,
    sector: raw.sector,
    geography: raw.geography,
    isSampleData: raw.isSampleData,
    buyerUserId: raw.buyerUserId,
    buyerName: raw.buyerName,
    sellerUserId: raw.sellerUserId,
    sellerName: raw.sellerName,
    currentStage: raw.currentStage,
    roomStatus: raw.status,
    transferConfirmedCount,
    transferTotalCount: transferItems.length,
    escrow: disputeEscrow,
    resolutionNote,
    resolvedAt: resolvedAudit ? resolvedAudit.createdAt : null,
    updatedAt: raw.updatedAt,
  };
}

export async function handleDealRoomEscrowAction(
  dealRoomId: string,
  input: EscrowActionInput,
  session: AuthSession | null
): Promise<DealRoomOperationResult<DealRoomView>> {
  const now = new Date();
  const nowIso = now.toISOString();
  const raw = await fetchRawDealRoomById(dealRoomId);
  if (!raw) {
    return { ok: false, code: "NOT_FOUND", reason: "Deal room not found." };
  }

  const access = enforceDealRoomAccess(session, raw, now);
  if (!access.ok) return access;

  const acceptedOffer = raw.offers.find((o) => o.status === "ACCEPTED") ?? null;

  const validation = validateEscrowAction({
    input,
    actorRole: access.viewerRole,
    roomStatus: raw.status,
    currentStage: raw.currentStage,
    acceptedOffer,
    existingEscrows: raw.escrowTransactions,
    checklistItems: raw.checklistItems,
  });

  if (!validation.ok) {
    return {
      ok: false,
      code: validation.code,
      reason: validation.reason,
    };
  }

  const buyerVer = await getBuyerVerificationReadiness(raw.buyerUserId, now);
  const counterpartyId =
    access.viewerRole === "BUYER" ? raw.sellerUserId : raw.buyerUserId;

  if (input.action === "INITIATE") {
    const amount = input.amount ?? acceptedOffer!.amount;
    const currency = input.currency ?? acceptedOffer!.currency;

    let buyerEmail = `${raw.buyerUserId}@trustmarketplace.local`;
    let sellerEmail = `${raw.sellerUserId}@trustmarketplace.local`;
    if (isDatabaseConfigured()) {
      const prisma = getPrismaClient();
      const users = await prisma.user.findMany({
        where: { id: { in: [raw.buyerUserId, raw.sellerUserId] } },
        select: { id: true, email: true },
      });
      buyerEmail = users.find((u) => u.id === raw.buyerUserId)?.email ?? buyerEmail;
      sellerEmail = users.find((u) => u.id === raw.sellerUserId)?.email ?? sellerEmail;
    }

    const adapterRes = await initiateThirdPartyEscrow({
      provider: input.provider,
      dealRoomId: raw.id,
      amount,
      currency,
      buyerEmail,
      sellerEmail,
      businessTitle: raw.teaserTitle,
    });
    if (!adapterRes.ok) {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: adapterRes.reason,
      };
    }

    if (isDatabaseConfigured()) {
      const prisma = getPrismaClient();
      const updated = await prisma.$transaction(async (tx) => {
        const created = await tx.escrowTransaction.create({
          data: {
            dealRoomId: raw.id,
            provider: adapterRes.provider,
            externalRef: adapterRes.externalRef,
            amount,
            currency: currency as PrismaCurrencyCode,
            status: PrismaEscrowStatus.INITIATED,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: session!.userId,
            dealRoomId: raw.id,
            entityType: "EscrowTransaction",
            entityId: created.id,
            action: "ESCROW_INITIATED",
            previousState: Prisma.JsonNull,
            newState: {
              provider: adapterRes.provider,
              externalRef: adapterRes.externalRef,
              amount,
              currency,
              status: "INITIATED",
            },
            metadataJson: {
              adapterMode: adapterRes.adapterMode,
              platformHoldsFunds: false,
            },
          },
        });

        await tx.notification.create({
          data: {
            userId: counterpartyId,
            type: "ESCROW_INITIATED",
            title: `Third-party escrow initiated (${adapterRes.provider})`,
            body: `Escrow reference ${adapterRes.externalRef} created for ${currency} ${amount.toLocaleString("en-IN")}.`,
            actionUrl: `/deals/${raw.id}`,
          },
        });

        return tx.dealRoom.findUniqueOrThrow({
          where: { id: raw.id },
          include: PRISMA_DEAL_ROOM_INCLUDE,
        });
      });

      publishDealRoomEvent(raw.id, "ESCROW_UPDATED");
      return {
        ok: true,
        data: sanitizeDealRoomForViewer(
          mapPrismaDealRoomToRaw(updated),
          access.viewerRole,
          buyerVer
        ),
      };
    }

    const escrowId = `esc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    raw.escrowTransactions.unshift({
      id: escrowId,
      dealRoomId: raw.id,
      provider: adapterRes.provider,
      externalRef: adapterRes.externalRef,
      amount,
      currency,
      status: "INITIATED",
      fundedAt: null,
      releasedAt: null,
      disputeReason: null,
      platformHoldsFunds: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    raw.updatedAt = nowIso;
    raw.auditLogs.unshift({
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      actorId: session!.userId,
      actorName: session!.name,
      entityType: "EscrowTransaction",
      entityId: escrowId,
      action: "ESCROW_INITIATED",
      previousState: null,
      newState: {
        provider: adapterRes.provider,
        externalRef: adapterRes.externalRef,
        amount,
        currency,
        status: "INITIATED",
      },
      metadataJson: {
        adapterMode: adapterRes.adapterMode,
        platformHoldsFunds: false,
      },
      createdAt: nowIso,
    });

    publishDealRoomEvent(raw.id, "ESCROW_UPDATED");
    return {
      ok: true,
      data: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
    };
  }

  const target = validation.targetEscrow!;
  const providerName: EscrowProviderName =
    target.provider === "Castler Escrow" ? "Castler Escrow" : "Escrow.com";

  if (input.action === "FUND") {
    const adapterRes = await confirmThirdPartyEscrowFunding({
      provider: providerName,
      externalRef: target.externalRef,
      fundingReference: input.fundingReference,
    });
    if (!adapterRes.ok) {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: adapterRes.reason,
      };
    }

    if (isDatabaseConfigured()) {
      const prisma = getPrismaClient();
      const updated = await prisma.$transaction(async (tx) => {
        await tx.escrowTransaction.update({
          where: { id: target.id },
          data: {
            status: PrismaEscrowStatus.FUNDED,
            fundedAt: now,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: session!.userId,
            dealRoomId: raw.id,
            entityType: "EscrowTransaction",
            entityId: target.id,
            action: "ESCROW_FUNDED",
            previousState: { status: target.status },
            newState: { status: "FUNDED", fundedAt: nowIso },
            metadataJson: {
              provider: target.provider,
              externalRef: target.externalRef,
              providerConfirmationId: adapterRes.providerConfirmationId,
              platformHoldsFunds: false,
            },
          },
        });

        await tx.notification.create({
          data: {
            userId: raw.sellerUserId,
            type: "ESCROW_FUNDED",
            title: `Third-party escrow funded (${target.externalRef})`,
            body: `${target.provider} confirmed funding. You can now advance to the Transfer stage.`,
            actionUrl: `/deals/${raw.id}`,
          },
        });

        return tx.dealRoom.findUniqueOrThrow({
          where: { id: raw.id },
          include: PRISMA_DEAL_ROOM_INCLUDE,
        });
      });

      publishDealRoomEvent(raw.id, "ESCROW_UPDATED");
      return {
        ok: true,
        data: sanitizeDealRoomForViewer(
          mapPrismaDealRoomToRaw(updated),
          access.viewerRole,
          buyerVer
        ),
      };
    }

    const prevStatus = target.status;
    target.status = "FUNDED";
    target.fundedAt = nowIso;
    target.updatedAt = nowIso;
    raw.updatedAt = nowIso;
    raw.auditLogs.unshift({
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      actorId: session!.userId,
      actorName: session!.name,
      entityType: "EscrowTransaction",
      entityId: target.id,
      action: "ESCROW_FUNDED",
      previousState: { status: prevStatus },
      newState: { status: "FUNDED", fundedAt: nowIso },
      metadataJson: {
        provider: target.provider,
        externalRef: target.externalRef,
        providerConfirmationId: adapterRes.providerConfirmationId,
        platformHoldsFunds: false,
      },
      createdAt: nowIso,
    });

    publishDealRoomEvent(raw.id, "ESCROW_UPDATED");
    return {
      ok: true,
      data: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
    };
  }

  if (input.action === "START_REVIEW") {
    await transitionThirdPartyEscrowReview({
      provider: providerName,
      externalRef: target.externalRef,
    });

    if (isDatabaseConfigured()) {
      const prisma = getPrismaClient();
      const updated = await prisma.$transaction(async (tx) => {
        await tx.escrowTransaction.update({
          where: { id: target.id },
          data: { status: PrismaEscrowStatus.IN_REVIEW },
        });

        await tx.auditLog.create({
          data: {
            actorId: session!.userId,
            dealRoomId: raw.id,
            entityType: "EscrowTransaction",
            entityId: target.id,
            action: "ESCROW_IN_REVIEW",
            previousState: { status: target.status },
            newState: { status: "IN_REVIEW" },
            metadataJson: {
              provider: target.provider,
              externalRef: target.externalRef,
            },
          },
        });

        return tx.dealRoom.findUniqueOrThrow({
          where: { id: raw.id },
          include: PRISMA_DEAL_ROOM_INCLUDE,
        });
      });

      publishDealRoomEvent(raw.id, "ESCROW_UPDATED");
      return {
        ok: true,
        data: sanitizeDealRoomForViewer(
          mapPrismaDealRoomToRaw(updated),
          access.viewerRole,
          buyerVer
        ),
      };
    }

    const prevStatus = target.status;
    target.status = "IN_REVIEW";
    target.updatedAt = nowIso;
    raw.updatedAt = nowIso;
    raw.auditLogs.unshift({
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      actorId: session!.userId,
      actorName: session!.name,
      entityType: "EscrowTransaction",
      entityId: target.id,
      action: "ESCROW_IN_REVIEW",
      previousState: { status: prevStatus },
      newState: { status: "IN_REVIEW" },
      metadataJson: {
        provider: target.provider,
        externalRef: target.externalRef,
      },
      createdAt: nowIso,
    });

    publishDealRoomEvent(raw.id, "ESCROW_UPDATED");
    return {
      ok: true,
      data: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
    };
  }

  if (input.action === "RELEASE") {
    const adapterRes = await releaseThirdPartyEscrowFunds({
      provider: providerName,
      externalRef: target.externalRef,
    });

    if (isDatabaseConfigured()) {
      const prisma = getPrismaClient();
      const updated = await prisma.$transaction(async (tx) => {
        await tx.escrowTransaction.update({
          where: { id: target.id },
          data: {
            status: PrismaEscrowStatus.RELEASED,
            releasedAt: now,
          },
        });

        await tx.dealStage.updateMany({
          where: { dealRoomId: raw.id, stage: PrismaDealStageType.TRANSFER },
          data: {
            status: PrismaStageStatus.COMPLETED,
            completedAt: now,
          },
        });

        await tx.dealRoom.update({
          where: { id: raw.id },
          data: { status: PrismaDealRoomStatus.COMPLETED },
        });

        await tx.auditLog.create({
          data: {
            actorId: session!.userId,
            dealRoomId: raw.id,
            entityType: "EscrowTransaction",
            entityId: target.id,
            action: "ESCROW_RELEASED",
            previousState: { status: target.status, roomStatus: raw.status },
            newState: {
              status: "RELEASED",
              releasedAt: nowIso,
              roomStatus: "COMPLETED",
            },
            metadataJson: {
              provider: target.provider,
              externalRef: target.externalRef,
              settlementRef: adapterRes.settlementRef,
              platformHoldsFunds: false,
            },
          },
        });

        await tx.notification.create({
          data: {
            userId: raw.sellerUserId,
            type: "ESCROW_RELEASED",
            title: `Escrow released (${target.externalRef})`,
            body: `${target.provider} released funds after two-sided Transfer checklist completion.`,
            actionUrl: `/deals/${raw.id}`,
          },
        });

        return tx.dealRoom.findUniqueOrThrow({
          where: { id: raw.id },
          include: PRISMA_DEAL_ROOM_INCLUDE,
        });
      });

      publishDealRoomEvent(raw.id, "ESCROW_RELEASED");
      return {
        ok: true,
        data: sanitizeDealRoomForViewer(
          mapPrismaDealRoomToRaw(updated),
          access.viewerRole,
          buyerVer
        ),
      };
    }

    const prevStatus = target.status;
    target.status = "RELEASED";
    target.releasedAt = nowIso;
    target.updatedAt = nowIso;
    raw.status = "COMPLETED";
    raw.updatedAt = nowIso;
    raw.stages = raw.stages.map((s) =>
      s.stage === "TRANSFER"
        ? {
            ...s,
            status: "COMPLETED",
            completedAt: nowIso,
            updatedAt: nowIso,
          }
        : s
    );
    raw.auditLogs.unshift({
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      actorId: session!.userId,
      actorName: session!.name,
      entityType: "EscrowTransaction",
      entityId: target.id,
      action: "ESCROW_RELEASED",
      previousState: { status: prevStatus, roomStatus: "ACTIVE" },
      newState: {
        status: "RELEASED",
        releasedAt: nowIso,
        roomStatus: "COMPLETED",
      },
      metadataJson: {
        provider: target.provider,
        externalRef: target.externalRef,
        settlementRef: adapterRes.settlementRef,
        platformHoldsFunds: false,
      },
      createdAt: nowIso,
    });

    publishDealRoomEvent(raw.id, "ESCROW_RELEASED");
    return {
      ok: true,
      data: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
    };
  }

  // DISPUTE
  const trimmedReason = input.disputeReason.trim();
  const adapterRes = await flagThirdPartyEscrowDispute({
    provider: providerName,
    externalRef: target.externalRef,
    disputeReason: trimmedReason,
  });

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const updated = await prisma.$transaction(async (tx) => {
      await tx.escrowTransaction.update({
        where: { id: target.id },
        data: {
          status: PrismaEscrowStatus.DISPUTED,
          disputeReason: trimmedReason,
        },
      });

      await tx.dealRoom.update({
        where: { id: raw.id },
        data: { status: PrismaDealRoomStatus.DISPUTED },
      });

      await tx.dealStage.updateMany({
        where: {
          dealRoomId: raw.id,
          stage: raw.currentStage as PrismaDealStageType,
        },
        data: { status: PrismaStageStatus.BLOCKED },
      });

      await tx.auditLog.create({
        data: {
          actorId: session!.userId,
          dealRoomId: raw.id,
          entityType: "EscrowTransaction",
          entityId: target.id,
          action: "ESCROW_DISPUTED",
          previousState: { status: target.status, roomStatus: raw.status },
          newState: { status: "DISPUTED", roomStatus: "DISPUTED" },
          metadataJson: {
            disputeReason: trimmedReason,
            holdRef: adapterRes.holdRef,
            raisedByRole: access.viewerRole,
          },
        },
      });

      await tx.notification.create({
        data: {
          userId: counterpartyId,
          type: "ESCROW_DISPUTED",
          title: `Escrow dispute flagged on ${raw.teaserTitle}`,
          body: `${session!.name} raised a dispute (${target.externalRef}): ${trimmedReason}`,
          actionUrl: `/deals/${raw.id}`,
        },
      });

      return tx.dealRoom.findUniqueOrThrow({
        where: { id: raw.id },
        include: PRISMA_DEAL_ROOM_INCLUDE,
      });
    });

    publishDealRoomEvent(raw.id, "ESCROW_DISPUTED");
    return {
      ok: true,
      data: sanitizeDealRoomForViewer(
        mapPrismaDealRoomToRaw(updated),
        access.viewerRole,
        buyerVer
      ),
    };
  }

  const prevStatus = target.status;
  target.status = "DISPUTED";
  target.disputeReason = trimmedReason;
  target.updatedAt = nowIso;
  raw.status = "DISPUTED";
  raw.updatedAt = nowIso;
  raw.stages = raw.stages.map((s) =>
    s.stage === raw.currentStage
      ? { ...s, status: "BLOCKED", updatedAt: nowIso }
      : s
  );
  raw.auditLogs.unshift({
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    actorId: session!.userId,
    actorName: session!.name,
    entityType: "EscrowTransaction",
    entityId: target.id,
    action: "ESCROW_DISPUTED",
    previousState: { status: prevStatus, roomStatus: "ACTIVE" },
    newState: { status: "DISPUTED", roomStatus: "DISPUTED" },
    metadataJson: {
      disputeReason: trimmedReason,
      holdRef: adapterRes.holdRef,
      raisedByRole: access.viewerRole,
    },
    createdAt: nowIso,
  });

  publishDealRoomEvent(raw.id, "ESCROW_DISPUTED");
  return {
    ok: true,
    data: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
  };
}

export async function listDisputedDealRoomsForAdmin(
  session: AuthSession | null
): Promise<DealRoomOperationResult<AdminDisputeView[]>> {
  const perm = canReviewAdminQueue(session);
  if (!perm.allowed) {
    return {
      ok: false,
      code: perm.code,
      reason: perm.reason,
    };
  }

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const rows = await prisma.dealRoom.findMany({
      where: {
        OR: [
          { status: PrismaDealRoomStatus.DISPUTED },
          {
            escrowTransactions: {
              some: {
                OR: [
                  { status: PrismaEscrowStatus.DISPUTED },
                  { status: PrismaEscrowStatus.REFUNDED },
                  { disputeReason: { not: null } },
                ],
              },
            },
          },
          {
            auditLogs: {
              some: { action: "DISPUTE_RESOLVED" },
            },
          },
        ],
      },
      include: PRISMA_DEAL_ROOM_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });

    const disputes = rows
      .map((r) => buildAdminDisputeViewFromRaw(mapPrismaDealRoomToRaw(r)))
      .filter((d): d is AdminDisputeView => d !== null);

    return { ok: true, data: disputes };
  }

  const disputes = getLocalDealRoomsStore()
    .map((r) => buildAdminDisputeViewFromRaw(r))
    .filter((d): d is AdminDisputeView => d !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return { ok: true, data: disputes };
}

export async function resolveDealRoomDisputeAsAdmin(
  dealRoomId: string,
  input: { decision: AdminDisputeDecision; resolutionNote: string },
  session: AuthSession | null
): Promise<
  DealRoomOperationResult<{ dispute: AdminDisputeView; dealRoom: DealRoomView }>
> {
  const now = new Date();
  const nowIso = now.toISOString();

  const perm = canReviewAdminQueue(session);
  if (!perm.allowed) {
    return { ok: false, code: perm.code, reason: perm.reason };
  }

  const raw = await fetchRawDealRoomById(dealRoomId);
  if (!raw) {
    return { ok: false, code: "NOT_FOUND", reason: "Deal room not found." };
  }

  // Mandatory 2FA check on deal room writes even for Reviewers/Admins
  const access = enforceDealRoomAccess(session, raw, now);
  if (!access.ok) return access;

  if (raw.status !== "DISPUTED") {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "This deal room does not currently have an open dispute.",
    };
  }

  const disputedEscrow = raw.escrowTransactions.find(
    (e) => e.status === "DISPUTED"
  );
  if (!disputedEscrow) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "No disputed escrow transaction found in this deal room.",
    };
  }

  const wasFunded = Boolean(disputedEscrow.fundedAt);
  if (
    (input.decision === "RELEASE_TO_SELLER" ||
      input.decision === "REFUND_TO_BUYER") &&
    !wasFunded
  ) {
    return {
      ok: false,
      code: "PREREQUISITE_FAILED",
      reason:
        "Cannot release or refund funds because this escrow transaction was never funded.",
    };
  }

  const providerName: EscrowProviderName =
    disputedEscrow.provider === "Castler Escrow" ? "Castler Escrow" : "Escrow.com";
  const adapterRes = await resolveThirdPartyEscrowDispute({
    provider: providerName,
    externalRef: disputedEscrow.externalRef,
    decision: input.decision,
    wasFunded,
  });

  const nextRoomStatus =
    input.decision === "RELEASE_TO_SELLER"
      ? "COMPLETED"
      : input.decision === "REFUND_TO_BUYER"
        ? "CANCELLED"
        : "ACTIVE";

  const buyerVer = await getBuyerVerificationReadiness(raw.buyerUserId, now);
  const trimmedNote = input.resolutionNote.trim();

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const updated = await prisma.$transaction(async (tx) => {
      await tx.escrowTransaction.update({
        where: { id: disputedEscrow.id },
        data: {
          status: adapterRes.nextStatus as PrismaEscrowStatus,
          ...(adapterRes.nextStatus === "RELEASED" ? { releasedAt: now } : {}),
        },
      });

      await tx.dealRoom.update({
        where: { id: raw.id },
        data: {
          status: nextRoomStatus as PrismaDealRoomStatus,
          ...(input.decision === "RELEASE_TO_SELLER"
            ? { currentStage: PrismaDealStageType.TRANSFER }
            : {}),
        },
      });

      if (input.decision === "RELEASE_TO_SELLER") {
        await tx.dealStage.updateMany({
          where: { dealRoomId: raw.id },
          data: { status: PrismaStageStatus.COMPLETED, completedAt: now },
        });
      } else if (input.decision === "RESUME_TO_IN_REVIEW") {
        await tx.dealStage.updateMany({
          where: {
            dealRoomId: raw.id,
            stage: raw.currentStage as PrismaDealStageType,
          },
          data: { status: PrismaStageStatus.ACTIVE },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: session!.userId,
          dealRoomId: raw.id,
          entityType: "DealRoom",
          entityId: raw.id,
          action: "DISPUTE_RESOLVED",
          previousState: {
            roomStatus: raw.status,
            escrowStatus: disputedEscrow.status,
          },
          newState: {
            roomStatus: nextRoomStatus,
            escrowStatus: adapterRes.nextStatus,
            decision: input.decision,
          },
          metadataJson: {
            resolutionNote: trimmedNote,
            resolutionRef: adapterRes.resolutionRef,
            externalRef: disputedEscrow.externalRef,
          },
        },
      });

      await tx.notification.createMany({
        data: [
          {
            userId: raw.buyerUserId,
            type: "DISPUTE_RESOLVED",
            title: `Dispute resolved for ${raw.teaserTitle}`,
            body: `Reviewer decision: ${input.decision.replaceAll("_", " ")}. ${trimmedNote}`,
            actionUrl: `/deals/${raw.id}`,
          },
          {
            userId: raw.sellerUserId,
            type: "DISPUTE_RESOLVED",
            title: `Dispute resolved for ${raw.teaserTitle}`,
            body: `Reviewer decision: ${input.decision.replaceAll("_", " ")}. ${trimmedNote}`,
            actionUrl: `/deals/${raw.id}`,
          },
        ],
      });

      return tx.dealRoom.findUniqueOrThrow({
        where: { id: raw.id },
        include: PRISMA_DEAL_ROOM_INCLUDE,
      });
    });

    publishDealRoomEvent(raw.id, "DISPUTE_RESOLVED");
    const nextRaw = mapPrismaDealRoomToRaw(updated);
    const disputeView = buildAdminDisputeViewFromRaw(nextRaw)!;
    return {
      ok: true,
      data: {
        dispute: disputeView,
        dealRoom: sanitizeDealRoomForViewer(nextRaw, access.viewerRole, buyerVer),
      },
    };
  }

  const prevEscrowStatus = disputedEscrow.status;
  disputedEscrow.status = adapterRes.nextStatus;
  if (adapterRes.nextStatus === "RELEASED") {
    disputedEscrow.releasedAt = nowIso;
  }
  disputedEscrow.updatedAt = nowIso;

  const prevRoomStatus = raw.status;
  raw.status = nextRoomStatus;
  raw.updatedAt = nowIso;

  if (input.decision === "RELEASE_TO_SELLER") {
    raw.currentStage = "TRANSFER";
    raw.stages = raw.stages.map((s) => ({
      ...s,
      status: "COMPLETED",
      completedAt: s.completedAt ?? nowIso,
      updatedAt: nowIso,
    }));
  } else if (input.decision === "RESUME_TO_IN_REVIEW") {
    raw.stages = raw.stages.map((s) =>
      s.stage === raw.currentStage
        ? { ...s, status: "ACTIVE", updatedAt: nowIso }
        : s
    );
  }

  raw.auditLogs.unshift({
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    actorId: session!.userId,
    actorName: session!.name,
    entityType: "DealRoom",
    entityId: raw.id,
    action: "DISPUTE_RESOLVED",
    previousState: {
      roomStatus: prevRoomStatus,
      escrowStatus: prevEscrowStatus,
    },
    newState: {
      roomStatus: nextRoomStatus,
      escrowStatus: adapterRes.nextStatus,
      decision: input.decision,
    },
    metadataJson: {
      resolutionNote: trimmedNote,
      resolutionRef: adapterRes.resolutionRef,
      externalRef: disputedEscrow.externalRef,
    },
    createdAt: nowIso,
  });

  publishDealRoomEvent(raw.id, "DISPUTE_RESOLVED");
  const disputeView = buildAdminDisputeViewFromRaw(raw)!;
  return {
    ok: true,
    data: {
      dispute: disputeView,
      dealRoom: sanitizeDealRoomForViewer(raw, access.viewerRole, buyerVer),
    },
  };
}
