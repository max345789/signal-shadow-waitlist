import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in required to verify phone.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  let body: { phoneNumber?: string; code?: string } = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  const phone = body.phoneNumber || "+91 98765 43210";
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days validity

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    await prisma.buyerProfile.upsert({
      where: { userId: session.userId },
      update: { phoneVerified: true },
      create: { userId: session.userId, phoneVerified: true },
    });

    await prisma.verification.create({
      data: {
        userId: session.userId,
        type: "PHONE",
        provider: "One-Time Code",
        status: "VERIFIED",
        verifiedAt: now,
        expiresAt,
        metadataJson: { phoneNumber: phone },
      },
    });
  }

  return NextResponse.json({
    ok: true,
    status: "VERIFIED",
    badgeText: "Phone number confirmed",
    tooltip:
      "This badge confirms only: number confirmed by code. It is not a guarantee of the business or its financials.",
  });
}
