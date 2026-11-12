import { expect, test, type Page } from "@playwright/test";

const ALLOWED_RGB_VALUES = new Set([
  "rgb(11, 37, 69)",    // Deep Navy #0B2545
  "rgb(30, 86, 160)",   // Trust Blue #1E56A0
  "rgb(245, 247, 250)", // Cloud #F5F7FA
  "rgb(255, 255, 255)", // White #FFFFFF
  "rgb(31, 41, 51)",    // Ink #1F2933
  "rgb(82, 96, 109)",   // Slate #52606D
  "rgb(203, 210, 217)", // Mist #CBD2D9
  "rgb(27, 127, 92)",   // Verified Green #1B7F5C
  "rgb(183, 121, 31)",  // Amber #B7791F
  "rgb(180, 35, 24)",   // Brick Red #B42318
  "rgb(232, 238, 246)", // Pale Blue #E8EEF6
  "rgba(0, 0, 0, 0)",
  "transparent",
]);

const NON_NEUTRAL_RGB = new Set([
  "rgb(11, 37, 69)",    // Deep Navy
  "rgb(30, 86, 160)",   // Trust Blue
  "rgb(27, 127, 92)",   // Verified Green
  "rgb(183, 121, 31)",  // Amber
  "rgb(180, 35, 24)",   // Brick Red
  "rgb(232, 238, 246)", // Pale Blue
]);

async function assertCleanDesignAudit(
  page: Page,
  options?: { enforceMaxThreeNonNeutrals?: boolean }
) {
  await page.waitForTimeout(260);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

  const audit = await page.evaluate(
    ({ allowedColors, nonNeutralColors }) => {
      const allowed = new Set(allowedColors);
      const nonNeutrals = new Set(nonNeutralColors);
      const usedNonNeutrals = new Set<string>();
      const violations: string[] = [];

      const h1 = document.querySelector("h1");
      const h1Font = h1 ? getComputedStyle(h1).fontFamily : null;

      const bodyPx = parseFloat(getComputedStyle(document.body).fontSize);
      const tooSmall: string[] = [];
      for (const el of document.querySelectorAll("p, input, textarea, button, select")) {
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < 16) {
          tooSmall.push(`${el.tagName}="${el.textContent?.trim().slice(0, 24)}" (${px}px)`);
        }
      }

      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const isTinySrGuard = rect.width <= 1 && rect.height <= 1;

        if (!isTinySrGuard && cs.opacity !== "1") {
          violations.push(`opacity=${cs.opacity} on ${el.tagName}.${String(el.className).slice(0, 40)}`);
        }
        if (cs.backgroundImage && cs.backgroundImage !== "none") {
          violations.push(`backgroundImage=${cs.backgroundImage} on ${el.tagName}`);
        }
        if (cs.boxShadow && cs.boxShadow !== "none") {
          violations.push(`boxShadow=${cs.boxShadow} on ${el.tagName}`);
        }

        for (const prop of [
          "color",
          "backgroundColor",
          "borderTopColor",
          "borderRightColor",
          "borderBottomColor",
          "borderLeftColor",
        ] as const) {
          const val = cs[prop];
          if (!val) continue;
          if (!allowed.has(val)) {
            violations.push(`${prop}=${val} on ${el.tagName}.${String(el.className).slice(0, 40)}`);
          }
          if (!isTinySrGuard && rect.width > 0 && rect.height > 0 && nonNeutrals.has(val)) {
            if (prop === "borderTopColor" && cs.borderTopWidth === "0px") continue;
            if (prop === "borderRightColor" && cs.borderRightWidth === "0px") continue;
            if (prop === "borderBottomColor" && cs.borderBottomWidth === "0px") continue;
            if (prop === "borderLeftColor" && cs.borderLeftWidth === "0px") continue;
            usedNonNeutrals.add(val);
          }
        }
      }

      return {
        hasH1: Boolean(h1),
        h1Font,
        bodyPx,
        tooSmall,
        violations,
        usedNonNeutrals: Array.from(usedNonNeutrals),
      };
    },
    {
      allowedColors: Array.from(ALLOWED_RGB_VALUES),
      nonNeutralColors: Array.from(NON_NEUTRAL_RGB),
    }
  );

  expect(audit.hasH1).toBe(true);
  expect(audit.h1Font?.toLowerCase()).toContain("serif");
  expect(audit.bodyPx).toBeGreaterThanOrEqual(16);
  expect(audit.tooSmall).toEqual([]);
  expect(audit.violations).toEqual([]);

  if (options?.enforceMaxThreeNonNeutrals) {
    expect(
      audit.usedNonNeutrals.length,
      `Used non-neutrals: ${audit.usedNonNeutrals.join(", ")}`
    ).toBeLessThanOrEqual(3);
  }
}

