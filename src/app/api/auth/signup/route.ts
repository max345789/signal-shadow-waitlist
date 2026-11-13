import { NextResponse } from "next/server";
import { z } from "zod";
import { registerCustomerUser } from "@/lib/auth/store";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth/session";
import type { AuthSession } from "@/lib/auth/types";
import { sendEmail, EMAIL_EVENTS } from "@/lib/notifications/email";

const signupSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(100),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(256, "Password exceeds maximum allowed length."),
  role: z.enum(["BUYER", "SELLER"]).default("BUYER"),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid registration details." },
      { status: 400 }
    );
  }

  const res = await registerCustomerUser({
    name: parsed.data.name,
    email: parsed.data.email,
    password: parsed.data.password,
    role: parsed.data.role,
  });

  if (!res.ok || !res.user) {
    return NextResponse.json({ error: res.error || "Registration failed." }, { status: 400 });
  }

  const session: AuthSession = {
    userId: res.user.id,
    email: res.user.email,
    name: res.user.name,
    roles: res.user.roles,
    twoFactorEnabled: false,
    twoFactorVerifiedAt: null,
    authMode: res.user.authMode,
    isSampleAccount: false,
  };

  const token = await signSessionToken(session);
  const redirectUrl = parsed.data.role === "SELLER" ? "/sell" : "/listings";

  void sendEmail({
    to: res.user.email,
    subject: `Welcome to Baton, ${res.user.name}`,
    body: `Welcome to Baton!\n\nYour account has been registered as a ${
      parsed.data.role === "SELLER" ? "Business Seller" : "Business Buyer"
    }.\n\nYou can explore verified acquisitions, create listings, and connect directly with founders on https://www.dabcloud.in/listings.\n\nBest regards,\nThe Baton Team`,
    eventType: EMAIL_EVENTS.USER_WELCOME,
  });

  const response = NextResponse.json(
    {
      session,
      redirectUrl,
      message: "Account created successfully.",
    },
    { status: 201 }
  );

  const isSecure =
    request.url.startsWith("https://") ||
    request.headers.get("x-forwarded-proto") === "https";

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}
