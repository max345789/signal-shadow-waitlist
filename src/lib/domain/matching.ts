import type { SanitizedListingView } from "@/lib/domain/listings";
import { formatCurrency, type CurrencyCode } from "@/lib/format/currency";

export const THESIS_ALERT_MIN_SCORE = 70;

export const THESIS_GEOGRAPHY_OPTIONS = [
  "India (Any city)",
  "India (Bengaluru)",
  "India (Mumbai)",
  "India (Delhi NCR)",
  "India (Remote)",
  "India & APAC",
  "Global / Remote",
] as const;

export interface ThesisCriteria {
  id?: string;
  title: string;
  sector: string | null;
  minRevenue: number | null;
  maxRevenue: number | null;
  minProfit: number | null;
  maxOwnerHours: number | null;
  geography: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  currency: CurrencyCode;
  freeText: string;
  alertsEnabled: boolean;
}

export interface SavedThesisRecord extends ThesisCriteria {
  id: string;
  buyerProfileId: string;
  buyerUserId: string;
  isSampleData: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatchEvaluationResult {
  businessId: string;
  score: number;
  headline: string;
  reasons: string[];
  mismatches: string[];
  breakdown: {
    hardScore: number;
    softScore: number;
    matchedCriteriaCount: number;
    mismatchedCriteriaCount: number;
  };
}

export interface RankedThesisMatch {
  matchId?: string;
  thesisId?: string;
  listing: SanitizedListingView;
  score: number;
  headline: string;
  reasons: string[];
  mismatches: string[];
  breakdown: MatchEvaluationResult["breakdown"];
  alertSentAt?: string | null;
}

export interface ThesisNotificationRecord {
  id: string;
  userId: string;
  type: "THESIS_MATCH";
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Reference FX conversion table relative to INR for cross-currency thesis matching.
 * Exact 1:1 when currencies match; approximate reference rates logged in DECISIONS.md.
 */
const INR_PER_UNIT: Record<CurrencyCode, number> = {
  INR: 1,
  USD: 84,
  EUR: 91,
  GBP: 107,
};

export function convertCurrencyAmount(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode
): number {
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return amount;
  const inr = amount * INR_PER_UNIT[from];
  return inr / INR_PER_UNIT[to];
}

const ADJACENT_SECTORS: Record<string, readonly string[]> = {
  "B2B SaaS": ["Developer Tools", "Marketplace"],
  "Developer Tools": ["B2B SaaS"],
  Marketplace: ["B2B SaaS", "E-commerce / D2C"],
  "E-commerce / D2C": ["Marketplace", "Content & Media"],
  "Content & Media": ["E-commerce / D2C", "Services & Agency"],
  "Services & Agency": ["Content & Media"],
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "business",
  "businesses",
  "buy",
  "by",
  "company",
  "for",
  "from",
  "good",
  "great",
  "high",
  "hours",
  "hour",
  "hr",
  "hrs",
  "in",
  "india",
  "into",
  "is",
  "it",
  "looking",
  "low",
  "max",
  "min",
  "minimum",
  "maximum",
  "more",
  "net",
  "of",
  "on",
  "or",
  "over",
  "owner",
  "per",
  "price",
  "profit",
  "revenue",
  "startup",
  "startups",
  "strong",
  "target",
  "than",
  "that",
  "the",
  "their",
  "this",
  "to",
  "under",
  "up",
  "want",
  "week",
  "weekly",
  "with",
]);

const VERIFICATION_CONNECTOR_TERMS = new Set([
  "verified",
  "stripe",
  "razorpay",
  "ga4",
  "plausible",
]);

const FUNCTION_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "per",
  "that",
  "the",
  "their",
  "this",
  "to",
  "with",
]);

function normalizeTextTokens(text: string, allowBroadDomainTerms = false): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[₹$€£,+]/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const tokens: string[] = [];
  for (const token of raw) {
    if (token.length < 2) continue;
    if (/^\d+$/.test(token)) continue;
    if (allowBroadDomainTerms ? FUNCTION_WORDS.has(token) : STOP_WORDS.has(token)) {
      continue;
    }
    tokens.push(token);
  }
  return Array.from(new Set(tokens));
}

