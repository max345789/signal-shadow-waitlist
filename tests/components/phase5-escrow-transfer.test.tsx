import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  generateTransferChecklistItems,
  sanitizeDealRoomForViewer,
  type AdminDisputeView,
  type RawDealRoomRecord,
} from "@/lib/domain/deal-room";
import { DEAL_STAGES_ORDER, DEAL_STAGE_DEFINITIONS } from "@/lib/domain/deal-stages";
import { DealRoomClient } from "@/components/deal-rooms/deal-room-client";
import { DealRoomsIndexClient } from "@/components/deal-rooms/deal-rooms-index-client";
import { AdminReviewClient } from "@/components/admin/admin-review-client";

const NOW_ISO = "2026-11-12T10:00:00.000Z";

function makeEscrowRoom(options: {
  escrowStatus: "IN_REVIEW" | "DISPUTED" | "RELEASED" | "REFUNDED";
  disputeReason?: string;
  currentStage?: "ESCROW" | "TRANSFER";
  offerCurrency?: "INR" | "USD";
}): RawDealRoomRecord {
  const transferItems = generateTransferChecklistItems().map((item, idx) => ({
    id: `xfer-${idx}`,
    dealRoomId: "deal-p5-1",
    phase: "TRANSFER" as const,
    category: item.category,
    title: item.title,
    buyerConfirmedAt: options.escrowStatus === "RELEASED" ? NOW_ISO : null,
    sellerConfirmedAt: options.escrowStatus === "RELEASED" ? NOW_ISO : null,
    status:
      options.escrowStatus === "RELEASED"
        ? ("CONFIRMED" as const)
        : ("OPEN" as const),
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  }));

  return {
    id: "deal-p5-1",
    businessId: "sample-biz-gst-01",
    businessSlug: "sample-b2b-gst-compliance-saas",
    teaserTitle: "Profitable B2B GST & E-Invoicing SaaS",
    sector: "B2B SaaS",
    geography: "India",
    askingPrice: 12_500_000,
    currency: "INR",
    isSampleData: true,
    redactedName: "TaxBridge Compliance Systems Pvt Ltd",
    redactedDomain: "taxbridge-sample.in",
    redactedCustomers: "Top 10 CA firms",
    buyerProfileId: "bp-1",
    buyerUserId: "sample-buyer-01",
    buyerName: "Ananya Rao (Sample Buyer)",
    sellerProfileId: "sp-1",
    sellerUserId: "sample-seller-01",
    sellerName: "Rohan Mehta (Sample Seller)",
    currentStage: options.currentStage ?? "TRANSFER",
    status:
      options.escrowStatus === "DISPUTED"
        ? "DISPUTED"
        : options.escrowStatus === "RELEASED"
          ? "COMPLETED"
          : options.escrowStatus === "REFUNDED"
            ? "CANCELLED"
            : "ACTIVE",
    ndaSignedAt: NOW_ISO,
    ndaDocumentId: "doc-nda-1",
    stages: DEAL_STAGES_ORDER.map((stage, idx) => ({
      id: `stg-${idx}`,
      stage,
      ownerRole: DEAL_STAGE_DEFINITIONS[stage]?.defaultOwner ?? "BOTH",
      requiredAction: DEAL_STAGE_DEFINITIONS[stage]?.defaultRequiredAction ?? "",
      status:
        idx < 6
          ? "COMPLETED"
          : options.escrowStatus === "DISPUTED"
            ? "BLOCKED"
            : options.escrowStatus === "RELEASED"
              ? "COMPLETED"
              : "ACTIVE",
      completedAt:
        idx < 6 || options.escrowStatus === "RELEASED" ? NOW_ISO : null,
      updatedAt: NOW_ISO,
    })),
    messages: [],
    documents: [],
    offers: [
      {
        id: "off-1",
        dealRoomId: "deal-p5-1",
        proposerId: "sample-buyer-01",
        proposerName: "Ananya Rao (Sample Buyer)",
        proposerRole: "BUYER",
        amount: 12_000_000,
        currency: options.offerCurrency ?? "INR",
        termsSummary: "1.20 Cr via third-party escrow.",
        status: "ACCEPTED",
        parentOfferId: null,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      },
    ],
    checklistItems: transferItems,
    escrowTransactions: [
      {
        id: "esc-1",
        dealRoomId: "deal-p5-1",
        provider: "Escrow.com",
        externalRef: "ESC-ESCCOM-P5",
        amount: 12_000_000,
        currency: "INR",
        status: options.escrowStatus,
        fundedAt: NOW_ISO,
        releasedAt: options.escrowStatus === "RELEASED" ? NOW_ISO : null,
        disputeReason: options.disputeReason ?? null,
        platformHoldsFunds: false,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      },
    ],
    auditLogs: [],
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };
}

