import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { isAuthorizedAdmin } from "@/lib/auth/permissions";
import {
  findUserByEmail,
  updateAdminEmail,
  updateAdminPassword,
  verifyAdminPassword,
} from "@/lib/auth/store";
import {
  generateAdminOtp,
  verifyAdminOtp,
  consumeAdminOtp,
} from "@/lib/auth/admin-otp";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth/session";
import type { AuthSession } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (!isAuthorizedAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  return NextResponse.json({
    email: session!.email,
    name: session!.name,
    roles: session!.roles,
  });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!isAuthorizedAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: {
    action: "change_email" | "change_password" | "request_otp" | "reset_with_otp";
    newEmail?: string;
    currentPassword?: string;
    newPassword?: string;
    otp?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "change_email") {
    if (!body.newEmail || !body.newEmail.includes("@")) {
      return NextResponse.json({ error: "A valid new email address is required." }, { status: 400 });
    }

    const currentEmail = session!.email;
    const newEmail = body.newEmail.trim().toLowerCase();

    const res = await updateAdminEmail(currentEmail, newEmail);
    if (!res.ok) {
      return NextResponse.json({ error: res.error || "Failed to update email." }, { status: 400 });
    }

    // Refresh active session token with new email
    const updatedSession: AuthSession = {
      ...session!,
      email: newEmail,
    };
    const newToken = await signSessionToken(updatedSession);

    const response = NextResponse.json({
      ok: true,
      message: `Admin email updated to ${newEmail}`,
      newEmail,
    });

    const isSecure = request.url.startsWith("https://") || request.headers.get("x-forwarded-proto") === "https";
    response.cookies.set(SESSION_COOKIE_NAME, newToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  }

  if (body.action === "change_password") {
    if (!body.currentPassword) {
      return NextResponse.json({ error: "Current password is required." }, { status: 400 });
    }
    if (!body.newPassword || body.newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
    }

    const validCurrent = await verifyAdminPassword(session!.email, body.currentPassword);
    if (!validCurrent) {
      return NextResponse.json({ error: "Current password does not match." }, { status: 401 });
    }

    const res = await updateAdminPassword(session!.email, body.newPassword);
    if (!res.ok) {
      return NextResponse.json({ error: res.error || "Failed to update password." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Admin password successfully updated.",
    });
  }

  if (body.action === "request_otp") {
    const otpResult = generateAdminOtp(session!.email);
    if (!otpResult.ok) {
      return NextResponse.json({ error: otpResult.error }, { status: 429 });
    }

    return NextResponse.json({
      ok: true,
      message: "6-digit OTP generated successfully.",
      devOtp: otpResult.code,
      expiresAt: otpResult.expiresAt,
    });
  }

  if (body.action === "reset_with_otp") {
    if (!body.otp || body.otp.trim().length !== 6) {
      return NextResponse.json({ error: "6-digit OTP code is required." }, { status: 400 });
    }
    if (!body.newPassword || body.newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
    }

    const verification = verifyAdminOtp(session!.email, body.otp);
    if (!verification.valid) {
      return NextResponse.json({ error: verification.reason || "Invalid OTP." }, { status: 400 });
    }

    consumeAdminOtp(session!.email, body.otp);

    const res = await updateAdminPassword(session!.email, body.newPassword);
    if (!res.ok) {
      return NextResponse.json({ error: res.error || "Failed to reset password." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Password reset successfully via OTP.",
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
