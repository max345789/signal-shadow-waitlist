export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP";

const SUPPORTED_CURRENCIES = new Set<CurrencyCode>(["INR", "USD", "EUR", "GBP"]);

const CURRENCY_LOCALES: Record<CurrencyCode, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
};

export function getDefaultCurrency(): CurrencyCode {
  const configured = process.env.NEXT_PUBLIC_DEFAULT_CURRENCY?.toUpperCase() as
    | CurrencyCode
    | undefined;
  if (configured && SUPPORTED_CURRENCIES.has(configured)) {
    return configured;
  }
  return "INR";
}

export interface FormatCurrencyOptions {
  currency?: CurrencyCode;
  compact?: boolean;
  locale?: string;
  maximumFractionDigits?: number;
}

export function formatCurrency(
  amount: number,
  options?: FormatCurrencyOptions
): string {
  if (!Number.isFinite(amount)) {
    return "—";
  }

  const currency = options?.currency ?? getDefaultCurrency();
  const locale = options?.locale ?? CURRENCY_LOCALES[currency];

  if (options?.compact && currency === "INR") {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? "-" : "";
    const trimTrailingZeros = (num: number) =>
      num.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
    if (abs >= 10_000_000) {
      return `${sign}₹${trimTrailingZeros(abs / 10_000_000)} Cr`;
    }
    if (abs >= 100_000) {
      return `${sign}₹${trimTrailingZeros(abs / 100_000)} L`;
    }
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: options?.compact && currency !== "INR" ? "compact" : "standard",
    maximumFractionDigits: options?.maximumFractionDigits ?? (options?.compact ? 1 : 0),
  }).format(amount);
}

export function formatPercentage(value: number, fractionDigits = 1): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(fractionDigits).replace(/\.0$/, "")}%`;
}

export function formatCount(value: number, locale = "en-IN"): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function formatRelativeVerifiedTime(
  verifiedAt: Date | string,
  now: Date = new Date()
): string {
  const date = typeof verifiedAt === "string" ? new Date(verifiedAt) : verifiedAt;
  if (Number.isNaN(date.getTime())) {
    return "Verification timestamp unavailable";
  }

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) {
    return "Verified just now";
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "Last verified just now";
  }
  if (minutes < 60) {
    return `Last verified ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Last verified ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(hours / 24);
  return `Last verified ${days} ${days === 1 ? "day" : "days"} ago`;
}
