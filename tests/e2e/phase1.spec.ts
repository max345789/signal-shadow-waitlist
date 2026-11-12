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
    expect(audit.usedNonNeutrals.length).toBeLessThanOrEqual(3);
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

const PHASE_1_ROUTES = [
  "/listings",
  "/listings/sample-b2b-gst-compliance-saas",
  "/sell",
  "/seller",
  "/admin/review",
];

const VIEWPORTS = [
  { name: "mobile-360", width: 360, height: 800 },
  { name: "desktop-1280", width: 1280, height: 800 },
];

for (const route of PHASE_1_ROUTES) {
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

test("Phase 1 acceptance: Seller creates listing, Admin approves it, and public page shows Seller-reported vs Verified metrics distinctly with NDA redaction", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.setViewportSize({ width: 1280, height: 800 });

  // 1. Sample listing demonstrates distinct Verified vs Seller-reported vitals & Sample data labelling
  await page.goto("/listings/sample-b2b-gst-compliance-saas", { waitUntil: "networkidle" });
  await expect(page.getByText("Sample data").first()).toBeVisible();
  await expect(page.getByText("Verified connected metrics")).toBeVisible();
  await expect(page.getByText("Seller-reported metrics (unverified)")).toBeVisible();
  await expect(page.getByText(/Last verified 2 hours ago/i).first()).toBeVisible();
  await expect(page.getByText("Redacted until NDA is signed").first()).toBeVisible();
  const sampleHtml = await page.content();
  expect(sampleHtml).not.toContain("TaxBridge Compliance Systems");
  expect(sampleHtml).not.toContain("taxbridge-sample.in");

  // 2. Sign in as Sample Seller & create a new listing via /sell
  await signInAsSampleRole(page, "seller.sample@trustmarketplace.local");

  await page.goto("/sell", { waitUntil: "networkidle" });
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  await page.getByLabel(/Legal or brand business name/i).fill("NimbusSecret Analytics Pvt Ltd");
  await page.getByLabel(/Primary domain/i).fill("nimbus-secret.in");
  await page
    .getByLabel(/Top customer names/i)
    .fill("48 healthcare clinics across Bengaluru and Pune.");
  await page.getByRole("button", { name: /Continue to financials/i }).click();

  await page.getByLabel(/Trailing 12m revenue/i).fill("9000000");
  await page.getByLabel(/Trailing 12m net profit/i).fill("4000000");
  await page.getByLabel(/Owner hours per week/i).fill("9");
  await page.getByRole("button", { name: /Use midpoint/i }).click();
  await page.getByRole("button", { name: /Continue to trust/i }).click();

  await page
    .getByLabel(/Reason for selling/i)
    .fill("Founder is relocating internationally after building the product for 4 years.");
  await page.getByRole("button", { name: /Auto-build & review listing/i }).click();

  const customTitle = "Profitable Healthcare Analytics SaaS (Bengaluru)";
  await page.getByLabel(/Public teaser title/i).fill(customTitle);

  await page.getByRole("button", { name: /Submit for Admin review/i }).click();
  await expect(page.getByText("Listing submitted for Admin review")).toBeVisible();
  await expect(page.getByText(/0 verified \/ 6 seller-reported/i)).toBeVisible();

  // Verify Seller dashboard shows the pending submission
  await page.goto("/seller", { waitUntil: "networkidle" });
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });
  await expect(page.getByText(customTitle)).toBeVisible();

  // 3. Sign in as Sample Reviewer (ADMIN + REVIEWER) & approve listing in /admin/review
  await signInAsSampleRole(page, "reviewer.sample@trustmarketplace.local");

  await page.goto("/admin/review", { waitUntil: "networkidle" });
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  const targetCard = page.locator("div").filter({ hasText: customTitle }).filter({
    has: page.getByRole("button", { name: /Approve listing/i }),
  }).last();

  // Admin can inspect confidential seller identity prior to approval
  await expect(targetCard.getByText("NimbusSecret Analytics Pvt Ltd")).toBeVisible();
  await expect(targetCard.getByText("nimbus-secret.in")).toBeVisible();

  // Missing reviewer note triggers accessible validation
  await targetCard.getByRole("button", { name: /Approve listing/i }).click();
  await expect(
    targetCard.getByRole("alert").filter({ hasText: /at least 5 characters/i })
  ).toBeVisible();

  await targetCard
    .getByLabel(/Reviewer decision note/i)
    .fill("Verified confidential redaction and clear seller-reported disclosures.");
  await targetCard.getByRole("button", { name: /Approve listing/i }).click();

  await expect(page.getByRole("status")).toContainText(customTitle);

  // Switch to Approved tab & confirm listing heading + AuditLog entry recorded
  await page.getByRole("tab", { name: /Approved/i }).click();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });
  await expect(page.getByRole("heading", { name: customTitle })).toBeVisible();
  await expect(page.getByText(/LISTING_APPROVED/).first()).toBeVisible();

  // 4. Sign out (public anonymous visitor) -> verify listing appears publicly with redaction & Seller-reported vitals only
  await page.goto("/auth/signin", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Sign out/i }).click();
  await expect(page.getByText("Signed out", { exact: true })).toBeVisible();

  await page.goto("/listings", { waitUntil: "networkidle" });
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  // Verify empty search state + reset filters
  await page.getByLabel(/Search listings/i).fill("zzznomatch999");
  await page.getByRole("button", { name: /Filter listings/i }).click();
  await expect(page.getByText(/No approved listings match these filters/i)).toBeVisible();
  await page.getByRole("button", { name: /Reset filters/i }).first().click();
  await expect(page.getByRole("link", { name: customTitle })).toBeVisible();

  await page.getByRole("link", { name: customTitle }).click();
  await page.waitForURL(/\/listings\/profitable-healthcare-analytics-saas/);
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  // Confidential details must be absent from HTML & visible page
  const publicListingHtml = await page.content();
  expect(publicListingHtml).not.toContain("NimbusSecret");
  expect(publicListingHtml).not.toContain("nimbus-secret.in");
  expect(publicListingHtml).not.toContain("48 healthcare clinics");

  await expect(
    page.getByText(/No third-party payment or analytics accounts are verified/i)
  ).toBeVisible();
  expect(await page.getByText("Seller-reported", { exact: true }).count()).toBeGreaterThanOrEqual(6);

  // 5. Buyer signs in, posts Q&A question on approved listing, and Seller answers it
  const listingUrl = page.url();
  await signInAsSampleRole(page, "buyer.sample@trustmarketplace.local");
  await page.goto(listingUrl, { waitUntil: "networkidle" });
  await page
    .getByLabel(/Ask the founder a public diligence question/i)
    .fill("Are customer contracts annual prepaid or billed monthly?");
  await page.getByRole("button", { name: /Post question/i }).click();
  await expect(
    page.getByText("Are customer contracts annual prepaid or billed monthly?")
  ).toBeVisible();

  await signInAsSampleRole(page, "seller.sample@trustmarketplace.local");
  await page.goto(listingUrl, { waitUntil: "networkidle" });
  await page
    .getByLabel(/Post seller answer/i)
    .fill("Most clinics pay annually; exact contract schedule unlocks post-NDA.");
  await page.getByRole("button", { name: /Save answer/i }).click();
  await expect(
    page.getByText("Most clinics pay annually; exact contract schedule unlocks post-NDA.")
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
