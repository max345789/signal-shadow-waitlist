"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  History,
  Lock,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type {
  DealChecklistItemView,
  DealDocumentView,
  DealMessageView,
  DealOfferView,
  DealRoomView,
} from "@/lib/domain/deal-room";
import {
  ALLOWED_STAGE_TRANSITIONS,
  DEAL_STAGE_DEFINITIONS,
  type DealStageType,
} from "@/lib/domain/deal-stages";
import { formatCurrency, type CurrencyCode } from "@/lib/format/currency";
import { StageTracker, type StageTrackerItem } from "@/components/domain/stage-tracker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardStateEmpty,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

export function DealRoomClient({
  initialDealRoom,
}: {
  initialDealRoom: DealRoomView;
}) {
  const [dealRoom, setDealRoom] = React.useState<DealRoomView>(initialDealRoom);
  const [activeTab, setActiveTab] = React.useState<string>("overview");
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  // NDA e-sign state
  const [ndaSignerName, setNdaSignerName] = React.useState(
    initialDealRoom.viewerRole === "BUYER"
      ? initialDealRoom.buyerName
      : initialDealRoom.viewerRole === "SELLER"
        ? initialDealRoom.sellerName
        : ""
  );
  const [ndaAccepted, setNdaAccepted] = React.useState(false);

  // Purchase agreement e-sign state
  const [paSignerName, setPaSignerName] = React.useState(
    initialDealRoom.viewerRole === "BUYER"
      ? initialDealRoom.buyerName
      : initialDealRoom.viewerRole === "SELLER"
        ? initialDealRoom.sellerName
        : ""
  );
  const [paAccepted, setPaAccepted] = React.useState(false);

  // Threaded chat state
  const [messageBody, setMessageBody] = React.useState("");
  const [replyToId, setReplyToId] = React.useState<string | null>(null);

  // Document vault upload & preview state
  const [docTitle, setDocTitle] = React.useState("");
  const [docCategory, setDocCategory] = React.useState<
    "FINANCIAL" | "LEGAL" | "TECHNICAL" | "CUSTOMER" | "OTHER"
  >("FINANCIAL");
  const [docTextFallback, setDocTextFallback] = React.useState("");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewDocTitle, setPreviewDocTitle] = React.useState("");
  const [previewWatermark, setPreviewWatermark] = React.useState("");
  const [previewBody, setPreviewBody] = React.useState("");
  const [previewDownloadUrl, setPreviewDownloadUrl] = React.useState<string | null>(
    null
  );

  // Offer state
  const [offerAmount, setOfferAmount] = React.useState(
    String(initialDealRoom.askingPrice)
  );
  const [offerCurrency, setOfferCurrency] = React.useState<CurrencyCode>(
    initialDealRoom.currency
  );
  const [offerTerms, setOfferTerms] = React.useState("");
  const [counterDrafts, setCounterDrafts] = React.useState<
    Record<string, { amount: string; terms: string }>
  >({});

  const refreshDealRoom = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/deal-rooms/${dealRoom.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.dealRoom) {
          setDealRoom(data.dealRoom);
        }
      }
    } catch {
      // Silent background sync error; user can retry manually
    }
  }, [dealRoom.id]);

  // Deferred SSE subscription (starts 1000ms after mount so networkidle settles cleanly)
  React.useEffect(() => {
    let source: EventSource | null = null;
    const timer = setTimeout(() => {
      if (typeof EventSource === "undefined") return;
      source = new EventSource(`/api/deal-rooms/${dealRoom.id}/events`);
      source.addEventListener("deal-update", () => {
        void refreshDealRoom();
      });
    }, 1000);

    return () => {
      clearTimeout(timer);
      if (source) {
        source.close();
      }
    };
  }, [dealRoom.id, refreshDealRoom]);

  const hasActiveError = Boolean(actionError);
  const allowGreen = !hasActiveError;

  function verifiedTone(isPositive: boolean): StatusChipTone {
    if (isPositive) {
      return allowGreen ? "verified" : "neutral";
    }
    return "seller-reported";
  }

  const trackerStages: StageTrackerItem[] = dealRoom.stages.map((s) => ({
    stage: s.stage,
    status: s.status,
    ownerRole: s.ownerRole,
    requiredAction: s.requiredAction,
    timestampLabel: s.completedAt
      ? `Completed ${formatTimestamp(s.completedAt)}`
      : s.status === "ACTIVE"
        ? `Active since ${formatTimestamp(s.updatedAt)}`
        : null,
  }));

  const allowedNextStages = ALLOWED_STAGE_TRANSITIONS[dealRoom.currentStage] ?? [];

  async function handleStageTransition(toStage: DealStageType) {
    setBusyAction(`stage:${toStage}`);
    setActionError(null);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/deal-rooms/${dealRoom.id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Unable to transition stage.");
        return;
      }
      setDealRoom(data.dealRoom);
      setStatusMessage(
        `Stage updated to ${DEAL_STAGE_DEFINITIONS[toStage].label}. Entry written to audit log.`
      );
    } catch {
      setActionError("Network error while updating stage.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSignNda(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setStatusMessage(null);
    if (ndaSignerName.trim().length < 2) {
      setActionError("Enter your legal signature name (at least 2 characters).");
      return;
    }
    if (!ndaAccepted) {
      setActionError("Confirm NDA acceptance checkbox before signing.");
      return;
    }

    setBusyAction("sign-nda");
    try {
      const res = await fetch(`/api/deal-rooms/${dealRoom.id}/nda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerName: ndaSignerName.trim(),
          acceptedTerms: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Unable to record NDA signature.");
        return;
      }
      setDealRoom(data.dealRoom);
      setNdaAccepted(false);
      setStatusMessage(
        data.dealRoom.nda.completed
          ? "Mutual NDA executed by both parties. Confidential identity fields are now unlocked."
          : "Your NDA signature is recorded. Waiting for counterparty signature."
      );
    } catch {
      setActionError("Network error while signing NDA.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSignPurchaseAgreement(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setStatusMessage(null);
    if (paSignerName.trim().length < 2) {
      setActionError("Enter your legal signature name (at least 2 characters).");
      return;
    }
    if (!paAccepted) {
      setActionError("Confirm Purchase Agreement checkbox before signing.");
      return;
    }

    setBusyAction("sign-pa");
    try {
      const res = await fetch(
        `/api/deal-rooms/${dealRoom.id}/purchase-agreement`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signerName: paSignerName.trim(),
            acceptedTerms: true,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Unable to sign Purchase Agreement.");
        return;
      }
      setDealRoom(data.dealRoom);
      setPaAccepted(false);
      setStatusMessage(
        data.dealRoom.purchaseAgreement.completed
          ? "Purchase Agreement executed by both parties and archived in Document Vault."
          : "Your Purchase Agreement signature is recorded. Waiting for counterparty signature."
      );
    } catch {
      setActionError("Network error while signing Purchase Agreement.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setStatusMessage(null);
    if (messageBody.trim().length < 2) {
      setActionError("Enter a message of at least 2 characters.");
      return;
    }

    setBusyAction("send-message");
    try {
      const res = await fetch(`/api/deal-rooms/${dealRoom.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: messageBody.trim(),
          parentId: replyToId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Unable to send message.");
        return;
      }
      setDealRoom(data.dealRoom);
      setMessageBody("");
      setReplyToId(null);
      setStatusMessage("Message posted to deal room thread.");
    } catch {
      setActionError("Network error while posting message.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUploadDocument(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setStatusMessage(null);

    if (docTitle.trim().length < 3) {
      setActionError("Document title must be at least 3 characters.");
      return;
    }

    if (!selectedFile && docTextFallback.trim().length < 10) {
      setActionError(
        "Attach a file or enter at least 10 characters of document text."
      );
      return;
    }

    setBusyAction("upload-doc");
    try {
      let payload: {
        title: string;
        category: string;
        filename: string;
        mimeType: string;
        contentBase64: string;
      };

      if (selectedFile) {
        const b64 = await fileToBase64(selectedFile);
        payload = {
          title: docTitle.trim(),
          category: docCategory,
          filename: selectedFile.name,
          mimeType: selectedFile.type || "text/plain",
          contentBase64: b64,
        };
      } else {
        const bytes = new TextEncoder().encode(docTextFallback.trim());
        let binary = "";
        for (const b of bytes) {
          binary += String.fromCharCode(b);
        }
        payload = {
          title: docTitle.trim(),
          category: docCategory,
          filename: `${docTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`,
          mimeType: "text/plain",
          contentBase64: btoa(binary),
        };
      }

      const res = await fetch(`/api/deal-rooms/${dealRoom.id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Document upload failed.");
        await refreshDealRoom();
        return;
      }
      setDealRoom(data.dealRoom);
      setDocTitle("");
      setDocTextFallback("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatusMessage(
        "Document passed virus scan, watermarked, and stored in private vault."
      );
    } catch {
      setActionError("Network error while uploading document.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePreviewDocument(doc: DealDocumentView) {
    setBusyAction(`view:${doc.id}`);
    setActionError(null);
    try {
      const signedRes = await fetch(
        `/api/deal-rooms/${dealRoom.id}/documents/${doc.id}/signed-url`
      );
      const signedData = await signedRes.json();
      if (!signedRes.ok) {
        setActionError(signedData.error ?? "Unable to generate signed document URL.");
        return;
      }

      const signedUrl = String(signedData.signedUrl);
      const downloadRes = await fetch(`${signedUrl}&mode=preview`);
      if (!downloadRes.ok) {
        const errData = await downloadRes.json().catch(() => ({}));
        setActionError(errData.error ?? "Unable to load watermarked preview.");
        return;
      }

      const watermarkHeader =
        downloadRes.headers.get("X-Watermark-Notice") ?? doc.watermarkNotice;
      const isText =
        doc.mimeType.startsWith("text/") || doc.mimeType === "application/json";
      const bodyText = isText
        ? await downloadRes.text()
        : `Binary file (${doc.filename}, ${doc.mimeType}). Use the signed download button below to save the watermarked file.`;

      setPreviewDocTitle(`${doc.title} (v${doc.version})`);
      setPreviewWatermark(watermarkHeader);
      setPreviewBody(bodyText);
      setPreviewDownloadUrl(signedUrl);
      setPreviewOpen(true);
      await refreshDealRoom();
    } catch {
      setActionError("Network error while fetching watermarked document.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleProposeOffer(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setStatusMessage(null);

    const parsedAmount = Number(offerAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setActionError("Enter a valid offer amount greater than zero.");
      return;
    }
    if (offerTerms.trim().length < 10) {
      setActionError("Enter clear offer terms (at least 10 characters).");
      return;
    }

    setBusyAction("propose-offer");
    try {
      const res = await fetch(`/api/deal-rooms/${dealRoom.id}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "PROPOSE",
          amount: parsedAmount,
          currency: offerCurrency,
          termsSummary: offerTerms.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Unable to submit offer.");
        return;
      }
      setDealRoom(data.dealRoom);
      setOfferTerms("");
      setStatusMessage("Offer submitted and logged in audit trail.");
    } catch {
      setActionError("Network error while submitting offer.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleOfferAction(
    offer: DealOfferView,
    action: "ACCEPT" | "DECLINE" | "WITHDRAW" | "COUNTER"
  ) {
    setActionError(null);
    setStatusMessage(null);
    setBusyAction(`offer:${offer.id}:${action}`);

    try {
      let body: Record<string, unknown>;
      if (action === "COUNTER") {
        const draft = counterDrafts[offer.id];
        const amt = Number(draft?.amount ?? offer.amount);
        const terms = (draft?.terms ?? "").trim();
        if (!Number.isFinite(amt) || amt <= 0) {
          setActionError("Enter a valid counter-offer amount.");
          setBusyAction(null);
          return;
        }
        if (terms.length < 10) {
          setActionError("Enter counter-offer terms (at least 10 characters).");
          setBusyAction(null);
          return;
        }
        body = {
          action: "COUNTER",
          offerId: offer.id,
          amount: amt,
          currency: offer.currency,
          termsSummary: terms,
        };
      } else {
        body = { action, offerId: offer.id };
      }

      const res = await fetch(`/api/deal-rooms/${dealRoom.id}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Offer action failed.");
        return;
      }
      setDealRoom(data.dealRoom);
      setStatusMessage(`Offer ${action.toLowerCase()}ed and recorded in audit log.`);
    } catch {
      setActionError("Network error while updating offer.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleChecklistAction(
    item: DealChecklistItemView,
    action: "CONFIRM" | "SET_IN_PROGRESS" | "REOPEN"
  ) {
    setActionError(null);
    setStatusMessage(null);
    setBusyAction(`chk:${item.id}`);

    try {
      const res = await fetch(`/api/deal-rooms/${dealRoom.id}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Unable to update checklist item.");
        return;
      }
      setDealRoom(data.dealRoom);
      setStatusMessage("Due-diligence checklist updated.");
    } catch {
      setActionError("Network error while updating checklist.");
    } finally {
      setBusyAction(null);
    }
  }

  // Group messages into top-level threads + replies
  const topLevelMessages = dealRoom.messages.filter((m) => !m.parentId);
  const repliesByParent = new Map<string, DealMessageView[]>();
  for (const m of dealRoom.messages) {
    if (m.parentId) {
      const arr = repliesByParent.get(m.parentId) ?? [];
      arr.push(m);
      repliesByParent.set(m.parentId, arr);
    }
  }
  const replyTargetMessage = replyToId
    ? dealRoom.messages.find((m) => m.id === replyToId) ?? null
    : null;

  const canSignNdaNow =
    (dealRoom.viewerRole === "BUYER" && !dealRoom.nda.buyerSigned) ||
    (dealRoom.viewerRole === "SELLER" && !dealRoom.nda.sellerSigned);

  const acceptedOffer =
    dealRoom.offers.find((o) => o.status === "ACCEPTED") ?? null;

  const canSignPaNow =
    Boolean(acceptedOffer) &&
    ((dealRoom.viewerRole === "BUYER" && !dealRoom.purchaseAgreement.buyerSigned) ||
      (dealRoom.viewerRole === "SELLER" &&
        !dealRoom.purchaseAgreement.sellerSigned));

  return (
    <div className="flex flex-col gap-8">
      {/* Header & Redaction Summary */}
      <Card>
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone="neutral" label={`Role: ${dealRoom.viewerRole}`} />
              <StatusChip
                tone={verifiedTone(dealRoom.nda.completed)}
                emphasis={dealRoom.nda.completed && allowGreen ? "solid" : "outline"}
                label={dealRoom.nda.completed ? "NDA executed" : "NDA pending"}
              />
              {dealRoom.isSampleData ? (
                <StatusChip tone="neutral" label="Sample data" />
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void refreshDealRoom()}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span>Refresh room</span>
              </Button>
              <Button asChild variant="secondary">
                <Link href={`/listings/${dealRoom.businessSlug}`}>
                  View listing
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-2 lg:col-span-2">
              <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
                {dealRoom.teaserTitle}
              </h1>
              <p className="text-16 text-slate">
                {dealRoom.sector} · {dealRoom.geography} · Buyer:{" "}
                <strong className="font-medium text-ink">
                  {dealRoom.buyerName}
                </strong>{" "}
                · Seller:{" "}
                <strong className="font-medium text-ink">
                  {dealRoom.sellerName}
                </strong>
              </p>
            </div>

            <div className="flex flex-col justify-between gap-2 rounded border border-mist bg-cloud p-4">
              <span className="text-14 font-medium text-slate">
                Asking price ({dealRoom.currency})
              </span>
              <span className="text-28 font-semibold text-deep-navy tabular-figures">
                {formatCurrency(dealRoom.askingPrice, {
                  currency: dealRoom.currency,
                  compact: true,
                })}
              </span>
              <span className="text-14 text-slate tabular-figures">
                Exact:{" "}
                {formatCurrency(dealRoom.askingPrice, {
                  currency: dealRoom.currency,
                })}
              </span>
            </div>
          </div>

          {/* Confidential Redaction Box */}
          <div className="rounded border border-mist bg-cloud p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
              <div className="flex items-center gap-2">
                {dealRoom.sensitiveDetailsUnlocked ? (
                  <ShieldCheck
                    className={
                      allowGreen
                        ? "h-5 w-5 text-verified-green"
                        : "h-5 w-5 text-trust-blue"
                    }
                    aria-hidden="true"
                  />
                ) : (
                  <Lock className="h-5 w-5 text-trust-blue" aria-hidden="true" />
                )}
                <span className="text-16 font-semibold text-deep-navy">
                  {dealRoom.sensitiveDetailsUnlocked
                    ? "Confidential details unlocked"
                    : "Confidential details redacted until NDA is signed"}
                </span>
              </div>
              <StatusChip
                tone={verifiedTone(dealRoom.sensitiveDetailsUnlocked)}
                label={
                  dealRoom.sensitiveDetailsUnlocked ? "Unlocked" : "Redacted"
                }
              />
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <dt className="text-14 font-medium text-slate">
                  Legal / brand name
                </dt>
                <dd className="text-16 font-medium text-ink">
                  {dealRoom.sensitiveDetailsUnlocked && dealRoom.redactedName
                    ? dealRoom.redactedName
                    : dealRoom.redactedPlaceholder}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-14 font-medium text-slate">
                  Primary domain
                </dt>
                <dd className="text-16 font-medium text-ink">
                  {dealRoom.sensitiveDetailsUnlocked && dealRoom.redactedDomain
                    ? dealRoom.redactedDomain
                    : dealRoom.redactedPlaceholder}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-14 font-medium text-slate">
                  Customer names &amp; cohorts
                </dt>
                <dd className="text-16 font-medium text-ink">
                  {dealRoom.sensitiveDetailsUnlocked && dealRoom.redactedCustomers
                    ? dealRoom.redactedCustomers
                    : dealRoom.redactedPlaceholder}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>

      {/* Alerts */}
      {actionError ? (
        <div
          role="alert"
          className="rounded border border-brick-red bg-white p-4 text-16 font-medium text-brick-red"
        >
          {actionError}
        </div>
      ) : null}

      {statusMessage ? (
        <div
          role="status"
          className="rounded border border-mist bg-white p-4 text-16 font-medium text-deep-navy"
        >
          {statusMessage}
        </div>
      ) : null}

      {/* Shared Stage Tracker & Allowed Transitions */}
      <StageTracker
        stages={trackerStages}
        strictThreeColorBudget
        allowGreenAccent={allowGreen}
        allowRiskAccent={hasActiveError}
      />

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-14 font-semibold text-deep-navy">
              Stage transition controls
            </span>
            <p className="text-16 text-slate">
              Current stage:{" "}
              <strong className="font-semibold text-deep-navy">
                {DEAL_STAGE_DEFINITIONS[dealRoom.currentStage].label}
              </strong>
              . Transitions follow strict server-enforced prerequisites.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {allowedNextStages.map((nextStage) => (
              <Button
                key={nextStage}
                type="button"
                variant={
                  nextStage === "DATA_ACCESS" ||
                  nextStage === "NDA" ||
                  nextStage === "OFFER" ||
                  nextStage === "DUE_DILIGENCE" ||
                  nextStage === "ESCROW"
                    ? "primary"
                    : "secondary"
                }
                loading={busyAction === `stage:${nextStage}`}
                loadingLabel="Updating..."
                onClick={() => void handleStageTransition(nextStage)}
              >
                <span>
                  Move to {DEAL_STAGE_DEFINITIONS[nextStage].label}
                </span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* Main Deal Room Workspace Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList aria-label="Deal room workspace sections">
          <TabsTrigger value="overview">Overview &amp; NDA</TabsTrigger>
          <TabsTrigger value="chat">
            Chat ({dealRoom.messages.length})
          </TabsTrigger>
          <TabsTrigger value="documents">
            Documents ({dealRoom.documents.length})
          </TabsTrigger>
          <TabsTrigger value="offers">
            Offers ({dealRoom.offers.length})
          </TabsTrigger>
          <TabsTrigger value="checklist">
            Checklist ({dealRoom.checklistItems.length})
          </TabsTrigger>
          <TabsTrigger value="audit">
            Audit log ({dealRoom.auditLogs.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW & NDA */}
        <TabsContent value="overview">
          <div className="flex flex-col gap-6">
            {/* Buyer Data Access Gate Readiness */}
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle as="h2">
                    Data access prerequisites (Section 6 gate)
                  </CardTitle>
                  <StatusChip
                    tone={verifiedTone(
                      dealRoom.buyerVerification.dataAccessReady &&
                        dealRoom.nda.completed
                    )}
                    label={
                      dealRoom.buyerVerification.dataAccessReady &&
                      dealRoom.nda.completed
                        ? "Ready for Data access"
                        : "Requirements pending"
                    }
                  />
                </div>
                <CardDescription>
                  Advancing from NDA to Data access requires executed NDA + active
                  Buyer Identity KYC + active Proof of Funds.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="flex flex-col gap-2 rounded border border-mist bg-cloud p-4">
                    <span className="text-14 font-medium text-slate">
                      Mutual NDA
                    </span>
                    <StatusChip
                      tone={verifiedTone(dealRoom.nda.completed)}
                      label={
                        dealRoom.nda.completed
                          ? "Both signed"
                          : "Awaiting signatures"
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-2 rounded border border-mist bg-cloud p-4">
                    <span className="text-14 font-medium text-slate">
                      Buyer Identity (KYC)
                    </span>
                    <StatusChip
                      tone={verifiedTone(
                        dealRoom.buyerVerification.identityVerified
                      )}
                      label={
                        dealRoom.buyerVerification.identityVerified
                          ? "Verified"
                          : "Unverified / expired"
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-2 rounded border border-mist bg-cloud p-4">
                    <span className="text-14 font-medium text-slate">
                      Buyer Proof of Funds
                    </span>
                    <StatusChip
                      tone={verifiedTone(
                        dealRoom.buyerVerification.proofOfFundsVerified
                      )}
                      label={
                        dealRoom.buyerVerification.proofOfFundsVerified
                          ? "Verified"
                          : "Unverified / expired"
                      }
                    />
                  </div>
                </div>
              </CardContent>
              {!dealRoom.buyerVerification.dataAccessReady ? (
                <CardFooter>
                  <p className="text-16 text-slate">
                    {dealRoom.buyerVerification.reason}
                  </p>
                  {dealRoom.viewerRole === "BUYER" ? (
                    <Button asChild variant="action">
                      <Link href="/verify">Complete verification</Link>
                    </Button>
                  ) : null}
                </CardFooter>
              ) : null}
            </Card>

            {/* Mutual NDA E-Signature Card */}
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle as="h2">{dealRoom.nda.templateTitle}</CardTitle>
                    <StatusChip
                      tone="neutral"
                      label={dealRoom.nda.templateLegalNotice}
                    />
                  </div>
                  <StatusChip
                    tone={verifiedTone(dealRoom.nda.completed)}
                    emphasis={dealRoom.nda.completed && allowGreen ? "solid" : "outline"}
                    label={dealRoom.nda.completed ? "Completed" : "Pending"}
                  />
                </div>
                <CardDescription>
                  Both Buyer and Seller must e-sign before redacted entity name,
                  domain, and customer details unlock.
                </CardDescription>
              </CardHeader>

              <CardContent className="flex flex-col gap-6">
                <div className="rounded border border-mist bg-cloud p-4">
                  <pre className="whitespace-pre-wrap font-sans text-16 text-ink">
                    {dealRoom.nda.templateBody}
                  </pre>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2 rounded border border-mist bg-white p-4">
                    <span className="text-14 font-medium text-slate">
                      Buyer e-signature
                    </span>
                    <span className="text-16 font-semibold text-deep-navy">
                      {dealRoom.nda.buyerSigned
                        ? dealRoom.nda.buyerSignerName ?? dealRoom.buyerName
                        : "Awaiting buyer signature"}
                    </span>
                    <span className="text-14 text-slate tabular-figures">
                      {dealRoom.nda.buyerSignedAt
                        ? `Signed ${formatTimestamp(dealRoom.nda.buyerSignedAt)}`
                        : "Not yet signed"}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 rounded border border-mist bg-white p-4">
                    <span className="text-14 font-medium text-slate">
                      Seller counter-signature
                    </span>
                    <span className="text-16 font-semibold text-deep-navy">
                      {dealRoom.nda.sellerSigned
                        ? dealRoom.nda.sellerSignerName ?? dealRoom.sellerName
                        : "Awaiting seller counter-signature"}
                    </span>
                    <span className="text-14 text-slate tabular-figures">
                      {dealRoom.nda.sellerSignedAt
                        ? `Signed ${formatTimestamp(dealRoom.nda.sellerSignedAt)}`
                        : "Not yet signed"}
                    </span>
                  </div>
                </div>

                {canSignNdaNow ? (
                  <form
                    onSubmit={handleSignNda}
                    className="flex flex-col gap-4 rounded border border-mist bg-cloud p-4"
                  >
                    <Input
                      label="Full legal name for NDA e-signature"
                      required
                      value={ndaSignerName}
                      onChange={(e) => setNdaSignerName(e.target.value)}
                      placeholder="Enter your legal name"
                      helperText="Recorded with timestamp and audit entry. Placeholder template marked Needs legal review."
                    />
                    <label className="flex cursor-pointer items-start gap-3 text-16 text-ink">
                      <input
                        type="checkbox"
                        checked={ndaAccepted}
                        onChange={(e) => setNdaAccepted(e.target.checked)}
                        className="mt-1 h-5 w-5 shrink-0 accent-trust-blue"
                      />
                      <span>
                        I confirm my electronic signature on this Mutual NDA draft
                        (Needs legal review).
                      </span>
                    </label>
                    <div>
                      <Button
                        type="submit"
                        variant="primary"
                        loading={busyAction === "sign-nda"}
                        loadingLabel="Recording signature..."
                      >
                        <span>
                          {dealRoom.viewerRole === "SELLER"
                            ? "Counter-sign Mutual NDA"
                            : "E-sign Mutual NDA"}
                        </span>
                      </Button>
                    </div>
                  </form>
                ) : null}
              </CardContent>
            </Card>

            {/* Purchase Agreement E-Signature Card */}
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle as="h2">
                      {dealRoom.purchaseAgreement.templateTitle}
                    </CardTitle>
                    <StatusChip
                      tone="neutral"
                      label={dealRoom.purchaseAgreement.templateLegalNotice}
                    />
                  </div>
                  <StatusChip
                    tone={verifiedTone(dealRoom.purchaseAgreement.completed)}
                    label={
                      dealRoom.purchaseAgreement.completed
                        ? "Executed"
                        : acceptedOffer
                          ? "Ready for signature"
                          : "Awaiting accepted offer"
                    }
                  />
                </div>
                <CardDescription>
                  Final Purchase Agreement template (Needs legal review) unlocks
                  after an offer is accepted.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="rounded border border-mist bg-cloud p-4">
                  <pre className="whitespace-pre-wrap font-sans text-16 text-ink">
                    {dealRoom.purchaseAgreement.templateBody}
                  </pre>
                </div>

                {canSignPaNow ? (
                  <form
                    onSubmit={handleSignPurchaseAgreement}
                    className="flex flex-col gap-4 rounded border border-mist bg-cloud p-4"
                  >
                    <Input
                      label="Full legal name for Purchase Agreement e-signature"
                      required
                      value={paSignerName}
                      onChange={(e) => setPaSignerName(e.target.value)}
                    />
                    <label className="flex cursor-pointer items-start gap-3 text-16 text-ink">
                      <input
                        type="checkbox"
                        checked={paAccepted}
                        onChange={(e) => setPaAccepted(e.target.checked)}
                        className="mt-1 h-5 w-5 shrink-0 accent-trust-blue"
                      />
                      <span>
                        I confirm my electronic signature on this Purchase Agreement
                        draft (Needs legal review).
                      </span>
                    </label>
                    <div>
                      <Button
                        type="submit"
                        variant="action"
                        loading={busyAction === "sign-pa"}
                        loadingLabel="Signing..."
                      >
                        <span>E-sign Purchase Agreement</span>
                      </Button>
                    </div>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: THREADED CHAT */}
        <TabsContent value="chat">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare
                      className="h-5 w-5 text-trust-blue"
                      aria-hidden="true"
                    />
                    <CardTitle as="h2">Threaded deal room chat</CardTitle>
                  </div>
                  <StatusChip tone="neutral" label="Rate-limited & audited" />
                </div>
                <CardDescription>
                  Private discussion restricted to Buyer, Seller, and assigned
                  Platform Reviewers with active 2FA.
                </CardDescription>
              </CardHeader>

              <CardContent className="flex flex-col gap-6">
                <form
                  onSubmit={handleSendMessage}
                  className="flex flex-col gap-4 rounded border border-mist bg-cloud p-4"
                >
                  {replyTargetMessage ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-mist bg-white p-3">
                      <span className="text-14 text-deep-navy">
                        Replying to{" "}
                        <strong>{replyTargetMessage.senderName}</strong>:{" "}
                        &ldquo;{replyTargetMessage.body.slice(0, 80)}&rdquo;
                      </span>
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setReplyToId(null)}
                      >
                        Cancel reply
                      </Button>
                    </div>
                  ) : null}

                  <Textarea
                    label={
                      replyTargetMessage
                        ? "Post threaded reply"
                        : "Post deal room message"
                    }
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    placeholder="Ask clarifying questions on financials, customer cohorts, or transition timelines."
                    rows={3}
                  />
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      variant="primary"
                      loading={busyAction === "send-message"}
                      loadingLabel="Sending..."
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                      <span>Send message</span>
                    </Button>
                  </div>
                </form>

                {topLevelMessages.length === 0 ? (
                  <CardStateEmpty
                    title="No messages yet"
                    description="Start a threaded conversation with your counterparty above."
                  />
                ) : (
                  <div className="flex flex-col gap-4">
                    {topLevelMessages.map((msg) => {
                      const replies = repliesByParent.get(msg.id) ?? [];
                      return (
                        <div
                          key={msg.id}
                          className="flex flex-col gap-3 rounded border border-mist bg-white p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-16 font-semibold text-deep-navy">
                                {msg.senderName}
                              </span>
                              <StatusChip
                                tone="neutral"
                                label={msg.senderRoleLabel}
                              />
                            </div>
                            <span className="text-14 text-slate tabular-figures">
                              {formatTimestamp(msg.createdAt)}
                            </span>
                          </div>

                          <p className="text-16 text-ink">{msg.body}</p>

                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="link"
                              onClick={() => setReplyToId(msg.id)}
                            >
                              Reply in thread
                            </Button>
                          </div>

                          {replies.length > 0 ? (
                            <div className="flex flex-col gap-3 border-l-2 border-mist pl-4">
                              {replies.map((reply) => (
                                <div
                                  key={reply.id}
                                  className="flex flex-col gap-2 rounded border border-mist bg-cloud p-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-14 font-semibold text-deep-navy">
                                        {reply.senderName}
                                      </span>
                                      <StatusChip
                                        tone="neutral"
                                        label={reply.senderRoleLabel}
                                      />
                                    </div>
                                    <span className="text-14 text-slate tabular-figures">
                                      {formatTimestamp(reply.createdAt)}
                                    </span>
                                  </div>
                                  <p className="text-16 text-ink">
                                    {reply.body}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: DOCUMENT VAULT */}
        <TabsContent value="documents">
          <div className="flex flex-col gap-6">
            {!dealRoom.dataAccessUnlocked ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Lock className="h-5 w-5 text-trust-blue" aria-hidden="true" />
                    <CardTitle as="h2">
                      Confidential data room locked until Data access stage
                    </CardTitle>
                  </div>
                  <CardDescription>
                    Executed NDAs appear below. Financial, legal, technical, and
                    customer documents unlock after Mutual NDA signature, active
                    Buyer KYC &amp; Proof of Funds, and advancing to Data access.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : null}

            {dealRoom.currentStage !== "INTRO" &&
            dealRoom.currentStage !== "NDA" ? (
              <Card>
                <CardHeader>
                  <CardTitle as="h2">
                    Upload versioned document to private vault
                  </CardTitle>
                  <CardDescription>
                    Uploading with the same title and category increments the
                    version automatically. Files are virus-scanned and
                    watermarked.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={handleUploadDocument}
                    className="flex flex-col gap-4"
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Input
                        label="Document title"
                        required
                        value={docTitle}
                        onChange={(e) => setDocTitle(e.target.value)}
                        placeholder="Q3 GST & Bank Reconciliation"
                      />
                      <Select
                        label="Document category"
                        value={docCategory}
                        onChange={(e) =>
                          setDocCategory(
                            e.target.value as typeof docCategory
                          )
                        }
                      >
                        <option value="FINANCIAL">Financial</option>
                        <option value="LEGAL">Legal</option>
                        <option value="TECHNICAL">Technical</option>
                        <option value="CUSTOMER">Customer</option>
                        <option value="OTHER">Other</option>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor="vault-file-input"
                        className="text-16 font-medium text-deep-navy"
                      >
                        Select file (TXT, MD, CSV, JSON, PDF, PNG, JPG — max 5 MB)
                      </label>
                      <input
                        id="vault-file-input"
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.md,.csv,.json,.pdf,.png,.jpg,.jpeg"
                        onChange={(e) =>
                          setSelectedFile(e.target.files?.[0] ?? null)
                        }
                        className="min-h-12 w-full rounded border border-mist bg-white px-4 py-2 text-16 text-ink"
                      />
                    </div>

                    <Textarea
                      label="Or enter plain-text document contents directly"
                      value={docTextFallback}
                      onChange={(e) => setDocTextFallback(e.target.value)}
                      placeholder="Optional if uploading a file above. Useful for structured financial notes or disclosures."
                      rows={3}
                    />

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="primary"
                        loading={busyAction === "upload-doc"}
                        loadingLabel="Scanning & watermarking..."
                      >
                        <Upload className="h-4 w-4" aria-hidden="true" />
                        <span>Upload &amp; scan document</span>
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {dealRoom.documents.length === 0 ? (
              <CardStateEmpty
                title="No documents available yet"
                description="Once NDA is signed and Data access begins, watermarked files and view logs appear here."
              />
            ) : (
              <div className="flex flex-col gap-4">
                {dealRoom.documents.map((doc) => (
                  <Card key={doc.id}>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip tone="neutral" label={doc.category} />
                          <StatusChip
                            tone="neutral"
                            label={`v${doc.version}`}
                          />
                          <StatusChip
                            tone={
                              doc.virusScanStatus === "CLEAN"
                                ? verifiedTone(true)
                                : hasActiveError
                                  ? "risk"
                                  : "seller-reported"
                            }
                            label={`Scan: ${doc.virusScanStatus}`}
                          />
                        </div>
                        <span className="text-14 text-slate tabular-figures">
                          {doc.viewCount}{" "}
                          {doc.viewCount === 1 ? "view" : "views"} logged
                        </span>
                      </div>
                      <CardTitle as="h3" className="pt-2">
                        {doc.title}
                      </CardTitle>
                      <CardDescription>
                        Uploaded by {doc.uploadedByName} on{" "}
                        {formatTimestamp(doc.createdAt)} · File: {doc.filename}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="flex flex-col gap-4">
                      <div className="rounded border border-mist bg-cloud p-3 text-14 text-slate">
                        <FileText
                          className="mr-2 inline h-4 w-4 text-trust-blue"
                          aria-hidden="true"
                        />
                        {doc.watermarkNotice}
                      </div>

                      {doc.views.length > 0 ? (
                        <div className="flex flex-col gap-2 rounded border border-mist bg-white p-4">
                          <span className="text-14 font-semibold text-deep-navy">
                            Document view log
                          </span>
                          <ul className="flex flex-col gap-1 text-14 text-slate tabular-figures">
                            {doc.views.map((v) => (
                              <li key={v.id}>
                                {v.viewerName} viewed at{" "}
                                {formatTimestamp(v.viewedAt)}
                                {v.ipAddress ? ` (IP: ${v.ipAddress})` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <span className="text-14 text-slate">
                          No document views recorded yet.
                        </span>
                      )}
                    </CardContent>

                    <CardFooter>
                      <Button
                        type="button"
                        variant="action"
                        disabled={doc.virusScanStatus !== "CLEAN"}
                        loading={busyAction === `view:${doc.id}`}
                        loadingLabel="Signing URL..."
                        onClick={() => void handlePreviewDocument(doc)}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        <span>Preview watermarked (logs view)</span>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 4: OFFERS & COUNTER-OFFERS */}
        <TabsContent value="offers">
          <div className="flex flex-col gap-6">
            {dealRoom.currentStage === "OFFER" &&
            !dealRoom.offers.some((o) => o.status === "PROPOSED") &&
            dealRoom.viewerRole !== "REVIEWER" ? (
              <Card>
                <CardHeader>
                  <CardTitle as="h2">Submit written offer</CardTitle>
                  <CardDescription>
                    Propose structured acquisition price and terms. Counterparty
                    can accept, counter, or decline.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={handleProposeOffer}
                    className="flex flex-col gap-4"
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Input
                        label="Offer amount"
                        type="number"
                        required
                        min={1}
                        value={offerAmount}
                        onChange={(e) => setOfferAmount(e.target.value)}
                      />
                      <Select
                        label="Currency"
                        value={offerCurrency}
                        onChange={(e) =>
                          setOfferCurrency(e.target.value as CurrencyCode)
                        }
                      >
                        <option value="INR">INR (₹)</option>
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                      </Select>
                    </div>
                    <Textarea
                      label="Offer terms & transition summary"
                      required
                      value={offerTerms}
                      onChange={(e) => setOfferTerms(e.target.value)}
                      placeholder="100% upfront via third-party escrow upon 14-day diligence completion and 30-day founder handover."
                      rows={3}
                    />
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="primary"
                        loading={busyAction === "propose-offer"}
                        loadingLabel="Submitting..."
                      >
                        Submit written offer
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : dealRoom.currentStage !== "OFFER" &&
              dealRoom.currentStage !== "DUE_DILIGENCE" ? (
              <Card>
                <CardHeader>
                  <CardTitle as="h2">
                    Advance to Offer stage to submit commercial offers
                  </CardTitle>
                  <CardDescription>
                    Current stage is{" "}
                    {DEAL_STAGE_DEFINITIONS[dealRoom.currentStage].label}.
                    Complete NDA and Data access first before exchanging binding
                    or non-binding offers.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : null}

            {dealRoom.offers.length === 0 ? (
              <CardStateEmpty
                title="No offers submitted yet"
                description="Offer and counter-offer history appears here once negotiations open in the Offer stage."
              />
            ) : (
              <div className="flex flex-col gap-4">
                {dealRoom.offers.map((offer) => {
                  const isOpen = offer.status === "PROPOSED";
                  const isOwnOffer =
                    (dealRoom.viewerRole === "BUYER" &&
                      offer.proposerRole === "BUYER") ||
                    (dealRoom.viewerRole === "SELLER" &&
                      offer.proposerRole === "SELLER");
                  const draft = counterDrafts[offer.id] ?? {
                    amount: String(offer.amount),
                    terms: "",
                  };

                  return (
                    <Card key={offer.id}>
                      <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusChip
                              tone={
                                offer.status === "ACCEPTED"
                                  ? verifiedTone(true)
                                  : offer.status === "DECLINED" && hasActiveError
                                    ? "risk"
                                    : "neutral"
                              }
                              label={`Status: ${offer.status}`}
                            />
                            <StatusChip
                              tone="neutral"
                              label={`By ${offer.proposerRole}`}
                            />
                            {offer.parentOfferId ? (
                              <StatusChip
                                tone="seller-reported"
                                label="Counter-offer"
                              />
                            ) : null}
                          </div>
                          <span className="text-14 text-slate tabular-figures">
                            {formatTimestamp(offer.createdAt)}
                          </span>
                        </div>
                        <CardTitle as="h3" className="pt-2 tabular-figures">
                          {formatCurrency(offer.amount, {
                            currency: offer.currency,
                          })}{" "}
                          (
                          {formatCurrency(offer.amount, {
                            currency: offer.currency,
                            compact: true,
                          })}
                          )
                        </CardTitle>
                        <CardDescription>
                          Proposed by {offer.proposerName}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="flex flex-col gap-4">
                        <p className="text-16 text-ink">{offer.termsSummary}</p>

                        {isOpen &&
                        !isOwnOffer &&
                        (dealRoom.viewerRole === "BUYER" ||
                          dealRoom.viewerRole === "SELLER") ? (
                          <div className="flex flex-col gap-4 rounded border border-mist bg-cloud p-4">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="primary"
                                loading={busyAction === `offer:${offer.id}:ACCEPT`}
                                loadingLabel="Accepting..."
                                onClick={() =>
                                  void handleOfferAction(offer, "ACCEPT")
                                }
                              >
                                <CheckCircle2
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                                <span>Accept offer</span>
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                loading={busyAction === `offer:${offer.id}:DECLINE`}
                                loadingLabel="Declining..."
                                onClick={() =>
                                  void handleOfferAction(offer, "DECLINE")
                                }
                              >
                                Decline offer
                              </Button>
                            </div>

                            <div className="grid grid-cols-1 gap-4 border-t border-mist pt-4 md:grid-cols-2">
                              <Input
                                label={`Counter-offer amount (${offer.currency})`}
                                type="number"
                                value={draft.amount}
                                onChange={(e) =>
                                  setCounterDrafts((prev) => ({
                                    ...prev,
                                    [offer.id]: {
                                      amount: e.target.value,
                                      terms: draft.terms,
                                    },
                                  }))
                                }
                              />
                              <Input
                                label="Counter-offer terms"
                                value={draft.terms}
                                placeholder="Revised price and handover schedule..."
                                onChange={(e) =>
                                  setCounterDrafts((prev) => ({
                                    ...prev,
                                    [offer.id]: {
                                      amount: draft.amount,
                                      terms: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="action"
                                loading={
                                  busyAction === `offer:${offer.id}:COUNTER`
                                }
                                loadingLabel="Sending counter..."
                                onClick={() =>
                                  void handleOfferAction(offer, "COUNTER")
                                }
                              >
                                Send counter-offer
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        {isOpen && isOwnOffer ? (
                          <div>
                            <Button
                              type="button"
                              variant="secondary"
                              loading={busyAction === `offer:${offer.id}:WITHDRAW`}
                              loadingLabel="Withdrawing..."
                              onClick={() =>
                                void handleOfferAction(offer, "WITHDRAW")
                              }
                            >
                              Withdraw offer
                            </Button>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 5: DUE DILIGENCE CHECKLIST */}
        <TabsContent value="checklist">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle as="h2">
                    Due-diligence checklist ({dealRoom.sector})
                  </CardTitle>
                  <StatusChip
                    tone={verifiedTone(
                      dealRoom.checklistItems.every(
                        (i) => i.status === "CONFIRMED"
                      )
                    )}
                    label={`${dealRoom.checklistItems.filter((i) => i.status === "CONFIRMED").length} / ${dealRoom.checklistItems.length} confirmed`}
                  />
                </div>
                <CardDescription>
                  Generated automatically from business type ({dealRoom.sector}
                  ). Each item tracks Buyer and Seller confirmation timestamps.
                </CardDescription>
              </CardHeader>
            </Card>

            {dealRoom.checklistItems.map((item) => (
              <Card key={item.id}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip tone="neutral" label={item.category} />
                      <StatusChip
                        tone={
                          item.status === "CONFIRMED"
                            ? verifiedTone(true)
                            : "seller-reported"
                        }
                        label={item.status.replace("_", " ")}
                      />
                    </div>
                    <h3 className="font-serif text-20 font-semibold text-deep-navy">
                      {item.title}
                    </h3>
                    <div className="flex flex-wrap gap-4 text-14 text-slate tabular-figures">
                      <span>
                        Buyer confirmed:{" "}
                        {item.buyerConfirmedAt
                          ? formatTimestamp(item.buyerConfirmedAt)
                          : "Pending"}
                      </span>
                      <span>
                        Seller confirmed:{" "}
                        {item.sellerConfirmedAt
                          ? formatTimestamp(item.sellerConfirmedAt)
                          : "Pending"}
                      </span>
                    </div>
                  </div>

                  {dealRoom.viewerRole === "BUYER" ||
                  dealRoom.viewerRole === "SELLER" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        loading={busyAction === `chk:${item.id}`}
                        loadingLabel="Saving..."
                        onClick={() =>
                          void handleChecklistAction(item, "CONFIRM")
                        }
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        <span>Confirm</span>
                      </Button>
                      {item.status === "OPEN" ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            void handleChecklistAction(item, "SET_IN_PROGRESS")
                          }
                        >
                          Mark in progress
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB 6: IMMUTABLE AUDIT LOG */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <History
                    className="h-5 w-5 text-trust-blue"
                    aria-hidden="true"
                  />
                  <CardTitle as="h2">Immutable deal room audit log</CardTitle>
                </div>
                <StatusChip
                  tone="neutral"
                  label={`${dealRoom.auditLogs.length} entries`}
                />
              </div>
              <CardDescription>
                Every stage transition, NDA signature, message, upload, document
                view, offer, and checklist update writes an append-only AuditLog
                record.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-3">
              {dealRoom.auditLogs.length === 0 ? (
                <p className="text-16 text-slate">
                  No audit entries recorded yet.
                </p>
              ) : (
                dealRoom.auditLogs.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-2 rounded border border-mist bg-cloud p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip tone="neutral" label={entry.action} />
                        <span className="text-14 font-semibold text-deep-navy">
                          {entry.actorName}
                        </span>
                      </div>
                      <span className="text-14 text-slate tabular-figures">
                        {formatTimestamp(entry.createdAt)}
                      </span>
                    </div>
                    <div className="text-14 text-ink">
                      <span>
                        Entity: {entry.entityType} ({entry.entityId})
                      </span>
                      {entry.newState ? (
                        <span>
                          {" "}
                          · New state: {JSON.stringify(entry.newState)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Watermarked Document Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          title={previewDocTitle || "Watermarked Document Preview"}
          description={previewWatermark}
        >
          <div className="flex flex-col gap-4">
            <div className="max-h-[360px] overflow-y-auto rounded border border-mist bg-cloud p-4">
              <pre className="whitespace-pre-wrap font-sans text-14 text-ink">
                {previewBody}
              </pre>
            </div>
            {previewDownloadUrl ? (
              <div className="flex justify-end">
                <Button asChild variant="primary">
                  <a href={previewDownloadUrl}>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    <span>Download watermarked copy</span>
                  </a>
                </Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
