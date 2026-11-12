"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { SanitizedListingView } from "@/lib/domain/listings";
import { BUSINESS_SECTORS } from "@/lib/domain/valuation";
import { ListingCard } from "@/components/listings/listing-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardStateEmpty,
  CardStateError,
  CardStateLoading,
} from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";

export function ListingsDirectoryClient({
  initialListings,
}: {
  initialListings: SanitizedListingView[];
}) {
  const [listings, setListings] = React.useState<SanitizedListingView[]>(initialListings);
  const [sector, setSector] = React.useState<string>("ALL");
  const [query, setQuery] = React.useState<string>("");
  const [verifiedOnly, setVerifiedOnly] = React.useState<boolean>(false);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  async function applyFilters(next?: {
    sector?: string;
    query?: string;
    verifiedOnly?: boolean;
  }) {
    const activeSector = next?.sector ?? sector;
    const activeQuery = next?.query ?? query;
    const activeVerified = next?.verifiedOnly ?? verifiedOnly;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeSector !== "ALL") params.set("sector", activeSector);
      if (activeQuery.trim()) params.set("q", activeQuery.trim());
      if (activeVerified) params.set("verifiedOnly", "true");

      const res = await fetch(`/api/listings?${params.toString()}`);
      if (!res.ok) {
        setError("Could not refresh business listings. Try again.");
        return;
      }
      const data = await res.json();
      setListings(data.listings ?? []);
    } catch {
      setError("Network error while loading business listings.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setSector("ALL");
    setQuery("");
    setVerifiedOnly(false);
    void applyFilters({ sector: "ALL", query: "", verifiedOnly: false });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Approved business listings
          </h1>
          <p className="max-w-[720px] text-16 text-slate">
            Every approved listing clearly separates third-party verified metrics from
            seller-reported figures. Identifying details remain redacted until NDA.
          </p>
        </div>

        <Button asChild variant="primary">
          <Link href="/sell">List your business</Link>
        </Button>
      </div>

      {/* Filter Bar */}
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void applyFilters();
          }}
          className="grid grid-cols-1 gap-4 md:grid-cols-4 md:items-end"
        >
          <div className="md:col-span-2">
            <Input
              label="Search listings"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sector, geography, or summary..."
            />
          </div>

          <Select
            label="Sector"
            value={sector}
            onChange={(e) => {
              const nextSector = e.target.value;
              setSector(nextSector);
              void applyFilters({ sector: nextSector });
            }}
          >
            <option value="ALL">All sectors</option>
            {BUSINESS_SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>

          <div className="flex flex-col gap-2">
            <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded border border-mist bg-white px-4 py-2 text-16 text-ink">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => {
                  const nextVal = e.target.checked;
                  setVerifiedOnly(nextVal);
                  void applyFilters({ verifiedOnly: nextVal });
                }}
                className="h-4 w-4 accent-trust-blue"
              />
              <span>Has verified vitals</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:col-span-4">
            <Button type="submit" variant="action" loading={loading}>
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Filter listings</span>
            </Button>
            <Button type="button" variant="secondary" onClick={handleReset}>
              Reset filters
            </Button>
            <span className="ml-auto text-14 text-slate tabular-figures">
              Showing {listings.length}{" "}
              {listings.length === 1 ? "listing" : "listings"}
            </span>
          </div>
        </form>
      </Card>

      {loading ? (
        <CardStateLoading
          title="Loading approved listings"
          description="Checking latest verification statuses and redaction controls."
        />
      ) : error ? (
        <CardStateError message={error} onRetry={() => void applyFilters()} />
      ) : listings.length === 0 ? (
        <CardStateEmpty
          title="No approved listings match these filters"
          description="Try resetting your sector or keyword filters, or check back after pending seller listings complete Admin review."
          actionLabel="Reset filters"
          onAction={handleReset}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} titleAs="h2" />
          ))}
        </div>
      )}
    </div>
  );
}
