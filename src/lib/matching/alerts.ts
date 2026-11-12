import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";
import {
  sanitizeListingForViewer,
  type RawBusinessRecord,
  type SanitizedListingView,
} from "@/lib/domain/listings";
import {
  scoreListingAgainstThesis,
  THESIS_ALERT_MIN_SCORE,
  type SavedThesisRecord,
} from "@/lib/domain/matching";
import type { CurrencyCode } from "@/lib/format/currency";
import { getLocalMatchingStore } from "@/lib/matching/local-store";
import { Prisma } from "@prisma/client";

export interface AlertEvaluationSummary {
  evaluatedTheses: number;
  alertsCreated: number;
}

export async function evaluateAndSendThesisAlertsForListing(
  listingInput: RawBusinessRecord | SanitizedListingView,
  actorId?: string | null
): Promise<AlertEvaluationSummary> {
  if (listingInput.status !== "APPROVED") {
    return { evaluatedTheses: 0, alertsCreated: 0 };
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Enforce public redaction BEFORE scoring & notification generation so confidential fields never leak
  const publicSanitizedListing: SanitizedListingView =
    "metrics" in listingInput && "trustSummary" in listingInput
      ? {
          ...listingInput,
          sensitiveDetailsUnlocked: false,
          redactedName: null,
          redactedDomain: null,
          redactedCustomers: null,
        }
      : sanitizeListingForViewer(
          listingInput,
          { userId: null, roles: [], hasSignedNda: false },
          now
        );

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const theses = await prisma.thesis.findMany({
      where: { alertsEnabled: true },
      include: {
        buyerProfile: { select: { userId: true } },
      },
    });

    let alertsCreated = 0;

    for (const row of theses) {
      const thesis: SavedThesisRecord = {
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

      const evaluation = scoreListingAgainstThesis(publicSanitizedListing, thesis);
      const sectorMismatchGate =
        thesis.sector &&
        thesis.sector !== "ALL" &&
        thesis.sector !== "ANY" &&
        publicSanitizedListing.sector.toLowerCase() !== thesis.sector.toLowerCase() &&
        evaluation.score < 85;
      const qualifiesForAlert =
        evaluation.score >= THESIS_ALERT_MIN_SCORE && !sectorMismatchGate;

      const existingMatch = await prisma.match.findUnique({
        where: {
          thesisId_businessId: {
            thesisId: thesis.id,
            businessId: publicSanitizedListing.id,
          },
        },
      });

      const shouldSendAlert =
        qualifiesForAlert && (!existingMatch || existingMatch.alertSentAt === null);

      await prisma.$transaction(async (tx) => {
        await tx.match.upsert({
          where: {
            thesisId_businessId: {
              thesisId: thesis.id,
              businessId: publicSanitizedListing.id,
            },
          },
          update: {
            score: evaluation.score,
            reasonsJson: evaluation.reasons as unknown as Prisma.InputJsonValue,
            mismatchesJson: evaluation.mismatches as unknown as Prisma.InputJsonValue,
            alertSentAt: shouldSendAlert ? now : existingMatch?.alertSentAt ?? null,
          },
          create: {
            thesisId: thesis.id,
            businessId: publicSanitizedListing.id,
            score: evaluation.score,
            reasonsJson: evaluation.reasons as unknown as Prisma.InputJsonValue,
            mismatchesJson: evaluation.mismatches as unknown as Prisma.InputJsonValue,
            alertSentAt: shouldSendAlert ? now : null,
          },
        });

        if (shouldSendAlert) {
          const notif = await tx.notification.create({
            data: {
              userId: thesis.buyerUserId,
              type: "THESIS_MATCH",
              title: `New match (${evaluation.score}/100 fit) for "${thesis.title}"`,
              body: `${publicSanitizedListing.teaserTitle} — ${evaluation.headline}`,
              actionUrl: `/matches?thesisId=${encodeURIComponent(thesis.id)}`,
            },
          });

          await tx.auditLog.create({
            data: {
              actorId: actorId ?? null,
              entityType: "Notification",
              entityId: notif.id,
              action: "THESIS_MATCH_ALERT_CREATED",
              newState: {
                thesisId: thesis.id,
                businessId: publicSanitizedListing.id,
                score: evaluation.score,
              },
            },
          });
        }
      });

      if (shouldSendAlert) {
        alertsCreated += 1;
      }
    }

    return { evaluatedTheses: theses.length, alertsCreated };
  }

  const store = getLocalMatchingStore();
  const activeTheses = store.theses.filter((t) => t.alertsEnabled);
  let alertsCreated = 0;

  for (const thesis of activeTheses) {
    const evaluation = scoreListingAgainstThesis(publicSanitizedListing, thesis);
    const sectorMismatchGate =
      thesis.sector &&
      thesis.sector !== "ALL" &&
      thesis.sector !== "ANY" &&
      publicSanitizedListing.sector.toLowerCase() !== thesis.sector.toLowerCase() &&
      evaluation.score < 85;
    const qualifiesForAlert =
      evaluation.score >= THESIS_ALERT_MIN_SCORE && !sectorMismatchGate;

    const existingIdx = store.matches.findIndex(
      (m) => m.thesisId === thesis.id && m.businessId === publicSanitizedListing.id
    );
    const existing = existingIdx >= 0 ? store.matches[existingIdx]! : null;
    const shouldSendAlert =
      qualifiesForAlert && (!existing || existing.alertSentAt === null);

    if (existing) {
      store.matches[existingIdx] = {
        ...existing,
        ...evaluation,
        alertSentAt: shouldSendAlert ? nowIso : existing.alertSentAt,
        updatedAt: nowIso,
      };
    } else {
      store.matches.push({
        id: `match-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        thesisId: thesis.id,
        ...evaluation,
        alertSentAt: shouldSendAlert ? nowIso : null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    if (shouldSendAlert) {
      alertsCreated += 1;
      store.notifications.unshift({
        id: `notif-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        userId: thesis.buyerUserId,
        type: "THESIS_MATCH",
        title: `New match (${evaluation.score}/100 fit) for "${thesis.title}"`,
        body: `${publicSanitizedListing.teaserTitle} — ${evaluation.headline}`,
        actionUrl: `/matches?thesisId=${encodeURIComponent(thesis.id)}`,
        readAt: null,
        createdAt: nowIso,
      });
    }
  }

  return { evaluatedTheses: activeTheses.length, alertsCreated };
}
