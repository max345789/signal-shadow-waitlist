import * as React from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

export interface AppShellProps {
  children: React.ReactNode;
  activeNav?:
    | "home"
    | "listings"
    | "thesis"
    | "matches"
    | "compare"
    | "sell"
    | "seller"
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
    { key: "sell", href: "/sell", label: "List a business" },
    { key: "seller", href: "/seller", label: "Seller" },
    { key: "admin", href: "/admin/review", label: "Review queue" },
    { key: "style-guide", href: "/style-guide", label: "Style Guide" },
  ];

  return (
    <div className="min-h-screen bg-cloud text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-deep-navy focus:px-4 focus:py-2 focus:text-16 focus:text-white"
      >
        Skip to main content
      </a>

      <header className="border-b border-mist bg-white">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between sm:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-serif text-20 font-semibold text-deep-navy no-underline hover:text-trust-blue"
          >
            <ShieldCheck className="h-6 w-6 shrink-0 text-trust-blue" aria-hidden="true" />
            <span>Trust Marketplace</span>
          </Link>

          <nav aria-label="Primary navigation" className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={activeNav === item.key ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 items-center rounded border px-4 py-2 text-16 font-medium no-underline state-transition",
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
                "inline-flex min-h-12 items-center rounded border px-4 py-2 text-16 font-medium no-underline state-transition",
                activeNav === "signin"
                  ? "border-deep-navy bg-deep-navy text-white font-semibold"
                  : "border-mist bg-white text-deep-navy hover:bg-cloud hover:border-deep-navy"
              )}
            >
              Sign in &amp; 2FA
            </Link>
          </nav>
        </div>
      </header>

      {trustBanner ? (
        <section
          aria-label="Verification and next step summary"
          className="border-b border-mist bg-white"
        >
          <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-8">
            <div className="flex flex-col gap-2 rounded border border-mist bg-cloud p-4">
              <span className="text-14 font-semibold text-deep-navy">
                Can I trust this?
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
        </section>
      ) : null}

      <main
        id="main-content"
        className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-8"
      >
        {children}
      </main>

      <footer className="mt-8 border-t border-mist bg-white">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-2 px-4 py-6 text-14 text-slate sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>
            Trust Marketplace — Phase 2: Buyer thesis, matching, and vitals. Verified marks require active verification records.
          </span>
          <span>
            Legal templates and regulatory positions require qualified counsel review prior to launch.
          </span>
        </div>
      </footer>
    </div>
  );
}
