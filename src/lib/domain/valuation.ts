import { formatCurrency, type CurrencyCode } from "@/lib/format/currency";

export const BUSINESS_SECTORS = [
  "B2B SaaS",
  "Developer Tools",
  "E-commerce / D2C",
  "Marketplace",
  "Content & Media",
  "Services & Agency",
] as const;

export type BusinessSector = (typeof BUSINESS_SECTORS)[number];

export const GEOGRAPHY_OPTIONS = [
  "India (Bengaluru)",
  "India (Mumbai)",
  "India (Delhi NCR)",
  "India (Remote)",
  "India & APAC",
  "Global / Remote",
] as const;

export const COMMON_ASSETS_INCLUDED = [
  "Primary domain & DNS transfer",
  "Production source code repository",
  "Cloud hosting & infrastructure accounts",
  "Payment processor account transfer support",
  "Customer database & billing history",
  "Standard operating procedures & documentation",
  "30-day post-close founder transition support",
  "Social handles & brand assets",
] as const;

export const COMMON_TECH_STACK = [
  "Next.js / React",
  "TypeScript",
  "Node.js",
  "PostgreSQL",
  "Python / Django",
  "AWS",
  "Vercel",
  "Shopify",
  "Stripe",
  "Razorpay",
] as const;

export interface ValuationInput {
  sector: string;
  annualRevenue: number;
  annualProfit: number;
  ownerHoursPerWeek: number;
  growthPercent: number;
  currency: CurrencyCode;
}

export interface GuidedValuationResult {
  mode: "PROFIT_MULTIPLE" | "REVENUE_MULTIPLE" | "INSUFFICIENT_DATA";
  low: number;
  high: number;
  suggestedAskingPrice: number;
  lowMultiple: number;
  highMultiple: number;
  basis: string;
  disclaimer: string;
}

const SECTOR_PROFIT_MULTIPLES: Record<string, [number, number]> = {
  "B2B SaaS": [2.8, 4.0],
  "Developer Tools": [2.6, 3.8],
  Marketplace: [2.4, 3.4],
  "E-commerce / D2C": [1.8, 2.8],
  "Content & Media": [1.8, 2.6],
  "Services & Agency": [1.5, 2.4],
};

function roundValuationAmount(value: number, currency: CurrencyCode): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const step = currency === "INR" ? 50_000 : 1_000;
  return Math.max(step, Math.round(value / step) * step);
}

/**
 * Conservative, transparent valuation range calculator for Seller Onboarding.
 * Produces an illustrative estimate only — never a guarantee or appraisal.
 */
