import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthSession } from "@/lib/auth/types";
import type { VerificationCentreState } from "@/lib/verification/store";
import { VerificationCentreClient } from "@/components/verification/verification-centre-client";
import { AdminReviewClient } from "@/components/admin/admin-review-client";

const BUYER_SESSION: AuthSession = {
  userId: "sample-buyer-01",
  email: "buyer.sample@trustmarketplace.local",
  name: "Ananya Rao (Sample Buyer)",
  roles: ["BUYER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: "2026-11-12T09:00:00.000Z",
  authMode: "local-dev",
  isSampleAccount: true,
};

const SELLER_SESSION: AuthSession = {
  userId: "sample-seller-01",
  email: "seller.sample@trustmarketplace.local",
  name: "Rohan Mehta (Sample Seller)",
  roles: ["SELLER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: "2026-11-12T09:00:00.000Z",
  authMode: "local-dev",
  isSampleAccount: true,
};

describe("Phase 3 UI components: VerificationCentreClient & AdminReviewClient verification queue", () => {
  it("renders unauthenticated sign-in prompt cleanly", () => {
    render(
      <VerificationCentreClient
        session={null}
        initialState={null}
        isSandboxMode={true}
      />
    );
    expect(screen.getByText("Verification Centre")).toBeInTheDocument();
    expect(
      screen.getByText(/Sign in to manage verifications/i)
    ).toBeInTheDocument();
  });

  it("enforces 3-color isolation on VerificationCentreClient when mixed Verified + Failed connectors exist", () => {
    const nowIso = "2026-11-12T10:00:00.000Z";
    const futureIso = "2026-11-19T10:00:00.000Z";
    const mixedState: VerificationCentreState = {
      identity: null,
      proofOfFunds: null,
      buyerDataAccess: {
        allowed: false,
        identityEvaluated: {
          isVerified: false,
          effectiveState: "seller-reported",
          label: "Seller-reported",
          detail: "Not connected",
          lastVerifiedLabel: null,
        },
        proofOfFundsEvaluated: {
          isVerified: false,
          effectiveState: "seller-reported",
          label: "Seller-reported",
          detail: "Not connected",
          lastVerifiedLabel: null,
        },
        reason: "Both required.",
      },
      sellerBusinesses: [
        {
          businessId: "biz-1",
          slug: "biz-1",
          teaserTitle: "Profitable B2B SaaS",
          status: "APPROVED",
          currency: "INR",
          isSampleData: false,
          verifiedMetricsCount: 2,
          totalMetricsCount: 6,
          paymentConnector: {
            record: {
              id: "ver-pay-1",
              userId: SELLER_SESSION.userId,
              businessId: "biz-1",
              type: "PAYMENT_CONNECTOR",
              provider: "Stripe",
              status: "VERIFIED",
              verifiedAt: nowIso,
              expiresAt: futureIso,
              failureReason: null,
              metadata: { accountHint: "Stripe acct****01", syncIntervalMinutes: 60 },
              isSampleData: false,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            evaluated: {
              isVerified: true,
              effectiveState: "verified",
              label: "Verified",
              detail: "Read-only via Stripe",
              lastVerifiedLabel: "Last verified just now",
            },
          },
          analyticsConnector: {
            record: {
              id: "ver-ana-1",
              userId: SELLER_SESSION.userId,
              businessId: "biz-1",
              type: "ANALYTICS_CONNECTOR",
              provider: "GA4",
              status: "FAILED",
              verifiedAt: null,
              expiresAt: null,
              failureReason: "GA4 token revoked",
              metadata: { accountHint: "GA4 prop****01", syncIntervalMinutes: 60 },
              isSampleData: false,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            evaluated: {
              isVerified: false,
              effectiveState: "failed",
              label: "Connection failed",
              detail: "GA4 token revoked",
              lastVerifiedLabel: null,
            },
          },
        },
      ],
      notifications: [],
    };

    const { container } = render(
      <VerificationCentreClient
        session={SELLER_SESSION}
        initialState={mixedState}
        initialTab="connectors"
        isSandboxMode={true}
      />
    );

    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
    // Because Verified Green is present, risk/caution chips must fall back to neutral border styling
    expect(container.querySelector('[data-status-tone="risk"]')).toBeNull();
    expect(container.querySelector('[data-status-tone="caution"]')).toBeNull();
    // Failed connector disables tokenless Refresh now button
    const refreshButtons = screen.getAllByRole("button", { name: /Refresh now/i });
    expect(refreshButtons[1]).toBeDisabled();
  });

  it("renders VerificationCentreClient notifications and enforces <=3 non-neutrals when actionError coexists with Verified", async () => {
    const user = userEvent.setup();
    const nowIso = "2026-11-12T10:00:00.000Z";
    const futureIso = "2026-12-12T10:00:00.000Z";
    const stateWithNotif: VerificationCentreState = {
      identity: {
        record: {
          id: "ver-id-active",
          userId: BUYER_SESSION.userId,
          businessId: null,
          type: "IDENTITY",
          provider: "Persona",
          status: "VERIFIED",
          verifiedAt: nowIso,
          expiresAt: futureIso,
          failureReason: null,
          metadata: { documentType: "PAN", maskedReference: "****482F" },
          isSampleData: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        evaluated: {
          isVerified: true,
          effectiveState: "verified",
          label: "Verified",
          detail: "Read-only via Persona",
          lastVerifiedLabel: "Last verified just now",
        },
      },
      proofOfFunds: null,
      buyerDataAccess: {
        allowed: false,
        identityEvaluated: {
          isVerified: true,
          effectiveState: "verified",
          label: "Verified",
          detail: "Read-only via Persona",
          lastVerifiedLabel: "Last verified just now",
        },
        proofOfFundsEvaluated: {
          isVerified: false,
          effectiveState: "seller-reported",
          label: "Seller-reported",
          detail: "Not submitted",
          lastVerifiedLabel: null,
        },
        reason: "Active Proof of Funds verification is required.",
      },
      sellerBusinesses: [],
      notifications: [
        {
          id: "notif-1",
          type: "VERIFICATION_APPROVED",
          title: "VERIFICATION APPROVED",
          body: "Persona KYC verified for 90 days.",
          createdAt: nowIso,
        },
      ],
    };

    render(
      <VerificationCentreClient
        session={BUYER_SESSION}
        initialState={stateWithNotif}
        isSandboxMode={true}
      />
    );

    expect(screen.getByText("Recent verification alerts")).toBeInTheDocument();
    expect(screen.getByText("Persona KYC verified for 90 days.")).toBeInTheDocument();

    // Triggering actionError while Verified Green is visible must NOT use brick-red
    await user.type(screen.getByLabelText(/Last 4 characters of ID/i), "12");
    await user.click(screen.getByRole("button", { name: /Submit identity check/i }));
    const alert = screen.getByRole("alert");
    expect(alert.className).not.toContain("brick-red");
  });

  it("validates Buyer KYC inputs and renders Deal Room Data Access status", async () => {
    const user = userEvent.setup();
    const emptyBuyerState: VerificationCentreState = {
      identity: null,
      proofOfFunds: null,
      buyerDataAccess: {
        allowed: false,
        identityEvaluated: {
          isVerified: false,
          effectiveState: "seller-reported",
          label: "Seller-reported",
          detail: "Not submitted",
          lastVerifiedLabel: null,
        },
        proofOfFundsEvaluated: {
          isVerified: false,
          effectiveState: "seller-reported",
          label: "Seller-reported",
          detail: "Not submitted",
          lastVerifiedLabel: null,
        },
        reason: "Buyer identity check (KYC) and proof of funds must both be verified before entering Data access.",
      },
      sellerBusinesses: [],
      notifications: [],
    };

    render(
      <VerificationCentreClient
        session={BUYER_SESSION}
        initialState={emptyBuyerState}
        isSandboxMode={true}
      />
    );

    expect(screen.getByText("Verification incomplete")).toBeInTheDocument();

    // Invalid last4 triggers accessible error alert
    await user.type(screen.getByLabelText(/Last 4 characters of ID/i), "12");
    await user.click(screen.getByRole("button", { name: /Submit identity check/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/last 4 alphanumeric/i);
  });

  it("renders AdminReviewClient Verification queue tab and validates reviewer note", async () => {
    const user = userEvent.setup();
    const nowIso = "2026-11-12T10:00:00.000Z";
    render(
      <AdminReviewClient
        initialListings={[]}
        initialVerifications={[
          {
            record: {
              id: "ver-pending-1",
              userId: BUYER_SESSION.userId,
              userName: BUYER_SESSION.name,
              userEmail: BUYER_SESSION.email,
              businessId: null,
              businessTitle: null,
              businessSlug: null,
              type: "IDENTITY",
              provider: "Persona",
              status: "PENDING",
              verifiedAt: null,
              expiresAt: null,
              failureReason: null,
              metadata: {
                legalName: "Ananya Rao",
                documentType: "PAN",
                maskedReference: "****482F",
              },
              isSampleData: false,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            evaluated: {
              isVerified: false,
              effectiveState: "pending",
              label: "Verification pending",
              detail: "Awaiting Persona confirmation",
              lastVerifiedLabel: null,
            },
          },
        ]}
      />
    );

    await user.click(screen.getByRole("tab", { name: /Verification queue/i }));
    expect(screen.getByText("Verification pending")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Ananya Rao \(Sample Buyer\)/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Approve & verify/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/at least 5 characters/i);
  });
});
