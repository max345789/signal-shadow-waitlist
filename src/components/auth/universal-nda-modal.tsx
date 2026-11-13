"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle2, Lock, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function UniversalNdaModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [entityName, setEntityName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsText, setTermsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let ignore = false;
    fetch("/api/auth/universal-nda")
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) {
          if (data.terms) setTermsText(data.terms);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          setError("Failed to load confidentiality terms.");
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSign(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (signerName.trim().length < 2) {
      setError("Enter your full legal name for electronic signature.");
      return;
    }

    if (!acceptedTerms) {
      setError("You must acknowledge and accept the confidentiality terms.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/universal-nda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerName: signerName.trim(),
          signerTitle: signerTitle.trim() || undefined,
          entityName: entityName.trim() || undefined,
          acceptedTerms: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to record NDA signature.");
        return;
      }

      onSuccess?.();
      onClose();
    } catch {
      setError("Network error while submitting signature. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-2xl rounded-lg border border-mist bg-white p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-mist pb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-trust-blue" aria-hidden="true" />
            <h3 className="text-18 font-semibold text-deep-navy">
              Universal Master Buyer NDA &amp; Confidentiality Agreement
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate hover:bg-cloud hover:text-deep-navy"
            aria-label="Close NDA modal"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSign} className="flex flex-col gap-5 py-4 text-14 text-slate">
          <div className="rounded border border-trust-blue/20 bg-trust-blue/5 p-3 text-13 text-deep-navy flex items-start gap-2.5">
            <Lock className="h-4 w-4 text-trust-blue shrink-0 mt-0.5" />
            <span>
              <strong>Sign Once, Access Everywhere:</strong> As on Baton.com, signing this universal agreement grants you immediate confidentiality clearance across all current and future business listings on Baton India.
            </span>
          </div>

          {/* Terms Window */}
          <div className="rounded border border-mist bg-cloud p-3.5 max-h-48 overflow-y-auto text-12 font-mono text-slate whitespace-pre-wrap leading-relaxed select-text">
            {loading ? "Loading agreement terms..." : termsText}
          </div>

          {error && (
            <div className="rounded border border-brick-red bg-brick-red/10 p-3 text-13 text-brick-red">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <Input
              label="Signer Legal Full Name"
              required
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              helperText="Must match your government ID or official business profile."
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Professional Title (Optional)"
                value={signerTitle}
                onChange={(e) => setSignerTitle(e.target.value)}
                placeholder="e.g. Managing Director / Principal"
              />
              <Input
                label="Acquiring Entity / Firm (Optional)"
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                placeholder="e.g. Sharma Capital Ventures LLP"
              />
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="h-4 w-4 rounded border-mist text-trust-blue mt-0.5 accent-trust-blue"
              />
              <span className="text-13 text-deep-navy leading-normal">
                I have read and hereby execute the <strong>Baton Master Buyer Confidentiality Agreement</strong>. I understand that all non-public records, source code, and customer information are legally protected.
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t border-mist pt-4 mt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="action" disabled={submitting || !acceptedTerms}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              <span>{submitting ? "Signing & Recording..." : "Execute Master NDA"}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