async function signInAsSampleRole(page: Page, emailPrefix: string) {
  await page.goto("/auth/signin", { waitUntil: "networkidle" });
  const signOutBtn = page.getByRole("button", { name: /Sign out/i });
  if (await signOutBtn.isVisible()) {
    await signOutBtn.click();
    await expect(page.getByText("Signed out", { exact: true })).toBeVisible();
  }

  const accountRow = page
    .locator("div")
    .filter({ hasText: emailPrefix })
    .filter({ has: page.getByRole("button", { name: /Prefill email & code/i }) })
    .last();

  await accountRow.getByRole("button", { name: /Prefill email & code/i }).click();
  await page.getByLabel(/Password/i).fill("SampleDevPass!2026");
  await page.getByRole("button", { name: /Sign in with Email/i }).click();
  await expect(page.getByText("2FA Required")).toBeVisible();
  await page.getByRole("button", { name: /Verify 2FA Code/i }).click();
  await expect(page.getByText("2FA Verified")).toBeVisible();
}

async function verifyBuyerIdentityAndPof(buyerPage: Page, reviewerPage: Page) {
  await buyerPage.goto("/verify", { waitUntil: "networkidle" });
  await buyerPage.getByLabel(/Full legal name/i).fill("Ananya Rao");
  await buyerPage.getByLabel(/Last 4 characters of ID/i).fill("482F");
  await buyerPage.getByRole("button", { name: /Submit identity check/i }).click();
  await expect(buyerPage.getByText("Verification pending").first()).toBeVisible();

  await buyerPage.getByLabel(/Institution \/ account label/i).fill("HDFC Corporate ****4821");
  await buyerPage.getByLabel(/Read-only consent \/ attestation reference/i).fill("SETU-AA-9941");
  await buyerPage.getByRole("button", { name: /Submit Proof of Funds/i }).click();
  await expect(buyerPage.getByText("Verification pending")).toHaveCount(2);

  await reviewerPage.goto("/admin/review", { waitUntil: "networkidle" });
  await reviewerPage.getByRole("tab", { name: /Verification queue/i }).click();
  for (let i = 0; i < 2; i++) {
    const firstPendingCard = reviewerPage
      .locator("div")
      .filter({ hasText: "Ananya Rao" })
      .filter({ has: reviewerPage.getByRole("button", { name: /Approve & verify/i }) })
      .last();
    await firstPendingCard
      .getByLabel(/Verification review note/i)
      .fill("Confirmed KYC & Proof of Funds for Phase 5.");
    await firstPendingCard.getByRole("button", { name: /Approve & verify/i }).click();
    await expect(reviewerPage.getByRole("status")).toContainText("VERIFIED");
  }
}

async function createAndApproveFreshListing(
  sellerPage: Page,
  reviewerPage: Page,
  suffix: string
): Promise<string> {
  const createRes = await sellerPage.request.post("/api/listings", {
    data: {
      teaserTitle: `Phase 5 B2B Payroll Automation SaaS (${suffix})`,
      teaserSummary:
        "Automated TDS and payroll compliance software serving 180 SMB finance teams across India.",
      redactedName: "Vanguard Ledger Pvt Ltd",
      redactedDomain: "vanguardledger-sample.in",
      redactedCustomers: "180 SMB finance teams across Bengaluru and Pune",
      sector: "B2B SaaS",
      geography: "India (Bengaluru)",
      askingPrice: 12_000_000,
      currency: "INR",
      ownerHoursPerWeek: 8,
      reasonForSelling:
        "Founders are moving to a new enterprise infrastructure venture and seeking a clean acquisition.",
      founderStory:
        "Built over 4 years with automated statutory updates and low-touch customer onboarding.",
      financialNarrative:
        "Steady recurring subscription revenue with predictable annual renewals and low support overhead.",
      risksSummary:
        "Annual tax regulation updates require timely engineering maintenance each fiscal year.",
      techStack: ["TypeScript", "Next.js", "PostgreSQL"],
      assetsIncluded: [
        "Primary domain & DNS transfer",
        "Production source code repository",
      ],
      annualRevenue: 8_400_000,
      annualProfit: 3_600_000,
      growthPercent: 25,
      churnPercent: 1.5,
      monthlyTraffic: 14_000,
      customerCount: 180,
      submitForReview: true,
    },
  });
  expect(createRes.status()).toBe(201);
  const createdJson = await createRes.json();
  const listingId = createdJson.listing.id as string;
  const listingSlug = createdJson.listing.slug as string;

  const reviewRes = await reviewerPage.request.post(
    `/api/admin/listings/${listingId}/review`,
    {
      data: {
        decision: "APPROVE",
        reviewerNote: `Approved Phase 5 sandbox test listing (${suffix}).`,
      },
    }
  );
  expect(reviewRes.status()).toBe(200);
  return listingSlug;
}

