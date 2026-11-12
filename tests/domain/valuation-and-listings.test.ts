// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildAutoListingDraft,
  calculateGuidedValuation,
  detectConfidentialLeak,
} from "@/lib/domain/valuation";
import {
  canViewerAccessListing,
  sanitizeFounderMediaUrl,
  sanitizeListingForViewer,
  validateListingReviewTransition,
} from "@/lib/domain/listings";
import { createSampleSeedListings } from "@/lib/listings/sample-data";

describe("Phase 1 guided valuation, leak detection, and auto-listing builder", () => {
  it("computes conservative profit multiples factoring sector, owner hours, and growth", () => {
    const lowHoursSaaS = calculateGuidedValuation({
      sector: "B2B SaaS",
      annualRevenue: 10_000_000,
      annualProfit: 4_000_000,
      ownerHoursPerWeek: 8,
      growthPercent: 30,
      currency: "INR",
    });

    expect(lowHoursSaaS.mode).toBe("PROFIT_MULTIPLE");
    expect(lowHoursSaaS.lowMultiple).toBe(3.4); // 2.8 + 0.3 + 0.3
    expect(lowHoursSaaS.highMultiple).toBe(4.6); // 4.0 + 0.3 + 0.3
    expect(lowHoursSaaS.low).toBeLessThan(lowHoursSaaS.high);
    expect(lowHoursSaaS.suggestedAskingPrice).toBeGreaterThanOrEqual(lowHoursSaaS.low);
    expect(lowHoursSaaS.suggestedAskingPrice).toBeLessThanOrEqual(lowHoursSaaS.high);

    const heavyHoursAgency = calculateGuidedValuation({
      sector: "Services & Agency",
      annualRevenue: 8_000_000,
      annualProfit: 2_000_000,
      ownerHoursPerWeek: 45,
      growthPercent: -5,
      currency: "INR",
    });
    expect(heavyHoursAgency.lowMultiple).toBe(1.0); // 1.5 - 0.3 - 0.3 clamped to 1.0
    expect(heavyHoursAgency.highMultiple).toBeLessThan(lowHoursSaaS.highMultiple);
  });

  it("falls back to pre-profit revenue multiple and handles zero-input edge case", () => {
    const preProfit = calculateGuidedValuation({
      sector: "B2B SaaS",
      annualRevenue: 5_000_000,
      annualProfit: -200_000,
      ownerHoursPerWeek: 15,
      growthPercent: 45,
      currency: "USD",
    });
    expect(preProfit.mode).toBe("REVENUE_MULTIPLE");
    expect(preProfit.low).toBeGreaterThan(0);

    const zeroInput = calculateGuidedValuation({
      sector: "B2B SaaS",
      annualRevenue: 0,
      annualProfit: 0,
      ownerHoursPerWeek: 10,
      growthPercent: 0,
      currency: "INR",
    });
    expect(zeroInput.mode).toBe("INSUFFICIENT_DATA");
    expect(zeroInput.suggestedAskingPrice).toBe(0);
  });

  it("detects confidential brand name or domain leaks in public copy", () => {
    const findings = detectConfidentialLeak(
      {
        teaserTitle: "Fast-growing SaaS built by TaxBridge team",
        teaserSummary: "Visit https://taxbridge-sample.in for compliance tools.",
        financialNarrative: "Strong recurring revenue.",
      },
      {
        redactedName: "TaxBridge Compliance Systems",
        redactedDomain: "https://www.taxbridge-sample.in/",
      }
    );

    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.some((f) => f.field === "teaserTitle")).toBe(true);
    expect(findings.some((f) => f.field === "teaserSummary")).toBe(true);

    // Must NOT false-positive on generic city/sector tokens in sample or real names
    const sample = createSampleSeedListings()[0]!;
    const sampleCheck = detectConfidentialLeak(
      {
        teaserTitle: sample.teaserTitle,
        teaserSummary: sample.teaserSummary,
        reasonForSelling: sample.reasonForSelling,
        financialNarrative: sample.financialNarrative,
        risksSummary: sample.risksSummary,
        founderStory: sample.founderStory,
      },
      {
        redactedName: sample.redactedName,
        redactedDomain: sample.redactedDomain,
      }
    );
    expect(sampleCheck).toEqual([]);

    // Catches multi-label subdomains & 3-letter brand names without false-matching substrings
    const subDomainLeaks = detectConfidentialLeak(
      {
        teaserTitle: "Fast FleetPulse tool",
        teaserSummary: "Built for sized logistics fleets by Zed team.",
      },
      {
        redactedName: "Zed Logistics Pvt Ltd",
        redactedDomain: "https://app.fleetpulse.co.in/",
      }
    );
    expect(subDomainLeaks.some((f) => f.matchedTerm === "fleetpulse")).toBe(true);
    expect(subDomainLeaks.some((f) => f.matchedTerm === "zed")).toBe(true);
  });

  it("generates seller-reported auto-built draft narrative and 4-quarter series", () => {
    const draft = buildAutoListingDraft({
      sector: "Developer Tools",
      geography: "India (Remote)",
      currency: "INR",
      annualRevenue: 7_200_000,
      annualProfit: 3_100_000,
      growthPercent: 30,
      churnPercent: 2.1,
      monthlyTraffic: 18_000,
      customerCount: 150,
      ownerHoursPerWeek: 8,
      reasonForSelling: "Focusing on another product.",
      techStack: ["TypeScript", "PostgreSQL"],
      assetsIncluded: ["Primary domain & DNS transfer"],
    });

    expect(draft.teaserTitle).toContain("Developer Tools");
    expect(draft.financialNarrative).toContain("Seller-reported");
    expect(draft.financialSeries).toHaveLength(4);
    expect(draft.financialSeries.every((p) => p.source === "SELLER_REPORTED")).toBe(
      true
    );
  });
});

