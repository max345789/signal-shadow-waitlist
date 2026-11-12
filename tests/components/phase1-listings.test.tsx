import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sanitizeListingForViewer } from "@/lib/domain/listings";
import { createSampleSeedListings } from "@/lib/listings/sample-data";
import { ListingDetailClient } from "@/components/listings/listing-detail-client";
import { FinancialChart } from "@/components/listings/financial-chart";
import { SellerOnboardingClient } from "@/components/seller/seller-onboarding-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("Phase 1 UI components: ListingDetailClient, FinancialChart, SellerOnboardingClient", () => {
  it("renders ListingDetailClient in strict Section 6 order with distinct Verified vs Seller-reported sections and redacted identity", () => {
    const now = new Date("2026-11-12T10:00:00.000Z");
    const sample = createSampleSeedListings(now.getTime())[0]!;
    const publicListing = sanitizeListingForViewer(
      sample,
      { userId: null, roles: [], hasSignedNda: false },
      now
    );

    const { container } = render(
      <ListingDetailClient
        initialListing={publicListing}
        referenceNow={now.toISOString()}
        isAuthenticated={false}
      />
    );

    // Sample data must be explicitly labelled
    expect(screen.getAllByText("Sample data").length).toBeGreaterThanOrEqual(1);

    // Confidential fields must be redacted and secret terms absent
    expect(screen.getAllByText("Redacted until NDA is signed").length).toBeGreaterThanOrEqual(3);
    expect(container.textContent).not.toContain("TaxBridge");
    expect(container.textContent).not.toContain("taxbridge-sample.in");

    // Distinct Verified vs Seller-reported subsections
    expect(screen.getByText("Verified connected metrics")).toBeInTheDocument();
    expect(screen.getByText("Seller-reported metrics (unverified)")).toBeInTheDocument();
    expect(screen.getAllByText("Verified").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Seller-reported").length).toBeGreaterThanOrEqual(1);

    // Strict Section 6 ordering
    const headings = Array.from(container.querySelectorAll("h2")).map((h) =>
      h.textContent?.trim()
    );
    expect(headings).toEqual([
      "1. Live vitals strip",
      "2. Founder voice note & story",
      "3. Reason for selling",
      "4. Financial narrative & trend",
      "5. Disclosed risks & diligence notes",
      "6. Tech stack & assets included",
      "7. Buyer Q&A",
    ]);
  });

  it("renders FinancialChart SVG and empty state safely", () => {
    const { rerender } = render(
      <FinancialChart
        currency="INR"
        series={[
          { period: "Q1", revenue: 2_000_000, profit: 800_000, source: "VERIFIED" },
          { period: "Q2", revenue: 2_500_000, profit: 1_000_000, source: "SELLER_REPORTED" },
        ]}
      />
    );

    expect(
      screen.getByRole("img", { name: /Quarterly revenue and net profit bar chart/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Verified connection")).toBeInTheDocument();
    expect(screen.getByText("Seller-reported")).toBeInTheDocument();

    rerender(<FinancialChart currency="INR" series={[]} />);
    expect(screen.getByText("No quarterly breakdown available")).toBeInTheDocument();
  });

  it("walks through SellerOnboardingClient valuation and leak detection warning", async () => {
    const user = userEvent.setup();
    render(
      <SellerOnboardingClient
        editingListing={null}
        session={{
          userId: "sample-seller-01",
          email: "seller.sample@trustmarketplace.local",
          name: "Rohan Mehta (Sample Seller)",
          roles: ["SELLER"],
          twoFactorEnabled: true,
          twoFactorVerifiedAt: new Date().toISOString(),
          authMode: "local-dev",
          isSampleAccount: true,
        }}
      />
    );

    await user.type(screen.getByLabelText(/Legal or brand business name/i), "SecretBrand Pvt Ltd");
    await user.type(screen.getByLabelText(/Primary domain/i), "secretbrand.in");
    await user.click(screen.getByRole("button", { name: /Continue to financials/i }));

    expect(
      screen.getByText(/Conservative guided valuation estimate/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Continue to trust/i }));
    await user.type(
      screen.getByLabelText(/Reason for selling/i),
      "Founder relocating abroad for family reasons."
    );
    await user.click(screen.getByRole("button", { name: /Auto-build & review listing/i }));

    // Auto-built title must be generated cleanly
    const titleInput = screen.getByLabelText(/Public teaser title/i) as HTMLInputElement;
    expect(titleInput.value).toContain("B2B SaaS");

    // Typing confidential domain into public teaser triggers immediate leak warning
    await user.type(titleInput, " secretbrand.in");
    expect(screen.getByText(/Confidential redaction warning/i)).toBeInTheDocument();
  });
});
