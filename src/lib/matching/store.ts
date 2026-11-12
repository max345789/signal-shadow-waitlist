import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";
import type { AuthSession } from "@/lib/auth/types";
import type { SanitizedListingView } from "@/lib/domain/listings";
import {
  rankListingsForThesis,
  scoreListingAgainstThesis,
  THESIS_ALERT_MIN_SCORE,
  type MatchEvaluationResult,
  type RankedThesisMatch,
  type SavedThesisRecord,
  type ThesisCriteria,
  type ThesisNotificationRecord,
} from "@/lib/domain/matching";
import type { CurrencyCode } from "@/lib/format/currency";
import { listApprovedListings } from "@/lib/listings/store";
import {
  getLocalMatchingStore,
  resetLocalMatchingStoreForTest,
} from "@/lib/matching/local-store";
import {
  CurrencyCode as PrismaCurrencyCode,
  Prisma,
} from "@prisma/client";

export { resetLocalMatchingStoreForTest };

export interface UpsertThesisInput {
  title: string;
  sector: string | null;
  minRevenue: number | null;
  maxRevenue: number | null;
  minProfit: number | null;
  maxOwnerHours: number | null;
  geography: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  currency: CurrencyCode;
  freeText: string;
  alertsEnabled: boolean;
}

export interface ThesisWithMatches {
  thesis: SavedThesisRecord;
  matches: RankedThesisMatch[];
}

