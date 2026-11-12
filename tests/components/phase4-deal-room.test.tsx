import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  sanitizeDealRoomForViewer,
  type RawDealRoomRecord,
} from "@/lib/domain/deal-room";
import { DEAL_STAGES_ORDER, DEAL_STAGE_DEFINITIONS } from "@/lib/domain/deal-stages";
import { DealRoomsIndexClient } from "@/components/deal-rooms/deal-rooms-index-client";
import { DealRoomClient } from "@/components/deal-rooms/deal-room-client";

const NOW_ISO = "2026-11-12T10:00:00.000Z";

function makeRawRoom(ndaSigned: boolean): RawDealRoomRecord {
  return {
    id: "deal-test-1",
    businessId: "sample-biz-saas-01",
    businessSlug: "sample-saas-gst-billing",
    teaserTitle: "Profitable B2B GST & Invoicing SaaS",
    sector: "B2B SaaS",
    geography: "India",
    askingPrice: 12_500_000,
    currency: "INR",
    isSampleData: true,
    redactedName: "TaxBridge Software Pvt Ltd",
    redactedDomain: "taxbridge-sample.in",
    redactedCustomers: "Top 10 CA firms",
    buyerProfileId: "bp-1",
    buyerUserId: "sample-buyer-01",
    buyerName: "Ananya Rao (Sample Buyer)",
    sellerProfileId: "sp-1",
    sellerUserId: "sample-seller-01",
    sellerName: "Rohan Mehta (Sample Seller)",
    currentStage: ndaSigned ? "DATA_ACCESS" : "NDA",
    status: "ACTIVE",
    ndaSignedAt: ndaSigned ? NOW_ISO : null,
    ndaDocumentId: ndaSigned ? "doc-nda-1" : null,
    stages: DEAL_STAGES_ORDER.map((stage, idx) => ({
      id: `stg-${idx}`,
      stage,
      ownerRole: DEAL_STAGE_DEFINITIONS[stage].defaultOwner,
      requiredAction: DEAL_STAGE_DEFINITIONS[stage].defaultRequiredAction,
      status:
        idx === 0
          ? "COMPLETED"
          : idx === 1
            ? ndaSigned
              ? "COMPLETED"
              : "ACTIVE"
            : idx === 2 && ndaSigned
              ? "ACTIVE"
              : "PENDING",
      completedAt: idx === 0 || (ndaSigned && idx === 1) ? NOW_ISO : null,
      updatedAt: NOW_ISO,
    })),
    messages: [
      {
        id: "msg-1",
        dealRoomId: "deal-test-1",
        senderId: "sample-buyer-01",
        senderName: "Ananya Rao (Sample Buyer)",
        senderRoleLabel: "Buyer",
        parentId: null,
        body: "Looking forward to reviewing Q3 cohorts.",
        createdAt: NOW_ISO,
      },
    ],
    documents: ndaSigned
      ? [
          {
            id: "doc-1",
            dealRoomId: "deal-test-1",
            uploadedById: "sample-seller-01",
            uploadedByName: "Rohan Mehta (Sample Seller)",
            title: "Q3 Financial Reconciliation",
            category: "FINANCIAL",
            filename: "q3-recon.txt",
            mimeType: "text/plain",
            storageKey: "deal-test-1/doc-1-q3-recon.txt",
            watermarkedKey: "deal-test-1/doc-1-watermarked-q3-recon.txt",
            version: 1,
            virusScanStatus: "CLEAN",
            watermarkNotice: "CONFIDENTIAL — Deal Room deal-test-1",
            viewCount: 1,
            views: [
              {
                id: "v-1",
                viewerId: "sample-buyer-01",
                viewerName: "Ananya Rao (Sample Buyer)",
                viewedAt: NOW_ISO,
                ipAddress: "127.0.0.1",
                userAgent: "Vitest",
              },
            ],
            createdAt: NOW_ISO,
          },
        ]
      : [],
    offers: [],
    checklistItems: [
      {
        id: "chk-1",
        dealRoomId: "deal-test-1",
        phase: "DUE_DILIGENCE",
        category: "Technical",
        title: "Audit Git repository ownership",
        buyerConfirmedAt: null,
        sellerConfirmedAt: null,
        status: "OPEN",
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      },
    ],
    auditLogs: [
      {
        id: "audit-1",
        actorId: "sample-buyer-01",
        actorName: "Ananya Rao (Sample Buyer)",
        entityType: "DealRoom",
        entityId: "deal-test-1",
        action: "DEAL_ROOM_CREATED",
        previousState: null,
        newState: { currentStage: "INTRO" },
        metadataJson: null,
        createdAt: NOW_ISO,
      },
    ],
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };
}

describe("Phase 4 Deal Room UI Components", () => {
  it("renders 2FA gate on DealRoomsIndexClient when 2FA is missing", () => {
    render(
      <DealRoomsIndexClient
        initialRooms={[]}
        gateStatus="two-factor-required"
        gateMessage="Two-factor authentication is mandatory before accessing deal rooms."
      />
    );

    expect(
      screen.getByText(/Mandatory 2FA verification required/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Sign in & verify 2FA/i })
    ).toBeInTheDocument();
  });

  it("hides redacted fields before NDA completion and unlocks them after NDA completion", async () => {
    const user = userEvent.setup();
    const lockedRoom = sanitizeDealRoomForViewer(makeRawRoom(false), "BUYER", {
      identityVerified: false,
      proofOfFundsVerified: false,
      dataAccessReady: false,
      reason: "Identity and POF pending.",
    });

    const { container, rerender } = render(
      <DealRoomClient initialDealRoom={lockedRoom} />
    );

    expect(
      screen.getAllByText("Redacted until NDA is signed").length
    ).toBeGreaterThanOrEqual(3);
    expect(container.textContent).not.toContain("TaxBridge Software Pvt Ltd");
    expect(container.textContent).not.toContain("taxbridge-sample.in");
    expect(screen.getAllByText("Needs legal review").length).toBeGreaterThanOrEqual(
      1
    );

    // Rerender with completed NDA -> fields unlock immediately
    const unlockedRoom = sanitizeDealRoomForViewer(makeRawRoom(true), "BUYER", {
      identityVerified: true,
      proofOfFundsVerified: true,
      dataAccessReady: true,
      reason: "Verified.",
    });

    rerender(
      <DealRoomClient key="unlocked" initialDealRoom={unlockedRoom} />
    );
    expect(screen.getByText("TaxBridge Software Pvt Ltd")).toBeInTheDocument();
    expect(screen.getByText("taxbridge-sample.in")).toBeInTheDocument();
    expect(screen.getByText("Top 10 CA firms")).toBeInTheDocument();

    // Verify all workspace tabs navigate cleanly
    await user.click(screen.getByRole("tab", { name: /Chat/i }));
    expect(
      screen.getByText("Looking forward to reviewing Q3 cohorts.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Documents/i }));
    expect(screen.getByText("Q3 Financial Reconciliation")).toBeInTheDocument();
    expect(screen.getByText("1 view logged")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Checklist/i }));
    expect(
      screen.getByText("Audit Git repository ownership")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Audit log/i }));
    expect(screen.getByText("DEAL_ROOM_CREATED")).toBeInTheDocument();
  });
});
