import { expect, test } from "@playwright/test";

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

const ROUTES = ["/", "/style-guide", "/auth/signin"];
const VIEWPORTS = [
  { name: "mobile-360", width: 360, height: 800 },
  { name: "desktop-1280", width: 1280, height: 800 },
];

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    test(`${route} renders cleanly at ${vp.name} with Section 4 colors only and zero horizontal overflow`, async ({
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

      // 1. Check horizontal overflow
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

      // 2. Check body font size >= 16px and no body copy/inputs/buttons < 16px
      const fontAudit = await page.evaluate(() => {
        const bodyPx = parseFloat(getComputedStyle(document.body).fontSize);
        const tooSmall: string[] = [];
        for (const el of document.querySelectorAll("p, input, textarea, button")) {
          const px = parseFloat(getComputedStyle(el).fontSize);
          if (px < 16) {
            tooSmall.push(`${el.tagName}="${el.textContent?.trim().slice(0, 24)}" (${px}px)`);
          }
        }
        return { bodyPx, tooSmall };
      });
      expect(fontAudit.bodyPx).toBeGreaterThanOrEqual(16);
      expect(fontAudit.tooSmall).toEqual([]);

      // 3. Audit all computed colors & backgroundImage gradients
      const styleAudit = await page.evaluate((allowedColors) => {
        const allowed = new Set(allowedColors);
        const violations: string[] = [];
        const nodes = document.querySelectorAll("body *");
        for (const el of nodes) {
          const cs = getComputedStyle(el);
          if (cs.backgroundImage && cs.backgroundImage !== "none") {
            violations.push(`backgroundImage=${cs.backgroundImage} on ${el.tagName}`);
          }
          if (cs.boxShadow && cs.boxShadow !== "none") {
            violations.push(`boxShadow=${cs.boxShadow} on ${el.tagName}`);
          }
          for (const prop of ["color", "backgroundColor", "borderTopColor"] as const) {
            const val = cs[prop];
            if (val && !allowed.has(val)) {
              violations.push(`${prop}=${val} on ${el.tagName}.${el.className}`);
            }
          }
        }
        return violations;
      }, Array.from(ALLOWED_RGB_VALUES));

      expect(styleAudit).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }
}

test("Style guide interactive states, dialog, tabs, and keyboard navigation work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/style-guide", { waitUntil: "networkidle" });

  // Keyboard focus navigation
  await page.keyboard.press("Tab");
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
  expect(focusedTag).toBe("A");

  // Toggle loading, empty, and error states
  await page.getByRole("button", { name: "Loading", exact: true }).click();
  await expect(page.getByText("Loading deal stages")).toBeVisible();

  await page.getByRole("button", { name: "Empty", exact: true }).click();
  await expect(page.getByText("No deal stages initialized")).toBeVisible();

  await page.getByRole("button", { name: "Error", exact: true }).click();
  await expect(page.getByText("Unable to load deal tracker")).toBeVisible();

  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await expect(page.getByText("Deal progression")).toBeVisible();

  // Switch to Tokens & WCAG Contrast tab
  await page.getByRole("tab", { name: /Tokens & WCAG Contrast/i }).click();
  await expect(page.getByText("WCAG AA Contrast Verification")).toBeVisible();
  await expect(page.getByText("Fail")).toHaveCount(0);
});

test("Auth sign-in and mandatory TOTP 2FA flow unlocks Deal Room gate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/auth/signin", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: /Prefill email & code/i }).first().click();
  const codeText = await page.getByText(/Current TOTP code:/i).first().textContent();
  const totpMatch = codeText?.match(/(\d{6})/);
  expect(totpMatch).not.toBeNull();
  const totpCode = totpMatch![1]!;

  await page.getByLabel(/Password/i).fill("SampleDevPass!2026");
  await page.getByRole("button", { name: /Sign in with Email/i }).click();

  await expect(page.getByText("2FA Required")).toBeVisible();
  await page.getByLabel(/6-digit authenticator code/i).fill(totpCode);
  await page.getByRole("button", { name: /Verify 2FA Code/i }).click();

  await expect(page.getByText("2FA Verified")).toBeVisible();
  await expect(page.getByText("Two-factor check active for Deal Room entry.")).toBeVisible();
});
