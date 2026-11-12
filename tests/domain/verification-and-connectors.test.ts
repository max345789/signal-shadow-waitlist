// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMemoryRateLimitsForTest } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth/session";
import type { AuthSession } from "@/lib/auth/types";
import {
  hasActiveBuyerDataAccessVerification,
  validateVerificationReviewTransition,
} from "@/lib/domain/verification";
import { resetLocalListingsStoreForTest } from "@/lib/listings/store";
import { fetchReadOnlyConnectorMetrics } from "@/lib/verification/connectors";
import { reconcileExpiredVerifications } from "@/lib/verification/store";

const mockCookiesGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mockCookiesGet,
  }),
}));

import { GET as verifyGet } from "@/app/api/verification/route";
import { POST as identityPost } from "@/app/api/verification/identity/route";
import { POST as pofPost } from "@/app/api/verification/proof-of-funds/route";
import { POST as connectPost } from "@/app/api/verification/connectors/route";
import { POST as syncPost } from "@/app/api/verification/connectors/[id]/sync/route";
import { POST as revokePost } from "@/app/api/verification/connectors/[id]/revoke/route";
import { POST as refreshPost } from "@/app/api/verification/refresh/route";
import { GET as adminVerificationsGet } from "@/app/api/admin/verifications/route";
import { POST as adminVerificationReviewPost } from "@/app/api/admin/verifications/[id]/review/route";
import { GET as listingByIdGet } from "@/app/api/listings/[id]/route";
import { POST as adminListingReviewPost } from "@/app/api/admin/listings/[id]/review/route";
import { POST as questionPost } from "@/app/api/listings/[id]/questions/route";

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

describe("Phase 3 Verification domain & read-only connector adapters", () => {
  it("evaluates read-only connector tokens deterministically for valid, fail, and expired cases", async () => {
    const okStripe = await fetchReadOnlyConnectorMetrics({
      provider: "Stripe",
      accountIdentifier: "acct_demo_01",
      readOnlyToken: "rk_sandbox_valid_stripe_2026",
      baselineMetrics: [
        { key: "REVENUE", value: 7_200_000, currency: "INR" },
        { key: "CUSTOMERS", value: 185, currency: null },
      ],
      businessCurrency: "INR",
      syncCount: 0,
    });
    expect(okStripe.ok).toBe(true);
    if (okStripe.ok) {
      expect(okStripe.metrics).toHaveLength(2);
      expect(okStripe.metrics[0]?.source).toBe("STRIPE");
      expect(okStripe.accountHint).toContain("Stripe");
    }

    const failRazorpay = await fetchReadOnlyConnectorMetrics({
      provider: "Razorpay",
      accountIdentifier: "rzp_demo_02",
      readOnlyToken: "rzp_sandbox_fail_token",
      baselineMetrics: [],
      businessCurrency: "INR",
    });
    expect(failRazorpay).toMatchObject({ ok: false, code: "CONNECTION_FAILED" });

    const expiredGa4 = await fetchReadOnlyConnectorMetrics({
      provider: "GA4",
      accountIdentifier: "properties/123456",
      readOnlyToken: "ga4_sandbox_expired_token",
      baselineMetrics: [],
      businessCurrency: "INR",
    });
    expect(expiredGa4).toMatchObject({ ok: false, code: "TOKEN_EXPIRED" });
  });

  it("enforces Buyer KYC + Proof of Funds active non-expired gate for Data access", () => {
    const now = new Date("2026-11-12T10:00:00.000Z");
    const validIdentity = {
      id: "v-id",
      provider: "Persona",
      status: "VERIFIED" as const,
      verifiedAt: "2026-11-10T10:00:00.000Z",
      expiresAt: "2027-02-01T10:00:00.000Z",
    };
    const validPof = {
      id: "v-pof",
      provider: "Setu AA",
      status: "VERIFIED" as const,
      verifiedAt: "2026-11-10T10:00:00.000Z",
      expiresAt: "2026-12-10T10:00:00.000Z",
    };
    const expiredPof = {
      ...validPof,
      expiresAt: "2026-11-11T10:00:00.000Z",
    };

    expect(
      hasActiveBuyerDataAccessVerification({
        identity: validIdentity,
        proofOfFunds: null,
        now,
      }).allowed
    ).toBe(false);

    expect(
      hasActiveBuyerDataAccessVerification({
        identity: validIdentity,
        proofOfFunds: expiredPof,
        now,
      }).allowed
    ).toBe(false);

    expect(
      hasActiveBuyerDataAccessVerification({
        identity: validIdentity,
        proofOfFunds: validPof,
        now,
      }).allowed
    ).toBe(true);
  });

  it("validates Admin verification review transitions and reviewer notes", () => {
    expect(
      validateVerificationReviewTransition({
        actorRoles: ["BUYER"],
        fromStatus: "PENDING",
        decision: "APPROVE",
        reviewerNote: "Looks good",
      })
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });

    expect(
      validateVerificationReviewTransition({
        actorRoles: ["REVIEWER"],
        fromStatus: "PENDING",
        decision: "APPROVE",
        reviewerNote: "ok",
      })
    ).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });

    expect(
      validateVerificationReviewTransition({
        actorRoles: ["REVIEWER"],
        fromStatus: "PENDING",
        decision: "EXPIRE",
        reviewerNote: "Cannot expire a pending record directly.",
      })
    ).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });

    expect(
      validateVerificationReviewTransition({
        actorRoles: ["ADMIN"],
        fromStatus: "VERIFIED",
        decision: "EXPIRE",
        reviewerNote: "Token TTL elapsed during audit.",
      })
    ).toMatchObject({
      ok: true,
      nextStatus: "EXPIRED",
      auditAction: "VERIFICATION_EXPIRED",
    });
  });
});

