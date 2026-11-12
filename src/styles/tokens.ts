/**
 * Section 4 Design Tokens — Single Source of Truth.
 * Rule: Solid colours only, from Section 4. No gradients, no neon, no glow effects, no pastel fills.
 */

export const SECTION_4_COLORS = {
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
} as const;

export type Section4ColorName = keyof typeof SECTION_4_COLORS;
export type Section4Hex = (typeof SECTION_4_COLORS)[Section4ColorName];

export const ALLOWED_HEX_SET = new Set<string>(
  Object.values(SECTION_4_COLORS).map((hex) => hex.toUpperCase())
);

export const COLOR_METADATA: Record<
  Section4ColorName,
  {
    label: string;
    role: string;
    hex: Section4Hex;
    category: "neutral" | "brand" | "semantic";
  }
> = {
  deepNavy: {
    label: "Deep Navy",
    role: "Primary (buttons, key headings)",
    hex: SECTION_4_COLORS.deepNavy,
    category: "brand",
  },
  trustBlue: {
    label: "Trust Blue",
    role: "Action and links",
    hex: SECTION_4_COLORS.trustBlue,
    category: "brand",
  },
  cloud: {
    label: "Cloud",
    role: "Page background",
    hex: SECTION_4_COLORS.cloud,
    category: "neutral",
  },
  white: {
    label: "White",
    role: "Surface (cards, panels)",
    hex: SECTION_4_COLORS.white,
    category: "neutral",
  },
  ink: {
    label: "Ink",
    role: "Body text",
    hex: SECTION_4_COLORS.ink,
    category: "neutral",
  },
  slate: {
    label: "Slate",
    role: "Secondary text",
    hex: SECTION_4_COLORS.slate,
    category: "neutral",
  },
  mist: {
    label: "Mist",
    role: "Borders and dividers",
    hex: SECTION_4_COLORS.mist,
    category: "neutral",
  },
  verifiedGreen: {
    label: "Verified Green",
    role: "Verified and success",
    hex: SECTION_4_COLORS.verifiedGreen,
    category: "semantic",
  },
  amber: {
    label: "Amber",
    role: "Caution and pending (UI border/icon only — paired with Ink text)",
    hex: SECTION_4_COLORS.amber,
    category: "semantic",
  },
  brickRed: {
    label: "Brick Red",
    role: "Risk and error",
    hex: SECTION_4_COLORS.brickRed,
    category: "semantic",
  },
  paleBlue: {
    label: "Pale Blue",
    role: "Subtle highlight (selected row, info box)",
    hex: SECTION_4_COLORS.paleBlue,
    category: "brand",
  },
};

/**
 * Approved accessible text-on-background pairings that satisfy WCAG AA (>= 4.5:1).
 * Note: Amber (#B7791F) is deliberately excluded as text fg/bg because it only achieves
 * 3.64:1 on White and 4.05:1 with Ink; Amber is used strictly for >= 3:1 UI borders/icons.
 */
