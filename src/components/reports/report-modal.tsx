"use client";

import React, { useState } from "react";
import { AlertTriangle, Flag, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export interface ReportModalProps {
  listingId: string;
  listingTitle?: string;
  listingSlug?: string;
  className?: string;
}

const REPORT_REASONS = [
  { id: "fake_figures", label: "Fake figures or false financial claims" },
  { id: "ip_breach", label: "IP breach or unauthorized asset listing" },
  { id: "impersonation", label: "Impersonation or unauthorized seller" },
  { id: "scam", label: "Fraudulent or suspicious behavior" },
  { id: "duplicate", label: "Duplicate or spam listing" },
  { id: "other", label: "Other platform rule violation" },
];

export function ReportModal({
  listingId,
  listingTitle,
  listingSlug,
  className = "",
}: ReportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0]?.id || "fake_figures");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!details.trim()) {
      setError("Please describe the issue in detail.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          listingTitle,
          listingSlug,
          reason,
          details,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit report.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error while submitting report.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setIsOpen(false);
    setSubmitted(false);
    setDetails("");
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1.5 text-14 text-slate hover:text-brick-red transition-colors min-h-[44px] ${className}`}
        aria-label="Report this listing"
      >
        <Flag className="h-4 w-4" />
        <span>Report this listing</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-deep-navy p-4 overflow-y-auto"
        >
          <div className="relative w-full max-w-lg rounded border border-mist bg-white p-6">
            <button
              type="button"
              onClick={handleClose}
              className="absolute top-4 right-4 text-slate hover:text-deep-navy min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            {submitted ? (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <CheckCircle2 className="h-12 w-12 text-verified-green" />
                <h2 id="report-dialog-title" className="text-20 font-bold text-deep-navy">
                  Report submitted
                </h2>
                <p className="text-14 text-slate max-w-sm">
                  Thank you for keeping Baton trusted. Our review team will
                  investigate this listing according to our Report and Takedown
                  policy.
                </p>
                <Button variant="secondary" onClick={handleClose} className="mt-2 min-h-[44px]">
                  Close
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-brick-red">
                  <AlertTriangle className="h-5 w-5" />
                  <h2 id="report-dialog-title" className="text-18 font-bold text-deep-navy">
                    Report listing
                  </h2>
                </div>

                <p className="text-14 text-slate">
                  Help us maintain platform integrity. Reports are reviewed by staff
                  under the Baton Listing Rules and Takedown Policy.
                </p>

                {error && (
                  <div className="rounded border border-brick-red bg-white p-3 text-14 text-brick-red">
                    {error}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <label htmlFor="report-reason" className="text-14 font-semibold text-deep-navy">
                    Reason
                  </label>
                  <select
                    id="report-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded border border-mist bg-white px-3 py-2 text-14 text-ink focus:border-trust-blue focus:outline-none min-h-[44px]"
                  >
                    {REPORT_REASONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <Textarea
                  id="report-details"
                  label="Details"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Provide specific details or links to evidence..."
                  rows={4}
                  required
                />

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleClose}
                    className="min-h-[44px]"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="action"
                    loading={submitting}
                    loadingLabel="Submitting..."
                    className="min-h-[44px]"
                  >
                    Submit report
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
