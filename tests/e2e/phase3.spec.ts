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

const VIEWPORTS = [
  { name: "mobile-360", width: 360, height: 800 },
  { name: "desktop-1280", width: 1280, height: 800 },
];

for (const vp of VIEWPORTS) {
  test(`/verify renders cleanly unauthenticated at ${vp.name} with Section 4 colors, <=3 non-neutrals, and zero overflow`, async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/verify", { waitUntil: "networkidle" });
    await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

test("Phase 3 acceptance: Buyer KYC & POF flow, Seller read-only Stripe & GA4 connectors, auto-refresh, and automatic Verified removal on fail & expiry", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.setViewportSize({ width: 1280, height: 800 });

  // 1. Buyer signs in -> submits Identity KYC + Proof of Funds in /verify
  await signInAsSampleRole(page, "buyer.sample@trustmarketplace.local");
  await page.goto("/verify", { waitUntil: "networkidle" });
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  await page.getByLabel(/Full legal name/i).fill("Ananya Rao");
  await page.getByLabel(/Last 4 characters of ID/i).fill("482F");
  await page.getByRole("button", { name: /Submit identity check/i }).click();
  await expect(page.getByText("Verification pending").first()).toBeVisible();

  await page.getByLabel(/Institution \/ account label/i).fill("HDFC Corporate ****4821");
  await page.getByLabel(/Read-only consent \/ attestation reference/i).fill("SETU-AA-9941");
  await page.getByRole("button", { name: /Submit Proof of Funds/i }).click();
  await expect(page.getByText("Verification pending")).toHaveCount(2);
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  // 2. Reviewer signs in -> approves Buyer KYC & Proof of Funds + approves sample-biz-dev-03
  await signInAsSampleRole(page, "reviewer.sample@trustmarketplace.local");
  await page.goto("/admin/review", { waitUntil: "networkidle" });

  // Approve pending DevTools sample listing so we can inspect its public page later
  const devListingCard = page
    .locator("div")
    .filter({ hasText: "Developer API Uptime & Latency Monitor" })
    .filter({ has: page.getByRole("button", { name: /Approve listing/i }) })
    .last();
  await devListingCard
    .getByLabel(/Reviewer decision note/i)
    .fill("Approved DevTools listing for Phase 3 connector verification.");
  await devListingCard.getByRole("button", { name: /Approve listing/i }).click();
  await expect(page.getByRole("status")).toContainText("APPROVED");

  // Switch to Verification queue -> approve both Buyer submissions
  await page.getByRole("tab", { name: /Verification queue/i }).click();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  for (let i = 0; i < 2; i++) {
    const firstPendingCard = page
      .locator("div")
      .filter({ hasText: "Ananya Rao" })
      .filter({ has: page.getByRole("button", { name: /Approve & verify/i }) })
      .last();
    await firstPendingCard
      .getByLabel(/Verification review note/i)
      .fill("Confirmed regulated KYC and Setu AA attestation.");
    await firstPendingCard.getByRole("button", { name: /Approve & verify/i }).click();
    await expect(page.getByRole("status")).toContainText("VERIFIED");
  }

  // 3. Buyer verifies Data access readiness & Verified marks at 1280px and 360px
  await signInAsSampleRole(page, "buyer.sample@trustmarketplace.local");
  await page.goto("/verify", { waitUntil: "networkidle" });
  await expect(page.getByText("Ready for Data access")).toBeVisible();
  await expect(page.getByText("Verified", { exact: true })).toHaveCount(2);
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  await page.setViewportSize({ width: 360, height: 800 });
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });
  await page.setViewportSize({ width: 1280, height: 800 });

  // 4. Seller connects read-only Stripe + GA4 to Developer API Uptime & Latency Monitor
  await signInAsSampleRole(page, "seller.sample@trustmarketplace.local");
  await page.goto("/verify?tab=connectors&businessId=sample-biz-dev-03", {
    waitUntil: "networkidle",
  });
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  // Connect Stripe (Payment)
  await page.getByLabel(/Target listing/i).selectOption("sample-biz-dev-03");
  await page.getByLabel(/Source category/i).selectOption("PAYMENT");
  await page.getByLabel(/Read-only provider/i).selectOption("Stripe");
  await page.getByLabel(/Account or property ID/i).fill("acct_pulsecheck_demo");
  await page
    .getByLabel(/Read-only restricted key \/ OAuth token/i)
    .fill("rk_sandbox_valid_stripe_2026");
  await page.getByRole("button", { name: /Connect read-only source/i }).click();
  await expect(page.getByRole("status")).toContainText("Connected read-only Stripe");

  // Connect GA4 (Analytics)
  await page.getByLabel(/Source category/i).selectOption("ANALYTICS");
  await page.getByLabel(/Read-only provider/i).selectOption("GA4");
  await page.getByLabel(/Account or property ID/i).fill("properties/394810221");
  await page
    .getByLabel(/Read-only restricted key \/ OAuth token/i)
    .fill("ga4_sandbox_valid_ro_2026");
  await page.getByRole("button", { name: /Connect read-only source/i }).click();
  await expect(page.getByRole("status")).toContainText("Connected read-only GA4");

  // Auto-refresh all vitals keeps connections verified
  await page.getByRole("button", { name: /Auto-refresh all vitals/i }).click();
  await expect(page.getByRole("status")).toContainText(/Auto-refresh completed/i);
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  // 5. Inspect public listing -> 3 active verification records & Last verified timestamp
  await page.goto("/listings/sample-devtools-api-monitoring", {
    waitUntil: "networkidle",
  });
  await expect(page.getByText("3 active verification records")).toBeVisible();
  await expect(page.getByText(/Last verified just now/i).first()).toBeVisible();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  // 6. Rotate Stripe to a failing token -> Verified mark disappears immediately for Stripe metrics
  await page.goto("/verify?tab=connectors&businessId=sample-biz-dev-03", {
    waitUntil: "networkidle",
  });
  await page.getByLabel(/Target listing/i).selectOption("sample-biz-dev-03");
  await page.getByLabel(/Source category/i).selectOption("PAYMENT");
  await page.getByLabel(/Read-only provider/i).selectOption("Stripe");
  await page.getByLabel(/Account or property ID/i).fill("acct_pulsecheck_demo");
  await page
    .getByLabel(/Read-only restricted key \/ OAuth token/i)
    .fill("rk_sandbox_fail_revoked_2026");
  await page.getByRole("button", { name: /Connect read-only source/i }).click();
  await expect(page.getByText("Connection failed").first()).toBeVisible();

  await page.goto("/listings/sample-devtools-api-monitoring", {
    waitUntil: "networkidle",
  });
  await expect(page.getByText("1 active verification record")).toBeVisible();
  await expect(page.getByText("Connection failed").first()).toBeVisible();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  // 7. Reviewer expires the remaining GA4 connector -> listing loses ALL Verified marks automatically
  await signInAsSampleRole(page, "reviewer.sample@trustmarketplace.local");
  await page.goto("/admin/review", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Verification queue/i }).click();
  await page.getByRole("tab", { name: /^Verified \(/i }).click();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  const ga4Card = page
    .locator("div")
    .filter({ hasText: "Developer API Uptime & Latency Monitor" })
    .filter({ hasText: "GA4" })
    .filter({ has: page.getByRole("button", { name: /Mark expired/i }) })
    .last();
  await ga4Card
    .getByLabel(/Verification review note/i)
    .fill("GA4 OAuth token TTL expired during scheduled audit.");
  await ga4Card.getByRole("button", { name: /Mark expired/i }).click();
  await expect(page.getByRole("status")).toContainText("EXPIRED");

  await page.goto("/listings/sample-devtools-api-monitoring", {
    waitUntil: "networkidle",
  });
  await expect(page.getByText("0 active verification records")).toBeVisible();
  await expect(page.getByText("Verification expired").first()).toBeVisible();
  await expect(
    page.getByText(/No third-party payment or analytics accounts are verified/i)
  ).toBeVisible();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  await page.setViewportSize({ width: 360, height: 800 });
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
