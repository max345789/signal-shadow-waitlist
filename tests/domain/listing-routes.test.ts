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
});
