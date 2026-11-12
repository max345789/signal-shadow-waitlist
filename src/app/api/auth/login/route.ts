import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/crypto";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth/session";
import { findUserByEmail } from "@/lib/auth/store";
import type { AuthSession } from "@/lib/auth/types";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(256, "Password exceeds maximum allowed length."),
});

export async function POST(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "local";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "local";

  const rateLimit = await checkRateLimit(`login:${clientIp}`, 30, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many sign-in attempts. Wait before trying again.",
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

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid email or password format." },
      { status: 400 }
    );
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const emailRateLimit = await checkRateLimit(`login:email:${normalizedEmail}`, 10, 60_000);
  if (!emailRateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many sign-in attempts for this account. Wait before trying again.",
        retryAfterSeconds: emailRateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(emailRateLimit.retryAfterSeconds) },
      }
    );
  }

  const user = await findUserByEmail(normalizedEmail);
  if (!user || !user.passwordHash || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return NextResponse.json(
      { error: "Email or password did not match." },
      { status: 401 }
    );
  }

  const session: AuthSession = {
    userId: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    twoFactorEnabled: user.twoFactorEnabled,
    twoFactorVerifiedAt: null,
    authMode: user.authMode,
    isSampleAccount: user.isSampleAccount,
  };

  const token = await signSessionToken(session);
  const response = NextResponse.json(
    {
      session,
      nextStep: "TWO_FACTOR_REQUIRED_FOR_DEAL_ROOM",
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
