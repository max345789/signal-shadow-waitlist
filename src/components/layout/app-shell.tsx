"use client";

import * as React from "react";
import Link from "next/link";
import {
  Menu,
  X,
  PanelLeft,
  PanelLeftClose,
  Building,
  Target,
  Compass,
  ArrowLeftRight,
  MessageSquare,
  PlusCircle,
  CreditCard,
  BookOpen,
  Scale,
  ShieldCheck,
  Palette,
  Home,
  User,
} from "lucide-react";
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
    | "legal-partners"
    | "admin"
    | "style-guide"
    | "signin";
  trustBanner?: {
    canTrustAnswer: string;
    nextStepAnswer: string;
  };
}

interface NavItem {
  key: NonNullable<AppShellProps["activeNav"]>;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "marketplace" | "deals" | "resources";
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  // Marketplace Group
  { key: "home", href: "/", label: "Home", icon: Home, group: "marketplace" },
  { key: "listings", href: "/listings", label: "Listings Directory", icon: Building, group: "marketplace" },
  { key: "matches", href: "/matches", label: "Matches & Alerts", icon: Target, group: "marketplace" },
  { key: "thesis", href: "/thesis/new", label: "Thesis Builder", icon: Compass, group: "marketplace" },
  { key: "compare", href: "/compare", label: "Compare Listings", icon: ArrowLeftRight, group: "marketplace" },

  // Deals Group
  { key: "deals", href: "/deals", label: "Connect Rooms", icon: MessageSquare, group: "deals" },
  { key: "verify", href: "/verify", label: "Profile Checks", icon: ShieldCheck, group: "deals" },

  // Resources Group
  { key: "sell", href: "/sell", label: "List a Business", icon: PlusCircle, group: "resources" },
  { key: "pricing", href: "/pricing", label: "Pricing", icon: CreditCard, group: "resources" },
  { key: "closing-guide", href: "/closing-guide", label: "Closing Guide", icon: BookOpen, group: "resources" },
  { key: "legal-partners", href: "/legal-partners", label: "Legal & CA Directory", icon: Scale, group: "resources" },
  { key: "style-guide", href: "/style-guide", label: "Style Guide", icon: Palette, group: "resources" },
];

