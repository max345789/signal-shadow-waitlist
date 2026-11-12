// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "@/lib/auth/types";
import { resetMemoryRateLimitsForTest } from "@/lib/auth/rate-limit";
import {
  generateDueDiligenceChecklistForSector,
  scanDocumentContent,
} from "@/lib/domain/deal-room";
import {
  getListingBySlugForViewer,
  resetLocalListingsStoreForTest,
} from "@/lib/listings/store";
import {
  reviewVerificationAsAdmin,
  submitIdentityVerification,
  submitProofOfFundsVerification,
} from "@/lib/verification/store";
import {
  createOrOpenDealRoom,
  getDealRoomForViewer,
  signDealRoomNda,
  transitionDealRoomStage,
} from "@/lib/deal-rooms/store";

let activeMockSession: AuthSession | null = null;

vi.mock("@/lib/auth/session-server", () => ({
  getServerSession: vi.fn(async () => activeMockSession),
}));

import { GET as listDealsGet, POST as createDealPost } from "@/app/api/deal-rooms/route";
import { GET as getDealGet } from "@/app/api/deal-rooms/[id]/route";
import { POST as stagePost } from "@/app/api/deal-rooms/[id]/stage/route";
import { POST as ndaPost } from "@/app/api/deal-rooms/[id]/nda/route";
import { POST as paPost } from "@/app/api/deal-rooms/[id]/purchase-agreement/route";
import { POST as msgPost } from "@/app/api/deal-rooms/[id]/messages/route";
import { POST as docPost } from "@/app/api/deal-rooms/[id]/documents/route";
import { GET as signedUrlGet } from "@/app/api/deal-rooms/[id]/documents/[docId]/signed-url/route";
import { GET as downloadGet } from "@/app/api/deal-rooms/[id]/documents/[docId]/download/route";
import { POST as offerPost } from "@/app/api/deal-rooms/[id]/offers/route";
import { PATCH as checklistPatch } from "@/app/api/deal-rooms/[id]/checklist/route";

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

