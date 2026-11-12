import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyTotpCode } from "@/lib/auth/crypto";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth/session";
import { getServerSession } from "@/lib/auth/session-server";
import { findUserById, recordTwoFactorVerification } from "@/lib/auth/store";
import type { AuthSession } from "@/lib/auth/types";

const verifySchema = z.object({
  code: z
    .string()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit authenticator code.")),
});

export async function POST(request: Request) {
  const existingSession = await getServerSession();
  if (!existingSession) {
    return NextResponse.json(
      { error: "Sign in before verifying two-factor authentication." },
      { status: 401 }
    );
  }

  const rateLimit = await checkRateLimit(`2fa:${existingSession.userId}`, 5, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many verification attempts. Wait before trying again.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter a 6-digit numeric code." },
      { status: 400 }
    );
  }

  const user = await findUserById(existingSession.userId);
  if (!user || !user.twoFactorSecret) {
    return NextResponse.json(
      { error: "Two-factor authenticator is not enrolled on this account." },
      { status: 400 }
    );
  }

  const valid = verifyTotpCode(user.twoFactorSecret, user.email, parsed.data.code);
  if (!valid) {
    return NextResponse.json(
      { error: "Verification code was incorrect or expired." },
      { status: 401 }
    );
  }

  const verifiedAt = new Date();
  await recordTwoFactorVerification(user.id, verifiedAt);

  const updatedSession: AuthSession = {
    ...existingSession,
    twoFactorEnabled: true,
    twoFactorVerifiedAt: verifiedAt.toISOString(),
  };

  const token = await signSessionToken(updatedSession);
  const response = NextResponse.json(
    {
      session: updatedSession,
      dealRoomAccessUnlocked: true,
    },
    { status: 200 }
  );

  const isSecure =
    request.url.startsWith("https://") ||
    request.headers.get("x-forwarded-proto") === "https";

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