export function AppShell({
  children,
  activeNav,
  trustBanner,
}: AppShellProps) {
  // Desktop side panel open state (default open on wide screens)
  const [isSidePanelOpen, setIsSidePanelOpen] = React.useState(true);
  // Mobile drawer open state
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = React.useState(false);

  // Close mobile drawer on Escape key
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsMobileDrawerOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const renderNavGroup = (group: "marketplace" | "deals" | "resources", title: string, isMobile = false) => {
    const items = NAV_ITEMS.filter((item) => item.group === group);
    return (
      <div className="flex flex-col gap-1">
        <span className="px-3 pt-3 pb-1 text-11 font-bold text-slate uppercase tracking-wider">
          {title}
        </span>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.key;
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={() => {
                if (isMobile) setIsMobileDrawerOpen(false);
              }}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md border text-14 font-medium transition-colors no-underline",
                isActive
                  ? "border-deep-navy bg-cloud text-deep-navy font-semibold"
                  : "border-transparent text-ink hover:bg-cloud hover:text-deep-navy"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-deep-navy" : "text-slate")} />
              <span className="truncate">{item.label}</span>
              {item.badge ? (
                <span className="ml-auto text-11 px-1.5 py-0.5 rounded bg-pale-blue text-trust-blue font-semibold">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-screen w-full bg-cloud text-ink flex overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-deep-navy focus:px-4 focus:py-2 focus:text-16 focus:text-white"
      >
        Skip to main content
      </a>

      {/* ─── DESKTOP CLOSEABLE SIDE PANEL (>= 1024px) ─── */}
      <aside
        id="desktop-side-panel"
        aria-label="Marketplace Navigation Side Panel"
        className={cn(
          "hidden lg:flex flex-col justify-between shrink-0 bg-white border-r border-mist h-full z-40 transition-all duration-200 ease-in-out",
          isSidePanelOpen ? "w-64 xl:w-72" : "w-0 -translate-x-full overflow-hidden border-none"
        )}
      >
        {/* Side Panel Header */}
        <div className="flex items-center justify-between h-16 sm:h-18 px-4 sm:px-5 border-b border-mist/70 shrink-0">
          <Link
            href="/"
            className="font-serif text-24 font-bold text-deep-navy no-underline hover:text-trust-blue transition-colors flex items-center gap-2"
          >
            <span>Baton</span>
          </Link>
          <button
            type="button"
            onClick={() => setIsSidePanelOpen(false)}
            aria-label="Close navigation side panel"
            title="Collapse side panel"
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-slate hover:text-deep-navy hover:bg-cloud transition-colors cursor-pointer"
          >
            <PanelLeftClose className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Side Panel Scrollable Navigation Body */}
        <div className="flex-1 overflow-y-auto px-3.5 py-3 flex flex-col gap-2">
          {renderNavGroup("marketplace", "Marketplace")}
          {renderNavGroup("deals", "Deals & Due Diligence")}
          {renderNavGroup("resources", "Platform & Resources")}
        </div>

        {/* Side Panel Footer */}
        <div className="p-4 border-t border-mist/70 flex flex-col gap-2.5 bg-white shrink-0">
          <Link
            href="/sell"
            className={cn(
              "inline-flex h-11 w-full items-center justify-center rounded-md border px-4 text-14 font-semibold transition-colors no-underline leading-none",
              activeNav === "sell"
                ? "border-deep-navy bg-cloud text-deep-navy font-semibold"
                : "border-deep-navy/35 bg-white text-deep-navy hover:bg-cloud hover:border-deep-navy"
            )}
          >
            <PlusCircle className="w-4 h-4 mr-2 text-trust-blue" />
            <span>List a business</span>
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/auth/signin?mode=signin"
              className={cn(
                "inline-flex h-10 w-full items-center justify-center rounded-md border px-3 text-14 font-medium transition-colors no-underline leading-none",
                activeNav === "signin"
                  ? "border-deep-navy bg-cloud text-deep-navy font-semibold"
                  : "border-deep-navy/30 bg-white text-deep-navy hover:bg-cloud"
              )}
            >
              <User className="w-4 h-4 mr-1.5" />
              <span>Sign in</span>
            </Link>
            <Link
              href="/auth/signin?mode=signup"
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-trust-blue bg-trust-blue text-white hover:bg-deep-navy hover:border-deep-navy px-3 text-14 font-semibold transition-colors no-underline leading-none"
            >
              <span>Sign up</span>
            </Link>
          </div>
        </div>
      </aside>

      {/* ─── MOBILE SLIDE-OUT DRAWER (< 1024px) ─── */}
      {isMobileDrawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Dimmed Backdrop */}
          <div
            className="fixed inset-0 bg-deep-navy/40 transition-opacity"
            onClick={() => setIsMobileDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Sidebar */}
          <aside
            id="mobile-side-panel"
            aria-label="Mobile Navigation Drawer"
            className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white border-r border-mist z-50 flex flex-col justify-between transition-transform"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-mist">
              <Link
                href="/"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="font-serif text-24 font-bold text-deep-navy no-underline"
              >
                Baton
              </Link>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                aria-label="Close navigation drawer"
                className="inline-flex items-center justify-center h-9 w-9 rounded-md text-slate hover:text-deep-navy hover:bg-cloud transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto px-3.5 py-3 flex flex-col gap-2">
              {renderNavGroup("marketplace", "Marketplace", true)}
              {renderNavGroup("deals", "Deals & Due Diligence", true)}
              {renderNavGroup("resources", "Platform & Resources", true)}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-mist flex flex-col gap-2.5 bg-white">
              <Link
                href="/sell"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="inline-flex h-11 w-full items-center justify-center rounded-md border border-deep-navy/35 bg-white text-deep-navy hover:bg-cloud text-14 font-semibold transition-colors no-underline leading-none"
              >
                <PlusCircle className="w-4 h-4 mr-2 text-trust-blue" />
                <span>List a business</span>
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/auth/signin?mode=signin"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="inline-flex h-10 w-full items-center justify-center rounded-md border border-deep-navy/30 bg-white text-deep-navy hover:bg-cloud text-14 font-medium transition-colors no-underline leading-none"
                >
                  <User className="w-4 h-4 mr-1.5" />
                  <span>Sign in</span>
                </Link>
                <Link
                  href="/auth/signin?mode=signup"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="inline-flex h-10 w-full items-center justify-center rounded-md border border-trust-blue bg-trust-blue text-white hover:bg-deep-navy hover:border-deep-navy text-14 font-semibold transition-colors no-underline leading-none"
                >
                  <span>Sign up</span>
                </Link>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {/* ─── MAIN CONTENT AREA (Stationary Header, Locked Side Panel, Scrollbar restricted below Header) ─── */}
      <div className="flex-1 min-w-0 h-screen flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="border-b border-mist bg-white shrink-0 h-16 sm:h-18 px-4 sm:px-6 lg:px-8 flex items-center z-30">
          <div className="w-full flex items-center justify-between gap-4">
            {/* Left Side: Toggle Panel Button + Brand Wordmark */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Desktop Toggle Button */}
              <button
                type="button"
                onClick={() => setIsSidePanelOpen((prev) => !prev)}
                aria-expanded={isSidePanelOpen}
                aria-controls="desktop-side-panel"
                aria-label={isSidePanelOpen ? "Collapse navigation panel" : "Open navigation panel"}
                className="hidden lg:inline-flex h-10 items-center justify-center gap-2 px-3.5 rounded-md border border-mist bg-cloud hover:bg-white text-deep-navy text-14 font-medium transition-colors cursor-pointer leading-none"
              >
                {isSidePanelOpen ? (
                  <>
                    <PanelLeftClose className="w-4 h-4 text-slate shrink-0" aria-hidden="true" />
                    <span>Collapse</span>
                  </>
                ) : (
                  <>
                    <PanelLeft className="w-4 h-4 text-trust-blue shrink-0" aria-hidden="true" />
                    <span>Navigation</span>
                  </>
                )}
              </button>

              {/* Mobile / Tablet Toggle Button */}
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(true)}
                aria-label="Open navigation menu"
                className="inline-flex lg:hidden h-10 w-10 items-center justify-center rounded-md border border-mist bg-cloud text-deep-navy hover:bg-white transition-colors cursor-pointer shrink-0"
              >
                <Menu className="w-5 h-5" aria-hidden="true" />
              </button>

              {/* Brand Wordmark */}
              <Link
                href="/"
                className={cn(
                  "font-serif text-24 sm:text-26 font-bold text-deep-navy no-underline hover:text-trust-blue transition-colors items-center tracking-tight",
                  isSidePanelOpen ? "lg:hidden" : "inline-flex"
                )}
              >
                Baton
              </Link>
            </div>

            {/* Right Side: Quick Action Buttons */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/sell"
                aria-current={activeNav === "sell" ? "page" : undefined}
                className={cn(
                  "hidden sm:inline-flex h-10 items-center justify-center px-4 rounded-md border border-deep-navy/35 bg-white text-deep-navy hover:bg-cloud hover:border-deep-navy text-14 font-medium transition-colors whitespace-nowrap leading-none",
                  activeNav === "sell"
                    ? "border-deep-navy bg-cloud text-deep-navy font-semibold"
                    : "border-deep-navy/35 bg-white text-deep-navy hover:bg-cloud hover:border-deep-navy"
                )}
              >
                List a business
              </Link>

              <Link
                href="/auth/signin?mode=signin"
                aria-current={activeNav === "signin" ? "page" : undefined}
                className="inline-flex h-10 items-center justify-center px-3.5 sm:px-4 rounded-md border border-deep-navy/30 bg-white text-deep-navy hover:bg-cloud text-14 font-medium transition-colors whitespace-nowrap leading-none"
              >
                Sign in
              </Link>

              <Link
                href="/auth/signin?mode=signup"
                className="inline-flex h-10 items-center justify-center px-3.5 sm:px-4 rounded-md border border-trust-blue bg-trust-blue text-white hover:bg-deep-navy hover:border-deep-navy text-14 font-semibold transition-colors whitespace-nowrap leading-none"
              >
                Sign up
              </Link>
            </div>
          </div>
        </header>

        {/* Scrollable Body (Scrollbar strictly restricted to content below the header) */}
        <div className="flex-1 min-w-0 overflow-y-auto flex flex-col justify-between">
          <div>

          {/* Trust Banner (C2 Mission / Vitals) */}
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

          {/* Page Body */}
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
                Listing rules
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
                href="/legal-partners"
                className="text-trust-blue underline hover:text-deep-navy text-14 min-h-[44px] inline-flex items-center"
              >
                Legal &amp; CA Directory
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
    </div>
  </div>
  );
}