const OTHER_BUYER_SESSION: AuthSession = {
  userId: "other-buyer-99",
  email: "other.buyer@example.com",
  name: "Other Buyer",
  roles: ["BUYER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: NOW_ISO,
  authMode: "local-dev",
  isSampleAccount: false,
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

async function verifyBuyerKycAndPof() {
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
  expect(idRes.ok).toBe(true);

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
  expect(pofRes.ok).toBe(true);

  if (idRes.ok && pofRes.ok) {
    await reviewVerificationAsAdmin(
      idRes.data.record.id,
      "APPROVE",
      "KYC verified for deal room test.",
      REVIEWER_SESSION
    );
    await reviewVerificationAsAdmin(
      pofRes.data.record.id,
      "APPROVE",
      "POF verified for deal room test.",
      REVIEWER_SESSION
    );
  }
}

describe("Phase 4 Deal Room: RBAC, 2FA, Redaction, Stage Machine, Vault, Offers & AuditLog", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetLocalListingsStoreForTest();
    resetMemoryRateLimitsForTest();
    activeMockSession = null;
  });

  it("enforces mandatory 2FA and participant-only RBAC on every deal room read & write", async () => {
    // Buyer opens a room with valid 2FA
    activeMockSession = BUYER_SESSION;
    const createRes = await createDealPost(
      new Request("http://localhost/api/deal-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: "sample-biz-gst-01" }),
      })
    );
    expect(createRes.status).toBe(201);
    const createdJson = await createRes.json();
    const roomId = createdJson.dealRoom.id as string;

    // 1. Unauthenticated -> 401
    activeMockSession = null;
    expect((await listDealsGet()).status).toBe(401);
    expect(
      (await getDealGet(new Request(`http://localhost/api/deal-rooms/${roomId}`), {
        params: Promise.resolve({ id: roomId }),
      })).status
    ).toBe(401);

    // 2. Participant without 2FA -> 403 TWO_FACTOR_REQUIRED
    activeMockSession = { ...BUYER_SESSION, twoFactorVerifiedAt: null };
    const no2faRes = await getDealGet(
      new Request(`http://localhost/api/deal-rooms/${roomId}`),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(no2faRes.status).toBe(403);
    expect((await no2faRes.json()).code).toBe("TWO_FACTOR_REQUIRED");

    // 3. Stale 2FA (>12h) -> 403 TWO_FACTOR_EXPIRED
    activeMockSession = {
      ...BUYER_SESSION,
      twoFactorVerifiedAt: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString(),
    };
    const staleRes = await msgPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Should be blocked by expired 2FA" }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(staleRes.status).toBe(403);
    expect((await staleRes.json()).code).toBe("TWO_FACTOR_EXPIRED");

    // 4. Non-participant Buyer -> 403 FORBIDDEN on read & write
    activeMockSession = OTHER_BUYER_SESSION;
    const otherGet = await getDealGet(
      new Request(`http://localhost/api/deal-rooms/${roomId}`),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(otherGet.status).toBe(403);
    expect((await otherGet.json()).code).toBe("FORBIDDEN");

    const otherOffer = await offerPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "PROPOSE",
          amount: 1000000,
          currency: "INR",
          termsSummary: "Unauthorized outsider offer attempt",
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(otherOffer.status).toBe(403);
  });

  it("keeps redacted fields hidden until BOTH parties complete NDA, and unlocks both DealRoom and Listing view", async () => {
    const opened = await createOrOpenDealRoom("sample-biz-gst-01", BUYER_SESSION);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const roomId = opened.data.id;
    // Before NDA: Buyer sees null redacted fields
    expect(opened.data.sensitiveDetailsUnlocked).toBe(false);
    expect(opened.data.redactedName).toBeNull();
    expect(opened.data.redactedDomain).toBeNull();
    expect(opened.data.redactedCustomers).toBeNull();

    const listingBefore = await getListingBySlugForViewer(
      "sample-b2b-gst-compliance-saas",
      BUYER_SESSION
    );
    expect(listingBefore?.sensitiveDetailsUnlocked).toBe(false);
    expect(listingBefore?.redactedName).toBeNull();

    // Buyer signs NDA alone -> STILL redacted until Seller countersigns!
    const buyerSigned = await signDealRoomNda(
      roomId,
      { signerName: "Ananya Rao", acceptedTerms: true },
      BUYER_SESSION
    );
    expect(buyerSigned.ok).toBe(true);
    if (!buyerSigned.ok) return;
    expect(buyerSigned.data.nda.buyerSigned).toBe(true);
    expect(buyerSigned.data.nda.sellerSigned).toBe(false);
    expect(buyerSigned.data.nda.completed).toBe(false);
    expect(buyerSigned.data.sensitiveDetailsUnlocked).toBe(false);
    expect(buyerSigned.data.redactedName).toBeNull();

    // Seller countersigns NDA -> NDA completed -> Redacted fields unlock for Buyer!
    const sellerSigned = await signDealRoomNda(
      roomId,
      { signerName: "Rohan Mehta", acceptedTerms: true },
      SELLER_SESSION
    );
    expect(sellerSigned.ok).toBe(true);
    if (!sellerSigned.ok) return;
    expect(sellerSigned.data.nda.completed).toBe(true);

    const buyerRoomAfter = await getDealRoomForViewer(roomId, BUYER_SESSION);
    expect(buyerRoomAfter.ok).toBe(true);
    if (buyerRoomAfter.ok) {
      expect(buyerRoomAfter.data.sensitiveDetailsUnlocked).toBe(true);
      expect(buyerRoomAfter.data.redactedName).toContain("TaxBridge");
      expect(buyerRoomAfter.data.redactedDomain).toContain("taxbridge");
      expect(buyerRoomAfter.data.redactedCustomers).not.toBeNull();
    }

    // Listing detail page also unlocks for this Buyer (and stays locked for other Buyers)
    const listingAfter = await getListingBySlugForViewer(
      "sample-b2b-gst-compliance-saas",
      BUYER_SESSION
    );
    expect(listingAfter?.sensitiveDetailsUnlocked).toBe(true);
    expect(listingAfter?.redactedName).toContain("TaxBridge");

    const otherBuyerListing = await getListingBySlugForViewer(
      "sample-b2b-gst-compliance-saas",
      OTHER_BUYER_SESSION
    );
    expect(otherBuyerListing?.sensitiveDetailsUnlocked).toBe(false);
    expect(otherBuyerListing?.redactedName).toBeNull();
  });

  it("enforces allowed stage transitions and Data access KYC + POF + NDA prerequisites", async () => {
    const opened = await createOrOpenDealRoom("sample-biz-gst-01", BUYER_SESSION);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const roomId = opened.data.id;

    // Cannot skip INTRO -> DATA_ACCESS
    const skipRes = await transitionDealRoomStage(roomId, "DATA_ACCESS", BUYER_SESSION);
    expect(skipRes.ok).toBe(false);
    if (!skipRes.ok) {
      expect(skipRes.code).toBe("INVALID_TRANSITION");
    }

    // Move INTRO -> NDA
    const toNda = await transitionDealRoomStage(roomId, "NDA", BUYER_SESSION);
    expect(toNda.ok).toBe(true);

    // Complete NDA signatures
    await signDealRoomNda(
      roomId,
      { signerName: "Ananya Rao", acceptedTerms: true },
      BUYER_SESSION
    );
    await signDealRoomNda(
      roomId,
      { signerName: "Rohan Mehta", acceptedTerms: true },
      SELLER_SESSION
    );

    // Still blocked from DATA_ACCESS without KYC + Proof of Funds
    const blockedData = await transitionDealRoomStage(
      roomId,
      "DATA_ACCESS",
      BUYER_SESSION
    );
    expect(blockedData.ok).toBe(false);
    if (!blockedData.ok) {
      expect(blockedData.code).toBe("PREREQUISITE_FAILED");
    }

    // Verify KYC & Proof of Funds -> NDA -> DATA_ACCESS succeeds
    await verifyBuyerKycAndPof();
    const toDataAccess = await transitionDealRoomStage(
      roomId,
      "DATA_ACCESS",
      BUYER_SESSION
    );
    expect(toDataAccess.ok).toBe(true);
    if (toDataAccess.ok) {
      expect(toDataAccess.data.currentStage).toBe("DATA_ACCESS");
      expect(toDataAccess.data.dataAccessUnlocked).toBe(true);
    }
  });

  it("handles threaded chat + rate limits, versioned vault + virus scan + view logs, offers, checklists, PA e-sign, and AuditLog", async () => {
    await verifyBuyerKycAndPof();

    activeMockSession = BUYER_SESSION;
    const createRes = await createDealPost(
      new Request("http://localhost/api/deal-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: "sample-biz-gst-01" }),
      })
    );
    const { dealRoom: createdRoom } = await createRes.json();
    const roomId = createdRoom.id as string;

    // Advance INTRO -> NDA -> sign both -> DATA_ACCESS
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

    // 1. Document Vault: EICAR virus test signature is blocked (400 INFECTED)
    const eicar =
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
    const infectedRes = await docPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Infected File",
          category: "FINANCIAL",
          filename: "bad.txt",
          mimeType: "text/plain",
          contentBase64: Buffer.from(eicar, "utf8").toString("base64"),
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(infectedRes.status).toBe(400);
    expect((await infectedRes.json()).code).toBe("INFECTED");

    // Clean v1 & v2 uploads increment version automatically
    const cleanV1 = await docPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Q3 Bank Reconciliation",
          category: "FINANCIAL",
          filename: "q3-recon.txt",
          mimeType: "text/plain",
          contentBase64: Buffer.from("Q3 Revenue: INR 36,00,000", "utf8").toString(
            "base64"
          ),
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(cleanV1.status).toBe(201);

    const cleanV2 = await docPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Q3 Bank Reconciliation",
          category: "FINANCIAL",
          filename: "q3-recon-v2.txt",
          mimeType: "text/plain",
          contentBase64: Buffer.from(
            "Q3 Revenue Revised: INR 36,50,000",
            "utf8"
          ).toString("base64"),
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(cleanV2.status).toBe(201);
    const v2Json = await cleanV2.json();
    const latestDoc = v2Json.dealRoom.documents.find(
      (d: { title: string; version: number }) =>
        d.title === "Q3 Bank Reconciliation" && d.version === 2
    );
    expect(latestDoc).toBeDefined();

    // Buyer requests signed URL and downloads watermarked copy -> logs DocumentView
    activeMockSession = BUYER_SESSION;
    const signedRes = await signedUrlGet(
      new Request(
        `http://localhost/api/deal-rooms/${roomId}/documents/${latestDoc.id}/signed-url`
      ),
      { params: Promise.resolve({ id: roomId, docId: latestDoc.id }) }
    );
    expect(signedRes.status).toBe(200);
    const { signedUrl } = await signedRes.json();

    const dlRes = await downloadGet(
      new Request(`http://localhost${signedUrl}`, {
        headers: { "user-agent": "VitestClient/1.0" },
      }),
      { params: Promise.resolve({ id: roomId, docId: latestDoc.id }) }
    );
    expect(dlRes.status).toBe(200);
    const dlText = await dlRes.text();
    expect(dlText).toContain("WATERMARK:");
    expect(dlText).toContain("Q3 Revenue Revised: INR 36,50,000");

    // 2. Threaded chat + rate limit check
    const msg1Res = await msgPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Please clarify enterprise churn in Q3." }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(msg1Res.status).toBe(201);
    const msg1Room = (await msg1Res.json()).dealRoom;
    const parentMsgId = msg1Room.messages[0].id as string;

    activeMockSession = SELLER_SESSION;
    const replyRes = await msgPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: "Enterprise churn remained under 1.2% in Q3.",
          parentId: parentMsgId,
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(replyRes.status).toBe(201);

    // Trigger chat rate limit after 20 rapid messages by same user
    for (let i = 0; i < 19; i++) {
      const r = await msgPost(
        new Request(`http://localhost/api/deal-rooms/${roomId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: `Follow-up note #${i + 1}` }),
        }),
        { params: Promise.resolve({ id: roomId }) }
      );
      expect(r.status).toBe(201);
    }
    const rateLimitedMsg = await msgPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "21st message should be rate limited" }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(rateLimitedMsg.status).toBe(429);

    // 3. Offers -> Counter -> Accept -> DUE_DILIGENCE -> Purchase Agreement -> Checklist
    await stagePost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage: "OFFER" }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );

    activeMockSession = BUYER_SESSION;
    const proposeRes = await offerPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "PROPOSE",
          amount: 11_000_000,
          currency: "INR",
          termsSummary: "100% escrow funded upon 14-day diligence completion.",
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(proposeRes.status).toBe(200);
    const offer1Id = (await proposeRes.json()).dealRoom.offers[0].id as string;

    // Buyer cannot accept their own offer
    const selfAccept = await offerPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ACCEPT", offerId: offer1Id }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(selfAccept.status).toBe(403);

    // Seller counters
    activeMockSession = SELLER_SESSION;
    const counterRes = await offerPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "COUNTER",
          offerId: offer1Id,
          amount: 12_000_000,
          currency: "INR",
          termsSummary: "1.2 Cr with 30-day founder handover included.",
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(counterRes.status).toBe(200);
    const counterRoom = (await counterRes.json()).dealRoom;
    const counterOfferId = counterRoom.offers[0].id as string;
    expect(counterRoom.offers[1].status).toBe("COUNTERED");

    // Cannot advance to DUE_DILIGENCE before an offer is accepted
    const blockedDd = await stagePost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage: "DUE_DILIGENCE" }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(blockedDd.status).toBe(400);

    // Buyer accepts counter-offer -> DUE_DILIGENCE unlocks
    activeMockSession = BUYER_SESSION;
    const acceptRes = await offerPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ACCEPT", offerId: counterOfferId }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(acceptRes.status).toBe(200);

    const ddRes = await stagePost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage: "DUE_DILIGENCE" }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(ddRes.status).toBe(200);

    // Two-sided checklist confirmation
    const ddRoom = (await ddRes.json()).dealRoom;
    const firstItemId = ddRoom.checklistItems[0].id as string;
    const buyerConfirm = await checklistPatch(
      new Request(`http://localhost/api/deal-rooms/${roomId}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: firstItemId, action: "CONFIRM" }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(buyerConfirm.status).toBe(200);
    expect((await buyerConfirm.json()).dealRoom.checklistItems[0].status).toBe(
      "IN_PROGRESS"
    );

    activeMockSession = SELLER_SESSION;
    const sellerConfirm = await checklistPatch(
      new Request(`http://localhost/api/deal-rooms/${roomId}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: firstItemId, action: "CONFIRM" }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(sellerConfirm.status).toBe(200);
    expect((await sellerConfirm.json()).dealRoom.checklistItems[0].status).toBe(
      "CONFIRMED"
    );

    // Purchase Agreement e-sign by both sides
    activeMockSession = BUYER_SESSION;
    await paPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/purchase-agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName: "Ananya Rao", acceptedTerms: true }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    activeMockSession = SELLER_SESSION;
    const paFinalRes = await paPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/purchase-agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName: "Rohan Mehta", acceptedTerms: true }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(paFinalRes.status).toBe(200);
    const finalRoom = (await paFinalRes.json()).dealRoom;
    expect(finalRoom.purchaseAgreement.completed).toBe(true);

    // Verify all major actions appear in AuditLog
    const auditActions = new Set(
      finalRoom.auditLogs.map((a: { action: string }) => a.action)
    );
    expect(auditActions.has("DEAL_ROOM_CREATED")).toBe(true);
    expect(auditActions.has("STAGE_TRANSITION")).toBe(true);
    expect(auditActions.has("NDA_BUYER_SIGNED")).toBe(true);
    expect(auditActions.has("NDA_SELLER_SIGNED")).toBe(true);
    expect(auditActions.has("NDA_COMPLETED")).toBe(true);
    expect(auditActions.has("DOCUMENT_SCAN_INFECTED")).toBe(true);
    expect(auditActions.has("DOCUMENT_UPLOADED")).toBe(true);
    expect(auditActions.has("DOCUMENT_VIEWED")).toBe(true);
    expect(auditActions.has("MESSAGE_POSTED")).toBe(true);
    expect(auditActions.has("OFFER_PROPOSED")).toBe(true);
    expect(auditActions.has("OFFER_COUNTERED")).toBe(true);
    expect(auditActions.has("OFFER_ACCEPTED")).toBe(true);
    expect(auditActions.has("CHECKLIST_ITEM_UPDATED")).toBe(true);
    expect(auditActions.has("PURCHASE_AGREEMENT_COMPLETED")).toBe(true);
  });

  it("generates sector-tailored due-diligence checklists and scans binary/script payloads", () => {
    const saasItems = generateDueDiligenceChecklistForSector("B2B SaaS");
    const ecomItems = generateDueDiligenceChecklistForSector("E-commerce");
    expect(saasItems.some((i) => i.title.includes("Git repository"))).toBe(true);
    expect(ecomItems.some((i) => i.title.includes("3PL"))).toBe(true);

    expect(
      scanDocumentContent(Buffer.from("MZ\x90\x00binary", "latin1"), "tool.bin")
        .status
    ).toBe("INFECTED");
    expect(
      scanDocumentContent(
        Buffer.from("<script>alert(1)</script>", "utf8"),
        "note.txt"
      ).status
    ).toBe("INFECTED");
    expect(
      scanDocumentContent(Buffer.from("Clean financial ledger", "utf8"), "ledger.csv")
        .status
    ).toBe("CLEAN");
  });

  it("redacts confidential document titles/filenames in auditLogs when Buyer lacks Data access", async () => {
    await verifyBuyerKycAndPof();
    activeMockSession = BUYER_SESSION;
    const opened = await createOrOpenDealRoom("sample-biz-gst-01", BUYER_SESSION);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const roomId = opened.data.id;

    await transitionDealRoomStage(roomId, "NDA", BUYER_SESSION);
    await signDealRoomNda(
      roomId,
      { signerName: "Ananya Rao", acceptedTerms: true },
      BUYER_SESSION
    );
    await signDealRoomNda(
      roomId,
      { signerName: "Rohan Mehta", acceptedTerms: true },
      SELLER_SESSION
    );
    await transitionDealRoomStage(roomId, "DATA_ACCESS", SELLER_SESSION);

    // Seller uploads confidential document while Buyer has Data Access
    activeMockSession = SELLER_SESSION;
    const uploadRes = await docPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Secret Customer Cohort Ledger",
          category: "CUSTOMER",
          filename: "secret-cohort-2026.csv",
          mimeType: "text/csv",
          contentBase64: Buffer.from("cohort,mrr\nenterprise,500000", "utf8").toString(
            "base64"
          ),
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(uploadRes.status).toBe(201);

    // Simulate Buyer KYC expiry/revocation by resetting verification store
    const { getLocalVerificationStore } = await import("@/lib/verification/local-store");
    for (const v of getLocalVerificationStore().verifications) {
      if (v.userId === BUYER_SESSION.userId) {
        v.status = "EXPIRED";
        v.expiresAt = new Date(Date.now() - 60_000).toISOString();
      }
    }

    // Buyer reads room -> documents AND auditLog document titles/filenames must be redacted,
    // and Buyer cannot upload or advance to OFFER while expired
    const buyerView = await getDealRoomForViewer(roomId, BUYER_SESSION);
    expect(buyerView.ok).toBe(true);
    if (buyerView.ok) {
      expect(buyerView.data.dataAccessUnlocked).toBe(false);
      expect(
        buyerView.data.documents.some((d) => d.title.includes("Secret Customer"))
      ).toBe(false);
      const serializedLogs = JSON.stringify(buyerView.data.auditLogs);
      expect(serializedLogs).not.toContain("Secret Customer Cohort Ledger");
      expect(serializedLogs).not.toContain("secret-cohort-2026.csv");
      expect(serializedLogs).toContain("[Redacted until Data access unlocked]");
    }

    activeMockSession = BUYER_SESSION;
    const blockedUpload = await docPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Expired Buyer Upload",
          category: "OTHER",
          filename: "note.txt",
          mimeType: "text/plain",
          contentBase64: Buffer.from("Hello world", "utf8").toString("base64"),
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(blockedUpload.status).toBe(400);

    const blockedOfferStage = await transitionDealRoomStage(
      roomId,
      "OFFER",
      BUYER_SESSION
    );
    expect(blockedOfferStage.ok).toBe(false);
    if (!blockedOfferStage.ok) {
      expect(blockedOfferStage.code).toBe("PREREQUISITE_FAILED");
    }
  });

  it("blocks REVIEWER from commercial stage transitions and document uploads, and handles multipart MIME safely", async () => {
    await verifyBuyerKycAndPof();
    const opened = await createOrOpenDealRoom("sample-biz-gst-01", BUYER_SESSION);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const roomId = opened.data.id;

    // REVIEWER cannot advance stage
    const reviewerStage = await transitionDealRoomStage(
      roomId,
      "NDA",
      REVIEWER_SESSION
    );
    expect(reviewerStage.ok).toBe(false);
    if (!reviewerStage.ok) {
      expect(reviewerStage.code).toBe("FORBIDDEN");
    }

    await transitionDealRoomStage(roomId, "NDA", BUYER_SESSION);
    await signDealRoomNda(
      roomId,
      { signerName: "Ananya Rao", acceptedTerms: true },
      BUYER_SESSION
    );
    await signDealRoomNda(
      roomId,
      { signerName: "Rohan Mehta", acceptedTerms: true },
      SELLER_SESSION
    );
    await transitionDealRoomStage(roomId, "DATA_ACCESS", SELLER_SESSION);

    // REVIEWER cannot upload documents
    activeMockSession = REVIEWER_SESSION;
    const reviewerUpload = await docPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Reviewer Note",
          category: "OTHER",
          filename: "note.txt",
          mimeType: "text/plain",
          contentBase64: Buffer.from("Note body", "utf8").toString("base64"),
        }),
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(reviewerUpload.status).toBe(403);

    // Multipart upload: .pdf with empty browser MIME type preserves binary bytes without text-watermark corruption
    activeMockSession = SELLER_SESSION;
    const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF", "utf8");
    const pdfForm = new FormData();
    pdfForm.set("title", "Audited Financial PDF");
    pdfForm.set("category", "FINANCIAL");
    pdfForm.set("file", new File([pdfBytes], "audited-2026.pdf", { type: "" }));
    const pdfRes = await docPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/documents`, {
        method: "POST",
        body: pdfForm,
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(pdfRes.status).toBe(201);
    const pdfDoc = (await pdfRes.json()).dealRoom.documents.find(
      (d: { filename: string }) => d.filename === "audited-2026.pdf"
    );
    expect(pdfDoc).toBeDefined();
    expect(pdfDoc.mimeType).toBe("application/pdf");

    activeMockSession = BUYER_SESSION;
    const pdfSignedRes = await signedUrlGet(
      new Request(
        `http://localhost/api/deal-rooms/${roomId}/documents/${pdfDoc.id}/signed-url`
      ),
      { params: Promise.resolve({ id: roomId, docId: pdfDoc.id }) }
    );
    const { signedUrl: pdfSignedUrl } = await pdfSignedRes.json();
    const pdfDlRes = await downloadGet(
      new Request(`http://localhost${pdfSignedUrl}`),
      { params: Promise.resolve({ id: roomId, docId: pdfDoc.id }) }
    );
    const dlBuf = Buffer.from(await pdfDlRes.arrayBuffer());
    expect(dlBuf.equals(pdfBytes)).toBe(true);

    // Disallowed HTML extension disguised as text/plain is rejected
    activeMockSession = SELLER_SESSION;
    const htmlForm = new FormData();
    htmlForm.set("title", "Disguised HTML");
    htmlForm.set("category", "OTHER");
    htmlForm.set(
      "file",
      new File([Buffer.from("<p>hi</p>")], "page.html", { type: "text/plain" })
    );
    const htmlRes = await docPost(
      new Request(`http://localhost/api/deal-rooms/${roomId}/documents`, {
        method: "POST",
        body: htmlForm,
      }),
      { params: Promise.resolve({ id: roomId }) }
    );
    expect(htmlRes.status).toBe(400);
  });
});
