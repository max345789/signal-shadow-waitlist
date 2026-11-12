// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sanitizeListingForViewer } from "@/lib/domain/listings";
import {
  convertCurrencyAmount,
  extractThesisHintsFromPrompt,
  rankListingsForThesis,
  scoreListingAgainstThesis,
  type ThesisCriteria,
} from "@/lib/domain/matching";
import { detectConfidentialLeak } from "@/lib/domain/valuation";
import { createSampleSeedListings } from "@/lib/listings/sample-data";
import {
  parseCompareBusinessIds,
  previewThesisSchema,
  upsertThesisSchema,
} from "@/lib/matching/validation";

describe("Phase 2 matching engine, prompt extraction, and validation", () => {
  const now = new Date("2026-11-12T10:00:00.000Z");
  const sampleListings = createSampleSeedListings(now.getTime()).map((raw) =>
    sanitizeListingForViewer(raw, { userId: null, roles: [], hasSignedNda: false }, now)
  );

  it("ensures all sample seed listings have zero confidential redaction leaks", () => {
    for (const raw of createSampleSeedListings(now.getTime())) {
      const leaks = detectConfidentialLeak(
        {
          teaserTitle: raw.teaserTitle,
          teaserSummary: raw.teaserSummary,
          reasonForSelling: raw.reasonForSelling,
          financialNarrative: raw.financialNarrative,
          risksSummary: raw.risksSummary,
          founderStory: raw.founderStory,
        },
        {
          redactedName: raw.redactedName,
          redactedDomain: raw.redactedDomain,
        }
      );
      expect(leaks, `Confidential leak on ${raw.id}`).toEqual([]);
    }
  });

  it("Phase 2 acceptance: three different test theses return three different sensible #1 ranked results with visible reasons and mismatches", () => {
    const thesisB2BSaaS: ThesisCriteria = {
      title: "High-cashflow B2B SaaS in Bengaluru",
      sector: "B2B SaaS",
      minRevenue: 10_000_000,
      maxRevenue: 25_000_000,
      minProfit: 4_500_000,
      maxOwnerHours: 12,
      geography: "India (Bengaluru)",
      minPrice: 12_000_000,
      maxPrice: 22_000_000,
      currency: "INR",
      freeText: "GST compliance recurring Stripe verified",
      alertsEnabled: true,
    };

    const thesisD2CSkincare: ThesisCriteria = {
      title: "Mumbai D2C Brand with Razorpay receipts",
      sector: "E-commerce / D2C",
      minRevenue: 15_000_000,
      maxRevenue: 30_000_000,
      minProfit: 3_500_000,
      maxOwnerHours: 20,
      geography: "India (Mumbai)",
      minPrice: 8_000_000,
      maxPrice: 13_000_000,
      currency: "INR",
      freeText: "skincare repeat Shopify Razorpay",
      alertsEnabled: true,
    };

    const thesisLeanMedia: ThesisCriteria = {
      title: "Lean Remote Media under 60L",
      sector: "Content & Media",
      minRevenue: 3_000_000,
      maxRevenue: 8_000_000,
      minProfit: 1_500_000,
      maxOwnerHours: 8,
      geography: "India (Remote)",
      minPrice: 2_000_000,
      maxPrice: 6_000_000,
      currency: "INR",
      freeText: "newsletter fintech GA4 sponsors",
      alertsEnabled: true,
    };

    const ranked1 = rankListingsForThesis(sampleListings, thesisB2BSaaS);
    const ranked2 = rankListingsForThesis(sampleListings, thesisD2CSkincare);
    const ranked3 = rankListingsForThesis(sampleListings, thesisLeanMedia);

    // Only APPROVED listings are ranked (4 approved out of 5 sample listings)
    expect(ranked1).toHaveLength(4);
    expect(ranked2).toHaveLength(4);
    expect(ranked3).toHaveLength(4);

    // Distinct #1 ranked results
    expect(ranked1[0]!.listing.id).toBe("sample-biz-gst-01");
    expect(ranked2[0]!.listing.id).toBe("sample-biz-d2c-02");
    expect(ranked3[0]!.listing.id).toBe("sample-biz-media-04");

    // Scores beat lower-ranked mismatches decisively
    expect(ranked1[0]!.score).toBeGreaterThan(ranked1[1]!.score);
    expect(ranked2[0]!.score).toBeGreaterThan(ranked2[1]!.score);
    expect(ranked3[0]!.score).toBeGreaterThan(ranked3[1]!.score);

    // Every match exposes reasons and mismatches honestly
    for (const rankList of [ranked1, ranked2, ranked3]) {
      expect(rankList[0]!.reasons.length).toBeGreaterThanOrEqual(3);
      expect(rankList[0]!.headline.length).toBeGreaterThan(10);
      // Runner-up / lower ranks must explicitly expose why they don't fit
      expect(rankList[1]!.mismatches.length).toBeGreaterThanOrEqual(1);
      expect(rankList[3]!.mismatches.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("never credits expired or seller-reported metrics as verified in free-text matching and never reads redacted fields", () => {
    const raw = createSampleSeedListings(now.getTime())[0]!;
    // Expire all verifications on a copy & unlock confidential details for test
    const expiredRaw = {
      ...raw,
      metrics: raw.metrics.map((m) =>
        m.verification
          ? {
              ...m,
              verification: {
                ...m.verification,
                expiresAt: new Date(now.getTime() - 60_000).toISOString(),
              },
            }
          : m
      ),
    };
    const unlockedExpiredView = sanitizeListingForViewer(
      expiredRaw,
      { userId: "admin-1", roles: ["ADMIN"], hasSignedNda: true },
      now
    );

    const thesisAskingVerifiedAndRedacted: ThesisCriteria = {
      title: "Require Stripe verified TaxBridge",
      sector: null,
      minRevenue: null,
      maxRevenue: null,
      minProfit: null,
      maxOwnerHours: null,
      geography: null,
      minPrice: null,
      maxPrice: null,
      currency: "INR",
      freeText: "verified Stripe TaxBridge",
      alertsEnabled: true,
    };

    const result = scoreListingAgainstThesis(
      unlockedExpiredView,
      thesisAskingVerifiedAndRedacted
    );

    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
    expect(result.mismatches.some((m) => m.includes("verified"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("TaxBridge");
  });

  it("handles cross-currency thesis normalization cleanly", () => {
    const gstListing = sampleListings[0]!; // ₹1.95 Cr (~$232k USD at 84 INR/USD)
    expect(convertCurrencyAmount(8_400_000, "INR", "USD")).toBe(100_000);

    const usdThesis: ThesisCriteria = {
      title: "USD B2B SaaS mandate",
      sector: "B2B SaaS",
      minRevenue: 100_000,
      maxRevenue: 300_000,
      minProfit: 50_000,
      maxOwnerHours: 12,
      geography: null,
      minPrice: 150_000,
      maxPrice: 280_000,
      currency: "USD",
      freeText: "",
      alertsEnabled: true,
    };

    const res = scoreListingAgainstThesis(gstListing, usdThesis);
    expect(res.score).toBeGreaterThanOrEqual(90);
    expect(res.reasons.some((r) => r.includes("converted from INR"))).toBe(true);
  });

  it("extracts structured hints conservatively from natural-language Home prompts", () => {
    const hints = extractThesisHintsFromPrompt(
      "B2B SaaS in India, ₹50L+ net profit, under 10 owner hours/week, max ₹2 Cr"
    );
    expect(hints.sector).toBe("B2B SaaS");
    expect(hints.geography).toBe("India (Any city)");
    expect(hints.minProfit).toBe(5_000_000);
    expect(hints.maxOwnerHours).toBe(10);
    expect(hints.maxPrice).toBe(20_000_000);
    expect(hints.freeText).toContain("B2B SaaS in India");
  });

  it("validates thesis bounds and compare ID limits strictly", () => {
    expect(
      previewThesisSchema.safeParse({
        sector: null,
        freeText: "",
      }).success
    ).toBe(false);

    expect(
      upsertThesisSchema.safeParse({
        title: "Invalid bounds thesis",
        minPrice: 20_000_000,
        maxPrice: 10_000_000,
      }).success
    ).toBe(false);

    expect(
      upsertThesisSchema.safeParse({
        title: "Valid SaaS thesis",
        sector: "B2B SaaS",
        minRevenue: 1_000_000,
        maxRevenue: 5_000_000,
        freeText: "",
      }).success
    ).toBe(true);

    expect(parseCompareBusinessIds("a,b,c")).toEqual({
      ok: true,
      ids: ["a", "b", "c"],
    });
    expect(parseCompareBusinessIds("a,a,b")).toEqual({
      ok: true,
      ids: ["a", "b"],
    });
    expect(parseCompareBusinessIds("a,b,c,d").ok).toBe(false);
    expect(parseCompareBusinessIds("bad/id").ok).toBe(false);
  });
});
