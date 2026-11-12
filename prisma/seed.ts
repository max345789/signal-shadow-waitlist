import {
  CurrencyCode,
  ListingStatus,
  MetricKey,
  MetricSource,
  MetricUnit,
  Prisma,
  PrismaClient,
  RoleType,
  VerificationStatus,
  VerificationType,
} from "@prisma/client";
import { hashPassword } from "../src/lib/auth/crypto";
import { sanitizeListingForViewer } from "../src/lib/domain/listings";
import { scoreListingAgainstThesis } from "../src/lib/domain/matching";
import {
  createSampleSeedListings,
  createSampleSeedTheses,
} from "../src/lib/listings/sample-data";

const prisma = new PrismaClient();

async function main() {
  const roles: Array<{ name: RoleType; description: string }> = [
    { name: RoleType.BUYER, description: "Qualified buyer searching and acquiring businesses" },
    { name: RoleType.SELLER, description: "Business founder or owner listing an asset for sale" },
    { name: RoleType.ADMIN, description: "Platform administrator managing trust rules and reviews" },
    { name: RoleType.REVIEWER, description: "Compliance reviewer handling verifications and disputes" },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }

  // Seed explicit Sample Data accounts and Sample Phase 1 listings (only when SEED_SAMPLE_DATA !== "false")
  if (process.env.SEED_SAMPLE_DATA !== "false") {
    const samplePassword = process.env.LOCAL_DEV_SAMPLE_PASSWORD ?? "SampleDevPass!2026";
    const passwordHash = hashPassword(samplePassword);

    const sampleUsers = [
      {
        id: "sample-buyer-01",
        email: "buyer.sample@trustmarketplace.local",
        name: "Ananya Rao (Sample Buyer)",
        roles: [RoleType.BUYER],
        twoFactorSecret: "JBSWY3DPEHPK3PXP",
      },
      {
        id: "sample-seller-01",
        email: "seller.sample@trustmarketplace.local",
        name: "Rohan Mehta (Sample Seller)",
        roles: [RoleType.SELLER],
        twoFactorSecret: "KRSXG5CTMVRXEZLU",
      },
      {
        id: "sample-seller-02",
        email: "seller2.sample@trustmarketplace.local",
        name: "Kavita Deshmukh (Sample Seller)",
        roles: [RoleType.SELLER],
        twoFactorSecret: "KRSXG5CTMVRXEZLU",
      },
      {
        id: "sample-reviewer-01",
        email: "reviewer.sample@trustmarketplace.local",
        name: "Priya Nair (Sample Reviewer)",
        roles: [RoleType.REVIEWER, RoleType.ADMIN],
        twoFactorSecret: "MFRGGZDFMZTWQ2LK",
      },
    ];

    const userIdByKey = new Map<string, string>();
    for (const u of sampleUsers) {
      const savedUser = await prisma.user.upsert({
        where: { email: u.email },
        update: { name: u.name },
        create: {
          id: u.id,
          email: u.email,
          name: u.name,
          passwordHash,
          twoFactorEnabled: true,
          twoFactorSecret: u.twoFactorSecret,
          roles: {
            connect: u.roles.map((name) => ({ name })),
          },
        },
      });
      userIdByKey.set(u.id, savedUser.id);
    }

    const buyerUserId = userIdByKey.get("sample-buyer-01") ?? "sample-buyer-01";
    const seller1UserId = userIdByKey.get("sample-seller-01") ?? "sample-seller-01";
    const seller2UserId = userIdByKey.get("sample-seller-02") ?? "sample-seller-02";

    const sampleBuyerProfile = await prisma.buyerProfile.upsert({
      where: { userId: buyerUserId },
      update: {},
      create: {
        id: "sample-buyer-profile-01",
        userId: buyerUserId,
        preferredCurrency: CurrencyCode.INR,
      },
    });

    const sampleSellerProfile1 = await prisma.sellerProfile.upsert({
      where: { userId: seller1UserId },
      update: {},
      create: {
        id: "sample-seller-profile-01",
        userId: seller1UserId,
        payoutCountry: "IN",
      },
    });

    const sampleSellerProfile2 = await prisma.sellerProfile.upsert({
      where: { userId: seller2UserId },
      update: {},
      create: {
        id: "sample-seller-profile-02",
        userId: seller2UserId,
        payoutCountry: "IN",
      },
    });

    const sellerProfileIdMap: Record<string, string> = {
      "sample-seller-profile-01": sampleSellerProfile1.id,
      "sample-seller-profile-02": sampleSellerProfile2.id,
    };

    const sampleListings = createSampleSeedListings();
    for (const biz of sampleListings) {
      await prisma.business.upsert({
        where: { slug: biz.slug },
        update: {
          teaserTitle: biz.teaserTitle,
          teaserSummary: biz.teaserSummary,
          reasonForSelling: biz.reasonForSelling,
          founderStory: biz.founderStory,
          founderMediaUrl: biz.founderMediaUrl,
          founderMediaType: biz.founderMediaType,
          financialNarrative: biz.financialNarrative,
          financialSeriesJson: biz.financialSeries as unknown as Prisma.InputJsonValue,
          risksSummary: biz.risksSummary,
          techStack: biz.techStack,
          assetsIncluded: biz.assetsIncluded,
          valuationLow: biz.valuationLow,
          valuationHigh: biz.valuationHigh,
          valuationBasis: biz.valuationBasis,
          status: biz.status as ListingStatus,
          isSampleData: true,
        },
        create: {
          id: biz.id,
          sellerProfileId: sellerProfileIdMap[biz.sellerProfileId] ?? biz.sellerProfileId,
          slug: biz.slug,
          teaserTitle: biz.teaserTitle,
          teaserSummary: biz.teaserSummary,
          redactedName: biz.redactedName,
          redactedDomain: biz.redactedDomain,
          redactedCustomers: biz.redactedCustomers,
          sector: biz.sector,
          geography: biz.geography,
          askingPrice: biz.askingPrice,
          currency: biz.currency as CurrencyCode,
          ownerHoursPerWeek: biz.ownerHoursPerWeek,
          reasonForSelling: biz.reasonForSelling,
          founderStory: biz.founderStory,
          founderMediaUrl: biz.founderMediaUrl,
          founderMediaType: biz.founderMediaType,
          financialNarrative: biz.financialNarrative,
          financialSeriesJson: biz.financialSeries as unknown as Prisma.InputJsonValue,
          risksSummary: biz.risksSummary,
          techStack: biz.techStack,
          assetsIncluded: biz.assetsIncluded,
          valuationLow: biz.valuationLow,
          valuationHigh: biz.valuationHigh,
          valuationBasis: biz.valuationBasis,
          status: biz.status as ListingStatus,
          submittedAt: biz.submittedAt ? new Date(biz.submittedAt) : null,
          reviewedAt: biz.reviewedAt ? new Date(biz.reviewedAt) : null,
          reviewedById: biz.reviewedById,
          reviewerNote: biz.reviewerNote,
          isSampleData: true,
        },
      });

      const createdVerIds = new Set<string>();
      for (const m of biz.metrics) {
        if (m.verification && !createdVerIds.has(m.verification.id)) {
          createdVerIds.add(m.verification.id);
          const vType =
            m.source === "GA4" || m.source === "PLAUSIBLE"
              ? VerificationType.ANALYTICS_CONNECTOR
              : VerificationType.PAYMENT_CONNECTOR;
          await prisma.verification.upsert({
            where: { id: m.verification.id },
            update: {
              status: m.verification.status as VerificationStatus,
              verifiedAt: m.verification.verifiedAt ? new Date(m.verification.verifiedAt) : null,
              expiresAt: m.verification.expiresAt ? new Date(m.verification.expiresAt) : null,
            },
            create: {
              id: m.verification.id,
              businessId: biz.id,
              type: vType,
              provider: m.verification.provider,
              status: m.verification.status as VerificationStatus,
              verifiedAt: m.verification.verifiedAt ? new Date(m.verification.verifiedAt) : null,
              expiresAt: m.verification.expiresAt ? new Date(m.verification.expiresAt) : null,
            },
          });
        }

        await prisma.businessMetric.upsert({
          where: { id: m.id },
          update: {
            value: m.value,
            source: m.source as MetricSource,
            verificationId: m.verification?.id ?? null,
            verifiedAt: m.verification?.verifiedAt ? new Date(m.verification.verifiedAt) : null,
          },
          create: {
            id: m.id,
            businessId: biz.id,
            key: m.key as MetricKey,
            label: m.label,
            value: m.value,
            unit: m.unit as MetricUnit,
            currency: m.currency ? (m.currency as CurrencyCode) : null,
            source: m.source as MetricSource,
            verificationId: m.verification?.id ?? null,
            verifiedAt: m.verification?.verifiedAt ? new Date(m.verification.verifiedAt) : null,
            isSampleData: true,
          },
        });
      }

      for (const q of biz.questions) {
        await prisma.listingQuestion.upsert({
          where: { id: q.id },
          update: {
            askerLabel: q.askerLabel,
          },
          create: {
            id: q.id,
            businessId: biz.id,
            askerId: q.askerId,
            askerLabel: q.askerLabel,
            question: q.question,
            answer: q.answer,
            answeredAt: q.answeredAt ? new Date(q.answeredAt) : null,
            isSampleData: true,
          },
        });
      }

      for (const entry of biz.auditLogs) {
        await prisma.auditLog.upsert({
          where: { id: entry.id },
          update: {},
          create: {
            id: entry.id,
            actorId: entry.actorId,
            entityType: "Business",
            entityId: biz.id,
            action: entry.action,
            previousState: entry.previousStatus ? { status: entry.previousStatus } : Prisma.JsonNull,
            newState: entry.newStatus ? { status: entry.newStatus } : Prisma.JsonNull,
            metadataJson: entry.note ? { note: entry.note } : Prisma.JsonNull,
          },
        });
      }
    }

    const approvedSanitized = sampleListings
      .filter((b) => b.status === "APPROVED")
      .map((b) =>
        sanitizeListingForViewer(b, { userId: null, roles: [], hasSignedNda: false })
      );

    for (const thesis of createSampleSeedTheses()) {
      await prisma.thesis.upsert({
        where: { id: thesis.id },
        update: {
          title: thesis.title,
          sector: thesis.sector,
          minRevenue: thesis.minRevenue,
          maxRevenue: thesis.maxRevenue,
          minProfit: thesis.minProfit,
          maxOwnerHours: thesis.maxOwnerHours,
          geography: thesis.geography,
          minPrice: thesis.minPrice,
          maxPrice: thesis.maxPrice,
          currency: thesis.currency as CurrencyCode,
          freeText: thesis.freeText,
          alertsEnabled: thesis.alertsEnabled,
          isSampleData: true,
        },
        create: {
          id: thesis.id,
          buyerProfileId: sampleBuyerProfile.id,
          title: thesis.title,
          sector: thesis.sector,
          minRevenue: thesis.minRevenue,
          maxRevenue: thesis.maxRevenue,
          minProfit: thesis.minProfit,
          maxOwnerHours: thesis.maxOwnerHours,
          geography: thesis.geography,
          minPrice: thesis.minPrice,
          maxPrice: thesis.maxPrice,
          currency: thesis.currency as CurrencyCode,
          freeText: thesis.freeText,
          alertsEnabled: thesis.alertsEnabled,
          isSampleData: true,
        },
      });

      for (const listing of approvedSanitized) {
        const evalRes = scoreListingAgainstThesis(listing, thesis);
        await prisma.match.upsert({
          where: {
            thesisId_businessId: {
              thesisId: thesis.id,
              businessId: listing.id,
            },
          },
          update: {
            score: evalRes.score,
            reasonsJson: evalRes.reasons as unknown as Prisma.InputJsonValue,
            mismatchesJson: evalRes.mismatches as unknown as Prisma.InputJsonValue,
          },
          create: {
            thesisId: thesis.id,
            businessId: listing.id,
            score: evalRes.score,
            reasonsJson: evalRes.reasons as unknown as Prisma.InputJsonValue,
            mismatchesJson: evalRes.mismatches as unknown as Prisma.InputJsonValue,
          },
        });
      }
    }
  }

  console.log("Seeded canonical Role records, Sample listings, and Sample buyer thesis.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