export function calculateGuidedValuation(
  input: ValuationInput
): GuidedValuationResult {
  const disclaimer =
    "Illustrative valuation range based on seller-reported figures and weekly owner involvement. Not a formal appraisal or guaranteed exit price.";

  const revenue = Number.isFinite(input.annualRevenue) ? Math.max(0, input.annualRevenue) : 0;
  const profit = Number.isFinite(input.annualProfit) ? input.annualProfit : 0;
  const hours = Number.isFinite(input.ownerHoursPerWeek)
    ? Math.min(168, Math.max(0, input.ownerHoursPerWeek))
    : 20;
  const growth = Number.isFinite(input.growthPercent) ? input.growthPercent : 0;

  if (profit > 0) {
    const [baseLow, baseHigh] = SECTOR_PROFIT_MULTIPLES[input.sector] ?? [2.0, 3.0];

    let adjustment = 0;
    const notes: string[] = [];

    if (hours <= 10) {
      adjustment += 0.3;
      notes.push("low owner workload (<=10 hrs/wk)");
    } else if (hours > 25) {
      adjustment -= 0.3;
      notes.push("operator-heavy workload (>25 hrs/wk)");
    } else {
      notes.push("moderate owner workload (11-25 hrs/wk)");
    }

    if (growth >= 25) {
      adjustment += 0.3;
      notes.push("strong annual growth (>=25%)");
    } else if (growth < 0) {
      adjustment -= 0.3;
      notes.push("contracting revenue");
    }

    const lowMultiple = Number(Math.max(1.0, baseLow + adjustment).toFixed(1));
    const highMultiple = Number(Math.max(lowMultiple + 0.4, baseHigh + adjustment).toFixed(1));

    const low = roundValuationAmount(profit * lowMultiple, input.currency);
    const high = roundValuationAmount(profit * highMultiple, input.currency);
    const suggestedAskingPrice = roundValuationAmount((low + high) / 2, input.currency);

    return {
      mode: "PROFIT_MULTIPLE",
      low,
      high,
      suggestedAskingPrice,
      lowMultiple,
      highMultiple,
      basis: `${lowMultiple}x–${highMultiple}x trailing annual net profit (${formatCurrency(
        profit,
        { currency: input.currency, compact: true }
      )}) for ${input.sector || "this sector"}, factoring ${notes.join(" and ")}.`,
      disclaimer,
    };
  }

  if (revenue > 0) {
    let revLow = 0.8;
    let revHigh = 1.4;
    if (growth >= 40) {
      revLow += 0.2;
      revHigh += 0.3;
    } else if (growth < 0) {
      revLow = 0.5;
      revHigh = 0.9;
    }

    const lowMultiple = Number(revLow.toFixed(1));
    const highMultiple = Number(revHigh.toFixed(1));
    const low = roundValuationAmount(revenue * lowMultiple, input.currency);
    const high = roundValuationAmount(revenue * highMultiple, input.currency);
    const suggestedAskingPrice = roundValuationAmount((low + high) / 2, input.currency);

    return {
      mode: "REVENUE_MULTIPLE",
      low,
      high,
      suggestedAskingPrice,
      lowMultiple,
      highMultiple,
      basis: `Pre-profit revenue multiple (${lowMultiple}x–${highMultiple}x trailing annual revenue of ${formatCurrency(
        revenue,
        { currency: input.currency, compact: true }
      )}). Buyers will scrutinize path to profitability.`,
      disclaimer,
    };
  }

  return {
    mode: "INSUFFICIENT_DATA",
    low: 0,
    high: 0,
    suggestedAskingPrice: 0,
    lowMultiple: 0,
    highMultiple: 0,
    basis: "Enter positive trailing 12-month revenue or net profit to compute a guided valuation range.",
    disclaimer,
  };
}

export interface AutoListingBuilderInput {
  sector: string;
  geography: string;
  currency: CurrencyCode;
  annualRevenue: number;
  annualProfit: number;
  growthPercent: number;
  churnPercent: number;
  monthlyTraffic: number;
  customerCount: number;
  ownerHoursPerWeek: number;
  reasonForSelling: string;
  techStack: string[];
  assetsIncluded: string[];
}

export interface FinancialSeriesPoint {
  period: string;
  revenue: number;
  profit: number;
  source: "VERIFIED" | "SELLER_REPORTED";
}

export function buildDefaultFinancialSeries(
  annualRevenue: number,
  annualProfit: number,
  growthPercent: number
): FinancialSeriesPoint[] {
  const safeRev = Math.max(0, annualRevenue);
  const safeProfit = Number.isFinite(annualProfit) ? annualProfit : 0;
  // Distribute trailing 4 quarters conservatively reflecting positive/negative growth trend
  const trendSlope = Math.max(-0.15, Math.min(0.25, growthPercent / 200));
  const rawWeights = [
    1 - 1.5 * trendSlope,
    1 - 0.5 * trendSlope,
    1 + 0.5 * trendSlope,
    1 + 1.5 * trendSlope,
  ];
  const totalWeight = rawWeights.reduce((acc, w) => acc + Math.max(0.2, w), 0);
  const labels = ["Q1", "Q2", "Q3", "Q4"];

  return labels.map((period, idx) => {
    const share = Math.max(0.2, rawWeights[idx] ?? 1) / totalWeight;
    return {
      period,
      revenue: Math.round(safeRev * share),
      profit: Math.round(safeProfit * share),
      source: "SELLER_REPORTED" as const,
    };
  });
}

