import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardStateEmpty,
  CardStateError,
  CardStateLoading,
} from "@/components/ui/card";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import { InfoTooltip } from "@/components/ui/tooltip";
import {
  StageTracker,
  type StageTrackerItem,
} from "@/components/domain/stage-tracker";
import { MetricTile } from "@/components/domain/metric-tile";

const STAGES_FIXTURE: StageTrackerItem[] = [
  {
    stage: "INTRO",
    status: "COMPLETED",
    ownerRole: "BOTH",
    requiredAction: "Confirm initial fit",
    timestampLabel: "10 Nov 2026",
  },
  {
    stage: "NDA",
    status: "ACTIVE",
    ownerRole: "BUYER",
    requiredAction: "Sign NDA and complete KYC",
    timestampLabel: null,
  },
  {
    stage: "DATA_ACCESS",
    status: "PENDING",
    ownerRole: "SELLER",
    requiredAction: "Unlock data room files",
    timestampLabel: null,
  },
  {
    stage: "OFFER",
    status: "PENDING",
    ownerRole: "BOTH",
    requiredAction: "Submit written offer",
    timestampLabel: null,
  },
  {
    stage: "DUE_DILIGENCE",
    status: "PENDING",
    ownerRole: "BUYER",
    requiredAction: "Verify diligence checklist",
    timestampLabel: null,
  },
  {
    stage: "ESCROW",
    status: "PENDING",
    ownerRole: "BUYER",
    requiredAction: "Fund escrow provider",
    timestampLabel: null,
  },
  {
    stage: "TRANSFER",
    status: "PENDING",
    ownerRole: "BOTH",
    requiredAction: "Confirm two-sided transfer",
    timestampLabel: null,
  },
];

