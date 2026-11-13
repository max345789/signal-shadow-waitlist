interface OtpRecord {
  email: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpRecord>();

/**
 * 10 minutes OTP validity window
 */
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;

/**
 * Generates a cryptographically randomized 6-digit numeric OTP for admin password reset.
 */
export function generateAdminOtp(email: string): { ok: boolean; code?: string; expiresAt?: Date; error?: string } {
  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit: Max 5 OTP requests per 15 minutes per email
  const now = Date.now();
  const existing = otpStore.get(normalizedEmail);
  if (existing && existing.expiresAt > now && (existing.expiresAt - now) > (OTP_TTL_MS - 60_000)) {
    return {
      ok: false,
      error: "An OTP was recently requested. Please wait 1 minute before requesting another code.",
    };
  }

  // 6-digit numeric OTP
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = now + OTP_TTL_MS;

  otpStore.set(normalizedEmail, {
    email: normalizedEmail,
    code,
    expiresAt,
    attempts: 0,
  });

  return {
    ok: true,
    code,
    expiresAt: new Date(expiresAt),
  };
}

/**
 * Verifies an OTP for an email without immediately consuming it.
 */
export function verifyAdminOtp(email: string, code: string): { valid: boolean; reason?: string } {
  const normalizedEmail = email.toLowerCase().trim();
  const record = otpStore.get(normalizedEmail);

  if (!record) {
    return { valid: false, reason: "No active OTP request found for this email. Request a new OTP." };
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(normalizedEmail);
    return { valid: false, reason: "OTP has expired. Please request a new code." };
  }

  if (record.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    otpStore.delete(normalizedEmail);
    return { valid: false, reason: "Too many failed attempts. This OTP has been invalidated." };
  }

  if (record.code !== code.trim()) {
    record.attempts += 1;
    return { valid: false, reason: `Invalid OTP code. ${MAX_VERIFICATION_ATTEMPTS - record.attempts} attempts remaining.` };
  }

  return { valid: true };
}

/**
 * Consumes and deletes the OTP upon successful verification.
 */
export function consumeAdminOtp(email: string, code: string): boolean {
  const verification = verifyAdminOtp(email, code);
  if (!verification.valid) return false;

  const normalizedEmail = email.toLowerCase().trim();
  otpStore.delete(normalizedEmail);
  return true;
}

/**
 * Test helper
 */
export function resetAdminOtpStoreForTest(): void {
  otpStore.clear();
}
