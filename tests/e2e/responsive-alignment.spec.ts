import { test, expect } from "@playwright/test";

const SCREEN_SIZES = [
  { name: "360-compact-mobile", width: 360, height: 740 },
  { name: "390-iphone-14", width: 390, height: 844 },
  { name: "768-tablet", width: 768, height: 1024 },
  { name: "1024-laptop", width: 1024, height: 768 },
  { name: "1280-desktop", width: 1280, height: 800 },
  { name: "1536-wide", width: 1536, height: 900 },
];

const PAGES_TO_TEST = [
  { path: "/", titleFragment: "Baton" },
  { path: "/listings", titleFragment: "Baton" },
  { path: "/pricing", titleFragment: "Baton" },
  { path: "/closing-guide", titleFragment: "Baton" },
  { path: "/legal/terms", titleFragment: "Baton" },
  { path: "/legal/privacy", titleFragment: "Baton" },
  { path: "/legal/rules", titleFragment: "Baton" },
  { path: "/legal/takedown", titleFragment: "Baton" },
];

test.describe("C12 Responsive UI Alignment and Zero Horizontal Scroll", () => {
  for (const size of SCREEN_SIZES) {
    test.describe(`Viewport: ${size.name} (${size.width}x${size.height})`, () => {
      test.use({ viewport: { width: size.width, height: size.height } });

      for (const pageInfo of PAGES_TO_TEST) {
        test(`checks zero horizontal scroll on ${pageInfo.path}`, async ({ page }) => {
          await page.goto(pageInfo.path, { waitUntil: "domcontentloaded" });

          // Zero horizontal scroll check
          const scrollInfo = await page.evaluate(() => {
            const doc = document.documentElement;
            return {
              scrollWidth: doc.scrollWidth,
              clientWidth: doc.clientWidth,
              innerWidth: window.innerWidth,
            };
          });

          expect(
            scrollInfo.scrollWidth,
            `Page ${pageInfo.path} has horizontal scroll overflow at ${size.width}px (scrollWidth: ${scrollInfo.scrollWidth}, clientWidth: ${scrollInfo.clientWidth})`
          ).toBeLessThanOrEqual(scrollInfo.clientWidth + 1); // 1px rounding tolerance
        });
      }

      if (size.width < 1024) {
        test("mobile navigation collapses into menu button with >=44px tap targets", async ({ page }) => {
          await page.goto("/", { waitUntil: "domcontentloaded" });

          // Header menu button must be visible
          const menuBtn = page.getByRole("button", { name: /navigation menu/i });
          await expect(menuBtn).toBeVisible();

          const box = await menuBtn.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);

          // Clicking menu opens drawer
          await menuBtn.click();
          const drawerPricingLink = page.locator('nav[aria-label="Mobile navigation"] a:has-text("Pricing")');
          await expect(drawerPricingLink).toBeVisible();
          const linkBox = await drawerPricingLink.boundingBox();
          expect(linkBox?.height).toBeGreaterThanOrEqual(44);
        });
      } else {
        test("desktop navigation shows full navbar links", async ({ page }) => {
          await page.goto("/", { waitUntil: "domcontentloaded" });
          const menuBtn = page.getByRole("button", { name: /navigation menu/i });
          await expect(menuBtn).not.toBeVisible();
          await expect(page.locator('nav[aria-label="Primary navigation"] a:has-text("Listings")')).toBeVisible();
          await expect(page.locator('nav[aria-label="Primary navigation"] a:has-text("Pricing")')).toBeVisible();
        });
      }
    });
  }
});