describe("Phase 5 Escrow & Transfer UI Components", () => {
  it("renders visual 4-state escrow status, non-custody disclosure, and 7-category transfer checklist", async () => {
    const user = userEvent.setup();
    const view = sanitizeDealRoomForViewer(
      makeEscrowRoom({ escrowStatus: "IN_REVIEW" }),
      "BUYER",
      {
        identityVerified: true,
        proofOfFundsVerified: true,
        dataAccessReady: true,
        reason: "Verified.",
      }
    );

    render(<DealRoomClient initialDealRoom={view} />);

    await user.click(screen.getByRole("tab", { name: /Escrow & transfer/i }));

    expect(
      screen.getByText(/Trust Marketplace never holds or custodies funds/i)
    ).toBeInTheDocument();
    expect(screen.getByText("ESC-ESCCOM-P5")).toBeInTheDocument();
    expect(screen.getByText("Funded")).toBeInTheDocument();
    expect(screen.getByText("In review")).toBeInTheDocument();
    expect(screen.getByText("Released")).toBeInTheDocument();
    expect(screen.getByText("Disputed")).toBeInTheDocument();

    // All 7 Section 6 transfer categories rendered
    for (const cat of [
      "Domain",
      "Code repository",
      "Cloud & hosting",
      "Payment accounts",
      "Social handles",
      "Customer data",
      "Vendor contracts",
    ]) {
      expect(screen.getByText(cat)).toBeInTheDocument();
    }

    // Release button disabled until 7/7 confirmed by both sides
    expect(
      screen.getByRole("button", { name: /Authorize escrow release/i })
    ).toBeDisabled();
  });

  it("isolates 3 non-neutral colors on disputed DealRoomClient (Brick Red replaces Verified Green)", async () => {
    const user = userEvent.setup();
    const disputedView = sanitizeDealRoomForViewer(
      makeEscrowRoom({
        escrowStatus: "DISPUTED",
        disputeReason: "Domain EPP code missing.",
      }),
      "BUYER",
      {
        identityVerified: true,
        proofOfFundsVerified: true,
        dataAccessReady: true,
        reason: "Verified.",
      }
    );

    const { container } = render(<DealRoomClient initialDealRoom={disputedView} />);
    await user.click(screen.getByRole("tab", { name: /Escrow & transfer/i }));

    expect(
      screen.getAllByText("Domain EPP code missing.").length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Paused: Dispute under review")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("text-verified-green");
    expect(container.innerHTML).not.toContain("bg-verified-green");
  });

  it("renders Admin Dispute queue tab with Open vs Resolved disputes", async () => {
    const user = userEvent.setup();
    const openDispute: AdminDisputeView = {
      dealRoomId: "deal-disp-1",
      businessId: "biz-1",
      businessSlug: "sample-saas",
      teaserTitle: "Sample B2B SaaS",
      sector: "B2B SaaS",
      geography: "India",
      isSampleData: true,
      buyerUserId: "buyer-1",
      buyerName: "Ananya Rao",
      sellerUserId: "seller-1",
      sellerName: "Rohan Mehta",
      currentStage: "TRANSFER",
      roomStatus: "DISPUTED",
      transferConfirmedCount: 5,
      transferTotalCount: 7,
      escrow: {
        id: "esc-disp-1",
        dealRoomId: "deal-disp-1",
        provider: "Escrow.com",
        externalRef: "ESC-DISP-001",
        amount: 12_000_000,
        currency: "INR",
        status: "DISPUTED",
        fundedAt: NOW_ISO,
        releasedAt: null,
        disputeReason: "Pending domain registrar push.",
        platformHoldsFunds: false,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      },
      resolutionNote: null,
      resolvedAt: null,
      updatedAt: NOW_ISO,
    };

    render(
      <AdminReviewClient
        initialListings={[]}
        initialVerifications={[]}
        initialDisputes={[openDispute]}
      />
    );

    await user.click(screen.getByRole("tab", { name: /Dispute queue/i }));
    expect(screen.getByText("ESC-DISP-001")).toBeInTheDocument();
    expect(screen.getByText("Pending domain registrar push.")).toBeInTheDocument();
    expect(screen.getByText("5 / 7 confirmed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Resume to In Review/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Release to Seller/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Refund to Buyer/i })
    ).toBeInTheDocument();
  });

  it("renders REFUNDED escrow details on cancelled rooms, IN_REVIEW guidance in ESCROW stage, and suppresses green on /deals when disputed", async () => {
    const user = userEvent.setup();

    const refundedView = sanitizeDealRoomForViewer(
      makeEscrowRoom({
        escrowStatus: "REFUNDED",
        disputeReason: "Vendor contract non-assignable.",
      }),
      "BUYER",
      {
        identityVerified: true,
        proofOfFundsVerified: true,
        dataAccessReady: true,
        reason: "Verified.",
      }
    );

    const { unmount } = render(<DealRoomClient initialDealRoom={refundedView} />);
    await user.click(screen.getByRole("tab", { name: /Escrow & transfer/i }));
    expect(screen.getByText("ESC-ESCCOM-P5")).toBeInTheDocument();
    expect(
      screen.getByText(/Escrow refunded to Buyer following dispute arbitration/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Original dispute reason: Vendor contract non-assignable\./i)
    ).toBeInTheDocument();
    unmount();

    const resumedInEscrowView = sanitizeDealRoomForViewer(
      makeEscrowRoom({
        escrowStatus: "IN_REVIEW",
        currentStage: "ESCROW",
      }),
      "BUYER",
      {
        identityVerified: true,
        proofOfFundsVerified: true,
        dataAccessReady: true,
        reason: "Verified.",
      }
    );
    const { unmount: unmountResumed } = render(
      <DealRoomClient initialDealRoom={resumedInEscrowView} />
    );
    await user.click(screen.getByRole("tab", { name: /Escrow & transfer/i }));
    expect(
      screen.getByText(/Escrow is in review following dispute resolution/i)
    ).toBeInTheDocument();
    unmountResumed();

    // USD offer disables Castler Escrow and defaults to Escrow.com
    const usdRaw = makeEscrowRoom({
      escrowStatus: "IN_REVIEW",
      currentStage: "ESCROW",
      offerCurrency: "USD",
    });
    usdRaw.escrowTransactions = [];
    const usdView = sanitizeDealRoomForViewer(usdRaw, "BUYER", {
      identityVerified: true,
      proofOfFundsVerified: true,
      dataAccessReady: true,
      reason: "Verified.",
    });
    const { unmount: unmountUsd } = render(
      <DealRoomClient initialDealRoom={usdView} />
    );
    await user.click(screen.getByRole("tab", { name: /Escrow & transfer/i }));
    const providerSelect = screen.getByLabelText(
      /Licensed third-party escrow provider/i
    ) as HTMLSelectElement;
    expect(providerSelect.value).toBe("Escrow.com");
    expect(
      screen.getByRole("option", { name: /Castler Escrow \(INR only\)/i })
    ).toBeDisabled();
    unmountUsd();

    // /deals suppresses text-verified-green when a DISPUTED room coexists with an NDA-signed room
    const { container: dealsContainer } = render(
      <DealRoomsIndexClient
        gateStatus="ready"
        initialRooms={[
          {
            id: "deal-ok",
            businessId: "b1",
            businessSlug: "b1",
            teaserTitle: "Clean SaaS",
            sector: "B2B SaaS",
            geography: "India",
            askingPrice: 10_000_000,
            currency: "INR",
            isSampleData: true,
            buyerUserId: "buyer-1",
            buyerName: "Ananya",
            sellerUserId: "seller-1",
            sellerName: "Rohan",
            currentStage: "TRANSFER",
            status: "ACTIVE",
            latestEscrowStatus: "FUNDED",
            ndaCompleted: true,
            ndaSignedAt: NOW_ISO,
            updatedAt: NOW_ISO,
            createdAt: NOW_ISO,
          },
          {
            id: "deal-disp",
            businessId: "b2",
            businessSlug: "b2",
            teaserTitle: "Disputed SaaS",
            sector: "B2B SaaS",
            geography: "India",
            askingPrice: 12_000_000,
            currency: "INR",
            isSampleData: true,
            buyerUserId: "buyer-1",
            buyerName: "Ananya",
            sellerUserId: "seller-2",
            sellerName: "Kiran",
            currentStage: "ESCROW",
            status: "DISPUTED",
            latestEscrowStatus: "DISPUTED",
            ndaCompleted: true,
            ndaSignedAt: NOW_ISO,
            updatedAt: NOW_ISO,
            createdAt: NOW_ISO,
          },
        ]}
      />
    );
    expect(dealsContainer.innerHTML).not.toContain("text-verified-green");
    expect(dealsContainer.innerHTML).not.toContain("bg-verified-green");
  });
});
