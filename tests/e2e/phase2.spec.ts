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
}

const PHASE_2_ROUTES = [
  "/thesis/new",
  "/matches",
  "/compare",
  "/compare?ids=sample-biz-gst-01,sample-biz-d2c-02,sample-biz-media-04",
];

const VIEWPORTS = [
  { name: "mobile-360", width: 360, height: 800 },
  { name: "desktop-1280", width: 1280, height: 800 },
];

for (const route of PHASE_2_ROUTES) {
  for (const vp of VIEWPORTS) {
    test(`${route} renders cleanly at ${vp.name} with Section 4 colors, <=3 non-neutrals, and zero overflow`, async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => pageErrors.push(err.message));

      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route, { waitUntil: "networkidle" });

      await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }
}

test("Phase 2 acceptance: three distinct theses return different ranked results with reasons and mismatches, compare up to 3 works at 360px/1280px, and new-listing approval triggers thesis alerts", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  // 1. Anonymous visitor previews matches directly from Home prompt -> Thesis Builder
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page
    .getByLabel(/Acquisition thesis/i)
    .fill("Content & Media under ₹60L, under 8 owner hours/week");
  await page.getByRole("button", { name: /Build thesis & match/i }).click();
  await page.waitForURL(/\/thesis\/new\?prompt=/);

  await page.getByRole("button", { name: /Preview ranked matches/i }).click();
  await expect(page.getByText(/Previewed matches \(\d+\)/)).toBeVisible();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });
  const firstPreviewCard = page.locator("section").filter({ hasText: "Previewed matches" });
  await expect(
    firstPreviewCard.getByText(/Profitable B2B Fintech & Regulatory Briefing Media/i).first()
  ).toBeVisible();
  await expect(firstPreviewCard.getByText("Why this matches").first()).toBeVisible();
  await expect(firstPreviewCard.getByText("What doesn't fit").first()).toBeVisible();

  // 2. Sign in as Sample Buyer -> Home shows saved-thesis feed cleanly at 360px & 1280px
  await signInAsSampleRole(page, "buyer.sample@trustmarketplace.local");
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", {
      name: "India B2B SaaS with verified Stripe revenue (Sample)",
    })
  ).toBeVisible();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  await page.setViewportSize({ width: 360, height: 800 });
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });
  await page.setViewportSize({ width: 1280, height: 800 });

  // 3. Create 2 additional distinct theses -> verify 3 different theses rank 3 different #1 winners
  // Thesis 2: Mumbai D2C Skincare
  await page.goto("/thesis/new", { waitUntil: "networkidle" });
  await page.getByLabel(/Thesis title/i).fill("Mumbai D2C Brand Focus");
  await page.getByLabel(/Industry \/ Sector/i).selectOption("E-commerce / D2C");
  await page.getByLabel(/Target geography/i).selectOption("India (Mumbai)");
  await page.getByLabel(/Maximum asking price/i).fill("12500000");
  await page.getByLabel(/Free-text thesis/i).fill("skincare repeat Razorpay Shopify");
  await page.getByRole("button", { name: /Save thesis & open matches/i }).click();
  await page.waitForURL(/\/matches\?thesisId=/);
  await expect(
    page.getByRole("heading", { name: /Saved theses & ranked matches/i })
  ).toBeVisible();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  const rankedSectionD2C = page.locator("section").filter({ hasText: /Ranked matches \(\d+\)/ });
  const firstMatchD2C = rankedSectionD2C.locator("article").first();
  await expect(firstMatchD2C).toContainText("Specialty Botanical Skincare D2C Brand");

  // Pausing & re-enabling alerts via PATCH must preserve all structured criteria
  await page.getByRole("button", { name: /Pause alerts/i }).click();
  await expect(page.getByText("Alerts paused", { exact: true })).toBeVisible();
  const activePanelD2C = page.getByRole("tabpanel");
  await expect(activePanelD2C).toContainText("E-commerce / D2C");
  await expect(activePanelD2C).toContainText("India (Mumbai)");
  await expect(firstMatchD2C).toContainText("Specialty Botanical Skincare D2C Brand");
  await page.getByRole("button", { name: /Enable alerts/i }).click();
  await expect(page.getByText("Alerts active", { exact: true })).toBeVisible();

  // Thesis 3: Lean Content & Media + DevTools alert test thesis
  await page.goto("/thesis/new", { waitUntil: "networkidle" });
  await page.getByLabel(/Thesis title/i).fill("Lean Media Under 60L");
  await page.getByLabel(/Industry \/ Sector/i).selectOption("Content & Media");
  await page.getByLabel(/Target geography/i).selectOption("India (Remote)");
  await page.getByLabel(/Max owner hours per week/i).fill("8");
  await page.getByLabel(/Maximum asking price/i).fill("6000000");
  await page.getByLabel(/Free-text thesis/i).fill("newsletter fintech GA4 sponsors");
  await page.getByRole("button", { name: /Save thesis & open matches/i }).click();
  await page.waitForURL(/\/matches\?thesisId=/);
  await expect(
    page.getByRole("heading", { name: /Saved theses & ranked matches/i })
  ).toBeVisible();

  const rankedSectionMedia = page.locator("section").filter({ hasText: /Ranked matches \(\d+\)/ });
  const firstMatchMedia = rankedSectionMedia.locator("article").first();
  await expect(firstMatchMedia).toContainText(
    "Profitable B2B Fintech & Regulatory Briefing Media"
  );

  // Switch back to Thesis 1 (B2B SaaS Sample) via keyboard -> #1 is TaxBridge GST SaaS
  const mediaTab = page.getByRole("tab", { name: /Lean Media Under 60L/i });
  await mediaTab.focus();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: /India B2B SaaS with verified Stripe revenue/i })
  ).toHaveAttribute("aria-selected", "true");
  const firstMatchSaaS = rankedSectionMedia.locator("article").first();
  await expect(firstMatchSaaS).toContainText("Profitable B2B GST & E-Invoicing SaaS");

  // Edit Thesis 2 via /thesis/new?thesisId=... and confirm updated title persists
  await page.getByRole("tab", { name: /Mumbai D2C Brand Focus/i }).click();
  await page.getByRole("link", { name: /Edit thesis/i }).click();
  await page.waitForURL(/\/thesis\/new\?thesisId=/);
  await page.getByLabel(/Thesis title/i).fill("Mumbai D2C Brand Focus (Edited)");
  await page.getByRole("button", { name: /Save thesis changes/i }).click();
  await page.waitForURL(/\/matches\?thesisId=/);
  await expect(
    page.getByRole("heading", { name: /Saved theses & ranked matches/i })
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /Mumbai D2C Brand Focus \(Edited\)/i })
  ).toBeVisible();

  await page
    .getByRole("tab", { name: /India B2B SaaS with verified Stripe revenue/i })
    .click();

  // 4. Select 3 businesses in /matches (4th becomes disabled) and open side-by-side /compare
  const compareCheckboxes = page.getByRole("checkbox", {
    name: /Select to compare|Selected for compare|Compare limit reached/i,
  });
  await compareCheckboxes.nth(0).check();
  await compareCheckboxes.nth(1).check();
  await compareCheckboxes.nth(2).check();
  await expect(compareCheckboxes.nth(3)).toBeDisabled();

  await page.getByRole("link", { name: /Compare selected \(3\)/i }).click();
  await page.waitForURL(/\/compare\?ids=/);
  await expect(page.getByText("3 / 3 selected")).toBeVisible();
  await expect(
    page.getByText(/1\. Overview, asking price & NDA redaction/i)
  ).toBeVisible();
  await expect(
    page.getByText(/2\. Fit against/i)
  ).toBeVisible();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  // Verify 360px mobile comparison has zero horizontal overflow
  await page.setViewportSize({ width: 360, height: 800 });
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });
  await page.setViewportSize({ width: 1280, height: 800 });

  // Verify > 3 IDs in URL triggers accessible error state
  await page.goto(
    "/compare?ids=sample-biz-gst-01,sample-biz-d2c-02,sample-biz-media-04,sample-biz-mkt-05",
    { waitUntil: "networkidle" }
  );
  await expect(
    page.getByRole("alert").filter({ hasText: /compare up to 3 businesses/i })
  ).toBeVisible();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  // 5. Alert trigger test: Buyer saves alert-enabled DevTools thesis -> Seller submits matching listing -> Admin approves -> Buyer receives alert
  await page.goto("/thesis/new", { waitUntil: "networkidle" });
  await page.getByLabel(/Thesis title/i).fill("DevTools Synthetic Probe Mandate");
  await page.getByLabel(/Industry \/ Sector/i).selectOption("Developer Tools");
  await page.getByLabel(/Target geography/i).selectOption("India (Remote)");
  await page.getByLabel(/Max owner hours per week/i).fill("12");
  await page.getByLabel(/Maximum asking price/i).fill("12000000");
  await page.getByLabel(/Free-text thesis/i).fill("API latency monitoring webhook teams");
  await page.getByRole("button", { name: /Save thesis & open matches/i }).click();
  await page.waitForURL(/\/matches\?thesisId=/);
  await expect(
    page.getByRole("heading", { name: /Saved theses & ranked matches/i })
  ).toBeVisible();

  await signInAsSampleRole(page, "seller.sample@trustmarketplace.local");
  await page.goto("/sell", { waitUntil: "networkidle" });
  await page.getByLabel(/^Sector/i).selectOption("Developer Tools");
  await page.getByLabel(/^Geography/i).selectOption("India (Remote)");
  await page.getByLabel(/Legal or brand business name/i).fill("TraceSentry Labs Pvt Ltd");
  await page.getByLabel(/Primary domain/i).fill("tracesentry-secret.dev");
  await page.getByRole("button", { name: /Continue to financials/i }).click();

  await page.getByLabel(/Trailing 12m revenue/i).fill("6800000");
  await page.getByLabel(/Trailing 12m net profit/i).fill("3000000");
  await page.getByLabel(/Owner hours per week/i).fill("9");
  await page.getByRole("button", { name: /Use midpoint/i }).click();
  await page.getByRole("button", { name: /Continue to trust/i }).click();

  await page
    .getByLabel(/Reason for selling/i)
    .fill("Founding engineer joining an open-source research foundation.");
  await page.getByRole("button", { name: /Auto-build & review listing/i }).click();

  const alertTitle = "Profitable API Latency & Webhook Monitor (Remote India)";
  await page.getByLabel(/Public teaser title/i).fill(alertTitle);
  await page.getByRole("button", { name: /Submit for Admin review/i }).click();
  await expect(page.getByText("Listing submitted for Admin review")).toBeVisible();

  await signInAsSampleRole(page, "reviewer.sample@trustmarketplace.local");
  await page.goto("/admin/review", { waitUntil: "networkidle" });
  const targetCard = page
    .locator("div")
    .filter({ hasText: alertTitle })
    .filter({ has: page.getByRole("button", { name: /Approve listing/i }) })
    .last();
  await targetCard
    .getByLabel(/Reviewer decision note/i)
    .fill("No leaks found; approved Developer Tools listing.");
  await targetCard.getByRole("button", { name: /Approve listing/i }).click();
  await expect(page.getByRole("status")).toContainText("APPROVED");

  await signInAsSampleRole(page, "buyer.sample@trustmarketplace.local");
  await page.goto("/matches", { waitUntil: "networkidle" });
  const alertsPanel = page.locator("section").filter({ hasText: /New thesis match alerts/i });
  await expect(alertsPanel).toBeVisible();
  await expect(alertsPanel.getByText(alertTitle).first()).toBeVisible();
  const matchesHtml = await page.content();
  expect(matchesHtml).not.toContain("TraceSentry");
  expect(matchesHtml).not.toContain("tracesentry-secret.dev");

  const alertCard = alertsPanel
    .locator("div")
    .filter({ hasText: alertTitle })
    .filter({ has: page.getByRole("button", { name: /Mark as read/i }) })
    .last();
  await alertCard.getByRole("button", { name: /Mark as read/i }).click();
  await expect(alertsPanel.getByText(alertTitle)).toHaveCount(0);

  if (await alertsPanel.isVisible()) {
    await alertsPanel.getByRole("button", { name: /Mark all read/i }).click();
  }
  await expect(page.getByText(/New thesis match alerts/i)).toHaveCount(0);

  // 6. Seller dashboard reflects anonymized Phase 2 matched buyer thesis demand cleanly
  await signInAsSampleRole(page, "seller.sample@trustmarketplace.local");
  await page.goto("/seller", { waitUntil: "networkidle" });
  await expect(page.getByText("Matched buyer theses (Phase 2)")).toBeVisible();
  await expect(page.getByText(/matching buyer thes/i).first()).toBeVisible();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
