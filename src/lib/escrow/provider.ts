import type { CurrencyCode } from "@/lib/format/currency";

export const ESCROW_PROVIDERS = ["Escrow.com", "Castler Escrow"] as const;
export type EscrowProviderName = (typeof ESCROW_PROVIDERS)[number];

export type EscrowStatusValue =
  | "INITIATED"
  | "FUNDED"
  | "IN_REVIEW"
  | "RELEASED"
  | "DISPUTED"
  | "REFUNDED";

export interface EscrowProviderSpec {
  provider: EscrowProviderName;
  regulatorySummary: string;
  supportedCurrencies: readonly CurrencyCode[];
  depositInstructionTemplate: string;
}

export const ESCROW_PROVIDER_SPECS: Record<EscrowProviderName, EscrowProviderSpec> = {
  "Escrow.com": {
    provider: "Escrow.com",
    regulatorySummary:
      "Licensed third-party online escrow (DFPI / multi-currency M&A). Baton never holds funds.",
    supportedCurrencies: ["INR", "USD", "EUR", "GBP"],
    depositInstructionTemplate:
      "Buyer wires purchase consideration directly to Escrow.com segregated trust account. Seller receives funds only after two-sided Transfer confirmation.",
  },
  "Castler Escrow": {
    provider: "Castler Escrow",
    regulatorySummary:
      "RBI-regulated digital escrow partner for domestic INR M&A settlements. Baton never holds funds.",
    supportedCurrencies: ["INR"],
    depositInstructionTemplate:
      "Buyer deposits INR consideration via NEFT/RTGS into Castler Escrow virtual trust account. Release executes upon Buyer & Seller transfer sign-off.",
  },
};

export interface EscrowProviderInitiateResult {
  ok: true;
  adapterMode: "sandbox" | "live";
  provider: EscrowProviderName;
  externalRef: string;
  status: "INITIATED";
  depositInstructions: string;
  platformHoldsFunds: false;
}

export interface EscrowProviderFailure {
  ok: false;
  code: "PROVIDER_ERROR" | "UNSUPPORTED_CURRENCY";
  reason: string;
}