function mapPrismaThesis(row: {
  id: string;
  buyerProfileId: string;
  buyerProfile: { userId: string };
  title: string;
  sector: string | null;
  minRevenue: Prisma.Decimal | null;
  maxRevenue: Prisma.Decimal | null;
  minProfit: Prisma.Decimal | null;
  maxOwnerHours: number | null;
  geography: string | null;
  minPrice: Prisma.Decimal | null;
  maxPrice: Prisma.Decimal | null;
  currency: PrismaCurrencyCode;
  freeText: string;
  alertsEnabled: boolean;
  isSampleData: boolean;
  createdAt: Date;
  updatedAt: Date;
}): SavedThesisRecord {
  return {
    id: row.id,
    buyerProfileId: row.buyerProfileId,
    buyerUserId: row.buyerProfile.userId,
    title: row.title,
    sector: row.sector,
    minRevenue: row.minRevenue !== null ? Number(row.minRevenue) : null,
    maxRevenue: row.maxRevenue !== null ? Number(row.maxRevenue) : null,
    minProfit: row.minProfit !== null ? Number(row.minProfit) : null,
    maxOwnerHours: row.maxOwnerHours,
    geography: row.geography,
    minPrice: row.minPrice !== null ? Number(row.minPrice) : null,
    maxPrice: row.maxPrice !== null ? Number(row.maxPrice) : null,
    currency: row.currency as CurrencyCode,
    freeText: row.freeText,
    alertsEnabled: row.alertsEnabled,
    isSampleData: row.isSampleData,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function syncLocalMatchesForThesis(
  thesis: SavedThesisRecord,
  approvedListings: SanitizedListingView[]
): RankedThesisMatch[] {
  const store = getLocalMatchingStore();
  const nowIso = new Date().toISOString();
  const ranked = rankListingsForThesis(approvedListings, thesis);

  return ranked.map((item) => {
    const idx = store.matches.findIndex(
      (m) => m.thesisId === thesis.id && m.businessId === item.listing.id
    );
    if (idx >= 0) {
      const existing = store.matches[idx]!;
      store.matches[idx] = {
        ...existing,
        score: item.score,
        headline: item.headline,
        reasons: item.reasons,
        mismatches: item.mismatches,
        breakdown: item.breakdown,
        updatedAt: nowIso,
      };
      return {
        ...item,
        matchId: existing.id,
        thesisId: thesis.id,
        alertSentAt: existing.alertSentAt,
      };
    }

    const matchId = `match-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    store.matches.push({
      id: matchId,
      thesisId: thesis.id,
      businessId: item.listing.id,
      score: item.score,
      headline: item.headline,
      reasons: item.reasons,
      mismatches: item.mismatches,
      breakdown: item.breakdown,
      alertSentAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    return {
      ...item,
      matchId,
      thesisId: thesis.id,
      alertSentAt: null,
    };
  });
}

async function syncPrismaMatchesForThesis(
  thesis: SavedThesisRecord,
  approvedListings: SanitizedListingView[]
): Promise<RankedThesisMatch[]> {
  const prisma = getPrismaClient();
  const ranked = rankListingsForThesis(approvedListings, thesis);
  const existingMatches = await prisma.match.findMany({
    where: { thesisId: thesis.id },
  });
  const existingByBiz = new Map(existingMatches.map((m) => [m.businessId, m]));

  const results: RankedThesisMatch[] = [];
  for (const item of ranked) {
    const existing = existingByBiz.get(item.listing.id);
    const saved = await prisma.match.upsert({
      where: {
        thesisId_businessId: {
          thesisId: thesis.id,
          businessId: item.listing.id,
        },
      },
      update: {
        score: item.score,
        reasonsJson: item.reasons as unknown as Prisma.InputJsonValue,
        mismatchesJson: item.mismatches as unknown as Prisma.InputJsonValue,
      },
      create: {
        thesisId: thesis.id,
        businessId: item.listing.id,
        score: item.score,
        reasonsJson: item.reasons as unknown as Prisma.InputJsonValue,
        mismatchesJson: item.mismatches as unknown as Prisma.InputJsonValue,
        alertSentAt: null,
      },
    });
    results.push({
      ...item,
      matchId: saved.id,
      thesisId: thesis.id,
      alertSentAt: (saved.alertSentAt ?? existing?.alertSentAt ?? null)?.toISOString() ?? null,
    });
  }

  return results;
}

export async function previewMatchesForDraftThesis(
  criteria: ThesisCriteria
): Promise<RankedThesisMatch[]> {
  const approvedListings = await listApprovedListings();
  return rankListingsForThesis(approvedListings, criteria);
}

function hasAnyThesisCriteria(t: {
  sector: string | null;
  geography: string | null;
  minRevenue: number | null;
  maxRevenue: number | null;
  minProfit: number | null;
  maxOwnerHours: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  freeText: string;
}): boolean {
  return (
    t.sector !== null ||
    t.geography !== null ||
    t.minRevenue !== null ||
    t.maxRevenue !== null ||
    t.minProfit !== null ||
    t.maxOwnerHours !== null ||
    t.minPrice !== null ||
    t.maxPrice !== null ||
    t.freeText.trim().length >= 3
  );
}

export async function listSavedThesesForBuyer(
  session: AuthSession
): Promise<SavedThesisRecord[]> {
  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const rows = await prisma.thesis.findMany({
      where: { buyerProfile: { userId: session.userId } },
      include: { buyerProfile: { select: { userId: true } } },
      orderBy: [{ isSampleData: "asc" }, { updatedAt: "desc" }],
    });
    return rows.map(mapPrismaThesis);
  }

  const store = getLocalMatchingStore();
  return store.theses
    .filter((t) => t.buyerUserId === session.userId)
    .sort(
      (a, b) =>
        Number(a.isSampleData) - Number(b.isSampleData) ||
        b.updatedAt.localeCompare(a.updatedAt)
    );
}

export async function getSavedThesisForViewer(
  thesisId: string,
  session: AuthSession
): Promise<
  | { ok: true; thesis: SavedThesisRecord }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; reason: string }
> {
  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const row = await prisma.thesis.findUnique({
      where: { id: thesisId },
      include: { buyerProfile: { select: { userId: true } } },
    });
    if (!row) {
      return { ok: false, code: "NOT_FOUND", reason: "Thesis not found." };
    }
    if (
      row.buyerProfile.userId !== session.userId &&
      !session.roles.includes("ADMIN")
    ) {
      return {
        ok: false,
        code: "FORBIDDEN",
        reason: "You do not have permission to view this acquisition thesis.",
      };
    }
    return { ok: true, thesis: mapPrismaThesis(row) };
  }

  const store = getLocalMatchingStore();
  const thesis = store.theses.find((t) => t.id === thesisId);
  if (!thesis) {
    return { ok: false, code: "NOT_FOUND", reason: "Thesis not found." };
  }
  if (
    thesis.buyerUserId !== session.userId &&
    !session.roles.includes("ADMIN")
  ) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "You do not have permission to view this acquisition thesis.",
    };
  }
  return { ok: true, thesis };
}

export async function listThesesWithMatchesForBuyer(
  session: AuthSession
): Promise<ThesisWithMatches[]> {
  const [approvedListings, theses] = await Promise.all([
    listApprovedListings(),
    listSavedThesesForBuyer(session),
  ]);

  if (isDatabaseConfigured()) {
    const out: ThesisWithMatches[] = [];
    for (const thesis of theses) {
      const matches = await syncPrismaMatchesForThesis(thesis, approvedListings);
      out.push({ thesis, matches });
    }
    return out;
  }

  return theses.map((thesis) => ({
    thesis,
    matches: syncLocalMatchesForThesis(thesis, approvedListings),
  }));
}

export async function getThesisWithMatchesForViewer(
  thesisId: string,
  session: AuthSession
): Promise<
  | { ok: true; data: ThesisWithMatches }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; reason: string }
> {
  const approvedListings = await listApprovedListings();

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const row = await prisma.thesis.findUnique({
      where: { id: thesisId },
      include: { buyerProfile: { select: { userId: true } } },
    });
    if (!row) {
      return { ok: false, code: "NOT_FOUND", reason: "Thesis not found." };
    }
    if (
      row.buyerProfile.userId !== session.userId &&
      !session.roles.includes("ADMIN")
    ) {
      return {
        ok: false,
        code: "FORBIDDEN",
        reason: "You do not have permission to view this acquisition thesis.",
      };
    }
    const thesis = mapPrismaThesis(row);
    const matches = await syncPrismaMatchesForThesis(thesis, approvedListings);
    return { ok: true, data: { thesis, matches } };
  }

  const store = getLocalMatchingStore();
  const thesis = store.theses.find((t) => t.id === thesisId);
  if (!thesis) {
    return { ok: false, code: "NOT_FOUND", reason: "Thesis not found." };
  }
  if (
    thesis.buyerUserId !== session.userId &&
    !session.roles.includes("ADMIN")
  ) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "You do not have permission to view this acquisition thesis.",
    };
  }

  return {
    ok: true,
    data: {
      thesis,
      matches: syncLocalMatchesForThesis(thesis, approvedListings),
    },
  };
}

export async function createThesisForBuyer(
  input: UpsertThesisInput,
  actor: AuthSession
): Promise<ThesisWithMatches> {
  const nowIso = new Date().toISOString();
  const approvedListings = await listApprovedListings();

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const created = await prisma.$transaction(async (tx) => {
      const buyerProfile = await tx.buyerProfile.upsert({
        where: { userId: actor.userId },
        update: {},
        create: {
          userId: actor.userId,
          preferredCurrency: input.currency as PrismaCurrencyCode,
        },
      });

      const row = await tx.thesis.create({
        data: {
          buyerProfileId: buyerProfile.id,
          title: input.title.trim(),
          sector: input.sector,
          minRevenue: input.minRevenue,
          maxRevenue: input.maxRevenue,
          minProfit: input.minProfit,
          maxOwnerHours: input.maxOwnerHours,
          geography: input.geography,
          minPrice: input.minPrice,
          maxPrice: input.maxPrice,
          currency: input.currency as PrismaCurrencyCode,
          freeText: input.freeText.trim(),
          alertsEnabled: input.alertsEnabled,
          isSampleData: false,
        },
        include: { buyerProfile: { select: { userId: true } } },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entityType: "Thesis",
          entityId: row.id,
          action: "THESIS_CREATED",
          previousState: Prisma.JsonNull,
          newState: {
            title: row.title,
            sector: row.sector,
            alertsEnabled: row.alertsEnabled,
          },
        },
      });

      return row;
    });

    const thesis = mapPrismaThesis(created);
    const matches = await syncPrismaMatchesForThesis(thesis, approvedListings);
    return { thesis, matches };
  }

  const store = getLocalMatchingStore();
  const thesis: SavedThesisRecord = {
    id: `thesis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    buyerProfileId: `buyer-profile-${actor.userId}`,
    buyerUserId: actor.userId,
    title: input.title.trim(),
    sector: input.sector,
    minRevenue: input.minRevenue,
    maxRevenue: input.maxRevenue,
    minProfit: input.minProfit,
    maxOwnerHours: input.maxOwnerHours,
    geography: input.geography,
    minPrice: input.minPrice,
    maxPrice: input.maxPrice,
    currency: input.currency,
    freeText: input.freeText.trim(),
    alertsEnabled: input.alertsEnabled,
    isSampleData: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.theses.unshift(thesis);
  const matches = syncLocalMatchesForThesis(thesis, approvedListings);
  return { thesis, matches };
}

export async function updateThesisForBuyer(
  thesisId: string,
  patch: Partial<UpsertThesisInput>,
  actor: AuthSession
): Promise<
  | { ok: true; data: ThesisWithMatches }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE"; reason: string }
> {
  const nowIso = new Date().toISOString();
  const approvedListings = await listApprovedListings();

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const existing = await prisma.thesis.findUnique({
      where: { id: thesisId },
      include: { buyerProfile: { select: { userId: true } } },
    });
    if (!existing) {
      return { ok: false, code: "NOT_FOUND", reason: "Thesis not found." };
    }
    if (
      existing.buyerProfile.userId !== actor.userId &&
      !actor.roles.includes("ADMIN")
    ) {
      return {
        ok: false,
        code: "FORBIDDEN",
        reason: "Only the owning buyer can modify this thesis.",
      };
    }

    const nextMinRev =
      patch.minRevenue !== undefined
        ? patch.minRevenue
        : existing.minRevenue !== null
          ? Number(existing.minRevenue)
          : null;
    const nextMaxRev =
      patch.maxRevenue !== undefined
        ? patch.maxRevenue
        : existing.maxRevenue !== null
          ? Number(existing.maxRevenue)
          : null;
    if (nextMinRev !== null && nextMaxRev !== null && nextMinRev > nextMaxRev) {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: "Maximum revenue must be greater than or equal to minimum revenue.",
      };
    }

    const nextMinPrice =
      patch.minPrice !== undefined
        ? patch.minPrice
        : existing.minPrice !== null
          ? Number(existing.minPrice)
          : null;
    const nextMaxPrice =
      patch.maxPrice !== undefined
        ? patch.maxPrice
        : existing.maxPrice !== null
          ? Number(existing.maxPrice)
          : null;
    if (
      nextMinPrice !== null &&
      nextMaxPrice !== null &&
      nextMinPrice > nextMaxPrice
    ) {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: "Maximum price must be greater than or equal to minimum price.",
      };
    }

    const nextCandidate = {
      sector: patch.sector !== undefined ? patch.sector : existing.sector,
      geography: patch.geography !== undefined ? patch.geography : existing.geography,
      minRevenue: nextMinRev,
      maxRevenue: nextMaxRev,
      minProfit:
        patch.minProfit !== undefined
          ? patch.minProfit
          : existing.minProfit !== null
            ? Number(existing.minProfit)
            : null,
      maxOwnerHours:
        patch.maxOwnerHours !== undefined ? patch.maxOwnerHours : existing.maxOwnerHours,
      minPrice: nextMinPrice,
      maxPrice: nextMaxPrice,
      freeText: patch.freeText !== undefined ? patch.freeText.trim() : existing.freeText,
    };
    if (!hasAnyThesisCriteria(nextCandidate)) {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason:
          "Provide at least one structured filter or 3+ characters of free-text thesis criteria.",
      };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.thesis.update({
        where: { id: existing.id },
        data: {
          title: patch.title !== undefined ? patch.title.trim() : existing.title,
          sector: nextCandidate.sector,
          minRevenue: nextCandidate.minRevenue,
          maxRevenue: nextCandidate.maxRevenue,
          minProfit: nextCandidate.minProfit,
          maxOwnerHours: nextCandidate.maxOwnerHours,
          geography: nextCandidate.geography,
          minPrice: nextCandidate.minPrice,
          maxPrice: nextCandidate.maxPrice,
          currency:
            patch.currency !== undefined
              ? (patch.currency as PrismaCurrencyCode)
              : existing.currency,
          freeText: nextCandidate.freeText,
          alertsEnabled:
            patch.alertsEnabled !== undefined
              ? patch.alertsEnabled
              : existing.alertsEnabled,
        },
        include: { buyerProfile: { select: { userId: true } } },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entityType: "Thesis",
          entityId: row.id,
          action: "THESIS_UPDATED",
          previousState: { alertsEnabled: existing.alertsEnabled, title: existing.title },
          newState: { alertsEnabled: row.alertsEnabled, title: row.title },
        },
      });

      return row;
    });

    const thesis = mapPrismaThesis(updated);
    const matches = await syncPrismaMatchesForThesis(thesis, approvedListings);
    return { ok: true, data: { thesis, matches } };
  }

  const store = getLocalMatchingStore();
  const idx = store.theses.findIndex((t) => t.id === thesisId);
  if (idx === -1) {
    return { ok: false, code: "NOT_FOUND", reason: "Thesis not found." };
  }
  const existing = store.theses[idx]!;
  if (
    existing.buyerUserId !== actor.userId &&
    !actor.roles.includes("ADMIN")
  ) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Only the owning buyer can modify this thesis.",
    };
  }

  const nextMinRev =
    patch.minRevenue !== undefined ? patch.minRevenue : existing.minRevenue;
  const nextMaxRev =
    patch.maxRevenue !== undefined ? patch.maxRevenue : existing.maxRevenue;
  if (nextMinRev !== null && nextMaxRev !== null && nextMinRev > nextMaxRev) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "Maximum revenue must be greater than or equal to minimum revenue.",
    };
  }

  const nextMinPrice =
    patch.minPrice !== undefined ? patch.minPrice : existing.minPrice;
  const nextMaxPrice =
    patch.maxPrice !== undefined ? patch.maxPrice : existing.maxPrice;
  if (
    nextMinPrice !== null &&
    nextMaxPrice !== null &&
    nextMinPrice > nextMaxPrice
  ) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "Maximum price must be greater than or equal to minimum price.",
    };
  }

  const updated: SavedThesisRecord = {
    ...existing,
    title: patch.title !== undefined ? patch.title.trim() : existing.title,
    sector: patch.sector !== undefined ? patch.sector : existing.sector,
    minRevenue: nextMinRev,
    maxRevenue: nextMaxRev,
    minProfit: patch.minProfit !== undefined ? patch.minProfit : existing.minProfit,
    maxOwnerHours:
      patch.maxOwnerHours !== undefined
        ? patch.maxOwnerHours
        : existing.maxOwnerHours,
    geography: patch.geography !== undefined ? patch.geography : existing.geography,
    minPrice: nextMinPrice,
    maxPrice: nextMaxPrice,
    currency: patch.currency !== undefined ? patch.currency : existing.currency,
    freeText: patch.freeText !== undefined ? patch.freeText.trim() : existing.freeText,
    alertsEnabled:
      patch.alertsEnabled !== undefined
        ? patch.alertsEnabled
        : existing.alertsEnabled,
    updatedAt: nowIso,
  };

  if (!hasAnyThesisCriteria(updated)) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason:
        "Provide at least one structured filter or 3+ characters of free-text thesis criteria.",
    };
  }

  store.theses[idx] = updated;
  const matches = syncLocalMatchesForThesis(updated, approvedListings);
  return { ok: true, data: { thesis: updated, matches } };
}