export function buildAutoListingDraft(input: AutoListingBuilderInput): {
  teaserTitle: string;
  teaserSummary: string;
  financialNarrative: string;
  risksSummary: string;
  founderStory: string;
  financialSeries: FinancialSeriesPoint[];
} {
  const revText = formatCurrency(input.annualRevenue, {
    currency: input.currency,
    compact: true,
  });
  const profitText = formatCurrency(input.annualProfit, {
    currency: input.currency,
    compact: true,
  });

  const profitabilityLabel = input.annualProfit > 0 ? "Profitable" : "Revenue-generating";
  const teaserTitle = `${profitabilityLabel} ${input.sector} business in ${input.geography}`;

  const teaserSummary = `${input.sector} operation generating ${revText} in trailing 12-month revenue and ${profitText} in net profit with ${input.ownerHoursPerWeek} owner hours per week.`;

  const financialNarrative = [
    `Seller-reported trailing 12-month revenue is ${revText} with net profit of ${profitText} (${
      input.annualRevenue > 0
        ? `${Math.round((input.annualProfit / input.annualRevenue) * 100)}% operating margin`
        : "margin pending revenue entry"
    }).`,
    `Year-over-year growth is reported at ${input.growthPercent}%, monthly churn at ${input.churnPercent}%, across ${input.customerCount.toLocaleString(
      "en-IN"
    )} active customers and ${input.monthlyTraffic.toLocaleString("en-IN")} monthly visitors.`,
    `All figures remain labelled Seller-reported until read-only payment and analytics accounts are connected and verified.`,
  ].join(" ");

  const risksSummary = [
    `Key diligence risks to confirm before NDA and offer:`,
    `1) Owner transition: current founder spends ${input.ownerHoursPerWeek} hours/week on operations.`,
    `2) Financial verification: figures above are seller-reported and require bank/payment processor verification during diligence.`,
    `3) Concentration & retention: review top-customer share and monthly churn (${input.churnPercent}%) after NDA unlocks.`,
  ].join(" ");

  const founderStory = [
    `Built to serve customers in ${input.geography} using ${
      input.techStack.length > 0 ? input.techStack.join(", ") : "a lean, maintainable stack"
    }.`,
    input.reasonForSelling
      ? `Reason for exit: ${input.reasonForSelling}`
      : "Looking for an operator to scale distribution while preserving product reliability.",
  ].join(" ");

  return {
    teaserTitle,
    teaserSummary,
    financialNarrative,
    risksSummary,
    founderStory,
    financialSeries: buildDefaultFinancialSeries(
      input.annualRevenue,
      input.annualProfit,
      input.growthPercent
    ),
  };
}

export interface ConfidentialLeakFinding {
  field: string;
  matchedTerm: string;
}

const GENERIC_LEGAL_TOKENS = new Set([
  "private",
  "limited",
  "solutions",
  "systems",
  "technologies",
  "technology",
  "services",
  "company",
  "india",
  "group",
  "holdings",
  "ventures",
  "software",
  "enterprises",
  "enterprise",
  "digital",
  "global",
  "online",
  "labs",
  "corp",
  "analytics",
  "consulting",
  "partners",
  "studio",
  "media",
  "capital",
  "commerce",
  "health",
  "healthcare",
  "cloud",
  "data",
  "platform",
  "network",
  "agency",
  "marketing",
  "finance",
  "fintech",
  "logistics",
  "retail",
  "saas",
  "tools",
]);

/**
 * Prevents sellers from accidentally exposing redacted business name or domain
 * in public teaser/narrative fields before an NDA is signed.
 */
export function detectConfidentialLeak(
  publicFields: Record<string, string>,
  sensitive: { redactedName: string; redactedDomain: string }
): ConfidentialLeakFinding[] {
  const findings: ConfidentialLeakFinding[] = [];
  const rawName = sensitive.redactedName.trim();
  const normalizedDomain =
    sensitive.redactedDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0] ?? "";

  const candidateTerms: string[] = [];
  if (rawName.length >= 3) {
    candidateTerms.push(rawName);
    for (const token of rawName.split(/[^a-zA-Z0-9]+/)) {
      const lowerToken = token.toLowerCase();
      if (lowerToken.length >= 4 && !GENERIC_LEGAL_TOKENS.has(lowerToken)) {
        candidateTerms.push(lowerToken);
      }
    }
  }
  if (normalizedDomain.length >= 4) {
    candidateTerms.push(normalizedDomain);
    const domainRoot = normalizedDomain.split(".")[0];
    if (domainRoot && domainRoot.length >= 4) {
      candidateTerms.push(domainRoot);
    }
  }

  const uniqueTerms = Array.from(new Set(candidateTerms.map((t) => t.toLowerCase())));

  for (const [field, text] of Object.entries(publicFields)) {
    const lowerText = text.toLowerCase();
    for (const term of uniqueTerms) {
      if (term.length >= 3 && lowerText.includes(term)) {
        findings.push({ field, matchedTerm: term });
      }
    }
  }

  return findings;
}
