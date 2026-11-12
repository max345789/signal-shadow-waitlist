import type {
  MetricKeyValue,
  MetricSourceValue,
  MetricUnitValue,
} from "@/lib/domain/listings";
import type {
  AnalyticsConnectorProvider,
  IdentityProvider,
  PaymentConnectorProvider,
  ProofOfFundsProvider,
} from "@/lib/domain/verification";
import type { CurrencyCode } from "@/lib/format/currency";

export interface ConnectorProviderSpec {
  provider: PaymentConnectorProvider | AnalyticsConnectorProvider;
  kind: "PAYMENT" | "ANALYTICS";
  source: MetricSourceValue;
  readOnlyScope: string;
  metricKeys: MetricKeyValue[];
  placeholderAccountId: string;
  placeholderToken: string;
}

export const IDENTITY_PROVIDER_SPECS: Array<{
  provider: IdentityProvider;
  label: string;
  scopeSummary: string;
  expiryDays: number;
}> = [
  {
    provider: "Persona",
    label: "Persona Regulated KYC",
    scopeSummary: "Government ID & liveness attestation without storing raw document scans.",
    expiryDays: 90,
  },
  {
    provider: "Digio KYC",
    label: "Digio / Aadhaar & PAN eKYC",
    scopeSummary: "Regulated Indian PAN / Aadhaar identity confirmation with masked reference.",
    expiryDays: 90,
  },
];

export const PROOF_OF_FUNDS_PROVIDER_SPECS: Array<{
  provider: ProofOfFundsProvider;
  label: string;
  scopeSummary: string;
  expiryDays: number;
}> = [
  {
    provider: "Setu AA",
    label: "Setu Account Aggregator (RBI-licensed)",
    scopeSummary: "Read-only consented bank balance verification without credential storage.",
    expiryDays: 30,
  },
  {
    provider: "Plaid Assets",
    label: "Plaid Read-Only Asset Report",
    scopeSummary: "Read-only institutional liquid balance verification for cross-border buyers.",
    expiryDays: 30,
  },
];

export const CONNECTOR_PROVIDER_SPECS: Record<
  PaymentConnectorProvider | AnalyticsConnectorProvider,
  ConnectorProviderSpec
> = {
  Stripe: {
    provider: "Stripe",
    kind: "PAYMENT",
    source: "STRIPE",
    readOnlyScope: "read_only:charges,balance_transactions,subscriptions,customers",
    metricKeys: ["REVENUE", "CUSTOMERS"],
    placeholderAccountId: "acct_1P9kDemo8821",
    placeholderToken: "rk_sandbox_valid_stripe_2026",
  },
  Razorpay: {
    provider: "Razorpay",
    kind: "PAYMENT",
    source: "RAZORPAY",
    readOnlyScope: "read_only:payments,settlements,subscriptions",
    metricKeys: ["REVENUE", "CUSTOMERS"],
    placeholderAccountId: "rzp_acct_demo_4410",
    placeholderToken: "rzp_sandbox_valid_2026",
  },
  GA4: {
    provider: "GA4",
    kind: "ANALYTICS",
    source: "GA4",
    readOnlyScope: "https://www.googleapis.com/auth/analytics.readonly",
    metricKeys: ["TRAFFIC"],
    placeholderAccountId: "properties/394810221",
    placeholderToken: "ga4_sandbox_valid_ro_2026",
  },
  Plausible: {
    provider: "Plausible",
    kind: "ANALYTICS",
    source: "PLAUSIBLE",
    readOnlyScope: "stats:read (aggregate visitor counts only)",
    metricKeys: ["TRAFFIC"],
    placeholderAccountId: "site_analytics_demo",
    placeholderToken: "plausible_sandbox_valid_2026",
  },
};

export function maskSecretHint(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) {
    return "****";
  }
  return `****${trimmed.slice(-4)}`;
}