describe("Phase 3 Verification Centre, Connector Sync, Expiry & Admin Review API routes", () => {
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

  it("requires auth on /api/verification, runs Buyer KYC + Proof of Funds flow, and updates Q&A buyer badge", async () => {
    await setActiveSession(null);
    const unauth = await verifyGet();
    expect(unauth.status).toBe(401);

    // Approve sample-biz-dev-03 so Buyer can test Q&A attribution
    await setActiveSession(REVIEWER_SESSION);
    await adminListingReviewPost(
      new Request("http://127.0.0.1:3000/api/admin/listings/sample-biz-dev-03/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "APPROVE",
          reviewerNote: "Approved for Phase 3 testing.",
        }),
      }),
      { params: Promise.resolve({ id: "sample-biz-dev-03" }) }
    );

    // Buyer submits KYC and POF -> enters PENDING
    await setActiveSession(BUYER_SESSION);
    const idRes = await identityPost(
      new Request("http://127.0.0.1:3000/api/verification/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "Persona",
          legalName: "Ananya Rao",
          country: "India",
          documentType: "PAN",
          referenceLast4: "482F",
          roleContext: "BUYER",
        }),
      })
    );
    expect(idRes.status).toBe(201);
    const idPayload = await idRes.json();
    expect(idPayload.verification.record.status).toBe("PENDING");
    expect(idPayload.verification.evaluated.isVerified).toBe(false);

    const pofRes = await pofPost(
      new Request("http://127.0.0.1:3000/api/verification/proof-of-funds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "Setu AA",
          amount: 25_000_000,
          currency: "INR",
          institutionLabel: "HDFC Corporate ****4821",
          attestationRef: "SETU-AA-9941",
        }),
      })
    );
    expect(pofRes.status).toBe(201);
    const pofPayload = await pofRes.json();

    // Before Admin approves KYC, Q&A question must still show Prospective Buyer
    const qBefore = await questionPost(
      new Request("http://127.0.0.1:3000/api/listings/sample-biz-dev-03/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "What is the probe region latency SLA?" }),
      }),
      { params: Promise.resolve({ id: "sample-biz-dev-03" }) }
    );
    expect((await qBefore.json()).question.askerLabel).toBe("Prospective Buyer");

    // Non-admin cannot access admin verification queue
    const nonAdminRes = await adminVerificationsGet();
    expect(nonAdminRes.status).toBe(403);

    // Admin approves both Buyer KYC and POF
    await setActiveSession(REVIEWER_SESSION);
    const approveId = await adminVerificationReviewPost(
      new Request(
        `http://127.0.0.1:3000/api/admin/verifications/${idPayload.verification.record.id}/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision: "APPROVE",
            reviewerNote: "Persona KYC check confirmed and valid.",
          }),
        }
      ),
      { params: Promise.resolve({ id: idPayload.verification.record.id }) }
    );
    expect(approveId.status).toBe(200);

    const approvePof = await adminVerificationReviewPost(
      new Request(
        `http://127.0.0.1:3000/api/admin/verifications/${pofPayload.verification.record.id}/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision: "APPROVE",
            reviewerNote: "Setu AA liquid balance confirmed above target.",
          }),
        }
      ),
      { params: Promise.resolve({ id: pofPayload.verification.record.id }) }
    );
    expect(approvePof.status).toBe(200);

    // Buyer now has active Data access readiness AND Identity-verified Buyer badge in Q&A
    await setActiveSession(BUYER_SESSION);
    const centerAfter = await (await verifyGet()).json();
    expect(centerAfter.buyerDataAccess.allowed).toBe(true);
    expect(centerAfter.identity.evaluated.isVerified).toBe(true);
    expect(centerAfter.proofOfFunds.evaluated.isVerified).toBe(true);

    const qAfter = await questionPost(
      new Request("http://127.0.0.1:3000/api/listings/sample-biz-dev-03/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "Are webhook alerts included on all plans?" }),
      }),
      { params: Promise.resolve({ id: "sample-biz-dev-03" }) }
    );
    expect((await qAfter.json()).question.askerLabel).toBe(
      "Identity-verified Buyer"
    );
  });

  it("connects Stripe + GA4 read-only sources, enforces seller ownership, refreshes vitals, never leaks raw tokens, and removes Verified mark on failure/expiry/revoke", async () => {
    // Approve sample-biz-dev-03 (originally all Seller-reported)
    await setActiveSession(REVIEWER_SESSION);
    await adminListingReviewPost(
      new Request("http://127.0.0.1:3000/api/admin/listings/sample-biz-dev-03/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "APPROVE",
          reviewerNote: "Approved for connector testing.",
        }),
      }),
      { params: Promise.resolve({ id: "sample-biz-dev-03" }) }
    );

    // Cross-seller connection attempt blocked (403)
    await setActiveSession(OTHER_SELLER_SESSION);
    const crossSellerConnect = await connectPost(
      new Request("http://127.0.0.1:3000/api/verification/connectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId: "sample-biz-dev-03",
          connectorKind: "PAYMENT",
          provider: "Stripe",
          accountIdentifier: "acct_hijack_01",
          readOnlyToken: "rk_sandbox_valid_hijack",
          syncIntervalMinutes: 60,
        }),
      })
    );
    expect(crossSellerConnect.status).toBe(403);

    // Owning Seller connects Stripe (Payment) and Plausible (Analytics)
    await setActiveSession(SELLER_SESSION);
    const stripeToken = "rk_sandbox_valid_secret_9911";
    const stripeRes = await connectPost(
      new Request("http://127.0.0.1:3000/api/verification/connectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId: "sample-biz-dev-03",
          connectorKind: "PAYMENT",
          provider: "Stripe",
          accountIdentifier: "acct_pulsecheck_01",
          readOnlyToken: stripeToken,
          syncIntervalMinutes: 60,
        }),
      })
    );
    expect(stripeRes.status).toBe(201);
    const stripeData = await stripeRes.json();
    const stripeVerId = stripeData.verification.record.id;
    expect(stripeData.verification.evaluated.isVerified).toBe(true);
    expect(stripeData.verification.evaluated.lastVerifiedLabel).toContain(
      "Last verified"
    );

    const plausibleToken = "plausible_sandbox_valid_secret_8822";
    const plausibleRes = await connectPost(
      new Request("http://127.0.0.1:3000/api/verification/connectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId: "sample-biz-dev-03",
          connectorKind: "ANALYTICS",
          provider: "Plausible",
          accountIdentifier: "site_pulsecheck",
          readOnlyToken: plausibleToken,
          syncIntervalMinutes: 60,
        }),
      })
    );
    expect(plausibleRes.status).toBe(201);
    const plausibleVerId = (await plausibleRes.json()).verification.record.id;

    // Listing now has 3 verified metrics (REVENUE, CUSTOMERS via Stripe; TRAFFIC via Plausible)
    const listingAfterConnect = await (
      await listingByIdGet(
        new Request("http://127.0.0.1:3000/api/listings/sample-biz-dev-03"),
        { params: Promise.resolve({ id: "sample-biz-dev-03" }) }
      )
    ).json();
    expect(listingAfterConnect.listing.trustSummary.verifiedCount).toBe(3);
    expect(listingAfterConnect.listing.trustSummary.sellerReportedCount).toBe(3);
    expect(listingAfterConnect.listing.financialSeries[0].source).toBe("VERIFIED");
    // Raw tokens must NEVER appear in serialized payloads
    expect(JSON.stringify(listingAfterConnect)).not.toContain(stripeToken);
    expect(JSON.stringify(listingAfterConnect)).not.toContain(plausibleToken);

    const verifyCenterRaw = await (await verifyGet()).text();
    expect(verifyCenterRaw).not.toContain(stripeToken);
    expect(verifyCenterRaw).not.toContain(plausibleToken);

    // Force auto-refresh keeps active connections verified
    const refreshRes = await refreshPost(
      new Request("http://127.0.0.1:3000/api/verification/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId: "sample-biz-dev-03",
          force: true,
        }),
      })
    );
    expect(refreshRes.status).toBe(200);
    const refreshSummary = await refreshRes.json();
    expect(refreshSummary.refreshedCount).toBe(2);

    // Syncing Stripe with a failing/revoked token immediately strips the Verified mark!
    const failSyncRes = await syncPost(
      new Request(
        `http://127.0.0.1:3000/api/verification/connectors/${stripeVerId}/sync`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ readOnlyToken: "rk_sandbox_fail_revoked" }),
        }
      ),
      { params: Promise.resolve({ id: stripeVerId }) }
    );
    expect(failSyncRes.status).toBe(200);
    const failSyncData = await failSyncRes.json();
    expect(failSyncData.verification.evaluated.isVerified).toBe(false);
    expect(failSyncData.verification.evaluated.label).toBe("Connection failed");

    const listingAfterStripeFail = await (
      await listingByIdGet(
        new Request("http://127.0.0.1:3000/api/listings/sample-biz-dev-03"),
        { params: Promise.resolve({ id: "sample-biz-dev-03" }) }
      )
    ).json();
    // Only Plausible (TRAFFIC) remains verified; Stripe (REVENUE, CUSTOMERS) lost Verified mark
    expect(listingAfterStripeFail.listing.trustSummary.verifiedCount).toBe(1);
    expect(listingAfterStripeFail.listing.trustSummary.expiredOrFailedCount).toBe(2);
    expect(listingAfterStripeFail.listing.financialSeries[0].source).toBe(
      "SELLER_REPORTED"
    );

    // Revoking Plausible removes the last Verified mark cleanly
    const revokeRes = await revokePost(
      new Request(
        `http://127.0.0.1:3000/api/verification/connectors/${plausibleVerId}/revoke`,
        { method: "POST" }
      ),
      { params: Promise.resolve({ id: plausibleVerId }) }
    );
    expect(revokeRes.status).toBe(200);

    const listingAfterAllRemoved = await (
      await listingByIdGet(
        new Request("http://127.0.0.1:3000/api/listings/sample-biz-dev-03"),
        { params: Promise.resolve({ id: "sample-biz-dev-03" }) }
      )
    ).json();
    expect(listingAfterAllRemoved.listing.trustSummary.verifiedCount).toBe(0);
    expect(
      listingAfterAllRemoved.listing.trustSummary.expiredOrFailedCount
    ).toBe(3);

    // Expiry reconciliation: connect Razorpay with short TTL, then advance clock past expiry
    const rzpRes = await connectPost(
      new Request("http://127.0.0.1:3000/api/verification/connectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId: "sample-biz-dev-03",
          connectorKind: "PAYMENT",
          provider: "Razorpay",
          accountIdentifier: "rzp_live_demo_01",
          readOnlyToken: "rzp_sandbox_valid_2026",
          syncIntervalMinutes: 15,
          expiresInHours: 1,
        }),
      })
    );
    expect(rzpRes.status).toBe(201);

    const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const reconciled = await reconcileExpiredVerifications(twoHoursLater);
    expect(reconciled.expiredCount).toBeGreaterThanOrEqual(1);

    const listingAfterExpiry = await (
      await listingByIdGet(
        new Request("http://127.0.0.1:3000/api/listings/sample-biz-dev-03"),
        { params: Promise.resolve({ id: "sample-biz-dev-03" }) }
      )
    ).json();
    expect(listingAfterExpiry.listing.trustSummary.verifiedCount).toBe(0);
    const revMetric = listingAfterExpiry.listing.metrics.find(
      (m: { key: string }) => m.key === "REVENUE"
    );
    expect(revMetric.trust.isVerified).toBe(false);
    expect(revMetric.trust.label).toBe("Verification expired");
  });
});