async function advanceDealToEscrowStage(
  buyerPage: Page,
  sellerPage: Page,
  listingSlug: string
): Promise<string> {
  await buyerPage.goto(`/listings/${listingSlug}`, { waitUntil: "networkidle" });
  await buyerPage.getByRole("button", { name: /Open deal room/i }).click();
  await buyerPage.waitForURL(/\/deals\/deal-/);
  const dealRoomUrl = buyerPage.url();

  // INTRO -> NDA & Buyer signs NDA
  await buyerPage.getByRole("button", { name: /Move to NDA/i }).click();
  await expect(buyerPage.getByRole("status")).toContainText("Stage updated to NDA");

  await buyerPage.getByLabel(/Full legal name for NDA e-signature/i).fill("Ananya Rao");
  await buyerPage
    .getByLabel(/I confirm my electronic signature on this Mutual NDA draft/i)
    .check();
  await buyerPage.getByRole("button", { name: /E-sign Mutual NDA/i }).click();
  await expect(buyerPage.getByRole("status")).toContainText(
    /Waiting for counterparty signature/i
  );

  // Seller countersigns NDA -> DATA_ACCESS -> OFFER
  await sellerPage.goto(dealRoomUrl, { waitUntil: "networkidle" });
  await sellerPage.getByLabel(/Full legal name for NDA e-signature/i).fill("Rohan Mehta");
  await sellerPage
    .getByLabel(/I confirm my electronic signature on this Mutual NDA draft/i)
    .check();
  await sellerPage.getByRole("button", { name: /Counter-sign Mutual NDA/i }).click();
  await expect(sellerPage.getByRole("status")).toContainText(/Mutual NDA executed/i);

  await sellerPage.getByRole("button", { name: /Move to Data access/i }).click();
  await expect(sellerPage.getByRole("status")).toContainText(
    "Stage updated to Data access"
  );
  await sellerPage.getByRole("button", { name: /Move to Offer/i }).click();
  await expect(sellerPage.getByRole("status")).toContainText("Stage updated to Offer");

  // Buyer proposes offer -> Seller accepts -> DUE_DILIGENCE -> ESCROW
  await buyerPage.reload({ waitUntil: "networkidle" });
  await buyerPage.getByRole("tab", { name: /^Offers/i }).click();
  await buyerPage
    .getByLabel(/Offer terms & transition summary/i)
    .fill("100% funded via licensed third-party escrow with 30-day founder handover.");
  await buyerPage.getByRole("button", { name: /Submit written offer/i }).click();
  await expect(buyerPage.getByText("Status: PROPOSED")).toBeVisible();

  await sellerPage.reload({ waitUntil: "networkidle" });
  await sellerPage.getByRole("tab", { name: /^Offers/i }).click();
  await sellerPage.getByRole("button", { name: /Accept offer/i }).click();
  await expect(sellerPage.getByText("Status: ACCEPTED")).toBeVisible();

  await sellerPage.getByRole("button", { name: /Move to Due diligence/i }).click();
  await expect(sellerPage.getByRole("status")).toContainText(
    "Stage updated to Due diligence"
  );

  await sellerPage.getByRole("button", { name: /Move to Escrow/i }).click();
  await expect(sellerPage.getByRole("status")).toContainText(
    "Stage updated to Escrow"
  );

  return dealRoomUrl;
}

