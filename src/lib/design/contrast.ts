import { ALLOWED_HEX_SET, SECTION_4_COLORS } from "@/styles/tokens";

function parseHexRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
    throw new Error(`Invalid 6-digit hex color: ${hex}`);
  }
  return [
    parseInt(normalized.slice(0, 2), 16) / 255,
    parseInt(normalized.slice(2, 4), 16) / 255,
    parseInt(normalized.slice(4, 6), 16) / 255,
  ];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHexRgb(hex).map((channel) =>
    channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4)
  ) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function meetsWcagAA(
  foregroundHex: string,
  backgroundHex: string,
  options?: { isUiComponentOrLargeText?: boolean }
): boolean {
  const threshold = options?.isUiComponentOrLargeText ? 3.0 : 4.5;
  return contrastRatio(foregroundHex, backgroundHex) >= threshold;
}

export function isSection4Hex(hex: string): boolean {
  return ALLOWED_HEX_SET.has(hex.trim().toUpperCase());
}

export { SECTION_4_COLORS };