export const APPROVED_TEXT_PAIRS: Array<{
  name: string;
  fg: Section4Hex;
  bg: Section4Hex;
}> = [
  { name: "Ink on Cloud (page body)", fg: SECTION_4_COLORS.ink, bg: SECTION_4_COLORS.cloud },
  { name: "Ink on White (card body)", fg: SECTION_4_COLORS.ink, bg: SECTION_4_COLORS.white },
  { name: "Ink on Pale Blue (highlight body)", fg: SECTION_4_COLORS.ink, bg: SECTION_4_COLORS.paleBlue },
  { name: "Slate on Cloud (secondary)", fg: SECTION_4_COLORS.slate, bg: SECTION_4_COLORS.cloud },
  { name: "Slate on White (secondary)", fg: SECTION_4_COLORS.slate, bg: SECTION_4_COLORS.white },
  { name: "Slate on Pale Blue (secondary)", fg: SECTION_4_COLORS.slate, bg: SECTION_4_COLORS.paleBlue },
  { name: "Deep Navy on Cloud (heading)", fg: SECTION_4_COLORS.deepNavy, bg: SECTION_4_COLORS.cloud },
  { name: "Deep Navy on White (heading)", fg: SECTION_4_COLORS.deepNavy, bg: SECTION_4_COLORS.white },
  { name: "Deep Navy on Pale Blue (selected)", fg: SECTION_4_COLORS.deepNavy, bg: SECTION_4_COLORS.paleBlue },
  { name: "White on Deep Navy (primary CTA)", fg: SECTION_4_COLORS.white, bg: SECTION_4_COLORS.deepNavy },
  { name: "Trust Blue on Cloud (link)", fg: SECTION_4_COLORS.trustBlue, bg: SECTION_4_COLORS.cloud },
  { name: "Trust Blue on White (link)", fg: SECTION_4_COLORS.trustBlue, bg: SECTION_4_COLORS.white },
  { name: "Trust Blue on Pale Blue (link)", fg: SECTION_4_COLORS.trustBlue, bg: SECTION_4_COLORS.paleBlue },
  { name: "White on Trust Blue (action button)", fg: SECTION_4_COLORS.white, bg: SECTION_4_COLORS.trustBlue },
  { name: "Verified Green on White (verified label)", fg: SECTION_4_COLORS.verifiedGreen, bg: SECTION_4_COLORS.white },
  { name: "Verified Green on Cloud (verified label)", fg: SECTION_4_COLORS.verifiedGreen, bg: SECTION_4_COLORS.cloud },
  { name: "White on Verified Green (verified chip)", fg: SECTION_4_COLORS.white, bg: SECTION_4_COLORS.verifiedGreen },
  { name: "Brick Red on White (error text)", fg: SECTION_4_COLORS.brickRed, bg: SECTION_4_COLORS.white },
  { name: "Brick Red on Cloud (error text)", fg: SECTION_4_COLORS.brickRed, bg: SECTION_4_COLORS.cloud },
  { name: "Brick Red on Pale Blue (error text)", fg: SECTION_4_COLORS.brickRed, bg: SECTION_4_COLORS.paleBlue },
  { name: "White on Brick Red (danger button/chip)", fg: SECTION_4_COLORS.white, bg: SECTION_4_COLORS.brickRed },
];

export const APPROVED_UI_INDICATOR_PAIRS: Array<{
  name: string;
  fg: Section4Hex;
  bg: Section4Hex;
}> = [
  { name: "Amber icon/border on White", fg: SECTION_4_COLORS.amber, bg: SECTION_4_COLORS.white },
  { name: "Amber icon/border on Cloud", fg: SECTION_4_COLORS.amber, bg: SECTION_4_COLORS.cloud },
  { name: "Amber icon/border on Pale Blue", fg: SECTION_4_COLORS.amber, bg: SECTION_4_COLORS.paleBlue },
  { name: "Amber icon/border on Deep Navy", fg: SECTION_4_COLORS.amber, bg: SECTION_4_COLORS.deepNavy },
];

export const TYPE_SCALE = {
  14: { px: 14, rem: "0.875rem", lineHeight: "1.428", usage: "Labels, chips, timestamps only (never body)" },
  16: { px: 16, rem: "1rem", lineHeight: "1.5", usage: "Minimum body copy (mobile & desktop)" },
  20: { px: 20, rem: "1.25rem", lineHeight: "1.4", usage: "Card titles, section subheads" },
  28: { px: 28, rem: "1.75rem", lineHeight: "1.25", usage: "Section headings, key metric figures" },
  40: { px: 40, rem: "2.5rem", lineHeight: "1.15", usage: "Page headlines, hero metric figures" },
} as const;

export const SPACING_GRID = {
  1: "8px",
  2: "16px",
  3: "24px",
  4: "32px",
  5: "40px",
  6: "48px",
  8: "64px",
} as const;

export const RADIUS = {
  base: "8px",
} as const;

export const MOTION = {
  durationMs: 200,
  easing: "cubic-bezier(0, 0, 0.2, 1)",
} as const;