function buildPublicListingCorpus(listing: SanitizedListingView): {
  text: string;
  tokenSet: Set<string>;
  verifiedSources: Set<string>;
  hasVerifiedMetrics: boolean;
} {
  const verifiedSources = new Set<string>();
  for (const metric of listing.metrics) {
    if (metric.trust.isVerified) {
      verifiedSources.add(metric.sourceLabel.toLowerCase());
    }
  }
  const hasVerifiedMetrics = listing.trustSummary.verifiedCount > 0;

  // Strictly public/sanitized fields ONLY — never include redactedName/redactedDomain/redactedCustomers.
  const combined = [
    listing.teaserTitle,
    listing.teaserSummary,
    listing.sector,
    listing.geography,
    listing.reasonForSelling,
    listing.founderStory,
    listing.financialNarrative,
    listing.risksSummary,
    listing.techStack.join(" "),
    listing.assetsIncluded.join(" "),
    Array.from(verifiedSources).join(" "),
    hasVerifiedMetrics ? "verified" : "",
  ]
    .join(" ")
    .toLowerCase();

  const words = combined.split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  return {
    text: combined,
    tokenSet: new Set(words),
    verifiedSources,
    hasVerifiedMetrics,
  };
}

function formatBoundRange(
  minVal: number | null,
  maxVal: number | null,
  currency: CurrencyCode
): string {
  if (minVal !== null && maxVal !== null) {
    return `${formatCurrency(minVal, { currency, compact: true })}–${formatCurrency(maxVal, {
      currency,
      compact: true,
    })}`;
  }
  if (minVal !== null) {
    return `${formatCurrency(minVal, { currency, compact: true })}+`;
  }
  if (maxVal !== null) {
    return `up to ${formatCurrency(maxVal, { currency, compact: true })}`;
  }
  return "unspecified range";
}

function evaluateGeographyFit(
  listingGeo: string,
  thesisGeo: string
): { credit: number; exact: boolean; reason?: string; mismatch?: string } {
  const normListing = listingGeo.trim().toLowerCase();
  const normThesis = thesisGeo.trim().toLowerCase();

  if (normListing === normThesis) {
    return {
      credit: 1,
      exact: true,
      reason: `Geography (${listingGeo}) matches your ${thesisGeo} target.`,
    };
  }

  if (normThesis === "global / remote" || normThesis === "global") {
    if (normListing.includes("remote") || normListing.includes("global")) {
      return {
        credit: 1,
        exact: true,
        reason: `Geography (${listingGeo}) supports remote operation.`,
      };
    }
    return {
      credit: 0.75,
      exact: false,
      reason: `Geography (${listingGeo}) fits a global mandate.`,
      mismatch: `Operations are anchored in ${listingGeo} rather than fully remote.`,
    };
  }

  if (normThesis === "india (any city)" || normThesis === "india") {
    if (normListing.includes("india")) {
      return {
        credit: 1,
        exact: true,
        reason: `Located in ${listingGeo}, within your India focus.`,
      };
    }
    return {
      credit: 0,
      exact: false,
      mismatch: `Geography is ${listingGeo}, outside your India mandate.`,
    };
  }

  if (normThesis.includes("remote") && normListing.includes("remote")) {
    return {
      credit: 1,
      exact: true,
      reason: `Remote-ready geography (${listingGeo}) fits ${thesisGeo}.`,
    };
  }

  const listingInIndia = normListing.includes("india");
  const thesisInIndia = normThesis.includes("india");
  if (listingInIndia && thesisInIndia) {
    if (normListing.includes("remote") || normThesis.includes("apac")) {
      return {
        credit: 0.8,
        exact: false,
        reason: `Operates in ${listingGeo}, compatible with ${thesisGeo}.`,
        mismatch: `Location (${listingGeo}) differs slightly from ${thesisGeo}.`,
      };
    }
    return {
      credit: 0.55,
      exact: false,
      reason: `Based in India (${listingGeo}).`,
      mismatch: `Located in ${listingGeo} rather than your preferred ${thesisGeo}.`,
    };
  }

  return {
    credit: 0,
    exact: false,
    mismatch: `Geography is ${listingGeo}, outside your ${thesisGeo} focus.`,
  };
}

