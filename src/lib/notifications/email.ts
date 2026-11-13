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
  ADMIN_OTP: "admin_otp",
  USER_WELCOME: "user_welcome",
} as const;

export type EmailEventType = (typeof EMAIL_EVENTS)[keyof typeof EMAIL_EVENTS];

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  eventType: EmailEventType;
}

/**
 * Email dispatch handler with native zero-dependency Resend REST integration.
 * Fires asynchronously without blocking request execution.
 *
 * When RESEND_API_KEY is configured in environment variables, emails are
 * dispatched to real recipients immediately. Otherwise, intent is logged cleanly.
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  // Always log intent for auditability (no PII in body is enforced by callers)
  console.info("[EmailDispatch] Stub — intent logged", {
    eventType: params.eventType,
    subject: params.subject,
    to: process.env.NODE_ENV === "development" ? params.to : "[redacted]",
  });

  const resendApiKey = process.env.RESEND_API_KEY;
  const isLiveEnabled = process.env.ENABLE_LIVE_EMAIL === "true" || Boolean(resendApiKey);

  if (!isLiveEnabled) {
    return;
  }

  if (resendApiKey) {
    try {
      const fromAddress = process.env.EMAIL_FROM || "Baton <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [params.to],
          subject: params.subject,
          text: params.body,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("[EmailDispatch] Resend delivery failed:", res.status, errorText);
      } else {
        console.info("[EmailDispatch] Live email delivered via Resend to recipient.");
      }
    } catch (err) {
      console.error("[EmailDispatch] Network error during live email delivery:", err);
    }
    return;
  }

  console.warn(
    "[EmailDispatch] ENABLE_LIVE_EMAIL=true but RESEND_API_KEY is not set. Email not sent."
  );
}
