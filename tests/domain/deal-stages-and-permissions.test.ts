// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateStageTransition } from "@/lib/domain/deal-stages";
import { evaluateVerification } from "@/lib/domain/verification";
import {
  canCreateListing,
  canEnterDealRoom,
  canReviewAdminQueue,
} from "@/lib/auth/permissions";
import {
  getCurrentTotpTokenForDev,
  hashPassword,
  verifyPassword,
  verifyTotpCode,
} from "@/lib/auth/crypto";
import { signSessionToken, verifySessionToken } from "@/lib/auth/session";
import { checkRateLimit, resetMemoryRateLimitsForTest } from "@/lib/auth/rate-limit";
import {
  formatCurrency,
  formatRelativeVerifiedTime,
} from "@/lib/format/currency";
import type { AuthSession } from "@/lib/auth/types";

describe("Deal stage transitions & audit log generation", () => {
  it("allows valid progression and writes AuditLog draft", () => {
    const result = validateStageTransition({
      dealRoomId: "deal-1",
      actorId: "buyer-1",
      actorRole: "BUYER",
      fromStage: "INTRO",
      toStage: "NDA",
      ndaSigned: false,
      buyerIdentityVerified: false,
      buyerProofOfFundsVerified: false,
      offerAccepted: false,
      escrowFunded: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextStage).toBe("NDA");
      expect(result.auditEntry).toMatchObject({
        dealRoomId: "deal-1",
        action: "STAGE_TRANSITION",
        previousState: { stage: "INTRO" },
        newState: { stage: "NDA" },
      });
    }
  });

  it("blocks skipping stages (INTRO -> OFFER)", () => {
    const result = validateStageTransition({
      dealRoomId: "deal-1",
      actorId: "buyer-1",
      actorRole: "BUYER",
      fromStage: "INTRO",
      toStage: "OFFER",
      ndaSigned: true,
      buyerIdentityVerified: true,
      buyerProofOfFundsVerified: true,
      offerAccepted: false,
      escrowFunded: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_TRANSITION");
    }
  });

  it("blocks NDA -> DATA_ACCESS without signed NDA and buyer KYC + proof of funds", () => {
    const missingKyc = validateStageTransition({
      dealRoomId: "deal-1",
      actorId: "buyer-1",
      actorRole: "BUYER",
      fromStage: "NDA",
      toStage: "DATA_ACCESS",
      ndaSigned: true,
      buyerIdentityVerified: true,
      buyerProofOfFundsVerified: false,
      offerAccepted: false,
      escrowFunded: false,
    });

    expect(missingKyc.ok).toBe(false);
    if (!missingKyc.ok) {
      expect(missingKyc.code).toBe("PREREQUISITE_FAILED");
    }

    const satisfied = validateStageTransition({
      dealRoomId: "deal-1",
      actorId: "buyer-1",
      actorRole: "BUYER",
      fromStage: "NDA",
      toStage: "DATA_ACCESS",
      ndaSigned: true,
      buyerIdentityVerified: true,
      buyerProofOfFundsVerified: true,
      offerAccepted: false,
      escrowFunded: false,
    });

    expect(satisfied.ok).toBe(true);
  });

  it("blocks ESCROW -> TRANSFER until escrow is funded", () => {
    const blocked = validateStageTransition({
      dealRoomId: "deal-1",
      actorId: "seller-1",
      actorRole: "SELLER",
      fromStage: "ESCROW",
      toStage: "TRANSFER",
      ndaSigned: true,
      buyerIdentityVerified: true,
      buyerProofOfFundsVerified: true,
      offerAccepted: true,
      escrowFunded: false,
    });
    expect(blocked.ok).toBe(false);
  });
});

describe("RBAC & Mandatory 2FA Deal Room permissions", () => {
  const baseSession: AuthSession = {
    userId: "user-buyer",
    email: "buyer@example.com",
    name: "Buyer",
    roles: ["BUYER"],
    twoFactorEnabled: true,
    twoFactorVerifiedAt: "2026-11-12T09:00:00.000Z",
    authMode: "database",
    isSampleAccount: false,
  };

  it("denies deal room entry when unauthenticated or lacking 2FA verification", () => {
    const now = new Date("2026-11-12T10:00:00.000Z");

    expect(
      canEnterDealRoom(null, { buyerUserId: "user-buyer", sellerUserId: "user-seller" }, { now })
    ).toMatchObject({ allowed: false, code: "UNAUTHENTICATED" });

    expect(
      canEnterDealRoom(
        { ...baseSession, twoFactorVerifiedAt: null },
        { buyerUserId: "user-buyer", sellerUserId: "user-seller" },
        { now }
      )
    ).toMatchObject({ allowed: false, code: "TWO_FACTOR_REQUIRED" });
  });

  it("denies deal room entry when 2FA is stale (>12h) or user is not a participant", () => {
    const staleNow = new Date("2026-11-13T10:00:00.000Z");
    expect(
      canEnterDealRoom(
        baseSession,
        { buyerUserId: "user-buyer", sellerUserId: "user-seller" },
        { now: staleNow }
      )
    ).toMatchObject({ allowed: false, code: "TWO_FACTOR_EXPIRED" });

    const freshNow = new Date("2026-11-12T10:00:00.000Z");
    expect(
      canEnterDealRoom(
        baseSession,
        { buyerUserId: "other-buyer", sellerUserId: "user-seller" },
        { now: freshNow }
      )
    ).toMatchObject({ allowed: false, code: "FORBIDDEN" });

    expect(
      canEnterDealRoom(
        { ...baseSession, roles: [] },
        { buyerUserId: "user-buyer", sellerUserId: "user-seller" },
        { now: freshNow }
      )
    ).toMatchObject({ allowed: false, code: "FORBIDDEN" });

    expect(
      canEnterDealRoom(
        { ...baseSession, twoFactorEnabled: false },
        { buyerUserId: "user-buyer", sellerUserId: "user-seller" },
        { now: freshNow }
      )
    ).toMatchObject({ allowed: false, code: "TWO_FACTOR_REQUIRED" });
  });

  it("allows deal room entry for participant or Reviewer with fresh 2FA", () => {
    const freshNow = new Date("2026-11-12T10:00:00.000Z");
    expect(
      canEnterDealRoom(
        baseSession,
        { buyerUserId: "user-buyer", sellerUserId: "user-seller" },
        { now: freshNow }
      )
    ).toEqual({ allowed: true });

    expect(
      canEnterDealRoom(
        { ...baseSession, userId: "reviewer-1", roles: ["REVIEWER"] },
        { buyerUserId: "user-buyer", sellerUserId: "user-seller" },
        { now: freshNow }
      )
    ).toEqual({ allowed: true });
  });

  it("enforces role boundaries for listing creation and admin review queue", () => {
    expect(canCreateListing(baseSession).allowed).toBe(false);
    expect(canCreateListing({ ...baseSession, roles: ["SELLER"] }).allowed).toBe(true);
    expect(canReviewAdminQueue(baseSession).allowed).toBe(false);
    expect(canReviewAdminQueue({ ...baseSession, roles: ["REVIEWER"] }).allowed).toBe(true);
  });
});

describe("Auth crypto, JWT sessions, rate limiting, verification freshness, and currency formatting", () => {
  it("hashes and verifies passwords with scrypt and validates RFC 6238 TOTP", async () => {
    const hash = hashPassword("StrongPassword!99");
    expect(verifyPassword("StrongPassword!99", hash)).toBe(true);
    expect(verifyPassword("WrongPassword!99", hash)).toBe(false);

    const secret = "JBSWY3DPEHPK3PXP";
    const email = "buyer@example.com";
    const token = getCurrentTotpTokenForDev(secret, email);
    expect(verifyTotpCode(secret, email, token)).toBe(true);
    expect(verifyTotpCode(secret, email, "000000")).toBe(false);

    const session: AuthSession = {
      userId: "u1",
      email,
      name: "Buyer",
      roles: ["BUYER"],
      twoFactorEnabled: true,
      twoFactorVerifiedAt: new Date().toISOString(),
      authMode: "local-dev",
      isSampleAccount: true,
    };
    const jwt = await signSessionToken(session);
    const decoded = await verifySessionToken(jwt);
    expect(decoded).toEqual(session);
  });

  it("enforces rate limiting window", async () => {
    resetMemoryRateLimitsForTest();
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit("test:ip", 3, 60_000);
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkRateLimit("test:ip", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("automatically revokes Verified state when expiry passes", () => {
    const now = new Date("2026-11-12T10:00:00.000Z");
    const active = evaluateVerification(
      {
        id: "ver-1",
        provider: "Stripe",
        status: "VERIFIED",
        verifiedAt: "2026-11-12T08:00:00.000Z",
        expiresAt: "2026-11-13T08:00:00.000Z",
      },
      now
    );
    expect(active.isVerified).toBe(true);
    expect(active.lastVerifiedLabel).toBe("Last verified 2 hours ago");

    const expired = evaluateVerification(
      {
        id: "ver-1",
        provider: "Stripe",
        status: "VERIFIED",
        verifiedAt: "2026-11-10T08:00:00.000Z",
        expiresAt: "2026-11-12T09:59:00.000Z",
      },
      now
    );
    expect(expired.isVerified).toBe(false);
    expect(expired.effectiveState).toBe("expired");

    const blankProvider = evaluateVerification(
      {
        id: "ver-2",
        provider: "   ",
        status: "VERIFIED",
        verifiedAt: "2026-11-12T08:00:00.000Z",
        expiresAt: "2026-11-13T08:00:00.000Z",
      },
      now
    );
    expect(blankProvider.isVerified).toBe(false);
    expect(blankProvider.effectiveState).toBe("seller-reported");
  });

  it("formats INR by default with locale-aware grouping and handles edge inputs", () => {
    expect(formatCurrency(12_500_000)).toBe("₹1,25,00,000");
    expect(formatCurrency(12_500_000, { compact: true })).toBe("₹1.25 Cr");
    expect(formatCurrency(4_250_000, { compact: true })).toBe("₹42.5 L");
    expect(formatCurrency(50_000, { currency: "USD" })).toBe("$50,000");
    expect(formatCurrency(Number.NaN)).toBe("—");
    expect(
      formatRelativeVerifiedTime("2026-11-12T08:00:00.000Z", new Date("2026-11-12T10:00:00.000Z"))
    ).toBe("Last verified 2 hours ago");
  });
});
