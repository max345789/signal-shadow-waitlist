/**
 * Error monitoring stub.
 * Decision 33: Error monitoring stubbed via captureException; wire Sentry when DSN is available.
 * No external calls are made unless NEXT_PUBLIC_SENTRY_DSN is configured.
 */
export function captureException(
  err: unknown,
  context?: Record<string, unknown>
): void {
  console.error("[ErrorMonitor]", err, context);
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    // TODO: Wire Sentry when DSN is available:
    // import * as Sentry from "@sentry/nextjs";
    // Sentry.captureException(err, { extra: context });
  }
}