describe("Phase 1 redaction, media URL safety, and admin review state transitions", () => {
  it("sanitizes founder media URLs strictly allowing https:// or /api/media/ only", () => {
    expect(sanitizeFounderMediaUrl("https://cdn.example.com/note.mp3")).toBe(
      "https://cdn.example.com/note.mp3"
    );
    expect(sanitizeFounderMediaUrl("/api/media/sample-founder-note")).toBe(
      "/api/media/sample-founder-note"
    );
    expect(sanitizeFounderMediaUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeFounderMediaUrl("http://insecure.example.com/a.mp3")).toBeNull();
    expect(sanitizeFounderMediaUrl("data:text/html,<script>")).toBeNull();
    expect(sanitizeFounderMediaUrl("/api/media/../auth/logout")).toBeNull();
    expect(sanitizeFounderMediaUrl("/api/media/sample?evil=1")).toBeNull();
  });

  it("redacts sensitive identity fields for public/buyer viewers without NDA and unlocks for owner/admin", () => {
    const sample = createSampleSeedListings()[0]!;

    const publicView = sanitizeListingForViewer(sample, {
      userId: null,
      roles: [],
      hasSignedNda: false,
    });
    expect(publicView.sensitiveDetailsUnlocked).toBe(false);
    expect(publicView.redactedName).toBeNull();
    expect(publicView.redactedDomain).toBeNull();
    expect(publicView.redactedCustomers).toBeNull();
    expect(publicView.reviewerNote).toBeNull();
    expect(publicView.trustSummary.verifiedCount).toBe(3);
    expect(publicView.trustSummary.sellerReportedCount).toBe(3);

    const reviewerView = sanitizeListingForViewer(sample, {
      userId: "sample-reviewer-01",
      roles: ["REVIEWER"],
      hasSignedNda: false,
    });
    expect(reviewerView.sensitiveDetailsUnlocked).toBe(true);
    expect(reviewerView.redactedName).toContain("TaxBridge");
    expect(reviewerView.redactedDomain).toBe("taxbridge-sample.in");

    const ndaBuyerView = sanitizeListingForViewer(sample, {
      userId: "sample-buyer-01",
      roles: ["BUYER"],
      hasSignedNda: true,
    });
    expect(ndaBuyerView.sensitiveDetailsUnlocked).toBe(true);
    expect(ndaBuyerView.redactedName).toContain("TaxBridge");
  });

  it("restricts unapproved listing visibility to owning seller and admin/reviewer", () => {
    const pendingSample = createSampleSeedListings()[2]!; // PENDING_REVIEW, sample-seller-01
    expect(
      canViewerAccessListing(pendingSample, { userId: null, roles: [] })
    ).toBe(false);
    expect(
      canViewerAccessListing(pendingSample, {
        userId: "sample-seller-02",
        roles: ["SELLER"],
      })
    ).toBe(false);
    expect(
      canViewerAccessListing(pendingSample, {
        userId: "sample-seller-01",
        roles: ["SELLER"],
      })
    ).toBe(true);
    expect(
      canViewerAccessListing(pendingSample, {
        userId: "sample-reviewer-01",
        roles: ["REVIEWER"],
      })
    ).toBe(true);
  });

  it("validates admin review transitions and requires reviewer notes", () => {
    expect(
      validateListingReviewTransition({
        listingId: "b1",
        actorId: "buyer-1",
        actorRoles: ["BUYER"],
        fromStatus: "PENDING_REVIEW",
        decision: "APPROVE",
        reviewerNote: "Looks good",
      })
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });

    expect(
      validateListingReviewTransition({
        listingId: "b1",
        actorId: "rev-1",
        actorRoles: ["REVIEWER"],
        fromStatus: "PENDING_REVIEW",
        decision: "APPROVE",
        reviewerNote: "ok",
      })
    ).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });

    expect(
      validateListingReviewTransition({
        listingId: "b1",
        actorId: "rev-1",
        actorRoles: ["REVIEWER"],
        fromStatus: "DRAFT",
        decision: "APPROVE",
        reviewerNote: "Cannot approve unsubmitted draft",
      })
    ).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });

    const validApprove = validateListingReviewTransition({
      listingId: "b1",
      actorId: "rev-1",
      actorRoles: ["ADMIN"],
      fromStatus: "PENDING_REVIEW",
      decision: "APPROVE",
      reviewerNote: "Verified redaction rules and seller ownership.",
    });
    expect(validApprove).toMatchObject({
      ok: true,
      nextStatus: "APPROVED",
      auditAction: "LISTING_APPROVED",
    });
  });
});