export function maskAccountIdentifier(accountId: string, provider: string): string {
  const trimmed = accountId.trim();
  if (trimmed.length <= 4) {
    return `${provider} ****`;
  }
  return `${provider} ${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
}

export interface ConnectorSyncedMetric {
  key: MetricKeyValue;
  label: string;
  value: number;
  unit: MetricUnitValue;
  currency: CurrencyCode | null;
  source: MetricSourceValue;
}

export type ConnectorFetchResult =
  | {
      ok: true;
      adapterMode: "live" | "sandbox";
      accountHint: string;
      readOnlyScope: string;
      sandboxTokenBehavior: "valid";
      metrics: ConnectorSyncedMetric[];
    }
  | {
      ok: false;
      code: "CONNECTION_FAILED" | "TOKEN_EXPIRED";
      reason: string;
      sandboxTokenBehavior: "fail" | "expired";
    };

function deterministicHash(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

/**
 * Fetches read-only vitals from a Payment (Stripe/Razorpay) or Analytics (GA4/Plausible) adapter.
 *
 * Security & Trust rules:
 * - Never writes or mutates funds/settings in external accounts (read-only GET scopes only).
 * - Never stores raw tokens in serialized metadata.
 * - Tokens containing "fail", "revoked", or "invalid" fail deterministically (CONNECTION_FAILED).
 * - Tokens containing "expired" fail deterministically (TOKEN_EXPIRED).
 * - If ENABLE_LIVE_CONNECTORS === "true" and a live Stripe restricted key (rk_live_...) is passed,
 *   queries Stripe's read-only balance_transactions endpoint over HTTPS with a 5s timeout.
 */
export async function fetchReadOnlyConnectorMetrics(params: {
  provider: PaymentConnectorProvider | AnalyticsConnectorProvider;
  accountIdentifier: string;
  readOnlyToken?: string | null;
  previousBehavior?: "valid" | "fail" | "expired";
  baselineMetrics: Array<{
    key: MetricKeyValue;
    value: number;
    currency: CurrencyCode | null;
  }>;
  businessCurrency: CurrencyCode;
  syncCount?: number;
}): Promise<ConnectorFetchResult> {
  const spec = CONNECTOR_PROVIDER_SPECS[params.provider];
  const token = params.readOnlyToken?.trim() ?? "";

  if (token.length > 0) {
    const lower = token.toLowerCase();
    if (
      lower.includes("fail") ||
      lower.includes("revoked") ||
      lower.includes("invalid") ||
      lower.includes("error")
    ) {
      return {
        ok: false,
        code: "CONNECTION_FAILED",
        reason: `${params.provider} rejected the read-only credential (revoked or missing read-only scope).`,
        sandboxTokenBehavior: "fail",
      };
    }
    if (lower.includes("expired")) {
      return {
        ok: false,
        code: "TOKEN_EXPIRED",
        reason: `${params.provider} read-only authorization expired; reconnect to restore Verified status.`,
        sandboxTokenBehavior: "expired",
      };
    }
    if (token.length < 8) {
      return {
        ok: false,
        code: "CONNECTION_FAILED",
        reason: `${params.provider} read-only token is malformed (minimum 8 characters required).`,
        sandboxTokenBehavior: "fail",
      };
    }
  } else if (params.previousBehavior === "fail") {
    return {
      ok: false,
      code: "CONNECTION_FAILED",
      reason: `${params.provider} read-only connection failed during scheduled refresh.`,
      sandboxTokenBehavior: "fail",
    };
  } else if (params.previousBehavior === "expired") {
    return {
      ok: false,
      code: "TOKEN_EXPIRED",
      reason: `${params.provider} read-only authorization expired during refresh.`,
      sandboxTokenBehavior: "expired",
    };
  }

  // Optional live read-only Stripe call when explicitly enabled in production
  if (
    process.env.ENABLE_LIVE_CONNECTORS === "true" &&
    params.provider === "Stripe" &&
    token.startsWith("rk_live_")
  ) {
    try {
      const res = await fetch(
        "https://api.stripe.com/v1/balance_transactions?limit=25",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (!res.ok) {
        return {
          ok: false,
          code: res.status === 401 ? "TOKEN_EXPIRED" : "CONNECTION_FAILED",
          reason: `Stripe read-only API returned HTTP ${res.status}.`,
          sandboxTokenBehavior: res.status === 401 ? "expired" : "fail",
        };
      }
      const payload = (await res.json()) as {
        data?: Array<{ amount?: number; type?: string }>;
      };
      const chargeRows = (payload.data ?? []).filter(
        (tx) => tx.type === "charge" || tx.type === "payment"
      );
      const sampleTotal = chargeRows.reduce(
        (sum, tx) => sum + Math.max(0, Number(tx.amount ?? 0)) / 100,
        0
      );
      const revBaseline =
        params.baselineMetrics.find((m) => m.key === "REVENUE")?.value ?? 0;
      const custBaseline =
        params.baselineMetrics.find((m) => m.key === "CUSTOMERS")?.value ?? 0;

      return {
        ok: true,
        adapterMode: "live",
        accountHint: maskAccountIdentifier(params.accountIdentifier, "Stripe"),
        readOnlyScope: spec.readOnlyScope,
        sandboxTokenBehavior: "valid",
        metrics: [
          {
            key: "REVENUE",
            label: "Trailing 12m Revenue",
            value: sampleTotal > 0 ? Math.round(sampleTotal) : revBaseline,
            unit: "CURRENCY",
            currency: params.businessCurrency,
            source: "STRIPE",
          },
          {
            key: "CUSTOMERS",
            label: "Active Customers",
            value: Math.max(custBaseline, chargeRows.length),
            unit: "COUNT",
            currency: null,
            source: "STRIPE",
          },
        ],
      };
    } catch {
      return {
        ok: false,
        code: "CONNECTION_FAILED",
        reason: "Network error reaching Stripe read-only API.",
        sandboxTokenBehavior: "fail",
      };
    }
  }

  // Deterministic read-only sandbox adapter anchored cleanly around business metrics
  const seed = deterministicHash(
    `${params.provider}:${params.accountIdentifier.trim()}:${params.syncCount ?? 0}`
  );
  // Deterministic subtle adjustment (-1% to +2%) on refresh so auto-refresh updates can be observed cleanly
  const deltaFactor =
    (params.syncCount ?? 0) === 0 ? 1 : 0.99 + ((seed % 4) * 0.01);

  const baselineByKey = new Map(params.baselineMetrics.map((m) => [m.key, m]));
  const metrics: ConnectorSyncedMetric[] = [];

  if (spec.kind === "PAYMENT") {
    const baseRev = baselineByKey.get("REVENUE")?.value ?? 6_000_000;
    const revCurrency =
      baselineByKey.get("REVENUE")?.currency ?? params.businessCurrency;
    const baseCust = baselineByKey.get("CUSTOMERS")?.value ?? 120;

    metrics.push({
      key: "REVENUE",
      label: "Trailing 12m Revenue",
      value: Math.max(0, Math.round(baseRev * deltaFactor)),
      unit: "CURRENCY",
      currency: revCurrency,
      source: spec.source,
    });
    metrics.push({
      key: "CUSTOMERS",
      label: "Active Customers",
      value: Math.max(1, Math.round(baseCust * deltaFactor)),
      unit: "COUNT",
      currency: null,
      source: spec.source,
    });
  } else {
    const baseTraffic = baselineByKey.get("TRAFFIC")?.value ?? 18_000;
    metrics.push({
      key: "TRAFFIC",
      label: "Monthly Visitors",
      value: Math.max(0, Math.round(baseTraffic * deltaFactor)),
      unit: "COUNT",
      currency: null,
      source: spec.source,
    });
  }

  return {
    ok: true,
    adapterMode: "sandbox",
    accountHint: maskAccountIdentifier(params.accountIdentifier, params.provider),
    readOnlyScope: spec.readOnlyScope,
    sandboxTokenBehavior: "valid",
    metrics,
  };
}
