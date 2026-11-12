/**
 * Next.js instrumentation hook.
 * Decision 33: Error monitoring stubbed via captureException; wire Sentry when DSN is available.
 *
 * To activate Sentry:
 * 1. Install: npm install @sentry/nextjs
 * 2. Set NEXT_PUBLIC_SENTRY_DSN in your environment
 * 3. Uncomment the Sentry.init() call below
 */
export async function register() {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    // TODO: Uncomment when Sentry is installed and DSN is configured:
    // if (process.env.NEXT_RUNTIME === "nodejs") {
    //   const Sentry = await import("@sentry/nextjs");
    //   Sentry.init({
    //     dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    //     tracesSampleRate: 0.1,
    //   });
    // }
    // if (process.env.NEXT_RUNTIME === "edge") {
    //   const Sentry = await import("@sentry/nextjs/edge");
    //   Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN });
    // }
  }
}