test("Phase 5 acceptance: full INTRO to TRANSFER sandbox deal, third-party escrow states, 7-category two-sided transfer, and dispute resolution", async ({
  page: buyerPage,
}) => {
  test.setTimeout(90_000);

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const attachErrorListeners = (p: Page) => {
    p.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    p.on("pageerror", (err) => pageErrors.push(err.message));
  };

  const browser = buyerPage.context().browser()!;
  const sellerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const reviewerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const sellerPage = await sellerContext.newPage();
  const reviewerPage = await reviewerContext.newPage();

  attachErrorListeners(buyerPage);
  attachErrorListeners(sellerPage);
  attachErrorListeners(reviewerPage);

  try {
    await buyerPage.setViewportSize({ width: 1280, height: 800 });

    // Sign in all 3 participants once with mandatory 2FA
    await signInAsSampleRole(buyerPage, "buyer.sample@trustmarketplace.local");
    await signInAsSampleRole(sellerPage, "seller.sample@trustmarketplace.local");
    await signInAsSampleRole(reviewerPage, "reviewer.sample@trustmarketplace.local");

    // 1. Verify Buyer KYC + Proof of Funds via UI
    await verifyBuyerIdentityAndPof(buyerPage, reviewerPage);

    // 2. Full deal #1 on a fresh Seller-created & Reviewer-approved listing:
    //    INTRO -> ESCROW -> FUNDED -> TRANSFER -> IN_REVIEW -> 7/7 Transfer -> RELEASED
    const runTag = Date.now().toString(36).slice(-5);
    const deal1Slug = await createAndApproveFreshListing(
      sellerPage,
      reviewerPage,
      `D1${runTag}`
    );
    const deal1Url = await advanceDealToEscrowStage(
      buyerPage,
      sellerPage,
      deal1Slug
    );

    await buyerPage.reload({ waitUntil: "networkidle" });
    await buyerPage.getByRole("tab", { name: /Escrow & transfer/i }).click();
    await expect(
      buyerPage.getByText(/Trust Marketplace never holds or custodies funds/i)
    ).toBeVisible();

    // Select Castler Escrow and initiate
    await buyerPage
      .getByLabel(/Licensed third-party escrow provider/i)
      .selectOption("Castler Escrow");
    await buyerPage.getByRole("button", { name: /Initiate third-party escrow/i }).click();
    await expect(buyerPage.getByText("Status: INITIATED")).toBeVisible();

    // Confirm third-party escrow funding -> FUNDED
    await buyerPage
      .getByLabel(/Third-party funding \/ wire reference/i)
      .fill("RTGS-HDFC-P5-2026");
    await buyerPage
      .getByRole("button", { name: /Confirm third-party escrow funding/i })
      .click();
    await expect(buyerPage.getByText("Status: FUNDED")).toBeVisible();
    await assertCleanDesignAudit(buyerPage, { enforceMaxThreeNonNeutrals: true });

    // Move ESCROW -> TRANSFER (generates 7 asset handover categories)
    await buyerPage.getByRole("button", { name: /Move to Transfer/i }).click();
    await expect(buyerPage.getByRole("status")).toContainText(
      "Stage updated to Transfer"
    );
    await expect(buyerPage.getByText("0 / 7 confirmed by both sides")).toBeVisible();

    // Mark escrow IN_REVIEW
    await buyerPage.getByRole("button", { name: /Mark escrow in review/i }).click();
    await expect(buyerPage.getByText("Status: IN REVIEW")).toBeVisible();
    await expect(buyerPage.getByText("Transfer inspection active")).toBeVisible();

    // Buyer confirms all 7 transfer categories
    for (let i = 0; i < 7; i++) {
      await buyerPage.getByRole("button", { name: /^Confirm transfer$/i }).first().click();
      await expect(buyerPage.getByRole("status")).toContainText("Checklist updated");
    }
    await expect(
      buyerPage.getByRole("button", { name: /Authorize escrow release/i })
    ).toBeDisabled();

    // Seller confirms all 7 transfer categories
    await sellerPage.goto(deal1Url, { waitUntil: "networkidle" });
    await sellerPage.getByRole("tab", { name: /Escrow & transfer/i }).click();
    for (let i = 0; i < 7; i++) {
      await sellerPage.getByRole("button", { name: /^Confirm transfer$/i }).first().click();
      await expect(sellerPage.getByRole("status")).toContainText("Checklist updated");
    }
    await expect(sellerPage.getByText("7 / 7 confirmed by both sides")).toBeVisible();

    // Buyer refreshes & authorizes escrow release -> RELEASED + COMPLETED
    await buyerPage.reload({ waitUntil: "networkidle" });
    await buyerPage.getByRole("tab", { name: /Escrow & transfer/i }).click();
    const releaseBtn = buyerPage.getByRole("button", {
      name: /Authorize escrow release/i,
    });
    await expect(releaseBtn).toBeEnabled();
    await releaseBtn.click();

    await expect(buyerPage.getByText("Status: RELEASED")).toBeVisible();
    await expect(buyerPage.getByText("Room: COMPLETED")).toBeVisible();
    await expect(buyerPage.getByText("Deal completed & escrow released")).toBeVisible();
    await assertCleanDesignAudit(buyerPage, { enforceMaxThreeNonNeutrals: true });

    // Audit log includes all Phase 5 escrow events
    await buyerPage.getByRole("tab", { name: /^Audit log/i }).click();
    await expect(buyerPage.getByText("ESCROW_INITIATED")).toBeVisible();
    await expect(buyerPage.getByText("ESCROW_FUNDED")).toBeVisible();
    await expect(buyerPage.getByText("ESCROW_IN_REVIEW")).toBeVisible();
    await expect(buyerPage.getByText("ESCROW_RELEASED")).toBeVisible();

    // Mobile 360px audit on completed deal room
    await buyerPage.setViewportSize({ width: 360, height: 800 });
    await buyerPage.getByRole("tab", { name: /Escrow & transfer/i }).click();
    await assertCleanDesignAudit(buyerPage, { enforceMaxThreeNonNeutrals: true });

    // 3. Deal #2: Dispute Flag & Admin/Reviewer Dispute Queue Resolution
    await buyerPage.setViewportSize({ width: 1280, height: 800 });
    const deal2Slug = await createAndApproveFreshListing(
      sellerPage,
      reviewerPage,
      `D2${runTag}`
    );
    await advanceDealToEscrowStage(
      buyerPage,
      sellerPage,
      deal2Slug
    );

    await buyerPage.reload({ waitUntil: "networkidle" });
    await buyerPage.getByRole("tab", { name: /Escrow & transfer/i }).click();
    await buyerPage.getByRole("button", { name: /Initiate third-party escrow/i }).click();
    await expect(buyerPage.getByText("Status: INITIATED")).toBeVisible();
    await buyerPage
      .getByRole("button", { name: /Confirm third-party escrow funding/i })
      .click();
    await expect(buyerPage.getByText("Status: FUNDED")).toBeVisible();

    await buyerPage
      .getByLabel(/Dispute reason/i)
      .fill("Seller has not shared verified registrar EPP transfer authorization.");
    await buyerPage.getByRole("button", { name: /Flag escrow dispute/i }).click();
    await expect(buyerPage.getByText("Status: DISPUTED")).toBeVisible();
    await expect(buyerPage.getByText("Paused: Dispute under review")).toBeVisible();
    await assertCleanDesignAudit(buyerPage, { enforceMaxThreeNonNeutrals: true });

    // /deals index enforces <=3 non-neutrals even when a COMPLETED NDA-signed room and a DISPUTED room coexist
    await buyerPage.goto("/deals", { waitUntil: "networkidle" });
    await expect(buyerPage.getByText("Disputed")).toBeVisible();
    await assertCleanDesignAudit(buyerPage, { enforceMaxThreeNonNeutrals: true });

    // Reviewer opens /admin/review -> Dispute queue -> resolves to Resume to In Review
    await reviewerPage.goto("/admin/review", { waitUntil: "networkidle" });
    await reviewerPage.getByRole("tab", { name: /Dispute queue/i }).click();
    await expect(
      reviewerPage.getByText(
        "Seller has not shared verified registrar EPP transfer authorization."
      )
    ).toBeVisible();
    await assertCleanDesignAudit(reviewerPage, { enforceMaxThreeNonNeutrals: true });

    await reviewerPage
      .getByLabel(/Dispute resolution note/i)
      .fill("Verified registrar EPP code uploaded; resuming escrow inspection.");
    await reviewerPage.getByRole("button", { name: /Resume to In Review/i }).click();
    await expect(reviewerPage.getByRole("status")).toContainText("IN_REVIEW");

    // Mobile 360px audit on Admin Dispute Queue
    await reviewerPage.setViewportSize({ width: 360, height: 800 });
    await assertCleanDesignAudit(reviewerPage, { enforceMaxThreeNonNeutrals: true });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await sellerContext.close();
    await reviewerContext.close();
  }
});