/**
 * Weighted hard-criteria + free-text scoring engine.
 * Always surfaces both 'Why this matches' and 'What doesn't fit' transparently.
 */
export function scoreListingAgainstThesis(
  listing: SanitizedListingView,
  thesis: ThesisCriteria
): MatchEvaluationResult {
  const reasons: string[] = [];
  const mismatches: string[] = [];

  let hardWeightSum = 0;
  let hardEarned = 0;
  let softWeightSum = 0;
  let softEarned = 0;
  let matchedCriteriaCount = 0;
  let mismatchedCriteriaCount = 0;

  const targetCurrency = thesis.currency;
  const currencyNote =
    listing.currency !== targetCurrency
      ? ` (converted from ${listing.currency})`
      : "";

  // 1. Sector (weight 22)
  const cleanSector = thesis.sector?.trim() || null;
  if (cleanSector && cleanSector !== "ALL" && cleanSector !== "ANY") {
    const weight = 22;
    hardWeightSum += weight;
    if (listing.sector.toLowerCase() === cleanSector.toLowerCase()) {
      hardEarned += weight;
      matchedCriteriaCount += 1;
      reasons.push(`Matches target sector (${listing.sector}).`);
    } else {
      const adjacent = ADJACENT_SECTORS[cleanSector] ?? [];
      if (adjacent.includes(listing.sector)) {
        hardEarned += weight * 0.25;
      }
      mismatchedCriteriaCount += 1;
      mismatches.push(
        `Sector is ${listing.sector}, outside your target ${cleanSector} focus.`
      );
    }
  }

  // 2. Asking price range (weight 20)
  const hasMinPrice =
    thesis.minPrice !== null && Number.isFinite(thesis.minPrice);
  const hasMaxPrice =
    thesis.maxPrice !== null && Number.isFinite(thesis.maxPrice);
  if (hasMinPrice || hasMaxPrice) {
    const weight = 20;
    hardWeightSum += weight;
    const minP = hasMinPrice ? thesis.minPrice! : null;
    const maxP = hasMaxPrice ? thesis.maxPrice! : null;
    const normalizedMin =
      minP !== null && maxP !== null && minP > maxP ? maxP : minP;
    const normalizedMax =
      minP !== null && maxP !== null && minP > maxP ? minP : maxP;

    const priceInTarget = convertCurrencyAmount(
      listing.askingPrice,
      listing.currency,
      targetCurrency
    );
    const fmtPrice = formatCurrency(priceInTarget, {
      currency: targetCurrency,
      compact: true,
    });

    if (
      (normalizedMin === null || priceInTarget >= normalizedMin) &&
      (normalizedMax === null || priceInTarget <= normalizedMax)
    ) {
      hardEarned += weight;
      matchedCriteriaCount += 1;
      reasons.push(
        `Asking price (${fmtPrice}${currencyNote}) fits your ${formatBoundRange(
          normalizedMin,
          normalizedMax,
          targetCurrency
        )} target.`
      );
    } else if (normalizedMax !== null && priceInTarget > normalizedMax) {
      const overRatio =
        normalizedMax > 0
          ? (priceInTarget - normalizedMax) / normalizedMax
          : 1;
      const credit = overRatio <= 0.15 ? 0.55 : overRatio <= 0.35 ? 0.25 : 0;
      hardEarned += weight * credit;
      mismatchedCriteriaCount += 1;
      mismatches.push(
        `Asking price (${fmtPrice}${currencyNote}) exceeds your ${formatCurrency(
          normalizedMax,
          { currency: targetCurrency, compact: true }
        )} ceiling by ${Math.round(overRatio * 100)}%.`
      );
    } else if (normalizedMin !== null && priceInTarget < normalizedMin) {
      const underRatio =
        normalizedMin > 0
          ? (normalizedMin - priceInTarget) / normalizedMin
          : 1;
      const credit = underRatio <= 0.3 ? 0.6 : 0.25;
      hardEarned += weight * credit;
      mismatchedCriteriaCount += 1;
      mismatches.push(
        `Asking price (${fmtPrice}${currencyNote}) is below your ${formatCurrency(
          normalizedMin,
          { currency: targetCurrency, compact: true }
        )} minimum size.`
      );
    }
  }

  // 3. Annual revenue range (weight 15)
  const hasMinRev =
    thesis.minRevenue !== null && Number.isFinite(thesis.minRevenue);
  const hasMaxRev =
    thesis.maxRevenue !== null && Number.isFinite(thesis.maxRevenue);
  if (hasMinRev || hasMaxRev) {
    const weight = 15;
    hardWeightSum += weight;
    const minR = hasMinRev ? thesis.minRevenue! : null;
    const maxR = hasMaxRev ? thesis.maxRevenue! : null;
    const normalizedMin =
      minR !== null && maxR !== null && minR > maxR ? maxR : minR;
    const normalizedMax =
      minR !== null && maxR !== null && minR > maxR ? minR : maxR;

    const revMetric = listing.metrics.find((m) => m.key === "REVENUE");
    if (!revMetric) {
      mismatchedCriteriaCount += 1;
      mismatches.push("Trailing 12m revenue figure is missing from this listing.");
    } else {
      const revCurrency = revMetric.currency ?? listing.currency;
      const revInTarget = convertCurrencyAmount(
        revMetric.value,
        revCurrency,
        targetCurrency
      );
      const trustTag = revMetric.trust.isVerified
        ? `${revMetric.sourceLabel}-verified`
        : "Seller-reported";
      const fmtRev = formatCurrency(revInTarget, {
        currency: targetCurrency,
        compact: true,
      });

      if (
        (normalizedMin === null || revInTarget >= normalizedMin) &&
        (normalizedMax === null || revInTarget <= normalizedMax)
      ) {
        hardEarned += weight;
        matchedCriteriaCount += 1;
        reasons.push(
          `Trailing revenue (${fmtRev}, ${trustTag}${currencyNote}) fits your ${formatBoundRange(
            normalizedMin,
            normalizedMax,
            targetCurrency
          )} range.`
        );
      } else if (normalizedMin !== null && revInTarget < normalizedMin) {
        const deficit =
          normalizedMin > 0 ? (normalizedMin - revInTarget) / normalizedMin : 1;
        const credit = Math.max(0, Math.min(0.6, 1 - deficit * 1.4));
        hardEarned += weight * credit;
        mismatchedCriteriaCount += 1;
        mismatches.push(
          `Trailing revenue (${fmtRev}, ${trustTag}) is below your ${formatCurrency(
            normalizedMin,
            { currency: targetCurrency, compact: true }
          )} minimum.`
        );
      } else if (normalizedMax !== null && revInTarget > normalizedMax) {
        const excess =
          normalizedMax > 0 ? (revInTarget - normalizedMax) / normalizedMax : 1;
        const credit = Math.max(0, Math.min(0.6, 1 - excess * 1.2));
        hardEarned += weight * credit;
        mismatchedCriteriaCount += 1;
        mismatches.push(
          `Trailing revenue (${fmtRev}, ${trustTag}) exceeds your ${formatCurrency(
            normalizedMax,
            { currency: targetCurrency, compact: true }
          )} maximum.`
        );
      }
    }
  }

  // 4. Net profit floor (weight 15)
  if (thesis.minProfit !== null && Number.isFinite(thesis.minProfit)) {
    const weight = 15;
    hardWeightSum += weight;
    const profitMetric = listing.metrics.find((m) => m.key === "PROFIT");
    if (!profitMetric) {
      mismatchedCriteriaCount += 1;
      mismatches.push("Trailing 12m net profit figure is missing from this listing.");
    } else {
      const pCurrency = profitMetric.currency ?? listing.currency;
      const profitInTarget = convertCurrencyAmount(
        profitMetric.value,
        pCurrency,
        targetCurrency
      );
      const trustTag = profitMetric.trust.isVerified
        ? `${profitMetric.sourceLabel}-verified`
        : "Seller-reported";
      const fmtProfit = formatCurrency(profitInTarget, {
        currency: targetCurrency,
        compact: true,
      });
      const fmtMinProfit = formatCurrency(thesis.minProfit, {
        currency: targetCurrency,
        compact: true,
      });

      if (profitInTarget >= thesis.minProfit) {
        hardEarned += weight;
        matchedCriteriaCount += 1;
        reasons.push(
          `Net profit (${fmtProfit}, ${trustTag}${currencyNote}) meets your ${fmtMinProfit}+ target.`
        );
      } else if (profitInTarget > 0 && thesis.minProfit > 0) {
        const credit = Math.max(
          0,
          Math.min(0.65, (profitInTarget / thesis.minProfit) * 0.65)
        );
        hardEarned += weight * credit;
        mismatchedCriteriaCount += 1;
        mismatches.push(
          `Net profit (${fmtProfit}, ${trustTag}) is below your ${fmtMinProfit} floor.`
        );
      } else {
        mismatchedCriteriaCount += 1;
        mismatches.push(
          `Business shows ${fmtProfit} net profit against your ${fmtMinProfit} floor.`
        );
      }
    }
  }

  // 5. Owner workload cap (weight 10)
  if (
    thesis.maxOwnerHours !== null &&
    Number.isFinite(thesis.maxOwnerHours)
  ) {
    const weight = 10;
    hardWeightSum += weight;
    if (listing.ownerHoursPerWeek <= thesis.maxOwnerHours) {
      hardEarned += weight;
      matchedCriteriaCount += 1;
      reasons.push(
        `Owner workload (${listing.ownerHoursPerWeek} hrs/week) is within your ${thesis.maxOwnerHours} hrs/week limit.`
      );
    } else {
      const overRatio =
        thesis.maxOwnerHours > 0
          ? (listing.ownerHoursPerWeek - thesis.maxOwnerHours) /
            thesis.maxOwnerHours
          : 1;
      const credit = overRatio <= 0.35 ? 0.45 : overRatio <= 0.75 ? 0.2 : 0;
      hardEarned += weight * credit;
      mismatchedCriteriaCount += 1;
      mismatches.push(
        `Owner workload (${listing.ownerHoursPerWeek} hrs/week) exceeds your ${thesis.maxOwnerHours} hrs/week cap.`
      );
    }
  }

  // 6. Geography (weight 8)
  const cleanGeo = thesis.geography?.trim() || null;
  if (cleanGeo && cleanGeo !== "ALL" && cleanGeo !== "ANY") {
    const weight = 8;
    hardWeightSum += weight;
    const geoFit = evaluateGeographyFit(listing.geography, cleanGeo);
    hardEarned += weight * geoFit.credit;
    if (geoFit.reason) {
      reasons.push(geoFit.reason);
    }
    if (geoFit.exact || geoFit.credit >= 0.8) {
      matchedCriteriaCount += 1;
    }
    if (geoFit.mismatch) {
      mismatchedCriteriaCount += 1;
      mismatches.push(geoFit.mismatch);
    }
  }

  // 7. Free-text soft criteria (weight 10 when hard criteria exist; 100 when free-text only)
  const cleanFreeText = thesis.freeText.trim();
  const primaryTokens = normalizeTextTokens(cleanFreeText);
  const freeTextTokens =
    primaryTokens.length > 0
      ? primaryTokens
      : hardWeightSum === 0 && cleanFreeText.length > 0
        ? normalizeTextTokens(cleanFreeText, true)
        : [];
  if (freeTextTokens.length > 0) {
    const weight = hardWeightSum > 0 ? 10 : 100;
    softWeightSum += weight;
    const corpus = buildPublicListingCorpus(listing);

    const matchedTokens: string[] = [];
    const unmatchedTokens: string[] = [];
    const missingConnectorReqs: string[] = [];

    for (const token of freeTextTokens) {
      if (VERIFICATION_CONNECTOR_TERMS.has(token)) {
        if (token === "verified") {
          if (corpus.hasVerifiedMetrics) {
            matchedTokens.push("verified metrics");
          } else {
            unmatchedTokens.push(token);
            missingConnectorReqs.push("verified third-party metrics");
          }
        } else if (corpus.verifiedSources.has(token)) {
          matchedTokens.push(`${token}-verified`);
        } else {
          unmatchedTokens.push(token);
          missingConnectorReqs.push(`${token} verified connection`);
        }
        continue;
      }

      if (
        corpus.tokenSet.has(token) ||
        (token.length >= 4 && corpus.text.includes(token))
      ) {
        matchedTokens.push(token);
      } else {
        unmatchedTokens.push(token);
      }
    }

    const ratio = matchedTokens.length / freeTextTokens.length;
    softEarned += weight * ratio;

    if (matchedTokens.length > 0) {
      matchedCriteriaCount += 1;
      reasons.push(
        `Free-text alignment: matches ${matchedTokens.slice(0, 5).join(", ")}.`
      );
    }
    if (missingConnectorReqs.length > 0) {
      mismatchedCriteriaCount += 1;
      mismatches.push(
        `Requested ${missingConnectorReqs.join(" and ")}, which ${
          listing.trustSummary.verifiedCount === 0
            ? "this listing does not currently verify (all figures Seller-reported)"
            : "is not verified on this listing"
        }.`
      );
    } else if (unmatchedTokens.length > 0) {
      mismatchedCriteriaCount += 1;
      mismatches.push(
        `Free-text criteria not evidenced in teaser: ${unmatchedTokens
          .slice(0, 4)
          .join(", ")}.`
      );
    }
  }

  const totalWeight = hardWeightSum + softWeightSum;
  if (totalWeight === 0) {
    return {
      businessId: listing.id,
      score: 0,
      headline: "Add structured criteria or free-text requirements to rank listings.",
      reasons: [],
      mismatches: ["No criteria specified in this thesis yet."],
      breakdown: {
        hardScore: 0,
        softScore: 0,
        matchedCriteriaCount: 0,
        mismatchedCriteriaCount: 1,
      },
    };
  }

  const totalScore = Math.round(
    Math.max(0, Math.min(100, ((hardEarned + softEarned) / totalWeight) * 100))
  );
  const hardScore =
    hardWeightSum > 0
      ? Math.round(Math.max(0, Math.min(100, (hardEarned / hardWeightSum) * 100)))
      : totalScore;
  const softScore =
    softWeightSum > 0
      ? Math.round(Math.max(0, Math.min(100, (softEarned / softWeightSum) * 100)))
      : totalScore;

  // Honest trust reminder when all metrics are seller-reported and not already flagged above
  if (
    listing.trustSummary.verifiedCount === 0 &&
    !mismatches.some((m) => m.toLowerCase().includes("seller-reported"))
  ) {
    mismatches.push(
      "All metrics on this listing are currently Seller-reported with no verified account connectors."
    );
  }

  const headline =
    reasons.length > 0
      ? reasons[0]!
      : mismatches.length > 0
        ? `Low fit: ${mismatches[0]!}`
        : "Partial alignment with thesis criteria.";

  return {
    businessId: listing.id,
    score: totalScore,
    headline,
    reasons,
    mismatches,
    breakdown: {
      hardScore,
      softScore,
      matchedCriteriaCount,
      mismatchedCriteriaCount,
    },
  };
}