export async function deleteThesisForBuyer(
  thesisId: string,
  actor: AuthSession
): Promise<
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; reason: string }
> {
  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const existing = await prisma.thesis.findUnique({
      where: { id: thesisId },
      include: { buyerProfile: { select: { userId: true } } },
    });
    if (!existing) {
      return { ok: false, code: "NOT_FOUND", reason: "Thesis not found." };
    }
    if (
      existing.buyerProfile.userId !== actor.userId &&
      !actor.roles.includes("ADMIN")
    ) {
      return {
        ok: false,
        code: "FORBIDDEN",
        reason: "Only the owning buyer can delete this thesis.",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.thesis.delete({ where: { id: thesisId } });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entityType: "Thesis",
          entityId: thesisId,
          action: "THESIS_DELETED",
          previousState: { title: existing.title },
          newState: Prisma.JsonNull,
        },
      });
    });

    return { ok: true };
  }

  const store = getLocalMatchingStore();
  const idx = store.theses.findIndex((t) => t.id === thesisId);
  if (idx === -1) {
    return { ok: false, code: "NOT_FOUND", reason: "Thesis not found." };
  }
  const existing = store.theses[idx]!;
  if (
    existing.buyerUserId !== actor.userId &&
    !actor.roles.includes("ADMIN")
  ) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Only the owning buyer can delete this thesis.",
    };
  }
  store.theses.splice(idx, 1);
  store.matches = store.matches.filter((m) => m.thesisId !== thesisId);
  return { ok: true };
}

