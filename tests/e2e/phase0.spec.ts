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

const ROUTES = ["/", "/style-guide", "/auth/signin"];
const VIEWPORTS = [
  { name: "mobile-360", width: 360, height: 800 },
  { name: "desktop-1280", width: 1280, height: 800 },
];

async function assertCleanDesignAudit(
  page: Page,
  options?: { enforceMaxThreeNonNeutrals?: boolean }
) {
  // Wait for any 200ms state-transition CSS interpolation to settle cleanly
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
      for (const el of document.querySelectorAll("p, input, textarea, button")) {
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

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    test(`${route} renders cleanly at ${vp.name} with Section 4 solid colors only and zero horizontal overflow`, async ({
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

      await assertCleanDesignAudit(page, {
        enforceMaxThreeNonNeutrals: route === "/",
      });

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }
}

test("Home thesis prompt validates empty submit and passes prompt to Style Guide", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByText("No saved acquisition theses yet")).toBeVisible();

  await page.getByRole("button", { name: /Preview system/i }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /Describe the kind of business/i })
  ).toBeVisible();

  await page
    .getByLabel(/Acquisition thesis/i)
    .fill("B2B SaaS in India with verified Stripe revenue");
  await page.getByRole("button", { name: /Preview system/i }).click();

  await page.waitForURL(/\/style-guide\?thesisPrompt=/);
  await expect(
    page.getByText(/B2B SaaS in India with verified Stripe revenue/i)
  ).toBeVisible();
});

test("Style guide interactive states, mobile tooltip, dialog focus, stage tracker keys, and 3-color rule work", async ({
  page,
}) => {
  // 1. Desktop 1280px initial keyboard Tab lands on Skip to main content link
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/style-guide", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: /Skip to main content/i });
  await expect(skipLink).toBeFocused();

  // 2. Mobile 360px tooltip interaction & viewport fit
  await page.setViewportSize({ width: 360, height: 800 });
  const tooltipBtn = page.getByRole("button", { name: "Explain verification standard" });
  await tooltipBtn.click();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await assertCleanDesignAudit(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  // 3. Desktop 1280px dialog, input error focus, stage tracker keys, and tabs
  await page.setViewportSize({ width: 1280, height: 800 });

  // Open Dialog, check Section 4 solid colors & Escape focus return
  const openDialogBtn = page.getByRole("button", { name: "Open Accessible Dialog" });
  await openDialogBtn.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await assertCleanDesignAudit(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(openDialogBtn).toBeFocused();

  // Simulate Input error state and verify focus outline remains visible
  await page.getByRole("button", { name: "Simulate error state" }).click();
  const priceInput = page.getByLabel(/Target Asking Price/i);
  await priceInput.focus();
  const inputFocusOutline = await priceInput.evaluate((el) => {
    const wrapper = el.parentElement;
    const cs = wrapper ? getComputedStyle(wrapper) : null;
    return cs ? { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor } : null;
  });
  expect(inputFocusOutline).toEqual({
    style: "solid",
    width: "2px",
    color: "rgb(30, 86, 160)",
  });
  await assertCleanDesignAudit(page);

  // StageTracker keyboard navigation
  const introStage = page.getByRole("button", { name: /01.*Intro/i });
  await introStage.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /02.*NDA/i })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("button", { name: /07.*Transfer/i })).toBeFocused();

  // Toggle loading, empty, and error states
  await page.getByRole("button", { name: "Loading", exact: true }).click();
  await expect(page.getByText("Loading deal stages")).toBeVisible();
  await assertCleanDesignAudit(page);

  await page.getByRole("button", { name: "Empty", exact: true }).click();
  await expect(page.getByText("No deal stages initialized")).toBeVisible();

  await page.getByRole("button", { name: "Error", exact: true }).click();
  await expect(page.getByText("Unable to load deal tracker")).toBeVisible();
  await assertCleanDesignAudit(page);

  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await expect(page.getByText("Deal progression")).toBeVisible();

  // Switch to Tokens & WCAG Contrast tab
  await page.getByRole("tab", { name: /Tokens & WCAG Contrast/i }).click();
  await expect(page.getByText("WCAG AA Contrast Verification")).toBeVisible();
  await expect(page.getByText("Fail")).toHaveCount(0);
  await assertCleanDesignAudit(page);

  // Switch to Focused 3-Color Rule Check tab and verify <= 3 non-neutral colors
  await page.getByRole("tab", { name: /Focused 3-Color Rule Check/i }).click();
  await expect(page.getByText("Focused 3-Accent View Verification")).toBeVisible();
  await assertCleanDesignAudit(page, { enforceMaxThreeNonNeutrals: true });
});

test("Auth sign-in error, mandatory TOTP 2FA unlock, session API check, and sign-out work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/auth/signin", { waitUntil: "networkidle" });

  // Wrong password triggers accessible alert with Section 4 colors
  await page.getByRole("button", { name: /Prefill email & code/i }).first().click();
  const codeText = await page.getByText(/Current TOTP code:/i).first().textContent();
  const totpMatch = codeText?.match(/(\d{6})/);
  expect(totpMatch).not.toBeNull();
  const totpCode = totpMatch![1]!;

  await page.getByLabel(/Password/i).fill("WrongPassword!2026");
  await page.getByRole("button", { name: /Sign in with Email/i }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /did not match/i })
  ).toBeVisible();
  await assertCleanDesignAudit(page);

  // Correct password -> 2FA required -> TOTP verify -> Deal Room gate unlocked
  await page.getByLabel(/Password/i).fill("SampleDevPass!2026");
  await page.getByRole("button", { name: /Sign in with Email/i }).click();

  await expect(page.getByText("2FA Required")).toBeVisible();
  await page.getByLabel(/6-digit authenticator code/i).fill(totpCode);
  await page.getByRole("button", { name: /Verify 2FA Code/i }).click();

  await expect(page.getByText("2FA Verified")).toBeVisible();
  await expect(page.getByText("Two-factor check active for Deal Room entry.")).toBeVisible();
  await assertCleanDesignAudit(page);

  const sessionRes = await page.evaluate(async () => {
    const r = await fetch("/api/auth/session");
    return r.json();
  });
  expect(sessionRes.authenticated).toBe(true);
  expect(sessionRes.dealRoomTwoFactorSatisfied).toBe(true);

  await page.getByRole("button", { name: /Sign out/i }).click();
  await expect(page.getByText("Signed out", { exact: true })).toBeVisible();
});
