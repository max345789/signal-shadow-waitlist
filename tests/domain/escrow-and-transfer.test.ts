// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "@/lib/auth/types";
import { resetMemoryRateLimitsForTest } from "@/lib/auth/rate-limit";
import {
  TRANSFER_CHECKLIST_CATEGORIES,
  generateTransferChecklistItems,
} from "@/lib/domain/deal-room";
import {
  confirmThirdPartyEscrowFunding,
  initiateThirdPartyEscrow,
} from "@/lib/escrow/provider";
import { resetLocalListingsStoreForTest } from "@/lib/listings/store";
import { resetLocalDealRoomsStoreForTest } from "@/lib/deal-rooms/local-store";
import {
  reviewVerificationAsAdmin,
  submitIdentityVerification,
  submitProofOfFundsVerification,
} from "@/lib/verification/store";

let activeMockSession: AuthSession | null = null;

vi.mock("@/lib/auth/session-server", () => ({
  getServerSession: vi.fn(async () => activeMockSession),
}));

import { POST as createDealPost } from "@/app/api/deal-rooms/route";
import { POST as stagePost } from "@/app/api/deal-rooms/[id]/stage/route";
import { POST as ndaPost } from "@/app/api/deal-rooms/[id]/nda/route";
import { POST as offerPost } from "@/app/api/deal-rooms/[id]/offers/route";
import { PATCH as checklistPatch } from "@/app/api/deal-rooms/[id]/checklist/route";
import { POST as escrowPost } from "@/app/api/deal-rooms/[id]/escrow/route";
import { GET as adminDisputesGet } from "@/app/api/admin/disputes/route";
import { POST as adminDisputeResolvePost } from "@/app/api/admin/disputes/[id]/resolve/route";

const NOW_ISO = new Date().toISOString();

const BUYER_SESSION: AuthSession = {
  userId: "sample-buyer-01",
  email: "buyer.sample@trustmarketplace.local",
  name: "Ananya Rao (Sample Buyer)",
  roles: ["BUYER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: NOW_ISO,
  authMode: "local-dev",
  isSampleAccount: true,
};

const SELLER_SESSION: AuthSession = {
  userId: "sample-seller-01",
  email: "seller.sample@trustmarketplace.local",
  name: "Rohan Mehta (Sample Seller)",
  roles: ["SELLER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: NOW_ISO,
  authMode: "local-dev",
  isSampleAccount: true,
};

const REVIEWER_SESSION: AuthSession = {
  userId: "sample-reviewer-01",
  email: "reviewer.sample@trustmarketplace.local",
  name: "Priya Nair (Sample Reviewer)",
  roles: ["REVIEWER", "ADMIN"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: NOW_ISO,
  authMode: "local-dev",
  isSampleAccount: true,
};

async function setupVerifiedBuyer() {
  const idRes = await submitIdentityVerification(
    {
      provider: "Persona",
      legalName: "Ananya Rao",
      country: "India",
      documentType: "PAN",
      referenceLast4: "482F",
      roleContext: "BUYER",
    },
    BUYER_SESSION
  );
  const pofRes = await submitProofOfFundsVerification(
    {
      provider: "Setu AA",
      amount: 15_000_000,
      currency: "INR",
      institutionLabel: "HDFC Corporate ****4821",
      attestationRef: "SETU-AA-9941",
    },
    BUYER_SESSION
  );
  if (idRes.ok && pofRes.ok) {
    await reviewVerificationAsAdmin(
      idRes.data.record.id,
      "APPROVE",
      "Verified KYC.",
      REVIEWER_SESSION
    );
    await reviewVerificationAsAdmin(
      pofRes.data.record.id,
      "APPROVE",
      "Verified POF.",
      REVIEWER_SESSION
    );
  }
}

async function advanceRoomToEscrowStage(businessId: string = "sample-biz-gst-01") {
  await setupVerifiedBuyer();

  activeMockSession = BUYER_SESSION;
  const createRes = await createDealPost(
    new Request("http://localhost/api/deal-rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId }),
    })
  );
  expect(createRes.status).toBe(201);
  const roomId = (await createRes.json()).dealRoom.id as string;

  await stagePost(
    new Request(`http://localhost/api/deal-rooms/${roomId}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStage: "NDA" }),
    }),
    { params: Promise.resolve({ id: roomId }) }
  );
  await ndaPost(
    new Request(`http://localhost/api/deal-rooms/${roomId}/nda`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signerName: "Ananya Rao", acceptedTerms: true }),
    }),
    { params: Promise.resolve({ id: roomId }) }
  );

  activeMockSession = SELLER_SESSION;
  await ndaPost(
    new Request(`http://localhost/api/deal-rooms/${roomId}/nda`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signerName: "Rohan Mehta", acceptedTerms: true }),
    }),
    { params: Promise.resolve({ id: roomId }) }
  );
  await stagePost(
    new Request(`http://localhost/api/deal-rooms/${roomId}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStage: "DATA_ACCESS" }),
    }),
    { params: Promise.resolve({ id: roomId }) }
  );
  await stagePost(
    new Request(`http://localhost/api/deal-rooms/${roomId}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStage: "OFFER" }),
    }),
    { params: Promise.resolve({ id: roomId }) }
  );

  activeMockSession = BUYER_SESSION;
  const offerRes = await offerPost(
    new Request(`http://localhost/api/deal-rooms/${roomId}/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "PROPOSE",
        amount: 12_000_000,
        currency: "INR",
        termsSummary: "1.20 Cr via licensed third-party escrow with 30-day transition.",
      }),
    }),
    { params: Promise.resolve({ id: roomId }) }
  );
  const offerId = (await offerRes.json()).dealRoom.offers[0].id as string;

  activeMockSession = SELLER_SESSION;
  await offerPost(
    new Request(`http://localhost/api/deal-rooms/${roomId}/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ACCEPT", offerId }),
    }),
    { params: Promise.resolve({ id: roomId }) }
  );
  await stagePost(
    new Request(`http://localhost/api/deal-rooms/${roomId}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStage: "DUE_DILIGENCE" }),
    }),
    { params: Promise.resolve({ id: roomId }) }
  );
  const escrowStageRes = await stagePost(
    new Request(`http://localhost/api/deal-rooms/${roomId}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStage: "ESCROW" }),
    }),
    { params: Promise.resolve({ id: roomId }) }
  );
  expect(escrowStageRes.status).toBe(200);
  return roomId;
}