export async function listNotificationsForUser(
  session: AuthSession
): Promise<ThesisNotificationRecord[]> {
  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const rows = await prisma.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      type: "THESIS_MATCH",
      title: r.title,
      body: r.body,
      actionUrl: r.actionUrl,
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  const store = getLocalMatchingStore();
  return store.notifications
    .filter((n) => n.userId === session.userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markNotificationRead(
  notificationId: string,
  session: AuthSession
): Promise<
  | { ok: true; notification: ThesisNotificationRecord }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; reason: string }
> {
  const now = new Date();
  const nowIso = now.toISOString();

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const existing = await prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!existing) {
      return { ok: false, code: "NOT_FOUND", reason: "Notification not found." };
    }
    if (existing.userId !== session.userId) {
      return {
        ok: false,
        code: "FORBIDDEN",
        reason: "Cannot modify another user's notification.",
      };
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: existing.readAt ?? now },
    });

    return {
      ok: true,
      notification: {
        id: updated.id,
        userId: updated.userId,
        type: "THESIS_MATCH",
        title: updated.title,
        body: updated.body,
        actionUrl: updated.actionUrl,
        readAt: updated.readAt ? updated.readAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
      },
    };
  }

  const store = getLocalMatchingStore();
  const idx = store.notifications.findIndex((n) => n.id === notificationId);
  if (idx === -1) {
    return { ok: false, code: "NOT_FOUND", reason: "Notification not found." };
  }
  const existing = store.notifications[idx]!;
  if (existing.userId !== session.userId) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Cannot modify another user's notification.",
    };
  }

  const updated: ThesisNotificationRecord = {
    ...existing,
    readAt: existing.readAt ?? nowIso,
  };
  store.notifications[idx] = updated;
  return { ok: true, notification: updated };
}

