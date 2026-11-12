// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMemoryRateLimitsForTest } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth/session";
import type { AuthSession } from "@/lib/auth/types";
import { resetLocalListingsStoreForTest } from "@/lib/listings/store";
import { resetLocalMatchingStoreForTest } from "@/lib/matching/store";

const mockCookiesGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mockCookiesGet,
  }),
}));

import { GET as thesesGet, POST as thesesPost } from "@/app/api/theses/route";
import {
  DELETE as thesisDelete,
  GET as thesisByIdGet,
  PATCH as thesisPatch,
} from "@/app/api/theses/[id]/route";
import { POST as previewMatchesPost } from "@/app/api/matches/preview/route";
import { GET as compareGet } from "@/app/api/compare/route";
import { GET as notificationsGet, POST as notificationsReadAllPost } from "@/app/api/notifications/route";
import { PATCH as notificationReadPatch } from "@/app/api/notifications/[id]/route";
import { POST as listingsPost } from "@/app/api/listings/route";
import { POST as adminReviewPost } from "@/app/api/admin/listings/[id]/review/route";

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

const OTHER_BUYER_SESSION: AuthSession = {
  userId: "other-buyer-02",
  email: "buyer2@example.com",
  name: "Second Buyer",
  roles: ["BUYER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date().toISOString(),
  authMode: "local-dev",
  isSampleAccount: false,
};

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

describe("Phase 2 thesis, match preview, compare, and new-listing alert API routes", () => {
  const originalDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetMemoryRateLimitsForTest();
    resetLocalListingsStoreForTest();
    resetLocalMatchingStoreForTest();
    mockCookiesGet.mockReset();
  });

  afterEach(() => {
    if (originalDbUrl !== undefined) {
      process.env.DATABASE_URL = originalDbUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("enforces Buyer RBAC and per-owner isolation on thesis CRUD endpoints", async () => {
    await setActiveSession(null);
    expect((await thesesGet()).status).toBe(401);
    expect(
      (
        await thesesPost(
          new Request("http://127.0.0.1:3000/api/theses", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "Unauth thesis", sector: "B2B SaaS" }),
          })
        )
      ).status
    ).toBe(401);

    await setActiveSession(SELLER_SESSION);
    expect(
      (
        await thesesPost(
          new Request("http://127.0.0.1:3000/api/theses", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "Seller thesis attempt", sector: "B2B SaaS" }),
          })
        )
      ).status
    ).toBe(403);

    // Buyer creates thesis
    await setActiveSession(BUYER_SESSION);
    const createRes = await thesesPost(
      new Request("http://127.0.0.1:3000/api/theses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Developer tools under 15 hrs",
          sector: "Developer Tools",
          maxOwnerHours: 15,
          maxPrice: 12_000_000,
          freeText: "API monitoring developer teams",
          alertsEnabled: true,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const createdBody = await createRes.json();
    expect(createdBody.thesis.id).toBeTruthy();
    expect(createdBody.matches).toHaveLength(4);

    // Other buyer cannot read, patch, or delete it
    await setActiveSession(OTHER_BUYER_SESSION);
    expect(
      (
        await thesisByIdGet(
          new Request(`http://127.0.0.1:3000/api/theses/${createdBody.thesis.id}`),
          { params: Promise.resolve({ id: createdBody.thesis.id }) }
        )
      ).status
    ).toBe(403);
    expect(
      (
        await thesisPatch(
          new Request(`http://127.0.0.1:3000/api/theses/${createdBody.thesis.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ alertsEnabled: false }),
          }),
          { params: Promise.resolve({ id: createdBody.thesis.id }) }
        )
      ).status
    ).toBe(403);
    expect(
      (
        await thesisDelete(
          new Request(`http://127.0.0.1:3000/api/theses/${createdBody.thesis.id}`),
          { params: Promise.resolve({ id: createdBody.thesis.id }) }
        )
      ).status
    ).toBe(403);

    // Owner updates & deletes cleanly
    await setActiveSession(BUYER_SESSION);
    const patchRes = await thesisPatch(
      new Request(`http://127.0.0.1:3000/api/theses/${createdBody.thesis.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alertsEnabled: false }),
      }),
      { params: Promise.resolve({ id: createdBody.thesis.id }) }
    );
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).thesis.alertsEnabled).toBe(false);

    const delRes = await thesisDelete(
      new Request(`http://127.0.0.1:3000/api/theses/${createdBody.thesis.id}`),
      { params: Promise.resolve({ id: createdBody.thesis.id }) }
    );
    expect(delRes.status).toBe(200);
  });

  it("supports stateless preview matching and enforces <= 3 approved listings in /api/compare", async () => {
    await setActiveSession(null);

    const badPreview = await previewMatchesPost(
      new Request("http://127.0.0.1:3000/api/matches/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ freeText: "" }),
      })
    );
    expect(badPreview.status).toBe(400);

    const previewRes = await previewMatchesPost(
      new Request("http://127.0.0.1:3000/api/matches/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sector: "Content & Media",
          maxPrice: 6_000_000,
          maxOwnerHours: 8,
          freeText: "newsletter GA4",
        }),
      })
    );
    expect(previewRes.status).toBe(200);
    const previewData = await previewRes.json();
    expect(previewData.matches[0].listing.id).toBe("sample-biz-media-04");

    // Compare rejects > 3 IDs
    const tooManyRes = await compareGet(
      new Request(
        "http://127.0.0.1:3000/api/compare?ids=sample-biz-gst-01,sample-biz-d2c-02,sample-biz-media-04,sample-biz-mkt-05"
      )
    );
    expect(tooManyRes.status).toBe(400);

    // Compare excludes PENDING_REVIEW sample-biz-dev-03 and keeps confidential fields redacted
    const compareRes = await compareGet(
      new Request(
        "http://127.0.0.1:3000/api/compare?ids=sample-biz-gst-01,sample-biz-dev-03,sample-biz-media-04"
      )
    );
    expect(compareRes.status).toBe(200);
    const compareBody = await compareRes.json();
    expect(compareBody.listings).toHaveLength(2);
    expect(
      compareBody.listings.every((l: { status: string }) => l.status === "APPROVED")
    ).toBe(true);
    expect(JSON.stringify(compareBody)).not.toContain("TaxBridge");
    expect(JSON.stringify(compareBody)).not.toContain("VartaLedger");
  });

  it("fires a redaction-safe Notification alert when a newly approved listing matches a saved thesis without duplicating on re-approval", async () => {
    // 1. Buyer saves a thesis matching Developer Tools under ₹1.2Cr
    await setActiveSession(BUYER_SESSION);
    const thesisRes = await thesesPost(
      new Request("http://127.0.0.1:3000/api/theses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Automated QA & DevTools India",
          sector: "Developer Tools",
          minRevenue: 4_000_000,
          maxRevenue: 15_000_000,
          minProfit: 2_000_000,
          maxOwnerHours: 12,
          geography: "India (Remote)",
          maxPrice: 12_000_000,
          freeText: "API monitoring synthetic alerts",
          alertsEnabled: true,
        }),
      })
    );
    expect(thesisRes.status).toBe(201);

    // 2. Seller creates a matching Developer Tools listing (starts PENDING_REVIEW -> NO alert yet)
    await setActiveSession(SELLER_SESSION);
    const createRes = await listingsPost(
      new Request("http://127.0.0.1:3000/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teaserTitle: "Automated API Latency & Synthetic Alerts Tool (Remote India)",
          teaserSummary:
            "Developer tools SaaS tracking API uptime and webhook latency for 140 engineering teams.",
          redactedName: "VigilantProbe Systems Pvt Ltd",
          redactedDomain: "vigilantprobe-secret.dev",
          redactedCustomers: "140 engineering teams across Bengaluru and Singapore.",
          sector: "Developer Tools",
          geography: "India (Remote)",
          askingPrice: 9_500_000,
          currency: "INR",
          ownerHoursPerWeek: 8,
          reasonForSelling: "Founder transitioning into enterprise security consulting.",
          founderStory:
            "Bootstrapped over 3 years with automated synthetic probing workers.",
          financialNarrative:
            "Trailing 12m revenue ₹65 L and net profit ₹29 L seller-reported.",
          risksSummary: "All metrics are currently seller-reported.",
          techStack: ["TypeScript", "Node.js", "PostgreSQL"],
          assetsIncluded: ["Primary domain & DNS transfer"],
          annualRevenue: 6_500_000,
          annualProfit: 2_900_000,
          growthPercent: 35,
          churnPercent: 2.0,
          monthlyTraffic: 16_000,
          customerCount: 140,
          submitForReview: true,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const { listing: pendingListing } = await createRes.json();

    await setActiveSession(BUYER_SESSION);
    const beforeNotifs = await (await notificationsGet()).json();
    expect(beforeNotifs.unreadCount).toBe(0);

    // 3. Admin approves listing -> triggers thesis match alert!
    await setActiveSession(REVIEWER_SESSION);
    const approveRes = await adminReviewPost(
      new Request(
        `http://127.0.0.1:3000/api/admin/listings/${pendingListing.id}/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision: "APPROVE",
            reviewerNote: "No leaks detected; approved for marketplace.",
          }),
        }
      ),
      { params: Promise.resolve({ id: pendingListing.id }) }
    );
    expect(approveRes.status).toBe(200);

    // 4. Buyer receives unread notification without confidential PII leaks
    await setActiveSession(BUYER_SESSION);
    const afterNotifs = await (await notificationsGet()).json();
    expect(afterNotifs.unreadCount).toBe(1);
    const notif = afterNotifs.notifications[0];
    expect(notif.type).toBe("THESIS_MATCH");
    expect(notif.title).toContain("Automated QA & DevTools India");
    expect(notif.body).toContain("Automated API Latency");
    expect(JSON.stringify(notif)).not.toContain("VigilantProbe");
    expect(JSON.stringify(notif)).not.toContain("vigilantprobe-secret.dev");

    // 5. Re-flagging & re-approving the same listing does NOT duplicate the alert
    await setActiveSession(REVIEWER_SESSION);
    await adminReviewPost(
      new Request(
        `http://127.0.0.1:3000/api/admin/listings/${pendingListing.id}/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision: "FLAG",
            reviewerNote: "Temporary flag check for dedupe test.",
          }),
        }
      ),
      { params: Promise.resolve({ id: pendingListing.id }) }
    );
    await adminReviewPost(
      new Request(
        `http://127.0.0.1:3000/api/admin/listings/${pendingListing.id}/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision: "APPROVE",
            reviewerNote: "Re-approved after temporary flag check.",
          }),
        }
      ),
      { params: Promise.resolve({ id: pendingListing.id }) }
    );

    await setActiveSession(BUYER_SESSION);
    const afterReapprove = await (await notificationsGet()).json();
    expect(afterReapprove.notifications).toHaveLength(1);

    // 6. Other buyer cannot mark this notification as read; owner can
    await setActiveSession(OTHER_BUYER_SESSION);
    const hijackRes = await notificationReadPatch(
      new Request(`http://127.0.0.1:3000/api/notifications/${notif.id}`, {
        method: "PATCH",
      }),
      { params: Promise.resolve({ id: notif.id }) }
    );
    expect(hijackRes.status).toBe(403);

    await setActiveSession(BUYER_SESSION);
    const readRes = await notificationReadPatch(
      new Request(`http://127.0.0.1:3000/api/notifications/${notif.id}`, {
        method: "PATCH",
      }),
      { params: Promise.resolve({ id: notif.id }) }
    );
    expect(readRes.status).toBe(200);
    const updatedNotifs = await (await notificationsGet()).json();
    expect(updatedNotifs).toMatchObject({ unreadCount: 0 });

    const readAllRes = await notificationsReadAllPost();
    expect(readAllRes.status).toBe(200);
  });
});
