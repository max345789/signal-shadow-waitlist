/**
 * Email notification dispatch stub.
 * Decision 32: Email notifications are stubbed; no PII leaves the server without live provider wired.
 *
 * To activate live email:
 * 1. Install your preferred provider SDK (Resend, SendGrid, Postmark, etc.)
 * 2. Set ENABLE_LIVE_EMAIL=true and the provider's API key env variable
 * 3. Implement the sendLiveEmail branch below
 */

export const EMAIL_EVENTS = {
  THESIS_MATCH_ALERT: "thesis_match_alert",
  VERIFICATION_APPROVED: "verification_approved",
  VERIFICATION_FAILED: "verification_failed",
  DEAL_STAGE_CHANGED: "deal_stage_changed",
  ESCROW_STATUS_CHANGED: "escrow_status_changed",
  NDA_SIGNED: "nda_signed",
  DEAL_CANCELLED: "deal_cancelled",
} as const;

export type EmailEventType = (typeof EMAIL_EVENTS)[keyof typeof EMAIL_EVENTS];

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  eventType: EmailEventType;
}

/**
 * Fire-and-forget email dispatch stub.
 * Never awaited in hot paths — call without await.
 *
 * Logs intent; does NOT send real email unless ENABLE_LIVE_EMAIL=true and
 * a live provider is wired.
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  // Always log intent for auditability (no PII in body is enforced by callers)
  console.info("[EmailDispatch] Stub — intent logged", {
    eventType: params.eventType,
    subject: params.subject,
    // Redact recipient PII from logs in production
    to: process.env.NODE_ENV === "development" ? params.to : "[redacted]",
  });

  if (process.env.ENABLE_LIVE_EMAIL !== "true") {
    // Needs live email provider (Resend/SendGrid/Postmark) wired here.
    // Example with Resend:
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.emails.send({ from: "noreply@trustmarketplace.com", to: params.to, subject: params.subject, text: params.body });
    return;
  }

  // TODO: Wire live provider when ENABLE_LIVE_EMAIL=true
  // Needs live email provider (Resend/SendGrid/Postmark) — configure here.
  console.warn(
    "[EmailDispatch] ENABLE_LIVE_EMAIL=true but no provider is wired. Email not sent."
  );
}