export async function markAllNotificationsRead(
  session: AuthSession
): Promise<{ updatedCount: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const res = await prisma.notification.updateMany({
      where: { userId: session.userId, readAt: null },
      data: { readAt: now },
    });
    return { updatedCount: res.count };
  }

  const store = getLocalMatchingStore();
  let updatedCount = 0;
  store.notifications = store.notifications.map((n) => {
    if (n.userId === session.userId && n.readAt === null) {
      updatedCount += 1;
      return { ...n, readAt: nowIso };
    }
    return n;
  });
  return { updatedCount };
}

export interface SellerListingBuyerDemand {
  strongMatchCount: number;
  sampleMatchCount: number;
  topScore: number | null;
}

export async function getBuyerDemandSummaryForSellerListings(
  listings: SanitizedListingView[]
): Promise<Record<string, SellerListingBuyerDemand>> {
  const approved = listings.filter((l) => l.status === "APPROVED");
  const summary: Record<string, SellerListingBuyerDemand> = {};
  for (const item of approved) {
    summary[item.id] = { strongMatchCount: 0, sampleMatchCount: 0, topScore: null };
  }
  if (approved.length === 0) {
    return summary;
  }

  let allTheses: SavedThesisRecord[];
  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const rows = await prisma.thesis.findMany({
      include: { buyerProfile: { select: { userId: true } } },
    });
    allTheses = rows.map(mapPrismaThesis);
  } else {
    allTheses = getLocalMatchingStore().theses;
  }

  for (const listing of approved) {
    let strongMatchCount = 0;
    let sampleMatchCount = 0;
    let topScore: number | null = null;
    for (const thesis of allTheses) {
      const ev = scoreListingAgainstThesis(listing, thesis);
      if (topScore === null || ev.score > topScore) {
        topScore = ev.score;
      }
      if (ev.score >= THESIS_ALERT_MIN_SCORE) {
        strongMatchCount += 1;
        if (thesis.isSampleData) {
          sampleMatchCount += 1;
        }
      }
    }
    summary[listing.id] = { strongMatchCount, sampleMatchCount, topScore };
  }

  return summary;
}

