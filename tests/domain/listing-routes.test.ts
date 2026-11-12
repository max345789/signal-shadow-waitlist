// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMemoryRateLimitsForTest } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth/session";
import type { AuthSession } from "@/lib/auth/types";
import { resetLocalListingsStoreForTest } from "@/lib/listings/store";

const mockCookiesGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mockCookiesGet,
  }),
}));

import { GET as listingsGet, POST as listingsPost } from "@/app/api/listings/route";
import { GET as listingByIdGet, PATCH as listingPatch } from "@/app/api/listings/[id]/route";
import { POST as adminReviewPost } from "@/app/api/admin/listings/[id]/review/route";
import { POST as questionPost } from "@/app/api/listings/[id]/questions/route";
import { PATCH as questionAnswerPatch } from "@/app/api/listings/[id]/questions/[questionId]/route";
import { GET as sampleMediaGet } from "@/app/api/media/sample-founder-note/route";

async function setActiveSession(session: AuthSession | null) {
  if (!session) {
    mockCookiesGet.mockReturnValue(undefined);
    return;
  }
  const token = await signSessionToken(session);
  mockCookiesGet.mockImplementation((name: string) =>
    name === SESSION_COOKIE_NAME ? { value: token } : undefined
  );
}

const SELLER_SESSION: AuthSession = {
  userId: "sample-seller-01",
  email: "seller.sample@trustmarketplace.local",
  name: "Rohan Mehta (Sample Seller)",
  roles: ["SELLER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date().toISOString(),
  authMode: "local-dev",
  isSampleAccount: true,
};

const OTHER_SELLER_SESSION: AuthSession = {
  userId: "sample-seller-02",
  email: "seller2.sample@trustmarketplace.local",
  name: "Kavita Deshmukh (Sample Seller)",
  roles: ["SELLER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date().toISOString(),
  authMode: "local-dev",
  isSampleAccount: true,
};

const BUYER_SESSION: AuthSession = {
  userId: "sample-buyer-01",
  email: "buyer.sample@trustmarketplace.local",
  name: "Ananya Rao (Sample Buyer)",
  roles: ["BUYER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date().toISOString(),
  authMode: "local-dev",
  isSampleAccount: true,
};

const REVIEWER_SESSION: AuthSession = {
  userId: "sample-reviewer-01",
  email: "reviewer.sample@trustmarketplace.local",
  name: "Priya Nair (Sample Reviewer)",
  roles: ["REVIEWER", "ADMIN"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date().toISOString(),
  authMode: "local-dev",
  isSampleAccount: true,
};

const VALID_LISTING_PAYLOAD = {
  teaserTitle: "Profitable B2B Logistics SaaS in Pune",
  teaserSummary:
    "Automated fleet dispatch SaaS serving 95 regional logistics operators with predictable annual subscriptions.",
  redactedName: "FleetPulse Systems Pvt Ltd",
  redactedDomain: "fleetpulse.in",
  redactedCustomers: "95 transport operators across Maharashtra and Gujarat.",
  sector: "B2B SaaS",
  geography: "India (Remote)",
  askingPrice: 12_000_000,
  currency: "INR",
  ownerHoursPerWeek: 10,
  reasonForSelling: "Founder is transitioning into institutional advisory work.",
  founderStory:
    "Built over three years with one part-time support engineer and automated webhook monitoring.",
  founderMediaUrl: "",
  founderMediaType: null,
  financialNarrative:
    "Trailing 12-month revenue is ₹72 L with ₹34 L seller-reported net profit.",
  risksSummary:
    "All metrics are currently seller-reported until Stripe read-only connection is linked.",
  techStack: ["TypeScript", "PostgreSQL"],
  assetsIncluded: ["Primary domain & DNS transfer", "Production source code repository"],
  annualRevenue: 7_200_000,
  annualProfit: 3_400_000,
  growthPercent: 28,
  churnPercent: 2.1,
  monthlyTraffic: 12_400,
  customerCount: 95,
  submitForReview: true,
};

describe("Phase 1 listing, admin review, redaction, and Q&A API routes", () => {
  const originalDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetMemoryRateLimitsForTest();
    resetLocalListingsStoreForTest();
    mockCookiesGet.mockReset();
  });

  afterEach(() => {
    if (originalDbUrl !== undefined) {
      process.env.DATABASE_URL = originalDbUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("enforces Seller RBAC on listing creation and never fakes verified metrics", async () => {
    await setActiveSession(null);
    const unauthRes = await listingsPost(
      new Request("http://127.0.0.1:3000/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_LISTING_PAYLOAD),
      })
    );
    expect(unauthRes.status).toBe(401);

    await setActiveSession(BUYER_SESSION);
    const buyerRes = await listingsPost(
      new Request("http://127.0.0.1:3000/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_LISTING_PAYLOAD),
      })
    );
    expect(buyerRes.status).toBe(403);

    await setActiveSession(SELLER_SESSION);
    const createRes = await listingsPost(
      new Request("http://127.0.0.1:3000/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_LISTING_PAYLOAD),
      })
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.listing.status).toBe("PENDING_REVIEW");
    expect(created.listing.isSampleData).toBe(false);
    expect(created.listing.trustSummary.verifiedCount).toBe(0);
    expect(created.listing.trustSummary.sellerReportedCount).toBe(6);
  });

  it("blocks submission when confidential name or domain leaks into public teaser", async () => {
    await setActiveSession(SELLER_SESSION);
    const leakyRes = await listingsPost(
      new Request("http://127.0.0.1:3000/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...VALID_LISTING_PAYLOAD,
          teaserTitle: "Profitable FleetPulse SaaS in Maharashtra",
        }),
      })
    );
    expect(leakyRes.status).toBe(400);
    const body = await leakyRes.json();
    expect(body.error).toContain("fleetpulse");
  });

  it("enforces seller ownership on PATCH and runs full Seller -> Admin Approve -> Public Redacted flow", async () => {
    await setActiveSession(SELLER_SESSION);
    const createRes = await listingsPost(
      new Request("http://127.0.0.1:3000/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_LISTING_PAYLOAD),
      })
    );
    const { listing: created } = await createRes.json();

    // Unapproved listing must not appear in public GET /api/listings or GET /api/listings/[id]
    await setActiveSession(null);
    const publicListBefore = await (
      await listingsGet(new Request("http://127.0.0.1:3000/api/listings"))
    ).json();
    expect(
      publicListBefore.listings.some((l: { id: string }) => l.id === created.id)
    ).toBe(false);

    const publicDetailBefore = await listingByIdGet(
      new Request(`http://127.0.0.1:3000/api/listings/${created.id}`),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(publicDetailBefore.status).toBe(404);

    // Another seller cannot edit the listing
    await setActiveSession(OTHER_SELLER_SESSION);
    const crossSellerPatch = await listingPatch(
      new Request(`http://127.0.0.1:3000/api/listings/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_LISTING_PAYLOAD),
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(crossSellerPatch.status).toBe(403);

    // Non-admin cannot approve listing
    await setActiveSession(SELLER_SESSION);
    const sellerApproveAttempt = await adminReviewPost(
      new Request(`http://127.0.0.1:3000/api/admin/listings/${created.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "APPROVE",
          reviewerNote: "Self approval attempt",
        }),
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(sellerApproveAttempt.status).toBe(403);

    // Admin requires reviewer note >= 5 chars, then approves
    await setActiveSession(REVIEWER_SESSION);
    const missingNoteRes = await adminReviewPost(
      new Request(`http://127.0.0.1:3000/api/admin/listings/${created.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "APPROVE", reviewerNote: "ok" }),
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(missingNoteRes.status).toBe(400);

    const approveRes = await adminReviewPost(
      new Request(`http://127.0.0.1:3000/api/admin/listings/${created.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "APPROVE",
          reviewerNote: "Confirmed no PII leaks and seller-reported labels accurate.",
        }),
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(approveRes.status).toBe(200);
    const approvedData = await approveRes.json();
    expect(approvedData.listing.status).toBe("APPROVED");
    expect(approvedData.listing.auditLogs[0].action).toBe("LISTING_APPROVED");

    // Public anonymous visitor now sees the approved listing, strictly redacted
    await setActiveSession(null);
    const publicDetailAfter = await listingByIdGet(
      new Request(`http://127.0.0.1:3000/api/listings/${created.id}`),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(publicDetailAfter.status).toBe(200);
    const publicPayload = await publicDetailAfter.json();
    expect(publicPayload.listing.sensitiveDetailsUnlocked).toBe(false);
    expect(publicPayload.listing.redactedName).toBeNull();
    expect(publicPayload.listing.redactedDomain).toBeNull();
    expect(publicPayload.listing.redactedCustomers).toBeNull();
    expect(JSON.stringify(publicPayload)).not.toContain("FleetPulse");
    expect(JSON.stringify(publicPayload)).not.toContain("fleetpulse.in");

    // Buyer can ask a Q&A question; owning seller can answer it; other seller cannot
    await setActiveSession(BUYER_SESSION);
    const askRes = await questionPost(
      new Request(`http://127.0.0.1:3000/api/listings/${created.id}/questions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: "How long does onboarding take for a new logistics customer?",
        }),
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(askRes.status).toBe(201);
    const { question } = await askRes.json();

    await setActiveSession(OTHER_SELLER_SESSION);
    const wrongSellerAns = await questionAnswerPatch(
      new Request(
        `http://127.0.0.1:3000/api/listings/${created.id}/questions/${question.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answer: "Unauthorized answer attempt." }),
        }
      ),
      { params: Promise.resolve({ id: created.id, questionId: question.id }) }
    );
    expect(wrongSellerAns.status).toBe(403);

    await setActiveSession(SELLER_SESSION);
    const ownerAns = await questionAnswerPatch(
      new Request(
        `http://127.0.0.1:3000/api/listings/${created.id}/questions/${question.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            answer: "Typical operator onboarding takes 48 hours using our import scripts.",
          }),
        }
      ),
      { params: Promise.resolve({ id: created.id, questionId: question.id }) }
    );
    expect(ownerAns.status).toBe(200);
    const answered = await ownerAns.json();
    expect(answered.question.answer).toContain("48 hours");
  });

  it("rate-limits listing creation and serves a valid RIFF/WAVE sample founder audio note", async () => {
    await setActiveSession(SELLER_SESSION);
    for (let i = 0; i < 15; i++) {
      const res = await listingsPost(
        new Request("http://127.0.0.1:3000/api/listings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...VALID_LISTING_PAYLOAD,
            teaserTitle: `Profitable B2B SaaS Listing Batch ${i}`,
          }),
        })
      );
      expect(res.status).toBe(201);
    }

    const throttled = await listingsPost(
      new Request("http://127.0.0.1:3000/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_LISTING_PAYLOAD),
      })
    );
    expect(throttled.status).toBe(429);

    const mediaRes = await sampleMediaGet();
    expect(mediaRes.status).toBe(200);
    expect(mediaRes.headers.get("content-type")).toBe("audio/wav");
    const bytes = new Uint8Array(await mediaRes.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
  });

  it("blocks leaks in reasonForSelling, handles negative profit / malformed inputs, enforces draft pull-back on PATCH, and blocks self-Q&A", async () => {
    // 1. Leak in reasonForSelling must be blocked
    await setActiveSession(SELLER_SESSION);
    const reasonLeakRes = await listingsPost(
      new Request("http://127.0.0.1:3000/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...VALID_LISTING_PAYLOAD,
          reasonForSelling: "Selling FleetPulse because founder is moving abroad.",
        }),
      })
    );
    expect(reasonLeakRes.status).toBe(400);

    // 2. Non-HTTPS founderMediaUrl and malformed financialSeries rejected with 400
    const badMediaRes = await listingsPost(
      new Request("http://127.0.0.1:3000/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...VALID_LISTING_PAYLOAD,
          founderMediaUrl: "http://insecure.example.com/audio.mp3",
        }),
      })
    );
    expect(badMediaRes.status).toBe(400);

    const badSeriesRes = await listingsPost(
      new Request("http://127.0.0.1:3000/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...VALID_LISTING_PAYLOAD,
          financialSeries: [{ period: "", revenue: -50, profit: 10 }],
        }),
      })
    );
    expect(badSeriesRes.status).toBe(400);

    // 3. Negative annualProfit with 0 annualRevenue succeeds cleanly as seller-reported
    const lossMakingRes = await listingsPost(
      new Request("http://127.0.0.1:3000/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...VALID_LISTING_PAYLOAD,
          annualRevenue: 0,
          annualProfit: -450_000,
        }),
      })
    );
    expect(lossMakingRes.status).toBe(201);
    const { listing: lossListing } = await lossMakingRes.json();
    expect(lossListing.valuationLow).toBeNull();

    // 4. PATCH with submitForReview: false on PENDING_REVIEW transitions cleanly to DRAFT (no leaked pending state)
    const draftPullbackRes = await listingPatch(
      new Request(`http://127.0.0.1:3000/api/listings/${lossListing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...VALID_LISTING_PAYLOAD,
          teaserTitle: "Updated FleetPulse title saved as draft",
          submitForReview: false,
        }),
      }),
      { params: Promise.resolve({ id: lossListing.id }) }
    );
    expect(draftPullbackRes.status).toBe(200);
    const pulledBack = await draftPullbackRes.json();
    expect(pulledBack.listing.status).toBe("DRAFT");

    // 5. Re-submit cleanly -> Admin FLAG -> Seller fixes & re-submits -> Admin APPROVE -> Seller blocked from self-Q&A, Buyer gets Prospective Buyer
    const resubmitRes = await listingPatch(
      new Request(`http://127.0.0.1:3000/api/listings/${lossListing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...VALID_LISTING_PAYLOAD,
          submitForReview: true,
        }),
      }),
      { params: Promise.resolve({ id: lossListing.id }) }
    );
    expect(resubmitRes.status).toBe(200);

    await setActiveSession(REVIEWER_SESSION);
    const flagRes = await adminReviewPost(
      new Request(`http://127.0.0.1:3000/api/admin/listings/${lossListing.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "FLAG",
          reviewerNote: "Clarify zero-revenue launch stage in risks summary.",
        }),
      }),
      { params: Promise.resolve({ id: lossListing.id }) }
    );
    expect(flagRes.status).toBe(200);
    expect((await flagRes.json()).listing.status).toBe("FLAGGED");

    const approveAfterFlag = await adminReviewPost(
      new Request(`http://127.0.0.1:3000/api/admin/listings/${lossListing.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "APPROVE",
          reviewerNote: "Disclosures verified after seller clarification.",
        }),
      }),
      { params: Promise.resolve({ id: lossListing.id }) }
    );
    expect(approveAfterFlag.status).toBe(200);
    expect((await approveAfterFlag.json()).listing.status).toBe("APPROVED");

    // Seller cannot post fake buyer Q&A on own listing
    await setActiveSession(SELLER_SESSION);
    const selfQuestionRes = await questionPost(
      new Request(`http://127.0.0.1:3000/api/listings/${lossListing.id}/questions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "Self-posted fake buyer interest check?" }),
      }),
      { params: Promise.resolve({ id: lossListing.id }) }
    );
    expect(selfQuestionRes.status).toBe(403);

    // Buyer gets honest Prospective Buyer label (never Verified Buyer without KYC)
    await setActiveSession(BUYER_SESSION);
    const buyerQuestionRes = await questionPost(
      new Request(`http://127.0.0.1:3000/api/listings/${lossListing.id}/questions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "Is source code covered by automated tests?" }),
      }),
      { params: Promise.resolve({ id: lossListing.id }) }
    );
    expect(buyerQuestionRes.status).toBe(201);
    const createdQ = await buyerQuestionRes.json();
    expect(createdQ.question.askerLabel).toBe("Prospective Buyer");

    // Verify editing sample listing preserves verified metrics & verified financialSeries
    await setActiveSession(SELLER_SESSION);
    const samplePatchRes = await listingPatch(
      new Request("http://127.0.0.1:3000/api/listings/sample-biz-gst-01", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...VALID_LISTING_PAYLOAD,
          redactedName: "TaxBridge Compliance Systems Pvt Ltd (Confidential Sample)",
          redactedDomain: "taxbridge-sample.in",
          teaserTitle: "Profitable B2B GST SaaS with updated copy",
          submitForReview: true,
        }),
      }),
      { params: Promise.resolve({ id: "sample-biz-gst-01" }) }
    );
    expect(samplePatchRes.status).toBe(200);
    const updatedSample = await samplePatchRes.json();
    expect(updatedSample.listing.trustSummary.verifiedCount).toBe(3);
    expect(updatedSample.listing.financialSeries[0].source).toBe("VERIFIED");
  });
});
