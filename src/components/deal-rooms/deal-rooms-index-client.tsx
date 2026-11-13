"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import type { DealRoomSummary } from "@/lib/domain/deal-room";
import { DEAL_STAGE_DEFINITIONS } from "@/lib/domain/deal-stages";
import { formatCurrency } from "@/lib/format/currency";
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
import { StatusChip } from "@/components/ui/status-chip";

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function DealRoomsIndexClient({
  initialRooms,
  gateStatus,
  gateMessage,
}: {
  initialRooms: DealRoomSummary[];
  gateStatus: "ready" | "unauthenticated" | "two-factor-required";
  gateMessage?: string;
}) {
  const [rooms, setRooms] = React.useState<DealRoomSummary[]>(initialRooms);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/deal-rooms");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Unable to load deal rooms.");
        return;
      }
      setRooms(data.dealRooms ?? []);
    } catch {
      setError("Network error while refreshing deal rooms.");
    } finally {
      setLoading(false);
    }
  }

  if (gateStatus !== "ready") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Deal rooms
          </h1>
          <p className="max-w-[720px] text-16 text-slate">
            Every deal room enforces participant role checks and mandatory 2FA on every
            read and write.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-trust-blue" aria-hidden="true" />
                <CardTitle as="h2">
                  {gateStatus === "unauthenticated"
                    ? "Sign in required"
                    : "Mandatory 2FA verification required"}
                </CardTitle>
              </div>
              <StatusChip tone="neutral" label="2FA gate" />
            </div>
            <CardDescription>
              {gateMessage ??
                "Sign in and verify a 6-digit authenticator code to access confidential deal rooms."}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild variant="primary">
              <Link href="/auth/signin">Sign in &amp; verify 2FA</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/listings">Browse approved listings</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const anyNdaSigned = rooms.some((r) => r.ndaCompleted);
  const hasDisputedRoom = rooms.some(
    (r) => r.status === "DISPUTED" || r.latestEscrowStatus === "DISPUTED"
  );
  const allowGreen = !hasDisputedRoom;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Deal rooms
          </h1>
          <p className="max-w-[720px] text-16 text-slate">
            Shared buyer and seller progression from Intro through NDA, Data access,
            Offers, and Due diligence. Every state change writes to the audit log.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            loading={loading}
            loadingLabel="Refreshing..."
            onClick={() => void handleRefresh()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Refresh</span>
          </Button>
          <Button asChild variant="action">
            <Link href="/listings">Browse listings</Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <CardStateLoading
          title="Loading deal rooms"
          description="Checking 2FA session, stage tracker state, and NDA execution status."
        />
      ) : error ? (
        <CardStateError message={error} onRetry={() => void handleRefresh()} />
      ) : rooms.length === 0 ? (
        <CardStateEmpty
          title="No deal rooms opened yet"
          description="Browse approved business listings to review verified vs seller-reported vitals and open your first 2FA-protected deal room."
          actionLabel="Browse approved listings"
          actionHref="/listings"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {rooms.map((room) => (
            <Card key={room.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip
                      tone="neutral"
                      label={`Stage: ${DEAL_STAGE_DEFINITIONS[room.currentStage]?.label || room.currentStage}`}
                    />
                    {room.ndaCompleted ? (
                      <StatusChip
                        tone={allowGreen ? "verified" : "neutral"}
                        emphasis={allowGreen ? "solid" : "outline"}
                        label="NDA signed"
                      />
                    ) : (
                      <StatusChip
                        tone={anyNdaSigned ? "seller-reported" : "neutral"}
                        label="NDA pending"
                      />
                    )}
                    {room.status === "DISPUTED" ? (
                      <StatusChip
                        tone="risk"
                        emphasis="solid"
                        label="Disputed"
                      />
                    ) : room.latestEscrowStatus ? (
                      <StatusChip
                        tone={
                          allowGreen &&
                          (room.latestEscrowStatus === "FUNDED" ||
                            room.latestEscrowStatus === "RELEASED")
                            ? "verified"
                            : "neutral"
                        }
                        label={`Escrow: ${room.latestEscrowStatus.replace("_", " ")}`}
                      />
                    ) : null}
                  </div>
                  <span className="text-14 font-medium text-slate tabular-figures">
                    Asking:{" "}
                    <strong className="font-semibold text-deep-navy">
                      {formatCurrency(room.askingPrice, {
                        currency: room.currency,
                        compact: true,
                      })}
                    </strong>
                  </span>
                </div>
                <CardTitle as="h2" className="pt-2">
                  {room.teaserTitle}
                </CardTitle>
                <CardDescription>
                  {room.sector} · {room.geography}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <dl className="grid grid-cols-1 gap-4 rounded border border-mist bg-cloud p-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <dt className="text-14 text-slate">Buyer</dt>
                    <dd className="text-16 font-medium text-ink">
                      {room.buyerName}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-14 text-slate">Seller</dt>
                    <dd className="text-16 font-medium text-ink">
                      {room.sellerName}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-14 text-slate">Last updated</dt>
                    <dd className="text-16 font-medium text-ink tabular-figures">
                      {formatShortDate(room.updatedAt)}
                    </dd>
                  </div>
                </dl>
              </CardContent>

              <CardFooter>
                <div className="flex items-center gap-2 text-14 text-slate">
                  <ShieldCheck
                    className={
                      allowGreen && room.ndaCompleted
                        ? "h-4 w-4 text-verified-green"
                        : "h-4 w-4 text-trust-blue"
                    }
                    aria-hidden="true"
                  />
                  <span>
                    {room.ndaCompleted
                      ? "Confidential identity unlocked inside deal room"
                      : "Identity & customer names stay redacted until NDA execution"}
                  </span>
                </div>

                <Button asChild variant="primary">
                  <Link href={`/deals/${room.id}`}>
                    <span>Enter deal room</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