export async function getListingsForCompare(params: {
  ids: string[];
  thesisId?: string | null;
  session: AuthSession | null;
}): Promise<
  | {
      ok: true;
      listings: SanitizedListingView[];
      availableListings: SanitizedListingView[];
      excludedCount: number;
      thesis: SavedThesisRecord | null;
      evaluationsByBusinessId: Record<string, MatchEvaluationResult>;
    }
  | { ok: false; code: "TOO_MANY"; reason: string }
> {
  if (params.ids.length > 3) {
    return {
      ok: false,
      code: "TOO_MANY",
      reason: "You can compare up to 3 businesses side by side.",
    };
  }

  const approvedListings = await listApprovedListings();
  const byId = new Map(approvedListings.map((l) => [l.id, l]));
  const selectedListings: SanitizedListingView[] = [];
  let excludedCount = 0;
  for (const id of params.ids) {
    const found = byId.get(id);
    if (found) {
      selectedListings.push(found);
    } else {
      excludedCount += 1;
    }
  }

  let activeThesis: SavedThesisRecord | null = null;
  const evaluationsByBusinessId: Record<string, MatchEvaluationResult> = {};

  if (params.thesisId && params.session) {
    const thesisRes = await getSavedThesisForViewer(
      params.thesisId,
      params.session
    );
    if (thesisRes.ok) {
      activeThesis = thesisRes.thesis;
      for (const item of selectedListings) {
        evaluationsByBusinessId[item.id] = scoreListingAgainstThesis(
          item,
          activeThesis
        );
      }
    }
  }

  return {
    ok: true,
    listings: selectedListings,
    availableListings: approvedListings,
    excludedCount,
    thesis: activeThesis,
    evaluationsByBusinessId,
  };
}