export async function initiateThirdPartyEscrow(params: {
  provider: EscrowProviderName;
  dealRoomId: string;
  amount: number;
  currency: CurrencyCode;
  buyerEmail: string;
  sellerEmail: string;
  businessTitle: string;
}): Promise<EscrowProviderInitiateResult | EscrowProviderFailure> {
  const spec = ESCROW_PROVIDER_SPECS[params.provider];
  if (!spec.supportedCurrencies.includes(params.currency)) {
    return {
      ok: false,
      code: "UNSUPPORTED_CURRENCY",
      reason: `${params.provider} supports ${spec.supportedCurrencies.join(", ")}. Select Escrow.com for ${params.currency} transactions.`,
    };
  }

  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      reason: "Escrow amount must be greater than zero.",
    };
  }

  // Optional live Escrow.com REST boundary when explicitly enabled in production
  if (
    process.env.ENABLE_LIVE_ESCROW === "true" &&
    params.provider === "Escrow.com" &&
    process.env.ESCROW_COM_API_KEY &&
    process.env.ESCROW_COM_EMAIL
  ) {
    try {
      const auth = Buffer.from(
        `${process.env.ESCROW_COM_EMAIL}:${process.env.ESCROW_COM_API_KEY}`
      ).toString("base64");
      const res = await fetch("https://api.escrow.com/2017-09-01/transaction", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currency: params.currency.toLowerCase(),
          description: `Baton acquisition: ${params.businessTitle} (Deal ${params.dealRoomId})`,
          parties: [
            { role: "buyer", customer: params.buyerEmail },
            { role: "seller", customer: params.sellerEmail },
          ],
          items: [
            {
              title: params.businessTitle,
              description: "Business & asset acquisition per executed Purchase Agreement",
              type: "domain_name",
              inspection_period: 259200,
              quantity: 1,
              schedule: [
                {
                  amount: params.amount,
                  payer_customer: params.buyerEmail,
                  beneficiary_customer: params.sellerEmail,
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        return {
          ok: false,
          code: "PROVIDER_ERROR",
          reason: `Escrow.com API returned HTTP ${res.status}.`,
        };
      }

      const payload = (await res.json()) as { id?: number | string };
      return {
        ok: true,
        adapterMode: "live",
        provider: params.provider,
        externalRef: `ESC-LIVE-${payload.id ?? Date.now()}`,
        status: "INITIATED",
        depositInstructions: spec.depositInstructionTemplate,
        platformHoldsFunds: false,
      };
    } catch {
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        reason: "Network error reaching Escrow.com API.",
      };
    }
  }

  const prefix = params.provider === "Escrow.com" ? "ESCCOM" : "CASTLER";
  const externalRef = `ESC-${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

  return {
    ok: true,
    adapterMode: "sandbox",
    provider: params.provider,
    externalRef,
    status: "INITIATED",
    depositInstructions: spec.depositInstructionTemplate,
    platformHoldsFunds: false,
  };
}

export async function confirmThirdPartyEscrowFunding(params: {
  provider: EscrowProviderName;
  externalRef: string;
  fundingReference?: string;
}): Promise<{ ok: true; status: "FUNDED"; providerConfirmationId: string } | EscrowProviderFailure> {
  const trimmedRef = params.externalRef.trim();
  if (!trimmedRef) {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      reason: "Missing external escrow transaction reference.",
    };
  }

  if (params.fundingReference && params.fundingReference.toLowerCase().includes("fail")) {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      reason: `${params.provider} rejected funding confirmation (insufficient or reversed wire reference).`,
    };
  }

  return {
    ok: true,
    status: "FUNDED",
    providerConfirmationId:
      params.fundingReference?.trim() || `${trimmedRef}-FUNDED`,
  };
}

export async function transitionThirdPartyEscrowReview(params: {
  provider: EscrowProviderName;
  externalRef: string;
}): Promise<{ ok: true; status: "IN_REVIEW" }> {
  void params;
  return {
    ok: true,
    status: "IN_REVIEW",
  };
}

export async function releaseThirdPartyEscrowFunds(params: {
  provider: EscrowProviderName;
  externalRef: string;
}): Promise<{ ok: true; status: "RELEASED"; settlementRef: string }> {
  return {
    ok: true,
    status: "RELEASED",
    settlementRef: `${params.externalRef}-RELEASED-${params.provider === "Escrow.com" ? "DFPI" : "RBI"}`,
  };
}

export async function flagThirdPartyEscrowDispute(params: {
  provider: EscrowProviderName;
  externalRef: string;
  disputeReason: string;
}): Promise<{ ok: true; status: "DISPUTED"; holdRef: string }> {
  void params.disputeReason;
  return {
    ok: true,
    status: "DISPUTED",
    holdRef: `${params.externalRef}-HOLD-${params.provider === "Escrow.com" ? "ESC" : "CST"}`,
  };
}

export async function resolveThirdPartyEscrowDispute(params: {
  provider: EscrowProviderName;
  externalRef: string;
  decision: "RESUME_TO_IN_REVIEW" | "RELEASE_TO_SELLER" | "REFUND_TO_BUYER";
  wasFunded: boolean;
}): Promise<{
  ok: true;
  nextStatus: "INITIATED" | "IN_REVIEW" | "RELEASED" | "REFUNDED";
  resolutionRef: string;
}> {
  if (params.decision === "RELEASE_TO_SELLER") {
    return {
      ok: true,
      nextStatus: "RELEASED",
      resolutionRef: `${params.externalRef}-ARB-RELEASE`,
    };
  }
  if (params.decision === "REFUND_TO_BUYER") {
    return {
      ok: true,
      nextStatus: "REFUNDED",
      resolutionRef: `${params.externalRef}-ARB-REFUND`,
    };
  }
  return {
    ok: true,
    nextStatus: params.wasFunded ? "IN_REVIEW" : "INITIATED",
    resolutionRef: `${params.externalRef}-ARB-RESUME`,
  };
}
