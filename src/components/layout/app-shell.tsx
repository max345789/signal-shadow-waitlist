"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { PageContainer } from "@/components/layout/page-container";
import { SITE_CONFIG } from "@/lib/config/site";

export interface AppShellProps {
  children: React.ReactNode;
  activeNav?:
    | "home"
    | "listings"
    | "thesis"
    | "matches"
    | "compare"
    | "deals"
    | "sell"
    | "seller"
    | "verify"
    | "pricing"
    | "billing"
    | "closing-guide"
    | "admin"
    | "style-guide"
    | "signin";
  trustBanner?: {
    canTrustAnswer: string;
    nextStepAnswer: string;
  };
}

export function AppShell({
  children,
  activeNav,
  trustBanner,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navItems: Array<{
    key: NonNullable<AppShellProps["activeNav"]>;
    href: string;
    label: string;
  }> = [
    { key: "home", href: "/", label: "Home" },
    { key: "listings", href: "/listings", label: "Listings" },
    { key: "thesis", href: "/thesis/new", label: "Thesis builder" },
    { key: "matches", href: "/matches", label: "Matches" },
    { key: "compare", href: "/compare", label: "Compare" },
    { key: "deals", href: "/deals", label: "Connect rooms" },
    { key: "sell", href: "/sell", label: "List a business" },
    { key: "pricing", href: "/pricing", label: "Pricing" },
    { key: "closing-guide", href: "/closing-guide", label: "Closing guide" },
    { key: "verify", href: "/verify", label: "Profile checks" },
    { key: "admin", href: "/admin/review", label: "Review & Reports" },
    { key: "style-guide", href: "/style-guide", label: "Style Guide" },
  ];

  return (
    <div className="min-h-screen bg-cloud text-ink flex flex-col justify-between">
      <div>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-deep-navy focus:px-4 focus:py-2 focus:text-16 focus:text-white"
        >
          Skip to main content
        </a>

        <header className="border-b border-mist bg-white">
          <PageContainer className="py-4">
            <div className="flex items-center justify-between">
              {/* C11: Wordmark: Baton (Source Serif 4, Deep Navy). No logo icon. */}
              <Link
                href="/"
                className="font-serif text-28 font-semibold text-deep-navy no-underline hover:text-trust-blue transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-trust-blue rounded py-1 px-2"
              >
                Baton
              </Link>

              {/* Desktop Navigation (>= 1024px) */}
              <nav
                aria-label="Primary navigation"
                className="hidden lg:flex flex-wrap items-center gap-1"
              >
                {navItems.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={activeNav === item.key ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-[44px] items-center rounded border px-3 py-2 text-16 font-medium no-underline state-transition",
                      activeNav === item.key
                        ? "border-deep-navy bg-cloud text-deep-navy font-semibold"
                        : "border-transparent text-ink hover:bg-cloud hover:text-deep-navy"
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  href="/auth/signin"
                  aria-current={activeNav === "signin" ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-[44px] items-center rounded border px-3 py-2 text-16 font-medium no-underline state-transition ml-2",
                    activeNav === "signin"
                      ? "border-deep-navy bg-deep-navy text-white font-semibold"
                      : "border-mist bg-white text-deep-navy hover:bg-cloud hover:border-deep-navy"
                  )}
                >
                  Sign in
                </Link>
              </nav>

              {/* Mobile Menu Toggle Button (< 1024px) */}
              <div className="flex items-center gap-2 lg:hidden">
                <Link
                  href="/auth/signin"
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border border-mist bg-white px-3 py-2 text-16 font-medium text-deep-navy"
                >
                  Sign in
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((open) => !open)}
                  aria-expanded={mobileMenuOpen}
                  aria-label={mobileMenuOpen ? "Close menu" : "Open navigation menu"}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border border-mist bg-cloud p-2 text-deep-navy hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-trust-blue"
                >
                  {mobileMenuOpen ? (
                    <X className="h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Menu className="h-6 w-6" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Mobile Navigation Drawer */}
            {mobileMenuOpen ? (
              <nav
                aria-label="Mobile navigation"
                className="mt-4 flex flex-col gap-1 border-t border-mist pt-4 lg:hidden"
              >
                {navItems.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={activeNav === item.key ? "page" : undefined}
                    className={cn(
                      "flex min-h-[44px] items-center rounded border px-4 py-2.5 text-16 font-medium no-underline state-transition",
                      activeNav === item.key
                        ? "border-deep-navy bg-cloud text-deep-navy font-semibold"
                        : "border-transparent text-ink hover:bg-cloud hover:text-deep-navy"
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            ) : null}
          </PageContainer>
        </header>

        {trustBanner ? (
          <section
            aria-label="Verification and next step summary"
            className="border-b border-mist bg-white"
          >
            <PageContainer className="py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2 rounded border border-mist bg-cloud p-4">
                  <span className="text-14 font-semibold text-deep-navy">
                    What has been checked, and what hasn&apos;t?
                  </span>
                  <p className="text-16 text-ink">{trustBanner.canTrustAnswer}</p>
                </div>
                <div className="flex flex-col gap-2 rounded border border-mist bg-cloud p-4">
                  <span className="text-14 font-semibold text-deep-navy">
                    What happens next?
                  </span>
                  <p className="text-16 text-ink">{trustBanner.nextStepAnswer}</p>
                </div>
              </div>
            </PageContainer>
          </section>
        ) : null}

        <main id="main-content" className="py-8">
          <PageContainer>{children}</PageContainer>
        </main>
      </div>

      {/* C2, C8, C11: Footer with Baton introduction platform disclaimer & legal links */}
      <footer className="mt-12 border-t border-mist bg-white">
        <PageContainer className="py-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4 text-14">
            <span className="text-slate font-medium">Baton Legal Pack:</span>
            <Link
              href="/legal/terms"
              className="text-trust-blue underline hover:text-deep-navy text-14 min-h-[44px] inline-flex items-center"
            >
              Terms of Service
            </Link>
            <Link
              href="/legal/privacy"
              className="text-trust-blue underline hover:text-deep-navy text-14 min-h-[44px] inline-flex items-center"
            >
              Privacy Policy
            </Link>
            <Link
              href="/legal/rules"
              className="text-trust-blue underline hover:text-deep-navy text-14 min-h-[44px] inline-flex items-center"
            >
              Listing Rules
            </Link>
            <Link
              href="/legal/takedown"
              className="text-trust-blue underline hover:text-deep-navy text-14 min-h-[44px] inline-flex items-center"
            >
              Report &amp; Takedown
            </Link>
            <Link
              href="/closing-guide"
              className="text-trust-blue underline hover:text-deep-navy text-14 min-h-[44px] inline-flex items-center"
            >
              Closing Guide
            </Link>
            <Link
              href="/pricing"
              className="text-trust-blue underline hover:text-deep-navy text-14 min-h-[44px] inline-flex items-center"
            >
              Pricing
            </Link>
          </div>
          <div className="flex flex-col gap-2 border-t border-mist pt-4 sm:flex-row sm:items-center sm:justify-between text-14 text-slate">
            <p className="text-14 text-slate m-0">
              {SITE_CONFIG.footerDisclaimer}
            </p>
            <span className="text-14 text-slate shrink-0">
              Legal templates require qualified counsel review prior to launch.
            </span>
          </div>
        </PageContainer>
      </footer>
    </div>
  );
}
