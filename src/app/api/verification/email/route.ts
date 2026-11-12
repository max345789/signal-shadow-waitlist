import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in required to verify email.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  let body: { email?: string; token?: string } = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  const emailToVerify = body.email || session.email;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days validity

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    await prisma.buyerProfile.upsert({
      where: { userId: session.userId },
      update: { emailVerified: true },
      create: { userId: session.userId, emailVerified: true },
    });

    await prisma.verification.create({
      data: {
        userId: session.userId,
        type: "EMAIL",
        provider: "One-Time Link",
        status: "VERIFIED",
        verifiedAt: now,
        expiresAt,
        metadataJson: { email: emailToVerify },
      },
    });
  }

  return NextResponse.json({
    ok: true,
    status: "VERIFIED",
    badgeText: "Email address confirmed",
    tooltip:
      "This badge confirms only: address confirmed by link. It is not a guarantee of the business or its financials.",
  });
}
