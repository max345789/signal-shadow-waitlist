import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_HEX_SET,
  APPROVED_TEXT_PAIRS,
  APPROVED_UI_INDICATOR_PAIRS,
  SECTION_4_COLORS,
} from "@/styles/tokens";
import { contrastRatio, isSection4Hex, meetsWcagAA } from "@/lib/design/contrast";

function collectFiles(dir: string, exts: string[]): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

describe("Section 4 design tokens, palette restrictions, and WCAG AA contrast", () => {
  it("defines exact 11 Section 4 solid colors", () => {
    expect(SECTION_4_COLORS).toEqual({
      deepNavy: "#0B2545",
      trustBlue: "#1E56A0",
      cloud: "#F5F7FA",
      white: "#FFFFFF",
      ink: "#1F2933",
      slate: "#52606D",
      mist: "#CBD2D9",
      verifiedGreen: "#1B7F5C",
      amber: "#B7791F",
      brickRed: "#B42318",
      paleBlue: "#E8EEF6",
    });
    expect(ALLOWED_HEX_SET.size).toBe(11);
  });

  it("ensures all approved text/background color pairs pass WCAG AA (>= 4.5:1)", () => {
    for (const pair of APPROVED_TEXT_PAIRS) {
      const ratio = contrastRatio(pair.fg, pair.bg);
      expect(
        meetsWcagAA(pair.fg, pair.bg),
        `${pair.name} (${pair.fg} on ${pair.bg}) has ratio ${ratio}:1`
      ).toBe(true);
    }
  });

  it("ensures all approved UI indicator pairs pass WCAG 1.4.11 (>= 3.0:1)", () => {
    for (const pair of APPROVED_UI_INDICATOR_PAIRS) {
      const ratio = contrastRatio(pair.fg, pair.bg);
      expect(
        meetsWcagAA(pair.fg, pair.bg, { isUiComponentOrLargeText: true }),
        `${pair.name} (${pair.fg} on ${pair.bg}) has ratio ${ratio}:1`
      ).toBe(true);
    }
  });

  it("confirms why Amber is restricted to UI borders/icons and Green cannot sit on Pale Blue", () => {
    expect(contrastRatio(SECTION_4_COLORS.amber, SECTION_4_COLORS.white)).toBeLessThan(4.5);
    expect(contrastRatio(SECTION_4_COLORS.amber, SECTION_4_COLORS.ink)).toBeLessThan(4.5);
    expect(contrastRatio(SECTION_4_COLORS.verifiedGreen, SECTION_4_COLORS.paleBlue)).toBeLessThan(4.5);
  });

  it("contains zero unauthorized hex colors, zero gradients, and zero banned Tailwind utility classes across src/", () => {
    const projectRoot = path.resolve(__dirname, "../..");
    const srcFiles = [
      ...collectFiles(path.join(projectRoot, "src"), [".ts", ".tsx", ".css", ".svg"]),
      path.join(projectRoot, "tailwind.config.ts"),
    ];

    const hexRegex = /#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/g;
    const gradientRegex = /(linear-gradient|radial-gradient|conic-gradient|bg-gradient-to-)/i;
    const glowOrShadowRegex = /(box-shadow:\s*(?!none\b)[^;]+|shadow-(sm|md|lg|xl|2xl)|drop-shadow-|backdrop-blur-)/i;
    const opacityClassRegex = /\bopacity-(?:0|5|10|20|25|30|40|50|60|70|75|80|90|95)\b/;
    const bannedAnimationRegex = /(animate-pulse|animate-bounce|animate-ping)/;

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, "utf8");

      const hexMatches = content.match(hexRegex) ?? [];
      for (const hex of hexMatches) {
        // Ignore 3-char matches that are CSS IDs like #main-content (only 6-digit hex or 3-digit hex tokens)
        const normalized = hex.length === 4
          ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
          : hex;
        expect(
          isSection4Hex(normalized),
          `Found non-Section-4 hex color ${hex} in ${path.relative(projectRoot, file)}`
        ).toBe(true);
      }

      expect(
        gradientRegex.test(content),
        `Found gradient syntax in ${path.relative(projectRoot, file)}`
      ).toBe(false);

      expect(
        glowOrShadowRegex.test(content),
        `Found shadow/glow syntax in ${path.relative(projectRoot, file)}`
      ).toBe(false);

      expect(
        opacityClassRegex.test(content),
        `Found translucent opacity class in ${path.relative(projectRoot, file)}`
      ).toBe(false);

      expect(
        bannedAnimationRegex.test(content),
        `Found banned idle animation in ${path.relative(projectRoot, file)}`
      ).toBe(false);
    }
  });
});
