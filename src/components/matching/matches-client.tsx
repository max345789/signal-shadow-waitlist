"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BellOff,
  Check,
  Edit3,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { AuthSession } from "@/lib/auth/types";
import type { ThesisNotificationRecord } from "@/lib/domain/matching";
import { formatCurrency } from "@/lib/format/currency";
import type { ThesisWithMatches } from "@/lib/matching/store";
import { MatchResultCard } from "@/components/matching/match-result-card";
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

export function MatchesClient({
  session,
  initialTheses,
  initialNotifications,
  initialSelectedThesisId,
}: {
  session: AuthSession | null;
  initialTheses: ThesisWithMatches[];
  initialNotifications: ThesisNotificationRecord[];
  initialSelectedThesisId?: string;
}) {
  const isBuyerAuthorized = Boolean(
    session && (session.roles.includes("BUYER") || session.roles.includes("ADMIN"))
  );

  const [thesesWithMatches, setThesesWithMatches] =
    React.useState<ThesisWithMatches[]>(initialTheses);
  const [notifications, setNotifications] =
    React.useState<ThesisNotificationRecord[]>(initialNotifications);
  const [selectedThesisId, setSelectedThesisId] = React.useState<string>(
    initialSelectedThesisId &&
      initialTheses.some((item) => item.thesis.id === initialSelectedThesisId)
      ? initialSelectedThesisId
      : initialTheses[0]?.thesis.id ?? ""
  );
  const [selectedCompareIds, setSelectedCompareIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [togglingAlert, setTogglingAlert] = React.useState<boolean>(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const activeEntry =
    thesesWithMatches.find((t) => t.thesis.id === selectedThesisId) ??
    thesesWithMatches[0] ??
    null;

  const unreadNotifications = notifications.filter((n) => n.readAt === null);

  async function refreshAll() {
    if (!isBuyerAuthorized) return;
    setLoading(true);
    setError(null);
    try {
      const [thesesRes, notifRes] = await Promise.all([
        fetch("/api/theses"),
        fetch("/api/notifications"),
      ]);
      if (!thesesRes.ok) {
        const errData = await thesesRes.json().catch(() => ({}));
        setError(errData.error ?? "Could not load saved theses and matches.");
        return;
      }
      const thesesData = await thesesRes.json();
      const nextList: ThesisWithMatches[] = thesesData.theses ?? [];
      setThesesWithMatches(nextList);
      if (nextList.length > 0 && !nextList.some((x) => x.thesis.id === selectedThesisId)) {
        setSelectedThesisId(nextList[0]!.thesis.id);
      }

      if (notifRes.ok) {
        const notifData = await notifRes.json();
        setNotifications(notifData.notifications ?? []);
      }
    } catch {
      setError("Network error while refreshing matches.");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleAlerts() {
    if (!activeEntry) return;
    setTogglingAlert(true);
    setStatusMessage(null);
    setError(null);
    try {
      const nextVal = !activeEntry.thesis.alertsEnabled;
      const res = await fetch(`/api/theses/${activeEntry.thesis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertsEnabled: nextVal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not update alert setting.");
        return;
      }
      setThesesWithMatches((prev) =>
        prev.map((item) =>
          item.thesis.id === activeEntry.thesis.id
            ? { thesis: data.thesis, matches: data.matches }
            : item
        )
      );
      setStatusMessage(
        nextVal
          ? "New-listing alerts enabled for this thesis."
          : "New-listing alerts paused for this thesis."
      );
    } catch {
      setError("Network error while updating alert settings.");
    } finally {
      setTogglingAlert(false);
    }
  }

  async function handleDeleteThesis(thesisId: string) {
    setDeletingId(thesisId);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/theses/${thesisId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not delete thesis.");
        return;
      }
      const remaining = thesesWithMatches.filter((t) => t.thesis.id !== thesisId);
      setThesesWithMatches(remaining);
      setSelectedThesisId(remaining[0]?.thesis.id ?? "");
      setSelectedCompareIds([]);
      setStatusMessage("Acquisition thesis deleted.");
    } catch {
      setError("Network error while deleting thesis.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleMarkRead(notificationId: string) {
    try {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: "PATCH",
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? data.notification : n))
        );
      } else {
        setStatusMessage("Could not update notification status. Refresh to retry.");
      }
    } catch {
      setStatusMessage("Network error while updating notification status.");
    }
  }

  async function handleMarkAllRead() {
    try {
      const res = await fetch("/api/notifications", { method: "POST" });
      if (res.ok) {
        const nowIso = new Date().toISOString();
        setNotifications((prev) =>
          prev.map((n) => (n.readAt === null ? { ...n, readAt: nowIso } : n))
        );
      } else {
        setStatusMessage("Could not mark alerts read. Refresh to retry.");
      }
    } catch {
      setStatusMessage("Network error while updating alerts.");
    }
  }

  function toggleCompare(listingId: string) {
    setSelectedCompareIds((prev) => {
      if (prev.includes(listingId)) {
        return prev.filter((id) => id !== listingId);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, listingId];
    });
  }

  if (!isBuyerAuthorized) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <StatusChip tone="neutral" label="Phase 2: Thesis Matches" className="w-fit" />
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Saved theses &amp; ranked matches
          </h1>
          <p className="max-w-[760px] text-16 text-slate">
            Sign in with a Buyer account to manage saved theses, inspect ranked matches
            with visible mismatches, and receive alerts when matching businesses are
            approved.
          </p>
        </div>

        <CardStateEmpty
          title={
            session
              ? "Buyer role required to view saved theses"
              : "Sign in as a Buyer to view saved theses & alerts"
          }
          description="You can still test thesis scoring immediately in the Thesis Builder without signing in."
        />

        <div className="flex flex-wrap gap-4">
          <Button asChild variant="primary">
            <Link href="/auth/signin">Sign in &amp; verify 2FA</Link>
          </Button>
          <Button asChild variant="action">
            <Link href="/thesis/new">Open Thesis Builder</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <StatusChip tone="neutral" label="Phase 2: Thesis Matches" className="w-fit" />
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Saved theses &amp; ranked matches
          </h1>
          <p className="max-w-[760px] text-16 text-slate">
            Businesses are ranked by weighted fit on your structured bounds and
            free-text priorities. Both reasons and mismatches are shown transparently.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void refreshAll()}
            loading={loading}
            loadingLabel="Refreshing..."
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Refresh</span>
          </Button>
          <Button asChild variant="primary">
            <Link href="/thesis/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>New thesis</span>
            </Link>
          </Button>
        </div>
      </div>

      {statusMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded border border-trust-blue bg-white p-4 text-16 font-medium text-deep-navy"
        >
          {statusMessage}
        </div>
      ) : null}

      {/* Unread Thesis Match Alerts */}
      {unreadNotifications.length > 0 ? (
        <section aria-labelledby="thesis-alerts-heading">
          <Card className="border-trust-blue">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-trust-blue" aria-hidden="true" />
                  <CardTitle id="thesis-alerts-heading" as="h2">
                    New thesis match alerts ({unreadNotifications.length})
                  </CardTitle>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleMarkAllRead()}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  <span>Mark all read</span>
                </Button>
              </div>
              <CardDescription>
                Newly approved marketplace listings matched your active theses.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {unreadNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className="flex flex-col gap-3 rounded border border-mist bg-cloud p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip tone="neutral" label="New match alert" />
                      <span className="text-16 font-semibold text-deep-navy">
                        {notif.title}
                      </span>
                    </div>
                    <p className="text-16 text-ink">{notif.body}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {notif.actionUrl && notif.actionUrl.includes("thesisId=") ? (
                      <Button
                        type="button"
                        variant="action"
                        onClick={() => {
                          const match = notif.actionUrl?.match(/thesisId=([^&]+)/);
                          const targetThesisId = match?.[1]
                            ? decodeURIComponent(match[1])
                            : null;
                          if (
                            targetThesisId &&
                            thesesWithMatches.some((t) => t.thesis.id === targetThesisId)
                          ) {
                            setSelectedThesisId(targetThesisId);
                            setSelectedCompareIds([]);
                          }
                        }}
                      >
                        Inspect match
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleMarkRead(notif.id)}
                    >
                      Mark as read
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {loading ? (
        <CardStateLoading
          title="Loading ranked thesis matches"
          description="Evaluating approved listings and checking latest verification records."
        />
      ) : error ? (
        <CardStateError
          title="Could not load thesis matches"
          message={error}
          onRetry={() => void refreshAll()}
        />
      ) : thesesWithMatches.length === 0 ? (
        <CardStateEmpty
          title="No saved acquisition theses yet"
          description="Create a structured acquisition thesis to rank approved businesses with clear reasons and mismatches, and enable alerts for future listings."
        />
      ) : activeEntry ? (
        <>
          {/* Saved Theses Selector & Active Criteria */}
          <section aria-labelledby="saved-theses-bar-heading" className="flex flex-col gap-4">
            <h2
              id="saved-theses-bar-heading"
              className="font-serif text-20 font-semibold text-deep-navy"
            >
              Select a saved thesis ({thesesWithMatches.length})
            </h2>

            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Saved acquisition theses">
              {thesesWithMatches.map((entry, tabIdx) => {
                const isSelected = entry.thesis.id === activeEntry.thesis.id;
                return (
                  <button
                    key={entry.thesis.id}
                    id={`thesis-tab-${entry.thesis.id}`}
                    type="button"
                    role="tab"
                    tabIndex={isSelected ? 0 : -1}
                    aria-selected={isSelected}
                    aria-controls={`thesis-panel-${entry.thesis.id}`}
                    onClick={() => {
                      setSelectedThesisId(entry.thesis.id);
                      setSelectedCompareIds([]);
                    }}
                    onKeyDown={(e) => {
                      if (thesesWithMatches.length <= 1) return;
                      let targetIdx = -1;
                      if (e.key === "ArrowRight") {
                        targetIdx = (tabIdx + 1) % thesesWithMatches.length;
                      } else if (e.key === "ArrowLeft") {
                        targetIdx =
                          (tabIdx - 1 + thesesWithMatches.length) %
                          thesesWithMatches.length;
                      } else if (e.key === "Home") {
                        targetIdx = 0;
                      } else if (e.key === "End") {
                        targetIdx = thesesWithMatches.length - 1;
                      }
                      if (targetIdx >= 0) {
                        e.preventDefault();
                        const nextEntry = thesesWithMatches[targetIdx];
                        if (nextEntry) {
                          setSelectedThesisId(nextEntry.thesis.id);
                          setSelectedCompareIds([]);
                          const tabs = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
                          tabs?.[targetIdx]?.focus();
                        }
                      }
                    }}
                    className={
                      isSelected
                        ? "inline-flex min-h-12 items-center gap-2 rounded border border-deep-navy bg-deep-navy px-4 py-2 text-16 font-medium text-white state-transition"
                        : "inline-flex min-h-12 items-center gap-2 rounded border border-mist bg-white px-4 py-2 text-16 font-medium text-deep-navy hover:bg-cloud state-transition"
                    }
                  >
                    <span>{entry.thesis.title}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div
            role="tabpanel"
            id={`thesis-panel-${activeEntry.thesis.id}`}
            aria-labelledby={`thesis-tab-${activeEntry.thesis.id}`}
            className="flex flex-col gap-8"
          >
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle as="h3">{activeEntry.thesis.title}</CardTitle>
                    {activeEntry.thesis.isSampleData ? (
                      <StatusChip tone="neutral" label="Sample data" />
                    ) : null}
                  </div>
                  <StatusChip
                    tone={activeEntry.thesis.alertsEnabled ? "neutral" : "seller-reported"}
                    label={
                      activeEntry.thesis.alertsEnabled
                        ? "Alerts active"
                        : "Alerts paused"
                    }
                  />
                </div>
                {activeEntry.thesis.freeText ? (
                  <CardDescription className="text-ink">
                    {activeEntry.thesis.freeText}
                  </CardDescription>
                ) : null}
              </CardHeader>

              <CardContent>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="flex flex-col gap-1">
                    <dt className="text-14 text-slate">Sector</dt>
                    <dd className="text-16 font-medium text-deep-navy">
                      {activeEntry.thesis.sector ?? "Any sector"}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-14 text-slate">Geography</dt>
                    <dd className="text-16 font-medium text-deep-navy">
                      {activeEntry.thesis.geography ?? "Any geography"}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-14 text-slate">Asking price target</dt>
                    <dd className="text-16 font-medium text-deep-navy tabular-figures">
                      {activeEntry.thesis.minPrice != null ||
                      activeEntry.thesis.maxPrice != null
                        ? `${
                            activeEntry.thesis.minPrice != null
                              ? formatCurrency(activeEntry.thesis.minPrice, {
                                  currency: activeEntry.thesis.currency,
                                  compact: true,
                                })
                              : "Any"
                          } – ${
                            activeEntry.thesis.maxPrice != null
                              ? formatCurrency(activeEntry.thesis.maxPrice, {
                                  currency: activeEntry.thesis.currency,
                                  compact: true,
                                })
                              : "Any"
                          }`
                        : "Any price"}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-14 text-slate">Min annual profit</dt>
                    <dd className="text-16 font-medium text-deep-navy tabular-figures">
                      {activeEntry.thesis.minProfit != null
                        ? formatCurrency(activeEntry.thesis.minProfit, {
                            currency: activeEntry.thesis.currency,
                            compact: true,
                          })
                        : "Any profit"}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-14 text-slate">Max owner hours</dt>
                    <dd className="text-16 font-medium text-deep-navy tabular-figures">
                      {activeEntry.thesis.maxOwnerHours != null
                        ? `<= ${activeEntry.thesis.maxOwnerHours} hrs/wk`
                        : "Any workload"}
                    </dd>
                  </div>
                </dl>
              </CardContent>

              <CardFooter>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleToggleAlerts()}
                    loading={togglingAlert}
                  >
                    {activeEntry.thesis.alertsEnabled ? (
                      <>
                        <BellOff className="h-4 w-4" aria-hidden="true" />
                        <span>Pause alerts</span>
                      </>
                    ) : (
                      <>
                        <Bell className="h-4 w-4" aria-hidden="true" />
                        <span>Enable alerts</span>
                      </>
                    )}
                  </Button>

                  <Button asChild variant="secondary">
                    <Link href={`/thesis/new?thesisId=${activeEntry.thesis.id}`}>
                      <Edit3 className="h-4 w-4" aria-hidden="true" />
                      <span>Edit thesis</span>
                    </Link>
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleDeleteThesis(activeEntry.thesis.id)}
                    loading={deletingId === activeEntry.thesis.id}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span>Delete</span>
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-14 text-slate tabular-figures">
                    Compare selected: {selectedCompareIds.length} / 3
                  </span>
                  {selectedCompareIds.length > 0 ? (
                    <Button asChild variant="action">
                      <Link
                        href={`/compare?ids=${selectedCompareIds.join(",")}&thesisId=${encodeURIComponent(
                          activeEntry.thesis.id
                        )}`}
                      >
                        <span>Compare selected ({selectedCompareIds.length})</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : activeEntry.matches.length >= 2 ? (
                    <Button asChild variant="action">
                      <Link
                        href={`/compare?ids=${activeEntry.matches
                          .slice(0, 3)
                          .map((m) => m.listing.id)
                          .join(",")}&thesisId=${encodeURIComponent(
                          activeEntry.thesis.id
                        )}`}
                      >
                        <span>Compare top {Math.min(3, activeEntry.matches.length)}</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </CardFooter>
            </Card>

            {/* Ranked Match Results */}
          <section aria-labelledby="ranked-matches-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id="ranked-matches-heading"
                className="font-serif text-28 font-semibold text-deep-navy"
              >
                Ranked matches ({activeEntry.matches.length})
              </h2>
              {selectedCompareIds.length > 0 ? (
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setSelectedCompareIds([])}
                >
                  Clear compare selection
                </Button>
              ) : null}
            </div>

            {activeEntry.matches.length === 0 ? (
              <CardStateEmpty
                title="No approved listings in the marketplace yet"
                description="When Admin reviewers approve new business listings, they will be ranked here automatically."
              />
            ) : (
              <div className="flex flex-col gap-6">
                {activeEntry.matches.map((match, idx) => (
                  <MatchResultCard
                    key={match.listing.id}
                    match={match}
                    rank={idx + 1}
                    titleAs="h3"
                    selectedForCompare={selectedCompareIds.includes(match.listing.id)}
                    compareDisabled={selectedCompareIds.length >= 3}
                    onToggleCompare={toggleCompare}
                  />
                ))}
              </div>
            )}
          </section>
            </div>
        </>
      ) : null}
    </div>
  );
}
