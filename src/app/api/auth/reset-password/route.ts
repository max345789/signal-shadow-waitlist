import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { findUserByEmail, updateAdminPassword } from "@/lib/auth/store";
import {
  generateAdminOtp,
  verifyAdminOtp,
  consumeAdminOtp,
} from "@/lib/auth/admin-otp";

export const dynamic = "force-dynamic";

const requestOtpSchema = z.object({
  action: z.literal("request_otp"),
  email: z.string().trim().email().max(254),
});

const verifyResetSchema = z.object({
  action: z.literal("verify_and_reset"),
  email: z.string().trim().email().max(254),
  otp: z.string().trim().length(6, "OTP must be exactly 6 digits."),
  newPassword: z.string().min(8, "Password must be at least 8 characters.").max(256),
});

export async function POST(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "local";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "local";

  const rateLimit = await checkRateLimit(`reset-pw:${clientIp}`, 20, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const rawAction = (body as { action?: string })?.action;

  if (rawAction === "request_otp") {
    const parsed = requestOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await findUserByEmail(email);

    // Only allow admin / staff accounts to reset via this admin OTP flow
    if (!user || (!user.roles.includes("ADMIN") && !user.roles.includes("REVIEWER"))) {
      // Return ambiguous success for security if user not found, or explicit message
      return NextResponse.json({
        ok: true,
        message: "If an authorized admin account exists with this email, an OTP has been generated.",
      });
    }

    const otpResult = generateAdminOtp(email);
    if (!otpResult.ok) {
      return NextResponse.json({ error: otpResult.error }, { status: 429 });
    }

    return NextResponse.json({
      ok: true,
      message: "6-digit OTP generated successfully.",
      devOtp: otpResult.code, // Returned for instant testing and usability
      expiresAt: otpResult.expiresAt,
    });
  }

  if (rawAction === "verify_and_reset") {
    const parsed = verifyResetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request format." }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const verification = verifyAdminOtp(email, parsed.data.otp);

    if (!verification.valid) {
      return NextResponse.json({ error: verification.reason || "Invalid OTP code." }, { status: 400 });
    }

    consumeAdminOtp(email, parsed.data.otp);

    const updateRes = await updateAdminPassword(email, parsed.data.newPassword);
    if (!updateRes.ok) {
      return NextResponse.json({ error: updateRes.error || "Failed to update password." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Password reset successful! You may now sign in with your new password.",
    });
  }

  return NextResponse.json({ error: "Invalid action. Supported: 'request_otp', 'verify_and_reset'" }, { status: 400 });
}