export function rankListingsForThesis(
  listings: SanitizedListingView[],
  thesis: ThesisCriteria
): RankedThesisMatch[] {
  const approvedOnly = listings.filter((l) => l.status === "APPROVED");
  const ranked: RankedThesisMatch[] = approvedOnly.map((listing) => {
    const evalResult = scoreListingAgainstThesis(listing, thesis);
    return {
      thesisId: thesis.id,
      listing,
      score: evalResult.score,
      headline: evalResult.headline,
      reasons: evalResult.reasons,
      mismatches: evalResult.mismatches,
      breakdown: evalResult.breakdown,
    };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.mismatches.length !== b.mismatches.length) {
      return a.mismatches.length - b.mismatches.length;
    }
    if (b.listing.trustSummary.verifiedCount !== a.listing.trustSummary.verifiedCount) {
      return b.listing.trustSummary.verifiedCount - a.listing.trustSummary.verifiedCount;
    }
    return a.listing.id.localeCompare(b.listing.id);
  });

  return ranked;
}

/**
 * Conservatively extracts structured hints from a natural-language Home prompt
 * to pre-populate the guided Thesis Builder while keeping the full prompt in freeText.
 */
export function extractThesisHintsFromPrompt(prompt: string): {
  title: string;
  sector: string | null;
  geography: string | null;
  maxOwnerHours: number | null;
  minProfit: number | null;
  maxPrice: number | null;
  freeText: string;
} {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  let sector: string | null = null;
  if (lower.includes("b2b saas") || lower.includes("saas")) {
    sector = "B2B SaaS";
  } else if (lower.includes("developer tool") || lower.includes("devtools") || lower.includes("api")) {
    sector = "Developer Tools";
  } else if (lower.includes("d2c") || lower.includes("e-commerce") || lower.includes("ecommerce") || lower.includes("skincare")) {
    sector = "E-commerce / D2C";
  } else if (lower.includes("marketplace")) {
    sector = "Marketplace";
  } else if (lower.includes("content") || lower.includes("media") || lower.includes("newsletter")) {
    sector = "Content & Media";
  } else if (lower.includes("agency") || lower.includes("services")) {
    sector = "Services & Agency";
  }

  let geography: string | null = null;
  if (lower.includes("bengaluru") || lower.includes("bangalore")) {
    geography = "India (Bengaluru)";
  } else if (lower.includes("mumbai")) {
    geography = "India (Mumbai)";
  } else if (lower.includes("delhi") || lower.includes("ncr")) {
    geography = "India (Delhi NCR)";
  } else if (lower.includes("india") && lower.includes("remote")) {
    geography = "India (Remote)";
  } else if (lower.includes("india")) {
    geography = "India (Any city)";
  } else if (lower.includes("remote") || lower.includes("global")) {
    geography = "Global / Remote";
  }

  let maxOwnerHours: number | null = null;
  const hoursMatch = lower.match(
    /(?:under|below|max|<=|<)\s*(\d{1,3})\s*(?:owner\s*)?(?:hours?|hrs?)/
  );
  if (hoursMatch && hoursMatch[1]) {
    const parsed = Number.parseInt(hoursMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 168) {
      maxOwnerHours = parsed;
    }
  }

  const parseIndianAmount = (numStr: string, unitStr: string): number | null => {
    const num = Number.parseFloat(numStr);
    if (!Number.isFinite(num) || num <= 0) return null;
    const u = unitStr.toLowerCase();
    if (u.startsWith("cr")) return Math.round(num * 10_000_000);
    if (u.startsWith("l")) return Math.round(num * 100_000);
    return Math.round(num);
  };

  let minProfit: number | null = null;
  const profitMatch = lower.match(
    /(?:₹|inr\s*)?(\d+(?:\.\d+)?)\s*(l|lac|lakh|lakhs|cr|crore|crores)\s*\+?\s*(?:net\s*)?profit/
  );
  if (profitMatch && profitMatch[1] && profitMatch[2]) {
    minProfit = parseIndianAmount(profitMatch[1], profitMatch[2]);
  }

  let maxPrice: number | null = null;
  const budgetMatch = lower.match(
    /(?:under|below|max|budget|price(?:\s*up\s*to)?)\s*(?:₹|inr\s*)?(\d+(?:\.\d+)?)\s*(l|lac|lakh|lakhs|cr|crore|crores)(?!\s*(?:\+?\s*)?(?:revenue|arr|mrr|profit|ebitda|sales))/
  );
  if (budgetMatch && budgetMatch[1] && budgetMatch[2]) {
    maxPrice = parseIndianAmount(budgetMatch[1], budgetMatch[2]);
  }

  const title =
    trimmed.length > 0
      ? trimmed.slice(0, 72)
      : sector
        ? `${sector} acquisition thesis`
        : "Custom acquisition thesis";

  return {
    title,
    sector,
    geography,
    maxOwnerHours,
    minProfit,
    maxPrice,
    freeText: trimmed,
  };
}
