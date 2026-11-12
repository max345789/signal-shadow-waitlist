"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Bell, Check, CheckCircle2 } from "lucide-react";
import type { ThesisNotificationRecord } from "@/lib/domain/matching";
import type { ThesisWithMatches } from "@/lib/matching/store";
import { formatCurrency } from "@/lib/format/currency";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

export function HomeSavedThesesFeed({
  initialTheses,
  initialNotifications,
}: {
  initialTheses: ThesisWithMatches[];
  initialNotifications: ThesisNotificationRecord[];
}) {
  const [notifications, setNotifications] =
    React.useState<ThesisNotificationRecord[]>(initialNotifications);
  const [alertNotice, setAlertNotice] = React.useState<string | null>(null);
  const unread = notifications.filter((n) => n.readAt === null);

  async function markAllRead() {
    setAlertNotice(null);
    try {
      const res = await fetch("/api/notifications", { method: "POST" });
      if (res.ok) {
        const nowIso = new Date().toISOString();
        setNotifications((prev) =>
          prev.map((n) => (n.readAt === null ? { ...n, readAt: nowIso } : n))
        );
      } else {
        setAlertNotice("Could not mark alerts read. Refresh the page and try again.");
      }
    } catch {
      setAlertNotice("Network error while updating alerts. Try again.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {unread.length > 0 ? (
        <Card className="border-trust-blue">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-trust-blue" aria-hidden="true" />
                <CardTitle as="h3">
                  New thesis match alerts ({unread.length})
                </CardTitle>
              </div>
              <Button type="button" variant="secondary" onClick={() => void markAllRead()}>
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>Mark all read</span>
              </Button>
            </div>
            <CardDescription>
              Newly approved listings matched your saved acquisition theses.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {alertNotice ? (
              <p role="status" className="text-14 font-medium text-deep-navy">
                {alertNotice}
              </p>
            ) : null}
            {unread.slice(0, 3).map((alert) => (
              <div
                key={alert.id}
                className="flex flex-col gap-2 rounded border border-mist bg-cloud p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-16 font-semibold text-deep-navy">
                    {alert.title}
                  </span>
                  <p className="text-16 text-ink">{alert.body}</p>
                </div>
                {alert.actionUrl ? (
                  <Button asChild variant="action">
                    <Link href={alert.actionUrl}>Inspect match</Link>
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6">
        {initialTheses.map(({ thesis, matches }) => {
          const topMatches = matches.slice(0, 2);
          return (
            <Card key={thesis.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle as="h3">{thesis.title}</CardTitle>
                    {thesis.isSampleData ? (
                      <StatusChip tone="neutral" label="Sample data" />
                    ) : null}
                  </div>
                  <StatusChip
                    tone={thesis.alertsEnabled ? "neutral" : "seller-reported"}
                    label={thesis.alertsEnabled ? "Alerts active" : "Alerts paused"}
                  />
                </div>
                {thesis.freeText ? (
                  <CardDescription className="text-ink">
                    {thesis.freeText}
                  </CardDescription>
                ) : null}
              </CardHeader>

              <CardContent className="flex flex-col gap-4">
                {topMatches.length === 0 ? (
                  <p className="text-16 text-slate">
                    No approved listings currently available to rank for this thesis.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {topMatches.map((m, idx) => (
                      <div
                        key={m.listing.id}
                        className="flex flex-col justify-between gap-3 rounded border border-mist bg-cloud p-4"
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-14 font-semibold text-deep-navy tabular-figures">
                              #{idx + 1} · {m.score} / 100 fit
                            </span>
                            {m.listing.trustSummary.verifiedCount > 0 ? (
                              <StatusChip
                                tone="verified"
                                emphasis="solid"
                                label={`${m.listing.trustSummary.verifiedCount} verified`}
                              />
                            ) : (
                              <StatusChip
                                tone="seller-reported"
                                label="Seller-reported"
                              />
                            )}
                          </div>

                          <Link
                            href={`/listings/${m.listing.slug}`}
                            className="font-serif text-20 font-semibold text-deep-navy no-underline hover:text-trust-blue hover:underline"
                          >
                            {m.listing.teaserTitle}
                          </Link>

                          <span className="text-14 text-slate tabular-figures">
                            {m.listing.sector} ·{" "}
                            {formatCurrency(m.listing.askingPrice, {
                              currency: m.listing.currency,
                              compact: true,
                            })}{" "}
                            · {m.listing.ownerHoursPerWeek} hrs/wk
                          </span>

                          <div className="flex items-start gap-2 text-16 text-ink">
                            <CheckCircle2
                              className="mt-1 h-4 w-4 shrink-0 text-trust-blue"
                              aria-hidden="true"
                            />
                            <span>
                              {m.reasons[0] ?? "Minimal match on stated criteria."}
                            </span>
                          </div>

                          <div className="flex items-start gap-2 text-16 text-ink">
                            <AlertTriangle
                              className="mt-1 h-4 w-4 shrink-0 text-deep-navy"
                              aria-hidden="true"
                            />
                            <span>
                              {m.mismatches[0] ??
                                "No hard-criteria mismatches flagged."}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2">
                          <Link
                            href={`/listings/${m.listing.slug}`}
                            className="text-16 font-medium text-trust-blue underline"
                          >
                            Inspect listing
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>

              <CardFooter>
                <Button asChild variant="secondary">
                  <Link href={`/matches?thesisId=${encodeURIComponent(thesis.id)}`}>
                    <span>View all ranked matches ({matches.length})</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                {matches.length >= 2 ? (
                  <Button asChild variant="action">
                    <Link
                      href={`/compare?ids=${matches
                        .slice(0, 3)
                        .map((x) => x.listing.id)
                        .join(",")}&thesisId=${encodeURIComponent(thesis.id)}`}
                    >
                      <span>Compare top {Math.min(3, matches.length)}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                ) : null}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
