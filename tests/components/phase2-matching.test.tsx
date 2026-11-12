import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sanitizeListingForViewer } from "@/lib/domain/listings";
import { rankListingsForThesis } from "@/lib/domain/matching";
import { createSampleSeedListings, createSampleSeedTheses } from "@/lib/listings/sample-data";
import { MatchResultCard } from "@/components/matching/match-result-card";
import { ThesisBuilderClient } from "@/components/matching/thesis-builder-client";
import { MatchesClient } from "@/components/matching/matches-client";
import { CompareClient } from "@/components/matching/compare-client";
import type { AuthSession } from "@/lib/auth/types";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
  }),
}));

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

describe("Phase 2 UI components: MatchResultCard, ThesisBuilderClient, MatchesClient, CompareClient", () => {
  const now = new Date("2026-11-12T10:00:00.000Z");
  const listings = createSampleSeedListings(now.getTime()).map((r) =>
    sanitizeListingForViewer(r, { userId: null, roles: [], hasSignedNda: false }, now)
  );
  const approved = listings.filter((l) => l.status === "APPROVED");
  const sampleThesis = createSampleSeedTheses(now.getTime())[0]!;

  it("renders MatchResultCard with both Why this matches and What doesn't fit never hidden, and withholds Verified Green when 0 metrics are verified", () => {
    const ranked = rankListingsForThesis(approved, sampleThesis);
    const { rerender, container } = render(
      <MatchResultCard
        match={ranked[1]!}
        rank={2}
        selectedForCompare={false}
        onToggleCompare={vi.fn()}
      />
    );

    expect(screen.getByText("#2 match")).toBeInTheDocument();
    expect(screen.getByText("Why this matches")).toBeInTheDocument();
    expect(screen.getByText("What doesn't fit")).toBeInTheDocument();
    expect(screen.getByText(/Sample data/)).toBeInTheDocument();
    expect(ranked[1]!.mismatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(ranked[1]!.mismatches[0]!)).toBeInTheDocument();

    // Even when mismatches array is empty, section remains visible with honest disclosure
    rerender(
      <MatchResultCard
        match={{ ...ranked[0]!, mismatches: [] }}
        rank={1}
      />
    );
    expect(screen.getByText("What doesn't fit")).toBeInTheDocument();
    expect(
      screen.getByText(/No criteria mismatches detected/i)
    ).toBeInTheDocument();

    // Unverified Seller-reported listing with high score (>=70) must NEVER render Verified Green
    const unverifiedRaw = createSampleSeedListings(now.getTime())[2]!;
    const unverifiedApproved = sanitizeListingForViewer(
      { ...unverifiedRaw, status: "APPROVED" },
      { userId: null, roles: [], hasSignedNda: false },
      now
    );
    rerender(
      <MatchResultCard
        match={{
          ...ranked[0]!,
          score: 88,
          listing: unverifiedApproved,
        }}
        rank={1}
      />
    );
    expect(container.querySelector(".text-verified-green")).toBeNull();
    expect(container.querySelector(".border-verified-green")).toBeNull();
  });

  it("prefills ThesisBuilderClient from Home prompt, validates invalid bounds, and handles preview fetch", async () => {
    const user = userEvent.setup();
    const ranked = rankListingsForThesis(approved, sampleThesis);

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ matches: ranked, evaluatedCount: ranked.length }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(
      <ThesisBuilderClient
        session={null}
        initialPrompt="B2B SaaS in India, ₹50L+ net profit, under 10 owner hours/week"
        editingThesis={null}
      />
    );

    expect(
      (screen.getByLabelText(/Industry \/ Sector/i) as HTMLSelectElement).value
    ).toBe("B2B SaaS");
    expect(
      (screen.getByLabelText(/Max owner hours per week/i) as HTMLInputElement).value
    ).toBe("10");

    // Invalid revenue range triggers accessible alerts (form summary + field alert)
    await user.type(screen.getByLabelText(/Minimum annual revenue/i), "9000000");
    await user.type(screen.getByLabelText(/Maximum annual revenue/i), "1000000");
    await user.click(screen.getByRole("button", { name: /Preview ranked matches/i }));
    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(/Check the highlighted thesis fields below/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Maximum revenue must be >= minimum revenue/i)
    ).toBeInTheDocument();

    // Fix revenue range and preview cleanly
    await user.clear(screen.getByLabelText(/Maximum annual revenue/i));
    await user.type(screen.getByLabelText(/Maximum annual revenue/i), "25000000");
    await user.click(screen.getByRole("button", { name: /Preview ranked matches/i }));

    expect(await screen.findByText(/Previewed matches/i)).toBeInTheDocument();
    expect(screen.getByText("#1 match")).toBeInTheDocument();

    // Entering an invalid negative maxPrice triggers validation and clears stale preview cards
    await user.type(screen.getByLabelText(/Maximum asking price/i), "-500");
    await user.click(screen.getByRole("button", { name: /Preview ranked matches/i }));
    expect(screen.getByText(/Maximum price cannot be negative/i)).toBeInTheDocument();
    expect(screen.queryByText(/Previewed matches/i)).not.toBeInTheDocument();

    fetchSpy.mockRestore();
  });

  it("renders MatchesClient alerts, enforces max 3 compare selection, and handles unauthenticated state", async () => {
    const user = userEvent.setup();
    const ranked = rankListingsForThesis(approved, sampleThesis);

    const { rerender, container } = render(
      <MatchesClient
        key="unauth"
        session={null}
        initialTheses={[]}
        initialNotifications={[]}
      />
    );
    expect(
      screen.getByText(/Sign in as a Buyer to view saved theses & alerts/i)
    ).toBeInTheDocument();

    const secondThesis = {
      ...sampleThesis,
      id: "second-thesis",
      title: "Second D2C Mandate",
      sector: "E-commerce / D2C",
      isSampleData: false,
    };

    rerender(
      <MatchesClient
        key="auth"
        session={BUYER_SESSION}
        initialTheses={[
          { thesis: sampleThesis, matches: ranked },
          { thesis: secondThesis, matches: rankListingsForThesis(approved, secondThesis) },
        ]}
        initialNotifications={[
          {
            id: "notif-1",
            userId: BUYER_SESSION.userId,
            type: "THESIS_MATCH",
            title: "New match (88/100 fit) for Second D2C Mandate",
            body: "Specialty Botanical Skincare D2C Brand",
            actionUrl: "/matches?thesisId=second-thesis",
            readAt: null,
            createdAt: now.toISOString(),
          },
        ]}
      />
    );

    expect(screen.getByText(/New thesis match alerts \(1\)/i)).toBeInTheDocument();
    expect(container.querySelector('[role="tabpanel"]')).not.toBeNull();

    // Clicking Inspect match jumps directly to the matching thesis tab
    await user.click(screen.getByRole("button", { name: /Inspect match/i }));
    const secondTab = screen.getByRole("tab", { name: /Second D2C Mandate/i });
    expect(secondTab).toHaveAttribute("aria-selected", "true");

    // Keyboard ArrowLeft switches back to first saved thesis tab cleanly
    const firstTab = screen.getByRole("tab", {
      name: /India B2B SaaS with verified Stripe revenue/i,
    });
    secondTab.focus();
    await user.keyboard("{ArrowLeft}");
    expect(firstTab).toHaveFocus();
    expect(firstTab).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(secondTab).toHaveFocus();
    await user.keyboard("{Home}");
    expect(firstTab).toHaveFocus();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(4);

    // Select 3 listings -> 4th checkbox becomes disabled cleanly
    await user.click(checkboxes[0]!);
    await user.click(checkboxes[1]!);
    await user.click(checkboxes[2]!);
    expect(screen.getByText("Compare selected: 3 / 3")).toBeInTheDocument();
    expect(checkboxes[3]!).toBeDisabled();
  });

  it("renders CompareClient empty/error states, prevents >3 non-neutral colors on mixed trust states, and handles rapid checkbox toggles", async () => {
    const user = userEvent.setup();
    const { rerender, container } = render(
      <CompareClient
        key="too-many"
        initialListings={[]}
        availableListings={approved}
        initialThesis={null}
        initialEvaluationsByBusinessId={{}}
        savedTheses={[sampleThesis]}
        initialTooManyError="You can compare up to 3 businesses side by side."
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /You can compare up to 3 businesses side by side/i
    );

    rerender(
      <CompareClient
        key="empty"
        initialListings={[]}
        availableListings={approved}
        initialThesis={null}
        initialEvaluationsByBusinessId={{}}
        savedTheses={[sampleThesis]}
        initialExcludedCount={1}
      />
    );
    expect(
      screen.getByText("No businesses selected for comparison")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 requested listing was excluded/i)
    ).toBeInTheDocument();

    // Rapid selection of two checkboxes preserves both selections even before fetch resolves
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        const idsMatch = url.match(/ids=([^&]+)/);
        const reqIds = idsMatch?.[1] ? decodeURIComponent(idsMatch[1]).split(",") : [];
        return new Response(
          JSON.stringify({
            listings: approved.filter((l) => reqIds.includes(l.id)),
            excludedCount: 0,
            thesis: null,
            evaluationsByBusinessId: {},
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });

    const compareBoxes = screen.getAllByRole("checkbox");
    await user.click(compareBoxes[0]!);
    await user.click(compareBoxes[1]!);
    expect(screen.getByText("2 / 3 selected")).toBeInTheDocument();
    fetchSpy.mockRestore();

    const three = approved.slice(0, 3);
    // Mix verified + expired + failed metrics in one compare view -> must not render >3 non-neutrals
    const rawExpired = {
      ...createSampleSeedListings(now.getTime())[1]!,
      metrics: createSampleSeedListings(now.getTime())[1]!.metrics.map((m, i) =>
        i === 0
          ? {
              ...m,
              verification: {
                id: "exp-1",
                provider: "Razorpay",
                status: "EXPIRED" as const,
                verifiedAt: new Date(now.getTime() - 86_400_000).toISOString(),
                expiresAt: new Date(now.getTime() - 3_600_000).toISOString(),
              },
            }
          : i === 1
            ? {
                ...m,
                verification: {
                  id: "fail-1",
                  provider: "GA4",
                  status: "FAILED" as const,
                  verifiedAt: null,
                  expiresAt: null,
                },
              }
            : m
      ),
    };
    const mixedSecond = sanitizeListingForViewer(
      rawExpired,
      { userId: null, roles: [], hasSignedNda: false },
      now
    );

    rerender(
      <CompareClient
        key="three"
        initialListings={[three[0]!, mixedSecond, three[2]!]}
        availableListings={approved}
        initialThesis={sampleThesis}
        initialEvaluationsByBusinessId={{}}
        savedTheses={[sampleThesis]}
      />
    );

    expect(screen.getByText("3 / 3 selected")).toBeInTheDocument();
    expect(
      screen.getByText(/1\. Overview, asking price & NDA redaction/i)
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Redacted until NDA is signed").length
    ).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Verification expired")).toBeInTheDocument();
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
    // Since Verified Green is present, caution (Amber) and risk (Brick Red) must NOT also appear
    expect(container.querySelector('[data-status-tone="caution"]')).toBeNull();
    expect(container.querySelector('[data-status-tone="risk"]')).toBeNull();
    expect(container.textContent).not.toContain("TaxBridge");
    expect(container.textContent).not.toContain("VartaLedger");
  });
});
