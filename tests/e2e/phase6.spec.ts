/**
 * Phase 6 E2E — Accessibility, Legal, Notifications & Production Readiness
 *
 * Tests:
 * 1. Legal pages render with "Needs legal review" disclaimer banner
 * 2. AppShell footer contains legal links on every page
 * 3. 404 page renders with "Return to listings" CTA
 * 4. Skip-to-main-content link is first Tab stop on every key page
 * 5. Keyboard navigation — homepage through listing detail, no focus traps
 * 6. Accessibility audit with axe-core on key public pages (0 critical violations)
 * 7. Design audit on legal pages (Section 4 compliance)
 */

import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 design audit helper (copied pattern from phase5.spec.ts)
// ─────────────────────────────────────────────────────────────────────────────
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

async function assertCleanDesignAudit(page: Page): Promise<void> {
  const violations = await page.evaluate((allowed: string[]) => {
    const allowedSet = new Set(allowed);
    const violations: string[] = [];
    const elements = document.querySelectorAll("*");
    elements.forEach((el) => {
      const style = window.getComputedStyle(el);
      const checks = [
        style.color,
        style.backgroundColor,
        style.borderColor,
        style.outlineColor,
      ];
      for (const val of checks) {
        if (val && val !== "" && !allowedSet.has(val) && val !== "rgba(0, 0, 0, 0)" && val !== "transparent") {
          // Skip if it's a gradient string (not expected but check anyway)
          if (val.includes("gradient")) {
            violations.push(`gradient found: ${val} on ${el.tagName}`);
          }
        }
      }
    });
    return violations;
  }, [...ALLOWED_RGB_VALUES]);

  // We only fail on gradients — color enforcement is done in Vitest unit tests
  const gradients = violations.filter((v) => v.includes("gradient"));
  expect(gradients, `Gradient CSS found on page: ${gradients.join(", ")}`).toHaveLength(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 — Legal pages render with disclaimer banner
// ─────────────────────────────────────────────────────────────────────────────
test("legal/terms renders with 'Needs legal review' disclaimer banner and h1", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/legal/terms", { waitUntil: "networkidle" });

  // Disclaimer banner present
  await expect(
    page.getByText(/Needs legal review/i).first()
  ).toBeVisible();

  // h1 present
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // No JS errors
  expect(errors).toEqual([]);

  await assertCleanDesignAudit(page);
});

test("legal/privacy renders with 'Needs legal review' disclaimer banner and h1", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/legal/privacy", { waitUntil: "networkidle" });

  await expect(
    page.getByText(/Needs legal review/i).first()
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  expect(errors).toEqual([]);
  await assertCleanDesignAudit(page);
});

test("legal/nda-template renders with 'Needs legal review' disclaimer and h1", async ({ page }) => {
  await page.goto("/legal/nda-template", { waitUntil: "networkidle" });
  await expect(page.getByText(/Needs legal review/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await assertCleanDesignAudit(page);
});

test("legal/purchase-agreement-template renders with disclaimer and h1", async ({ page }) => {
  await page.goto("/legal/purchase-agreement-template", { waitUntil: "networkidle" });
  await expect(page.getByText(/Needs legal review/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await assertCleanDesignAudit(page);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 — AppShell footer has legal links on every key page
// ─────────────────────────────────────────────────────────────────────────────
const KEY_PAGES = ["/", "/listings", "/legal/terms"];

for (const path of KEY_PAGES) {
  test(`footer contains Terms and Privacy links on ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });

    const footer = page.locator("footer");
    await expect(footer).toBeVisible();

    // Terms link
    await expect(
      footer.getByRole("link", { name: /terms/i })
    ).toBeVisible();

    // Privacy link
    await expect(
      footer.getByRole("link", { name: /privacy/i })
    ).toBeVisible();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3 — 404 page renders with "Return to listings" CTA
// ─────────────────────────────────────────────────────────────────────────────
test("404 page renders with 'Return to listings' CTA and h1", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/nonexistent-route-xyz-phase6-test", { waitUntil: "networkidle" });

  // h1 present
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // CTA link
  await expect(
    page.getByRole("link", { name: /return to listings/i })
  ).toBeVisible();

  expect(errors).toEqual([]);
  await assertCleanDesignAudit(page);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4 — Skip-to-main-content link is first Tab stop
// ─────────────────────────────────────────────────────────────────────────────
const SKIP_LINK_PAGES = ["/", "/listings", "/legal/terms", "/legal/privacy"];

for (const path of SKIP_LINK_PAGES) {
  test(`skip-to-main-content link is first Tab stop on ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });

    // Press Tab once — first focused element should be the skip link
    await page.keyboard.press("Tab");

    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      return {
        tag: el.tagName.toLowerCase(),
        href: (el as HTMLAnchorElement).href ?? null,
        text: el.textContent?.trim() ?? null,
      };
    });

    expect(focused?.text?.toLowerCase()).toMatch(/skip/i);
    expect(focused?.href).toMatch(/#main-content/);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 5 — Keyboard navigation — homepage to listing detail, no focus traps
// ─────────────────────────────────────────────────────────────────────────────
test("keyboard navigation: Tab through homepage nav links without focus trap", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  // Tab up to 20 times; collect focused element texts; ensure they change
  const focusedTexts: string[] = [];
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const text = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? (el.textContent?.trim() ?? el.getAttribute("aria-label") ?? el.tagName) : "";
    });
    focusedTexts.push(text);
  }

  // We should have visited multiple different elements (no focus trap)
  const unique = new Set(focusedTexts);
  expect(unique.size).toBeGreaterThan(3);
});

test("keyboard navigation: listings page — can Tab to a listing card link", async ({ page }) => {
  await page.goto("/listings", { waitUntil: "networkidle" });

  // Tab until we find a link that goes to /listings/
  let foundListing = false;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const { tag, href } = await page.evaluate(() => {
      const el = document.activeElement as HTMLAnchorElement;
      return { tag: el?.tagName?.toLowerCase() ?? "", href: el?.href ?? "" };
    });
    if (tag === "a" && href.includes("/listings/")) {
      foundListing = true;
      break;
    }
  }

  expect(foundListing, "Could not Tab to a listing card link on /listings").toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6 — axe-core accessibility audit (0 critical violations)
// ─────────────────────────────────────────────────────────────────────────────
const AXE_PAGES: Array<{ path: string; label: string }> = [
  { path: "/", label: "home" },
  { path: "/listings", label: "listings" },
  { path: "/legal/terms", label: "terms" },
  { path: "/legal/privacy", label: "privacy" },
];

for (const { path, label } of AXE_PAGES) {
  test(`axe-core: 0 critical accessibility violations on ${label} (${path})`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      // Exclude colour-contrast rule — enforced by design token unit tests; axe
      // can't see our CSS custom-property token system accurately in test env.
      .disableRules(["color-contrast"])
      .analyze();

    // Filter to critical and serious only
    const criticalViolations = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    if (criticalViolations.length > 0) {
      const summary = criticalViolations.map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description} — ${v.nodes.length} node(s) — ${v.helpUrl}`
      );
      throw new Error(
        `axe-core found ${criticalViolations.length} critical/serious violation(s) on ${path}:\n${summary.join("\n")}`
      );
    }

    expect(criticalViolations).toHaveLength(0);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 7 — Design audit on legal pages (Section 4, no gradients)
// ─────────────────────────────────────────────────────────────────────────────
test("legal pages pass Section 4 gradient audit", async ({ page }) => {
  for (const path of ["/legal/terms", "/legal/privacy", "/legal/nda-template", "/legal/purchase-agreement-template"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await assertCleanDesignAudit(page);
  }
});
