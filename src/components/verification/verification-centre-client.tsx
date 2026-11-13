"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Link2,
  RefreshCw,
  ShieldCheck,
  Unplug,
  UserCheck,
  Wallet,
} from "lucide-react";
import type { AuthSession } from "@/lib/auth/types";
import type {
  AnalyticsConnectorProvider,
  EvaluatedVerification,
  IdentityProvider,
  PaymentConnectorProvider,
  ProofOfFundsProvider,
} from "@/lib/domain/verification";
import { formatCurrency, type CurrencyCode } from "@/lib/format/currency";
import type {
  SellerBusinessConnectorSummary,
  VerificationCentreState,
  VerificationWithEvaluation,
} from "@/lib/verification/store";
import {
  CONNECTOR_PROVIDER_SPECS,
  IDENTITY_PROVIDER_SPECS,
  PROOF_OF_FUNDS_PROVIDER_SPECS,
} from "@/lib/verification/connectors";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardStateEmpty,
  CardStateError,
  CardStateLoading,
  CardTitle,
} from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function resolveStatusChipTone(
  evaluated: EvaluatedVerification,
  allowCautionAccent: boolean,
  allowRiskAccent: boolean
): StatusChipTone {
  switch (evaluated.effectiveState) {
    case "verified":
      return "verified";
    case "pending":
      return allowCautionAccent ? "pending" : "seller-reported";
    case "expired":
      return allowCautionAccent ? "caution" : "seller-reported";
    case "failed":
      return allowRiskAccent ? "risk" : "seller-reported";
    default:
      return "seller-reported";
  }
}