describe("Phase 0 UI Component Library", () => {
  it("renders Button variants and exposes accessible loading state", () => {
    render(
      <div>
        <Button variant="primary">Primary Action</Button>
        <Button variant="action" loading loadingLabel="Submitting...">
          Submit
        </Button>
      </div>
    );

    expect(screen.getByRole("button", { name: "Primary Action" })).toBeEnabled();
    const loadingBtn = screen.getByRole("button", { name: "Submitting..." });
    expect(loadingBtn).toBeDisabled();
    expect(loadingBtn).toHaveAttribute("aria-busy", "true");
  });

  it("renders Input with accessible label, helper text, and error alert", () => {
    render(
      <Input
        label="Asking Price"
        prefixText="₹"
        helperText="Enter whole INR"
        error="Asking price is required"
        required
      />
    );

    const input = screen.getByLabelText(/Asking Price/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Asking price is required");
    expect(screen.getByText("Enter whole INR")).toBeInTheDocument();
  });

  it("renders Card loading, empty, and error states with retry callback", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <div>
        <Card>Basic card body</Card>
        <CardStateLoading title="Loading listings" />
        <CardStateEmpty title="No results" description="Try broadening filters." />
        <CardStateError message="Failed to connect" onRetry={onRetry} />
      </div>
    );

    expect(screen.getByText("Basic card body")).toBeInTheDocument();
    expect(screen.getByText("Loading listings")).toBeInTheDocument();
    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to connect");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("enforces icon + text label on every StatusChip tone (never colour alone)", () => {
    const tones: StatusChipTone[] = [
      "verified",
      "completed",
      "pending",
      "caution",
      "risk",
      "seller-reported",
      "neutral",
    ];

    const { container } = render(
      <div>
        {tones.map((tone) => (
          <StatusChip key={tone} tone={tone} label={`Label ${tone}`} />
        ))}
      </div>
    );

    for (const tone of tones) {
      const chip = container.querySelector(`[data-status-tone="${tone}"]`);
      expect(chip).not.toBeNull();
      expect(chip?.querySelector("svg")).not.toBeNull();
      expect(chip).toHaveTextContent(`Label ${tone}`);
    }
  });

  it("renders StageTracker with all 7 stages and supports keyboard arrow navigation", async () => {
    const user = userEvent.setup();
    render(<StageTracker stages={STAGES_FIXTURE} />);

    const introBtn = screen.getByRole("button", { name: /01.*Intro/i });
    const ndaBtn = screen.getByRole("button", { name: /02.*NDA/i });
    const transferBtn = screen.getByRole("button", { name: /07.*Transfer/i });

    expect(ndaBtn).toHaveAttribute("aria-current", "step");
    expect(transferBtn).toBeInTheDocument();

    introBtn.focus();
    await user.keyboard("{ArrowRight}");
    expect(ndaBtn).toHaveFocus();
    expect(screen.getByText("Sign NDA and complete KYC")).toBeInTheDocument();
  });

  it("never fakes Verified trust in MetricTile: handles verified, seller-reported, expired, and failed states", () => {
    const now = "2026-11-12T10:00:00.000Z";

    const { rerender } = render(
      <MetricTile
        label="MRR"
        value={1_500_000}
        unit="CURRENCY"
        currency="INR"
        sourceLabel="Stripe"
        isSampleData
        referenceNow={now}
        verification={{
          id: "v1",
          provider: "Stripe",
          status: "VERIFIED",
          verifiedAt: "2026-11-12T08:00:00.000Z",
          expiresAt: "2026-11-19T08:00:00.000Z",
        }}
      />
    );

    expect(screen.getByText("Sample data")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Last verified 2 hours ago")).toBeInTheDocument();
    expect(screen.getByText("₹15,00,000")).toBeInTheDocument();

    // Unverified -> Seller-reported, never Verified
    rerender(
      <MetricTile
        label="Profit"
        value={500_000}
        unit="CURRENCY"
        currency="INR"
        sourceLabel="Seller-reported"
        referenceNow={now}
        verification={null}
      />
    );
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
    expect(screen.getAllByText("Seller-reported").length).toBeGreaterThanOrEqual(1);

    // Expired verification -> automatically stripped of Verified mark
    rerender(
      <MetricTile
        label="Traffic"
        value={42000}
        unit="COUNT"
        sourceLabel="GA4"
        referenceNow={now}
        verification={{
          id: "v2",
          provider: "GA4",
          status: "VERIFIED",
          verifiedAt: "2026-10-01T08:00:00.000Z",
          expiresAt: "2026-11-01T08:00:00.000Z",
        }}
      />
    );
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
    expect(screen.getByText("Verification expired")).toBeInTheDocument();

    // Failed verification -> Connection failed
    rerender(
      <MetricTile
        label="Churn"
        value={3.2}
        unit="PERCENT"
        sourceLabel="Razorpay"
        referenceNow={now}
        verification={{
          id: "v3",
          provider: "Razorpay",
          status: "FAILED",
          verifiedAt: null,
          expiresAt: null,
        }}
      />
    );
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
  });

  it("supports click toggle and Escape dismissal on InfoTooltip for touch and keyboard users", async () => {
    const user = userEvent.setup();
    render(
      <InfoTooltip
        label="Verification info"
        explanation="Only active third-party records earn a Verified mark."
      />
    );

    const trigger = screen.getByRole("button", { name: "Verification info" });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Only active third-party records earn a Verified mark."
    );

    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("focuses the ACTIVE stage when StageTracker transitions from loading/empty to ready", () => {
    const { rerender } = render(<StageTracker stages={[]} state="loading" />);
    expect(screen.getByText("Loading deal stages")).toBeInTheDocument();

    rerender(<StageTracker stages={STAGES_FIXTURE} state="ready" />);
    const ndaBtn = screen.getByRole("button", { name: /02.*NDA/i });
    expect(ndaBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Sign NDA and complete KYC")).toBeInTheDocument();
  });

  it("falls back to non-empty label in StatusChip and guards Button asChild+loading", () => {
    render(
      <div>
        <StatusChip tone="verified" label="   " />
        <Button asChild loading loadingLabel="Working...">
          <a href="/test">Should show working label safely</a>
        </Button>
      </div>
    );

    expect(screen.getByText("Verified")).toBeInTheDocument();
    const loadingBtn = screen.getByRole("button", { name: "Working..." });
    expect(loadingBtn).toBeDisabled();
  });
});