describe("Phase 5 Escrow & Transfer", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetLocalListingsStoreForTest();
    resetLocalDealRoomsStoreForTest();
    resetMemoryRateLimitsForTest();
    activeMockSession = null;
  });

  it("enforces licensed third-party escrow provider rules without holding platform funds", async () => {
    const castlerUsd = await initiateThirdPartyEscrow({
      provider: "Castler Escrow",
      dealRoomId: "deal-1",
      amount: 100_000,
      currency: "USD",
      buyerEmail: "buyer@example.com",
      sellerEmail: "seller@example.com",
      businessTitle: "SaaS",
    });
    expect(castlerUsd.ok).toBe(false);

    const escrowOk = await initiateThirdPartyEscrow({
      provider: "Escrow.com",
      dealRoomId: "deal-1",
      amount: 12_000_000,
      currency: "INR",
      buyerEmail: "buyer@example.com",
      sellerEmail: "seller@example.com",
      businessTitle: "TaxBridge",
    });
    expect(escrowOk.ok).toBe(true);
    if (escrowOk.ok) {
      expect(escrowOk.platformHoldsFunds).toBe(false);
      expect(escrowOk.externalRef).toContain("ESC-ESCCOM-");
    }

    const failedWire = await confirmThirdPartyEscrowFunding({
      provider: "Escrow.com",
      externalRef: "ESC-ESCCOM-1",
      fundingReference: "WIRE-FAIL-REVERSED",
    });
    expect(failedWire.ok).toBe(false);

    const transferItems = generateTransferChecklistItems();
    expect(transferItems.map((i) => i.category)).toEqual([
      ...TRANSFER_CHECKLIST_CATEGORIES,
    ]);
    expect(transferItems).toHaveLength(7);
  });

  it("runs full INTRO -> TRANSFER -> RELEASED sandbox deal with 7-category two-sided checklist", async () => {
    const roomId = await advanceRoomToEscrowStage();

    // Cannot move to TRANSFER before escrow is funded
    activeMockSession = BUYER_SESSION;
    const blockedTransfer = await stagePost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage: "TRANSFER" }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(blockedTransfer.status).toBe(400);

    // Buyer initiates third-party escrow (Castler Escrow)
    const initRes = await escrowPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/escrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "INITIATE", provider: "Castler Escrow" }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(initRes.status).toBe(201);
    const initRoom = (await initRes.json()).dealRoom;
    const escrowId = initRoom.escrowTransactions[0].id as string;
    expect(initRoom.escrowTransactions[0].status).toBe("INITIATED");
    expect(initRoom.escrowTransactions[0].platformHoldsFunds).toBe(false);

    // Seller cannot confirm buyer funding (403 FORBIDDEN)
    activeMockSession = SELLER_SESSION;
    const sellerFund = await escrowPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/escrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "FUND", escrowId }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(sellerFund.status).toBe(403);

    // Buyer confirms funding -> status FUNDED
    activeMockSession = BUYER_SESSION;
    const fundRes = await escrowPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/escrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "FUND",
          escrowId,
          fundingReference: "RTGS-HDFC-8812",
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(fundRes.status).toBe(200);
    expect((await fundRes.json()).dealRoom.escrowTransactions[0].status).toBe(
      "FUNDED"
    );

    // Move ESCROW -> TRANSFER -> automatically generates 7 TRANSFER checklist items
    const toTransfer = await stagePost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage: "TRANSFER" }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(toTransfer.status).toBe(200);
    const transferRoom = (await toTransfer.json()).dealRoom;
    const transferItems = transferRoom.checklistItems.filter(
      (c: { phase: string }) => c.phase === "TRANSFER"
    );
    expect(transferItems).toHaveLength(7);

    // Mark escrow IN_REVIEW
    const reviewRes = await escrowPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/escrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "START_REVIEW", escrowId }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(reviewRes.status).toBe(200);
    expect((await reviewRes.json()).dealRoom.escrowTransactions[0].status).toBe(
      "IN_REVIEW"
    );

    // Cannot release before BOTH Buyer and Seller confirm all 7 transfer items
    const earlyRelease = await escrowPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/escrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RELEASE", escrowId }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(earlyRelease.status).toBe(400);

    // Buyer confirms all 7 transfer items
    for (const item of transferItems) {
      const r = await checklistPatch(
        new Request(`http://localhost/api/deal-rooms/${roomId}/checklist`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.id, action: "CONFIRM" }),
        }),
        { params: Promise.resolve({ id: roomId }) }
      );
      expect(r.status).toBe(200);
    }

    // Still blocked until Seller confirms all 7
    const buyerOnlyRelease = await escrowPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/escrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RELEASE", escrowId }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(buyerOnlyRelease.status).toBe(400);

    // Seller confirms all 7 transfer items
    activeMockSession = SELLER_SESSION;
    for (const item of transferItems) {
      const r = await checklistPatch(
        new Request(`http://localhost/api/deal-rooms/${roomId}/checklist`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.id, action: "CONFIRM" }),
        }),
        { params: Promise.resolve({ id: roomId }) }
      );
      expect(r.status).toBe(200);
    }

    // Seller cannot release funds themselves (Buyer or Admin arbitration only)
    const sellerRelease = await escrowPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/escrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RELEASE", escrowId }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(sellerRelease.status).toBe(403);

    // Buyer authorizes escrow release -> RELEASED + DealRoom COMPLETED + TRANSFER stage COMPLETED
    activeMockSession = BUYER_SESSION;
    const releaseRes = await escrowPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/escrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RELEASE", escrowId }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(releaseRes.status).toBe(200);
    const completedRoom = (await releaseRes.json()).dealRoom;
    expect(completedRoom.status).toBe("COMPLETED");
    expect(completedRoom.escrowTransactions[0].status).toBe("RELEASED");
    expect(completedRoom.escrowTransactions[0].releasedAt).not.toBeNull();
    const transferStage = completedRoom.stages.find(
      (s: { stage: string }) => s.stage === "TRANSFER"
    );
    expect(transferStage.status).toBe("COMPLETED");

    const auditActions = new Set(
      completedRoom.auditLogs.map((a: { action: string }) => a.action)
    );
    expect(auditActions.has("ESCROW_INITIATED")).toBe(true);
    expect(auditActions.has("ESCROW_FUNDED")).toBe(true);
    expect(auditActions.has("ESCROW_IN_REVIEW")).toBe(true);
    expect(auditActions.has("ESCROW_RELEASED")).toBe(true);
  });

  it("handles escrow dispute flagging, locks room mutations, and resolves via Admin Dispute Queue with 2FA", async () => {
    const roomId = await advanceRoomToEscrowStage();

    activeMockSession = BUYER_SESSION;
    const initRes = await escrowPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/escrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "INITIATE", provider: "Escrow.com" }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    const escrowId = (await initRes.json()).dealRoom.escrowTransactions[0]
      .id as string;

    await escrowPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/escrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "FUND", escrowId }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );

    await stagePost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage: "TRANSFER" }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );

    // Buyer flags dispute
    const disputeRes = await escrowPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/escrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DISPUTE",
          escrowId,
          disputeReason:
            "Primary domain EPP authorization code has not been transferred after 72 hours.",
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(disputeRes.status).toBe(200);
    const disputedRoom = (await disputeRes.json()).dealRoom;
    expect(disputedRoom.status).toBe("DISPUTED");
    expect(disputedRoom.escrowTransactions[0].status).toBe("DISPUTED");

    // Cannot confirm checklist items while room is DISPUTED
    const transferItemId = disputedRoom.checklistItems.find(
      (c: { phase: string }) => c.phase === "TRANSFER"
    ).id as string;
    const blockedChk = await checklistPatch(
      new Request(`http://localhost/api/deal-rooms/${roomId}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: transferItemId, action: "CONFIRM" }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(blockedChk.status).toBe(400);

    // Buyer cannot access Admin disputes queue (403)
    const buyerQueue = await adminDisputesGet();
    expect(buyerQueue.status).toBe(403);

    // Reviewer without 2FA cannot resolve deal room dispute (403 TWO_FACTOR_REQUIRED)
    activeMockSession = { ...REVIEWER_SESSION, twoFactorVerifiedAt: null };
    const no2faResolve = await adminDisputeResolvePost(
      new Request(`http://localhost/api/admin/disputes/${roomId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "RESUME_TO_IN_REVIEW",
          resolutionNote: "Attempt without 2FA should be blocked.",
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(no2faResolve.status).toBe(403);

    // Reviewer with 2FA sees open dispute and resumes to IN_REVIEW
    activeMockSession = REVIEWER_SESSION;
    const queueRes = await adminDisputesGet();
    expect(queueRes.status).toBe(200);
    const queueJson = await queueRes.json();
    expect(queueJson.disputes).toHaveLength(1);
    expect(queueJson.disputes[0].escrow.status).toBe("DISPUTED");

    const resumeRes = await adminDisputeResolvePost(
      new Request(`http://localhost/api/admin/disputes/${roomId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "RESUME_TO_IN_REVIEW",
          resolutionNote:
            "Seller uploaded valid EPP code in vault; resuming asset transfer review.",
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(resumeRes.status).toBe(200);
    const resumedJson = await resumeRes.json();
    expect(resumedJson.dealRoom.status).toBe("ACTIVE");
    expect(resumedJson.dealRoom.escrowTransactions[0].status).toBe("IN_REVIEW");

    // Flag again and test REFUND_TO_BUYER resolution
    activeMockSession = SELLER_SESSION;
    await escrowPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/escrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DISPUTE",
          escrowId,
          disputeReason:
            "Mutual agreement to unwind deal due to unresolved third-party vendor contract restriction.",
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );

    activeMockSession = REVIEWER_SESSION;
    const refundRes = await adminDisputeResolvePost(
      new Request(`http://localhost/api/admin/disputes/${roomId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "REFUND_TO_BUYER",
          resolutionNote:
            "Both parties agreed to cancel transfer; instructed Escrow.com to refund Buyer.",
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(refundRes.status).toBe(200);
    const refundedJson = await refundRes.json();
    expect(refundedJson.dealRoom.status).toBe("CANCELLED");
    expect(refundedJson.dealRoom.escrowTransactions[0].status).toBe("REFUNDED");
    expect(
      refundedJson.dealRoom.auditLogs.some(
        (a: { action: string }) => a.action === "DISPUTE_RESOLVED"
      )
    ).toBe(true);
  });
});