function formatDateTimeShort(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ConnectorSlotPanel({
  kindLabel,
  connector,
  allowCautionAccent,
  allowRiskAccent,
  busyId,
  onSync,
  onRevoke,
  onSelectForEdit,
}: {
  kindLabel: string;
  connector: VerificationWithEvaluation | null;
  allowCautionAccent: boolean;
  allowRiskAccent: boolean;
  busyId: string | null;
  onSync: (verificationId: string) => void;
  onRevoke: (verificationId: string) => void;
  onSelectForEdit: (connector: VerificationWithEvaluation) => void;
}) {
  if (!connector) {
    return (
      <div className="flex flex-col justify-between gap-4 rounded border border-mist bg-cloud p-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-16 font-semibold text-deep-navy">
              {kindLabel}
            </span>
            <StatusChip tone="seller-reported" label="Not connected" />
          </div>
          <p className="text-16 text-slate">
            Metrics in this group currently display as Seller-reported without a
            Verified mark.
          </p>
        </div>
      </div>
    );
  }

  const { record, evaluated } = connector;
  const isBusy = busyId === record.id;
  const tone = resolveStatusChipTone(
    evaluated,
    allowCautionAccent,
    allowRiskAccent
  );

  return (
    <div
      className={
        evaluated.isVerified
          ? "flex flex-col justify-between gap-4 rounded border border-verified-green bg-white p-4"
          : "flex flex-col justify-between gap-4 rounded border border-mist bg-cloud p-4"
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-16 font-semibold text-deep-navy">
            {kindLabel}: {record.provider}
          </span>
          <StatusChip
            tone={tone}
            emphasis={evaluated.isVerified ? "solid" : "outline"}
            label={evaluated.label}
          />
        </div>

        <dl className="grid grid-cols-1 gap-2 text-14 text-slate">
          <div>
            <dt className="inline">Account: </dt>
            <dd className="inline font-medium text-ink">
              {record.metadata.accountHint ?? record.provider}
            </dd>
          </div>
          <div>
            <dt className="inline">Status detail: </dt>
            <dd className="inline text-ink">
              {evaluated.lastVerifiedLabel ?? evaluated.detail}
            </dd>
          </div>
          {record.failureReason && !evaluated.isVerified ? (
            <div>
              <dt className="inline font-medium text-ink">Reason: </dt>
              <dd className="inline text-ink">{record.failureReason}</dd>
            </div>
          ) : null}
          <div>
            <dt className="inline">Expires: </dt>
            <dd className="inline tabular-figures text-ink">
              {formatDateTimeShort(record.expiresAt)}
            </dd>
          </div>
          <div>
            <dt className="inline">Auto-refresh cadence: </dt>
            <dd className="inline tabular-figures text-ink">
              Every {record.metadata.syncIntervalMinutes ?? 60} min
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-mist pt-3">
        <Button
          type="button"
          variant="secondary"
          disabled={isBusy || record.status === "REVOKED" || record.status === "FAILED"}
          loading={isBusy}
          loadingLabel="Syncing..."
          onClick={() => onSync(record.id)}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span>Refresh now</span>
        </Button>

        <Button
          type="button"
          variant="secondary"
          disabled={isBusy}
          onClick={() => onSelectForEdit(connector)}
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
          <span>Rotate / reconnect</span>
        </Button>

        {record.status !== "REVOKED" ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isBusy}
            onClick={() => onRevoke(record.id)}
          >
            <Unplug className="h-4 w-4" aria-hidden="true" />
            <span>Disconnect</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function VerificationCentreClient({
  session,
  initialState,
  initialTab,
  initialBusinessId,
  isSandboxMode,
}: {
  session: AuthSession | null;
  initialState: VerificationCentreState | null;
  initialTab?: "identity" | "connectors";
  initialBusinessId?: string;
  isSandboxMode: boolean;
}) {
  const isSellerOrAdmin = Boolean(
    session && (session.roles.includes("SELLER") || session.roles.includes("ADMIN"))
  );
  const isBuyerOrAdmin = Boolean(
    session && (session.roles.includes("BUYER") || session.roles.includes("ADMIN"))
  );

  const resolvedDefaultTab: "identity" | "connectors" =
    initialTab ??
    (initialBusinessId || (isSellerOrAdmin && !isBuyerOrAdmin)
      ? "connectors"
      : "identity");

  const [activeTab, setActiveTab] = React.useState<"identity" | "connectors">(
    resolvedDefaultTab
  );
  const [state, setState] = React.useState<VerificationCentreState | null>(
    initialState
  );
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Identity (KYC) form state
  const [idProvider, setIdProvider] = React.useState<IdentityProvider>("Persona");
  const [legalName, setLegalName] = React.useState(session?.name ?? "");
  const [country, setCountry] = React.useState("India");
  const [documentType, setDocumentType] = React.useState<
    "PAN" | "PASSPORT" | "NATIONAL_ID" | "DRIVERS_LICENSE"
  >("PAN");
  const [referenceLast4, setReferenceLast4] = React.useState("");
  const [roleContext, setRoleContext] = React.useState<"BUYER" | "SELLER">(
    isBuyerOrAdmin ? "BUYER" : "SELLER"
  );
  const [submittingIdentity, setSubmittingIdentity] = React.useState(false);

  // Proof of Funds form state
  const [pofProvider, setPofProvider] =
    React.useState<ProofOfFundsProvider>("Setu AA");
  const [pofAmount, setPofAmount] = React.useState("15000000");
  const [pofCurrency, setPofCurrency] = React.useState<CurrencyCode>("INR");
  const [institutionLabel, setInstitutionLabel] = React.useState("");
  const [attestationRef, setAttestationRef] = React.useState("");
  const [submittingPof, setSubmittingPof] = React.useState(false);

  // Account Connector form state
  const businesses = React.useMemo(
    () => state?.sellerBusinesses ?? [],
    [state?.sellerBusinesses]
  );
  const [selectedBusinessId, setSelectedBusinessId] = React.useState<string>(
    initialBusinessId &&
      businesses.some((b) => b.businessId === initialBusinessId)
      ? initialBusinessId
      : businesses[0]?.businessId ?? ""
  );
  const effectiveSelectedBusinessId = businesses.some(
    (b) => b.businessId === selectedBusinessId
  )
    ? selectedBusinessId
    : businesses[0]?.businessId ?? "";
  const [connectorKind, setConnectorKind] = React.useState<
    "PAYMENT" | "ANALYTICS"
  >("PAYMENT");
  const [connectorProvider, setConnectorProvider] = React.useState<
    PaymentConnectorProvider | AnalyticsConnectorProvider
  >("Stripe");
  const [accountIdentifier, setAccountIdentifier] = React.useState("");
  const [readOnlyToken, setReadOnlyToken] = React.useState("");
  const [syncIntervalMinutes, setSyncIntervalMinutes] = React.useState("60");
  const [submittingConnector, setSubmittingConnector] = React.useState(false);
  const [busyConnectorId, setBusyConnectorId] = React.useState<string | null>(
    null
  );
  const [refreshingAll, setRefreshingAll] = React.useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = React.useState(true);

  const reloadVerificationState = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/verification");
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? "Unable to load Verification Centre.");
        return;
      }
      setState(data);
    } catch {
      setLoadError("Network error while loading Verification Centre.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Periodic background auto-refresh when Connectors tab is open & enabled
  React.useEffect(() => {
    if (
      !session ||
      !isSellerOrAdmin ||
      activeTab !== "connectors" ||
      !autoRefreshEnabled
    ) {
      return;
    }

    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/verification/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false }),
        });
        if (res.ok) {
          const summary = await res.json();
          if (
            (summary.expiredCount ?? 0) > 0 ||
            (summary.refreshedCount ?? 0) > 0 ||
            (summary.failedCount ?? 0) > 0
          ) {
            await reloadVerificationState();
          }
        }
      } catch {
        // Silent background poll; user can trigger manual refresh cleanly
      }
    }, 60_000);

    return () => clearInterval(timer);
  }, [
    session,
    isSellerOrAdmin,
    activeTab,
    autoRefreshEnabled,
    reloadVerificationState,
  ]);

  if (!session) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Verification Centre
          </h1>
          <p className="max-w-[760px] text-16 text-slate">
            Complete regulated identity checks, proof of funds, and read-only
            payment and analytics connections.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Sign in to manage verifications</CardTitle>
            <CardDescription>
              Verification records are tied to your authenticated buyer or seller
              account and audited on every change.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded border border-mist bg-cloud p-4">
              <span className="text-16 font-semibold text-deep-navy">
                For Buyers
              </span>
              <p className="pt-2 text-16 text-ink">
                Submit Identity KYC (Persona / Digio) and Proof of Funds (Setu AA /
                Plaid Assets) to unlock Deal Room Data access after signing an NDA.
              </p>
            </div>
            <div className="rounded border border-mist bg-cloud p-4">
              <span className="text-16 font-semibold text-deep-navy">
                For Sellers
              </span>
              <p className="pt-2 text-16 text-ink">
                Connect read-only Stripe, Razorpay, GA4, or Plausible sources to
                display Verified metrics with live refresh timestamps.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button asChild variant="primary">
              <Link href="/auth/signin">Sign in &amp; verify 2FA</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  async function handleIdentitySubmit(event: React.FormEvent) {
    event.preventDefault();
    setActionError(null);
    setStatusMessage(null);

    if (legalName.trim().length < 2) {
      setActionError("Enter your full legal name (at least 2 characters).");
      return;
    }
    if (!/^[a-zA-Z0-9]{4}$/.test(referenceLast4.trim())) {
      setActionError(
        "Enter only the last 4 alphanumeric characters of your ID document."
      );
      return;
    }

    setSubmittingIdentity(true);
    try {
      const res = await fetch("/api/verification/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: idProvider,
          legalName: legalName.trim(),
          country: country.trim(),
          documentType,
          referenceLast4: referenceLast4.trim().toUpperCase(),
          roleContext,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Unable to submit identity verification.");
        return;
      }

      setReferenceLast4("");
      setStatusMessage(
        `Submitted ${idProvider} identity verification for compliance review.`
      );
      await reloadVerificationState();
    } catch {
      setActionError("Network error while submitting identity verification.");
    } finally {
      setSubmittingIdentity(false);
    }
  }

  async function handleProofOfFundsSubmit(event: React.FormEvent) {
    event.preventDefault();
    setActionError(null);
    setStatusMessage(null);

    const parsedAmount = Number(pofAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setActionError("Enter a valid Proof of Funds amount greater than zero.");
      return;
    }
    if (institutionLabel.trim().length < 3) {
      setActionError("Enter your bank or institutional custody label.");
      return;
    }
    if (attestationRef.trim().length < 4) {
      setActionError("Enter the consent or read-only attestation reference.");
      return;
    }

    setSubmittingPof(true);
    try {
      const res = await fetch("/api/verification/proof-of-funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: pofProvider,
          amount: parsedAmount,
          currency: pofCurrency,
          institutionLabel: institutionLabel.trim(),
          attestationRef: attestationRef.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Unable to submit Proof of Funds.");
        return;
      }

      setAttestationRef("");
      setStatusMessage(
        `Submitted ${pofProvider} Proof of Funds attestation for review.`
      );
      await reloadVerificationState();
    } catch {
      setActionError("Network error while submitting Proof of Funds.");
    } finally {
      setSubmittingPof(false);
    }
  }

  function handleConnectorKindChange(nextKind: "PAYMENT" | "ANALYTICS") {
    setConnectorKind(nextKind);
    setConnectorProvider(nextKind === "PAYMENT" ? "Stripe" : "GA4");
  }

  async function handleConnectAccount(event: React.FormEvent) {
    event.preventDefault();
    setActionError(null);
    setStatusMessage(null);

    if (!effectiveSelectedBusinessId) {
      setActionError("Select one of your business listings first.");
      return;
    }
    if (accountIdentifier.trim().length < 3) {
      setActionError("Enter the read-only account or analytics property ID.");
      return;
    }
    if (readOnlyToken.trim().length < 4) {
      setActionError("Enter a read-only token or OAuth grant.");
      return;
    }

    setSubmittingConnector(true);
    try {
      const res = await fetch("/api/verification/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: effectiveSelectedBusinessId,
          connectorKind,
          provider: connectorProvider,
          accountIdentifier: accountIdentifier.trim(),
          readOnlyToken: readOnlyToken.trim(),
          syncIntervalMinutes: Number(syncIntervalMinutes),
        }),
      });
      const data = await res.json();
      await reloadVerificationState();
      if (!res.ok) {
        setActionError(
          data.error ??
            "Read-only connection check failed. Any previous Verified mark has been removed."
        );
        return;
      }

      const ev: EvaluatedVerification | undefined =
        data.verification?.evaluated;
      if (data.connected === false || (ev && !ev.isVerified)) {
        setActionError(
          data.error ??
            `${connectorProvider} credential check returned "${ev?.label ?? "Connection failed"}". Verified mark removed automatically.`
        );
        return;
      }

      setReadOnlyToken("");
      setStatusMessage(
        `Connected read-only ${connectorProvider} (${ev?.lastVerifiedLabel ?? "Last verified just now"}). Synced ${data.syncedMetrics?.length ?? 0} verified metrics.`
      );
    } catch {
      setActionError("Network error while connecting read-only account.");
    } finally {
      setSubmittingConnector(false);
    }
  }

  async function handleSyncSingle(verificationId: string) {
    setBusyConnectorId(verificationId);
    setActionError(null);
    setStatusMessage(null);
    try {
      const res = await fetch(
        `/api/verification/connectors/${verificationId}/sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
        }
      );
      const data = await res.json();
      await reloadVerificationState();
      if (!res.ok) {
        setActionError(data.error ?? "Unable to refresh connector.");
        return;
      }
      const ev: EvaluatedVerification | undefined = data.verification?.evaluated;
      if (ev && !ev.isVerified) {
        setActionError(
          `${data.verification.record.provider} status changed to "${ev.label}". Verified mark removed automatically.`
        );
      } else {
        setStatusMessage(
          `Refreshed ${data.verification?.record?.provider ?? "connector"} (${ev?.lastVerifiedLabel ?? "Last verified just now"}).`
        );
      }
    } catch {
      setActionError("Network error while refreshing connector.");
    } finally {
      setBusyConnectorId(null);
    }
  }

  async function handleRevokeSingle(verificationId: string) {
    setBusyConnectorId(verificationId);
    setActionError(null);
    setStatusMessage(null);
    try {
      const res = await fetch(
        `/api/verification/connectors/${verificationId}/revoke`,
        { method: "POST" }
      );
      const data = await res.json();
      await reloadVerificationState();
      if (!res.ok) {
        setActionError(data.error ?? "Unable to disconnect account.");
        return;
      }
      setStatusMessage(
        `Disconnected ${data.verification?.record?.provider ?? "connector"} and removed its Verified mark.`
      );
    } catch {
      setActionError("Network error while disconnecting account.");
    } finally {
      setBusyConnectorId(null);
    }
  }

  async function handleRefreshAllDue() {
    setRefreshingAll(true);
    setActionError(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/verification/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      await reloadVerificationState();
      if (!res.ok) {
        setActionError(data.error ?? "Unable to auto-refresh vitals.");
        return;
      }
      setStatusMessage(
        `Auto-refresh completed: ${data.refreshedCount ?? 0} verified sources refreshed, ${data.expiredCount ?? 0} expired, ${data.failedCount ?? 0} failed.`
      );
    } catch {
      setActionError("Network error while running auto-refresh.");
    } finally {
      setRefreshingAll(false);
    }
  }

  function handleSelectConnectorForEdit(
    businessId: string,
    connector: VerificationWithEvaluation
  ) {
    const kind =
      connector.record.type === "ANALYTICS_CONNECTOR" ? "ANALYTICS" : "PAYMENT";
    setSelectedBusinessId(businessId);
    setConnectorKind(kind);
    setConnectorProvider(
      connector.record.provider as
        | PaymentConnectorProvider
        | AnalyticsConnectorProvider
    );
    setAccountIdentifier(connector.record.metadata.accountIdentifier ?? "");
    setReadOnlyToken("");
    setStatusMessage(
      `Loaded ${connector.record.provider} into the connection form below. Enter a new or updated read-only token to reconnect or test credentials.`
    );
  }

  // Compute strict 3-color-rule allowances per tab
  const identityStates: EvaluatedVerification[] = [
    state?.identity?.evaluated,
    state?.proofOfFunds?.evaluated,
  ].filter((x): x is EvaluatedVerification => Boolean(x));

  const identityTabHasVerified = identityStates.some((e) => e.isVerified);
  const identityTabHasFailed = identityStates.some(
    (e) => e.effectiveState === "failed"
  );
  const identityTabHasPendingOrExpired = identityStates.some(
    (e) => e.effectiveState === "pending" || e.effectiveState === "expired"
  );
  const allowIdentityCaution =
    !identityTabHasVerified && !identityTabHasFailed;
  const allowIdentityRisk =
    !identityTabHasVerified && !identityTabHasPendingOrExpired;

  const connectorStates: EvaluatedVerification[] = businesses.flatMap((b) =>
    [b.paymentConnector?.evaluated, b.analyticsConnector?.evaluated].filter(
      (x): x is EvaluatedVerification => Boolean(x)
    )
  );
  const connTabHasVerified = connectorStates.some((e) => e.isVerified);
  const connTabHasFailed = connectorStates.some(
    (e) => e.effectiveState === "failed"
  );
  const connTabHasPendingOrExpired = connectorStates.some(
    (e) => e.effectiveState === "pending" || e.effectiveState === "expired"
  );
  const allowConnCaution = !connTabHasVerified && !connTabHasFailed;
  const allowConnRisk = !connTabHasVerified && !connTabHasPendingOrExpired;

  const hasNonRedSemanticOnActiveTab =
    activeTab === "identity"
      ? identityTabHasVerified || identityTabHasPendingOrExpired
      : connTabHasVerified || connTabHasPendingOrExpired;

  const activeSpec = CONNECTOR_PROVIDER_SPECS[connectorProvider];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Verification Centre
          </h1>
          <p className="max-w-[760px] text-16 text-slate">
            Manage regulated identity verification, buyer proof of funds, and
            read-only payment and analytics connectors. Expired or failed
            records lose their Verified mark automatically.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          loading={loading}
          loadingLabel="Refreshing..."
          onClick={() => void reloadVerificationState()}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span>Reload status</span>
        </Button>
      </div>

      {statusMessage ? (
        <div
          role="status"
          className="rounded border border-mist bg-white p-4 text-16 font-medium text-deep-navy"
        >
          {statusMessage}
        </div>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className={
            hasNonRedSemanticOnActiveTab
              ? "flex items-start gap-2 rounded border border-deep-navy bg-white p-4 text-16 font-medium text-deep-navy"
              : "flex items-start gap-2 rounded border border-brick-red bg-white p-4 text-16 font-medium text-brick-red"
          }
        >
          <AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      ) : null}

      {state && state.notifications.length > 0 ? (
        <Card className="bg-white">
          <CardHeader>
            <CardTitle as="h2">Recent verification alerts</CardTitle>
            <CardDescription>
              Status changes, expiry removals, and reviewer decisions for your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {state.notifications.slice(0, 5).map((n) => (
                <li
                  key={n.id}
                  className="flex flex-col gap-1 rounded border border-mist bg-cloud p-4"
                >
                  <span className="text-14 font-semibold text-deep-navy">
                    {n.title}
                  </span>
                  <span className="text-16 text-ink">{n.body}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {loading && !state ? (
        <CardStateLoading
          title="Loading Verification Centre"
          description="Checking your KYC, proof of funds, and connector expiration dates."
        />
      ) : loadError ? (
        <CardStateError
          message={loadError}
          onRetry={() => void reloadVerificationState()}
        />
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            setActiveTab(v === "connectors" ? "connectors" : "identity")
          }
        >
          <TabsList aria-label="Verification Centre sections">
            <TabsTrigger value="identity">
              Identity &amp; Proof of Funds
            </TabsTrigger>
            <TabsTrigger value="connectors">
              Payment &amp; Analytics Connectors ({businesses.length})
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: IDENTITY & PROOF OF FUNDS */}
          <TabsContent value="identity">
            <div className="flex flex-col gap-6">
              {isBuyerOrAdmin && state ? (
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck
                          className={
                            state.buyerDataAccess.allowed
                              ? "h-5 w-5 text-verified-green"
                              : "h-5 w-5 text-trust-blue"
                          }
                          aria-hidden="true"
                        />
                        <CardTitle as="h2">
                          Deal Room Data Access readiness
                        </CardTitle>
                      </div>
                      <StatusChip
                        tone={
                          state.buyerDataAccess.allowed
                            ? "verified"
                            : "seller-reported"
                        }
                        emphasis={
                          state.buyerDataAccess.allowed ? "solid" : "outline"
                        }
                        label={
                          state.buyerDataAccess.allowed
                            ? "Ready for Data access"
                            : "Verification incomplete"
                        }
                      />
                    </div>
                    <CardDescription>
                      {state.buyerDataAccess.reason}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : null}

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Identity KYC Card */}
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <UserCheck
                          className="h-5 w-5 text-trust-blue"
                          aria-hidden="true"
                        />
                        <CardTitle as="h2">Identity verification (KYC)</CardTitle>
                      </div>
                      {state?.identity ? (
                        <StatusChip
                          tone={resolveStatusChipTone(
                            state.identity.evaluated,
                            allowIdentityCaution,
                            allowIdentityRisk
                          )}
                          emphasis={
                            state.identity.evaluated.isVerified
                              ? "solid"
                              : "outline"
                          }
                          label={state.identity.evaluated.label}
                        />
                      ) : (
                        <StatusChip
                          tone="seller-reported"
                          label="Not submitted"
                        />
                      )}
                    </div>
                    <CardDescription>
                      Required before accessing buyer Data access stages or
                      earning an Identity-verified Buyer badge in listing Q&amp;A.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="flex flex-col gap-6">
                    {state?.identity ? (
                      <div className="rounded border border-mist bg-cloud p-4">
                        <dl className="grid grid-cols-1 gap-2 text-14 text-slate">
                          <div>
                            <dt className="inline">Provider: </dt>
                            <dd className="inline font-medium text-ink">
                              {state.identity.record.provider}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">Status: </dt>
                            <dd className="inline text-ink">
                              {state.identity.evaluated.lastVerifiedLabel ??
                                state.identity.evaluated.detail}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">Masked ID ref: </dt>
                            <dd className="inline font-medium text-ink">
                              {state.identity.record.metadata.documentType ??
                                "ID"}{" "}
                              {state.identity.record.metadata.maskedReference ??
                                "****"}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">Expires: </dt>
                            <dd className="inline tabular-figures text-ink">
                              {formatDateTimeShort(
                                state.identity.record.expiresAt
                              )}
                            </dd>
                          </div>
                          {state.identity.record.failureReason ? (
                            <div>
                              <dt className="inline font-medium text-ink">
                                Note:{" "}
                              </dt>
                              <dd className="inline text-ink">
                                {state.identity.record.failureReason}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>
                    ) : (
                      <div className="rounded border border-mist bg-cloud p-4">
                        <p className="text-16 text-ink">
                          No identity verification submitted yet. Submit via a
                          regulated provider below; full ID numbers are never
                          stored.
                        </p>
                      </div>
                    )}

                    <form
                      onSubmit={handleIdentitySubmit}
                      className="flex flex-col gap-4"
                    >
                      <Select
                        label="Regulated KYC provider"
                        value={idProvider}
                        onChange={(e) =>
                          setIdProvider(e.target.value as IdentityProvider)
                        }
                      >
                        {IDENTITY_PROVIDER_SPECS.map((spec) => (
                          <option key={spec.provider} value={spec.provider}>
                            {spec.label}
                          </option>
                        ))}
                      </Select>

                      <Input
                        label="Full legal name"
                        required
                        value={legalName}
                        onChange={(e) => setLegalName(e.target.value)}
                        placeholder="As shown on government ID"
                      />

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Input
                          label="Country of residence"
                          required
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                        />
                        <Select
                          label="Document type"
                          value={documentType}
                          onChange={(e) =>
                            setDocumentType(
                              e.target.value as
                                | "PAN"
                                | "PASSPORT"
                                | "NATIONAL_ID"
                                | "DRIVERS_LICENSE"
                            )
                          }
                        >
                          <option value="PAN">PAN Card</option>
                          <option value="PASSPORT">Passport</option>
                          <option value="NATIONAL_ID">
                            National ID / Aadhaar
                          </option>
                          <option value="DRIVERS_LICENSE">
                            Driver&apos;s License
                          </option>
                        </Select>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Input
                          label="Last 4 characters of ID"
                          required
                          maxLength={4}
                          value={referenceLast4}
                          onChange={(e) => setReferenceLast4(e.target.value)}
                          placeholder="e.g. 482F"
                          helperText="Only masked last 4 characters are stored."
                        />

                        {isBuyerOrAdmin && isSellerOrAdmin ? (
                          <Select
                            label="Profile role"
                            value={roleContext}
                            onChange={(e) =>
                              setRoleContext(
                                e.target.value as "BUYER" | "SELLER"
                              )
                            }
                          >
                            <option value="BUYER">Buyer profile</option>
                            <option value="SELLER">Seller profile</option>
                          </Select>
                        ) : null}
                      </div>

                      <div className="flex justify-end pt-2">
                        <Button
                          type="submit"
                          variant="primary"
                          loading={submittingIdentity}
                          loadingLabel="Submitting KYC..."
                        >
                          Submit identity check
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>

                {/* Proof of Funds Card */}
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Wallet
                          className="h-5 w-5 text-trust-blue"
                          aria-hidden="true"
                        />
                        <CardTitle as="h2">Proof of Funds (Buyers)</CardTitle>
                      </div>
                      {state?.proofOfFunds ? (
                        <StatusChip
                          tone={resolveStatusChipTone(
                            state.proofOfFunds.evaluated,
                            allowIdentityCaution,
                            allowIdentityRisk
                          )}
                          emphasis={
                            state.proofOfFunds.evaluated.isVerified
                              ? "solid"
                              : "outline"
                          }
                          label={state.proofOfFunds.evaluated.label}
                        />
                      ) : (
                        <StatusChip
                          tone="seller-reported"
                          label="Not submitted"
                        />
                      )}
                    </div>
                    <CardDescription>
                      Verify liquid acquisition capacity via read-only Account
                      Aggregator or institutional asset attestation (30-day
                      validity).
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="flex flex-col gap-6">
                    {!isBuyerOrAdmin ? (
                      <CardStateEmpty
                        title="Buyer role required for Proof of Funds"
                        description="Proof of Funds verification is required only for Buyer accounts entering Deal Room Data access."
                      />
                    ) : (
                      <>
                        {state?.proofOfFunds ? (
                          <div className="rounded border border-mist bg-cloud p-4">
                            <dl className="grid grid-cols-1 gap-2 text-14 text-slate">
                              <div>
                                <dt className="inline">Provider: </dt>
                                <dd className="inline font-medium text-ink">
                                  {state.proofOfFunds.record.provider}
                                </dd>
                              </div>
                              <div>
                                <dt className="inline">Attested capacity: </dt>
                                <dd className="inline font-semibold text-deep-navy tabular-figures">
                                  {state.proofOfFunds.record.metadata
                                    .declaredAmount
                                    ? formatCurrency(
                                        state.proofOfFunds.record.metadata
                                          .declaredAmount,
                                        {
                                          currency:
                                            state.proofOfFunds.record.metadata
                                              .currency ?? "INR",
                                          compact: true,
                                        }
                                      )
                                    : "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="inline">Institution: </dt>
                                <dd className="inline text-ink">
                                  {state.proofOfFunds.record.metadata
                                    .institutionLabel ?? "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="inline">Status: </dt>
                                <dd className="inline text-ink">
                                  {state.proofOfFunds.evaluated
                                    .lastVerifiedLabel ??
                                    state.proofOfFunds.evaluated.detail}
                                </dd>
                              </div>
                              <div>
                                <dt className="inline">Expires: </dt>
                                <dd className="inline tabular-figures text-ink">
                                  {formatDateTimeShort(
                                    state.proofOfFunds.record.expiresAt
                                  )}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        ) : (
                          <div className="rounded border border-mist bg-cloud p-4">
                            <p className="text-16 text-ink">
                              No Proof of Funds submitted yet. Submit a read-only
                              balance attestation below for Admin compliance
                              review.
                            </p>
                          </div>
                        )}

                        <form
                          onSubmit={handleProofOfFundsSubmit}
                          className="flex flex-col gap-4"
                        >
                          <Select
                            label="Proof of Funds provider"
                            value={pofProvider}
                            onChange={(e) =>
                              setPofProvider(
                                e.target.value as ProofOfFundsProvider
                              )
                            }
                          >
                            {PROOF_OF_FUNDS_PROVIDER_SPECS.map((spec) => (
                              <option key={spec.provider} value={spec.provider}>
                                {spec.label}
                              </option>
                            ))}
                          </Select>

                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Input
                              label="Verified liquid capacity"
                              type="number"
                              required
                              min={1}
                              prefixText={pofCurrency}
                              value={pofAmount}
                              onChange={(e) => setPofAmount(e.target.value)}
                            />
                            <Select
                              label="Currency"
                              value={pofCurrency}
                              onChange={(e) =>
                                setPofCurrency(e.target.value as CurrencyCode)
                              }
                            >
                              <option value="INR">INR (₹)</option>
                              <option value="USD">USD ($)</option>
                              <option value="EUR">EUR (€)</option>
                              <option value="GBP">GBP (£)</option>
                            </Select>
                          </div>

                          <Input
                            label="Institution / account label"
                            required
                            value={institutionLabel}
                            onChange={(e) =>
                              setInstitutionLabel(e.target.value)
                            }
                            placeholder="e.g. HDFC Corporate Current ****4821"
                          />

                          <Input
                            label="Read-only consent / attestation reference"
                            required
                            value={attestationRef}
                            onChange={(e) => setAttestationRef(e.target.value)}
                            placeholder="e.g. SETU-AA-CONSENT-9941"
                            helperText="Never enter banking passwords or PINs."
                          />

                          <div className="flex justify-end pt-2">
                            <Button
                              type="submit"
                              variant="primary"
                              loading={submittingPof}
                              loadingLabel="Submitting Proof of Funds..."
                            >
                              Submit Proof of Funds
                            </Button>
                          </div>
                        </form>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: PAYMENT & ANALYTICS CONNECTORS */}
          <TabsContent value="connectors">
            {!isSellerOrAdmin ? (
              <CardStateEmpty
                title="Seller account required for business connectors"
                description="Payment (Stripe, Razorpay) and Analytics (GA4, Plausible) connectors are managed by the business Seller. Switch to a Seller account to connect listing vitals."
                actionLabel="Browse verified listings"
                actionHref="/listings"
              />
            ) : (
              <div className="flex flex-col gap-6">
                {/* Auto-refresh bar */}
                <Card>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-16 font-semibold text-deep-navy">
                        Live vitals auto-refresh
                      </span>
                      <p className="text-16 text-slate">
                        Connected metrics sync automatically on their configured
                        cadence and strip the Verified mark immediately if
                        credentials fail or expire.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded border border-mist bg-cloud px-4 py-2 text-16 font-medium text-deep-navy">
                        <input
                          type="checkbox"
                          checked={autoRefreshEnabled}
                          onChange={(e) =>
                            setAutoRefreshEnabled(e.target.checked)
                          }
                          className="h-4 w-4 accent-trust-blue"
                        />
                        <span>Auto-refresh active (60s)</span>
                      </label>

                      <Button
                        type="button"
                        variant="action"
                        loading={refreshingAll}
                        loadingLabel="Refreshing vitals..."
                        onClick={() => void handleRefreshAllDue()}
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        <span>Auto-refresh all vitals</span>
                      </Button>
                    </div>
                  </div>
                </Card>

                {/* Business Connector List */}
                {businesses.length === 0 ? (
                  <CardStateEmpty
                    title="No seller listings found"
                    description="Create a business listing first, then return here to connect read-only Stripe, Razorpay, GA4, or Plausible metrics."
                    actionLabel="Create a listing"
                    actionHref="/sell"
                  />
                ) : (
                  <div className="flex flex-col gap-6">
                    {businesses.map((biz: SellerBusinessConnectorSummary) => (
                      <Card key={biz.businessId}>
                        <CardHeader>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Building2
                                className="h-5 w-5 text-trust-blue"
                                aria-hidden="true"
                              />
                              <CardTitle as="h2">{biz.teaserTitle}</CardTitle>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-14 font-medium text-slate tabular-figures">
                                {biz.verifiedMetricsCount} /{" "}
                                {biz.totalMetricsCount} vitals verified
                              </span>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                          <ConnectorSlotPanel
                            kindLabel="Payment source"
                            connector={biz.paymentConnector}
                            allowCautionAccent={allowConnCaution}
                            allowRiskAccent={allowConnRisk}
                            busyId={busyConnectorId}
                            onSync={(id) => void handleSyncSingle(id)}
                            onRevoke={(id) => void handleRevokeSingle(id)}
                            onSelectForEdit={(conn) =>
                              handleSelectConnectorForEdit(biz.businessId, conn)
                            }
                          />
                          <ConnectorSlotPanel
                            kindLabel="Analytics source"
                            connector={biz.analyticsConnector}
                            allowCautionAccent={allowConnCaution}
                            allowRiskAccent={allowConnRisk}
                            busyId={busyConnectorId}
                            onSync={(id) => void handleSyncSingle(id)}
                            onRevoke={(id) => void handleRevokeSingle(id)}
                            onSelectForEdit={(conn) =>
                              handleSelectConnectorForEdit(biz.businessId, conn)
                            }
                          />
                        </CardContent>

                        <CardFooter>
                          <span className="text-14 text-slate">
                            Listing status: {biz.status.replace("_", " ")}
                          </span>
                          <Button asChild variant="link">
                            <Link href={`/listings/${biz.slug}`}>
                              <span>Inspect live vitals strip</span>
                              <ExternalLink
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </Link>
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Connect / Reconnect Read-Only Source Form */}
                {businesses.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle as="h2">
                        Connect or update a read-only data source
                      </CardTitle>
                      <CardDescription>
                        Link at least one payment provider (Stripe or Razorpay)
                        and one analytics provider (GA4 or Plausible). Raw
                        tokens are never stored in listing responses.
                      </CardDescription>
                    </CardHeader>

                    <CardContent>
                      <form
                        onSubmit={handleConnectAccount}
                        className="flex flex-col gap-6"
                      >
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <Select
                            label="Target listing"
                            value={effectiveSelectedBusinessId}
                            onChange={(e) =>
                              setSelectedBusinessId(e.target.value)
                            }
                          >
                            {businesses.map((b) => (
                              <option key={b.businessId} value={b.businessId}>
                                {b.teaserTitle}
                              </option>
                            ))}
                          </Select>

                          <Select
                            label="Source category"
                            value={connectorKind}
                            onChange={(e) =>
                              handleConnectorKindChange(
                                e.target.value as "PAYMENT" | "ANALYTICS"
                              )
                            }
                          >
                            <option value="PAYMENT">
                              Payment &amp; Billing (Revenue &amp; Customers)
                            </option>
                            <option value="ANALYTICS">
                              Web Analytics (Monthly Traffic)
                            </option>
                          </Select>

                          <Select
                            label="Read-only provider"
                            value={connectorProvider}
                            onChange={(e) =>
                              setConnectorProvider(
                                e.target.value as
                                  | PaymentConnectorProvider
                                  | AnalyticsConnectorProvider
                              )
                            }
                          >
                            {connectorKind === "PAYMENT" ? (
                              <>
                                <option value="Stripe">Stripe (Read-only)</option>
                                <option value="Razorpay">
                                  Razorpay (Read-only)
                                </option>
                              </>
                            ) : (
                              <>
                                <option value="GA4">
                                  Google Analytics 4 (GA4)
                                </option>
                                <option value="Plausible">
                                  Plausible Analytics
                                </option>
                              </>
                            )}
                          </Select>

                          <Select
                            label="Auto-refresh interval"
                            value={syncIntervalMinutes}
                            onChange={(e) =>
                              setSyncIntervalMinutes(e.target.value)
                            }
                          >
                            <option value="15">Every 15 minutes</option>
                            <option value="60">Every 60 minutes</option>
                            <option value="360">Every 6 hours</option>
                          </Select>

                          <Input
                            label="Account or property ID"
                            required
                            value={accountIdentifier}
                            onChange={(e) =>
                              setAccountIdentifier(e.target.value)
                            }
                            placeholder={activeSpec.placeholderAccountId}
                          />

                          <Input
                            label="Read-only restricted key / OAuth token"
                            type="password"
                            required
                            value={readOnlyToken}
                            onChange={(e) => setReadOnlyToken(e.target.value)}
                            placeholder={activeSpec.placeholderToken}
                            helperText={
                              isSandboxMode
                                ? `Sandbox testing: use "${activeSpec.placeholderToken}" to verify, or include "fail" / "expired" to test automatic Verified removal.`
                                : "Supply a strictly read-only restricted key."
                            }
                          />
                        </div>

                        <div className="rounded border border-mist bg-cloud p-4">
                          <div className="flex items-start gap-3">
                            <CheckCircle2
                              className="mt-1 h-4 w-4 shrink-0 text-trust-blue"
                              aria-hidden="true"
                            />
                            <div className="flex flex-col gap-1">
                              <span className="text-14 font-semibold text-deep-navy">
                                Strict read-only scope:{" "}
                                {activeSpec.readOnlyScope}
                              </span>
                              <p className="text-16 text-ink">
                                Baton can only read aggregate
                                metrics ({activeSpec.metricKeys.join(", ")}) and
                                never holds funds or mutates provider settings.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            variant="primary"
                            loading={submittingConnector}
                            loadingLabel="Verifying connection..."
                          >
                            Connect read-only source
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
