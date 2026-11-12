/**
 * Analytics event tracking stub.
 * Decision 34: Analytics events stubbed; no PII tracked; wire PostHog/Plausible when ready.
 *
 * Rules enforced by this module:
 * - No PII (names, emails, addresses) in event properties
 * - Fire-and-forget — never await in hot paths
 * - Gated on NEXT_PUBLIC_ANALYTICS_ENABLED=true
 */

export const ANALYTICS_EVENTS = {
  PAGE_VIEW: "page_view",
  THESIS_CREATED: "thesis_created",
  MATCH_VIEWED: "match_viewed",
  LISTING_VIEWED: "listing_viewed",
  DEAL_ROOM_OPENED: "deal_room_opened",
  NDA_SIGNED: "nda_signed",
  DEAL_COMPLETED: "deal_completed",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * Track an analytics event.
 * - Never include PII (name, email, company name) in properties.
 * - Use anonymised IDs (userId hashes, listingId slugs) only.
 * - Fire-and-forget: do not await this call in render or API hot paths.
 */
export function trackEvent(
  name: string,
  properties?: Record<string, unknown>
): void {
  if (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "true") {
    return;
  }

  // TODO: Wire provider when NEXT_PUBLIC_ANALYTICS_ENABLED=true
  // Example with PostHog:
  // posthog.capture(name, properties);
  // Example with Plausible:
  // plausible(name, { props: properties });
  console.info("[Analytics] Event:", name, properties ?? {});
}
