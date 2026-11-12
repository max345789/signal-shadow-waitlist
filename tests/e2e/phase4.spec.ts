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

async function signInAsSampleRole(
  page: Page,
  emailPrefix: string,
  verify2fa: boolean
) {
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

  if (verify2fa) {
    await page.getByRole("button", { name: /Verify 2FA Code/i }).click();
    await expect(page.getByText("2FA Verified")).toBeVisible();
  }
}

const VIEWPORTS = [
  { name: "mobile-360", width: 360, height: 800 },
  { name: "desktop-1280", width: 1280, height: 800 },
];

for (const vp of VIEWPORTS) {
  test(`/deals renders 2FA gate cleanly unauthenticated at ${vp.name}`, async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/deals", { waitUntil: "networkidle" });
    await expect(page.getByText("Sign in required")).toBeVisible();
    await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

test("Phase 4 acceptance: 2FA gate, NDA redaction unlock, stage transitions, chat, versioned vault + view logs, offers, checklists, and AuditLog", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.setViewportSize({ width: 1280, height: 800 });

  // 1. Buyer signs in WITHOUT 2FA -> /deals strictly blocks entry
  await signInAsSampleRole(page, "buyer.sample@trustmarketplace.local", false);
  await page.goto("/deals", { waitUntil: "networkidle" });
  await expect(
    page.getByText(/Mandatory 2FA verification required/i)
  ).toBeVisible();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  // Verify 2FA -> unlock Deal Rooms
  await signInAsSampleRole(page, "buyer.sample@trustmarketplace.local", true);

  // 2. Submit Buyer KYC + Proof of Funds in /verify and approve as Reviewer
  await page.goto("/verify", { waitUntil: "networkidle" });
  await page.getByLabel(/Full legal name/i).fill("Ananya Rao");
  await page.getByLabel(/Last 4 characters of ID/i).fill("482F");
  await page.getByRole("button", { name: /Submit identity check/i }).click();
  await expect(page.getByText("Verification pending").first()).toBeVisible();

  await page.getByLabel(/Institution \/ account label/i).fill("HDFC Corporate ****4821");
  await page.getByLabel(/Read-only consent \/ attestation reference/i).fill("SETU-AA-9941");
  await page.getByRole("button", { name: /Submit Proof of Funds/i }).click();
  await expect(page.getByText("Verification pending")).toHaveCount(2);

  await signInAsSampleRole(page, "reviewer.sample@trustmarketplace.local", true);
  await page.goto("/admin/review", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Verification queue/i }).click();
  for (let i = 0; i < 2; i++) {
    const firstPendingCard = page
      .locator("div")
      .filter({ hasText: "Ananya Rao" })
      .filter({ has: page.getByRole("button", { name: /Approve & verify/i }) })
      .last();
    await firstPendingCard
      .getByLabel(/Verification review note/i)
      .fill("Confirmed KYC & Proof of Funds for Phase 4.");
    await firstPendingCard.getByRole("button", { name: /Approve & verify/i }).click();
    await expect(page.getByRole("status")).toContainText("VERIFIED");
  }

  // 3. Buyer opens deal room from approved listing -> redacted fields stay hidden
  await signInAsSampleRole(page, "buyer.sample@trustmarketplace.local", true);
  await page.goto("/listings/sample-b2b-gst-compliance-saas", { waitUntil: "networkidle" });
  await expect(page.getByText("Redacted until NDA is signed").first()).toBeVisible();

  await page.getByRole("button", { name: /Open deal room/i }).click();
  await page.waitForURL(/\/deals\/deal-/);
  const dealRoomUrl = page.url();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  await expect(page.getByText("Redacted until NDA is signed").first()).toBeVisible();
  await expect(page.getByText(/TaxBridge Compliance Systems/i)).toHaveCount(0);

  // Move INTRO -> NDA
  await page.getByRole("button", { name: /Move to NDA/i }).click();
  await expect(page.getByRole("status")).toContainText("Stage updated to NDA");

  // Buyer tries NDA -> DATA_ACCESS before NDA completion -> blocked with alert & 3-color audit still passes
  await page.getByRole("button", { name: /Move to Data access/i }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /complete NDA signature/i })
  ).toBeVisible();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  // Acknowledge the expected HTTP 400 console log from the deliberately blocked stage transition
  expect(consoleErrors).toEqual([
    "Failed to load resource: the server responded with a status of 400 (Bad Request)",
  ]);
  consoleErrors.length = 0;

  // Buyer signs NDA (still redacted until Seller countersigns)
  await page.getByLabel(/Full legal name for NDA e-signature/i).fill("Ananya Rao");
  await page
    .getByLabel(/I confirm my electronic signature on this Mutual NDA draft/i)
    .check();
  await page.getByRole("button", { name: /E-sign Mutual NDA/i }).click();
  await expect(page.getByRole("status")).toContainText(
    /Waiting for counterparty signature/i
  );
  await expect(page.getByText(/TaxBridge Compliance Systems/i)).toHaveCount(0);

  // 4. Seller enters deal room, countersigns NDA, advances to DATA_ACCESS, uploads versioned doc
  await signInAsSampleRole(page, "seller.sample@trustmarketplace.local", true);
  await page.goto("/seller", { waitUntil: "networkidle" });
  await expect(page.getByText("Active deal rooms")).toBeVisible();
  await page.goto(dealRoomUrl, { waitUntil: "networkidle" });

  await page.getByLabel(/Full legal name for NDA e-signature/i).fill("Rohan Mehta");
  await page
    .getByLabel(/I confirm my electronic signature on this Mutual NDA draft/i)
    .check();
  await page.getByRole("button", { name: /Counter-sign Mutual NDA/i }).click();
  await expect(page.getByRole("status")).toContainText(/Mutual NDA executed/i);

  await page.getByRole("button", { name: /Move to Data access/i }).click();
  await expect(page.getByRole("status")).toContainText(
    "Stage updated to Data access"
  );

  // Upload v1 and v2 of a financial document
  await page.getByRole("tab", { name: /^Documents/i }).click();
  await page.getByLabel(/Document title/i).fill("Q3 Bank Reconciliation");
  await page
    .getByLabel(/Or enter plain-text document contents directly/i)
    .fill("Q3 Verified Bank Inflows: INR 36,00,000");
  await page.getByRole("button", { name: /Upload & scan document/i }).click();
  await expect(page.getByRole("status")).toContainText(/passed virus scan/i);

  await page.getByLabel(/Document title/i).fill("Q3 Bank Reconciliation");
  await page
    .getByLabel(/Or enter plain-text document contents directly/i)
    .fill("Q3 Updated Bank Inflows: INR 36,50,000");
  await page.getByRole("button", { name: /Upload & scan document/i }).click();
  await expect(page.getByText("v2")).toBeVisible();

  // Seller posts chat message
  await page.getByRole("tab", { name: /^Chat/i }).click();
  await page
    .getByLabel(/Post deal room message/i)
    .fill("Uploaded Q3 reconciliation v1 and v2 to the vault.");
  await page.getByRole("button", { name: /Send message/i }).click();
  await expect(
    page.getByText("Uploaded Q3 reconciliation v1 and v2 to the vault.")
  ).toBeVisible();

  // 5. Buyer signs back in -> redacted fields unlocked on BOTH Deal Room & Listing Page!
  await signInAsSampleRole(page, "buyer.sample@trustmarketplace.local", true);
  await page.goto("/listings/sample-b2b-gst-compliance-saas", { waitUntil: "networkidle" });
  await expect(page.getByText(/TaxBridge Compliance Systems/i)).toBeVisible();

  await page.goto(dealRoomUrl, { waitUntil: "networkidle" });
  await expect(page.getByText(/TaxBridge Compliance Systems/i).first()).toBeVisible();
  await expect(page.getByText("taxbridge-sample.in")).toBeVisible();

  // Preview watermarked document -> logs DocumentView
  await page.getByRole("tab", { name: /^Documents/i }).click();
  await page
    .getByRole("button", { name: /Preview watermarked/i })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("WATERMARK:");
  await page.keyboard.press("Escape");
  await expect(page.getByText("1 view logged").first()).toBeVisible();

  // Reply in chat thread
  await page.getByRole("tab", { name: /^Chat/i }).click();
  await page.getByRole("button", { name: /Reply in thread/i }).first().click();
  await page
    .getByLabel(/Post threaded reply/i)
    .fill("Reviewed v2 reconciliation — numbers match Stripe.");
  await page.getByRole("button", { name: /Send message/i }).click();
  await expect(
    page.getByText("Reviewed v2 reconciliation — numbers match Stripe.")
  ).toBeVisible();

  // Advance DATA_ACCESS -> OFFER -> Buyer proposes offer
  await page.getByRole("button", { name: /Move to Offer/i }).click();
  await page.getByRole("tab", { name: /^Offers/i }).click();
  await page.getByLabel(/^Offer amount/i).fill("11500000");
  await page
    .getByLabel(/Offer terms & transition summary/i)
    .fill("1.15 Cr via licensed third-party escrow with 30-day handover.");
  await page.getByRole("button", { name: /Submit written offer/i }).click();
  await expect(page.getByText("Status: PROPOSED")).toBeVisible();

  // Seller counters offer -> Buyer accepts -> DUE_DILIGENCE -> Checklist confirmed
  await signInAsSampleRole(page, "seller.sample@trustmarketplace.local", true);
  await page.goto(dealRoomUrl, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /^Offers/i }).click();
  await page.getByLabel(/Counter-offer amount/i).fill("12000000");
  await page
    .getByLabel(/Counter-offer terms/i)
    .fill("1.20 Cr with 45-day founder transition support.");
  await page.getByRole("button", { name: /Send counter-offer/i }).click();
  await expect(page.getByText("Status: COUNTERED")).toBeVisible();

  await signInAsSampleRole(page, "buyer.sample@trustmarketplace.local", true);
  await page.goto(dealRoomUrl, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /^Offers/i }).click();
  await page.getByRole("button", { name: /Accept offer/i }).click();
  await expect(page.getByText("Status: ACCEPTED")).toBeVisible();

  await page.getByRole("button", { name: /Move to Due diligence/i }).click();
  await expect(page.getByRole("status")).toContainText(
    "Stage updated to Due diligence"
  );

  // Confirm first checklist item
  await page.getByRole("tab", { name: /^Checklist/i }).click();
  await page.getByRole("button", { name: /^Confirm$/i }).first().click();
  await expect(page.getByText("IN PROGRESS").first()).toBeVisible();

  // Inspect Audit log tab -> all core actions logged
  await page.getByRole("tab", { name: /^Audit log/i }).click();
  await expect(page.getByText("DEAL_ROOM_CREATED")).toBeVisible();
  await expect(page.getByText("NDA_COMPLETED")).toBeVisible();
  await expect(page.getByText("DOCUMENT_VIEWED")).toBeVisible();
  await expect(page.getByText("OFFER_ACCEPTED")).toBeVisible();
  await expect(page.getByText("STAGE_TRANSITION").first()).toBeVisible();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  // Mobile 360px audit on Deal Room
  await page.setViewportSize({ width: 360, height: 800 });
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
