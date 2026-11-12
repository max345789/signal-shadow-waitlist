import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";

// In-memory store for requests
const detailRequestsStore = new Map<
  string,
  {
    id: string;
    businessId: string;
    buyerId: string;
    buyerName: string;
    buyerEmail: string;
    status: "PENDING" | "APPROVED" | "DECLINED";
    confidentialityAgreed: boolean;
    createdAt: string;
  }
>();

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: businessId } = await context.params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ requests: [] }, { status: 200 });
  }

  const list = Array.from(detailRequestsStore.values()).filter(
    (r) => r.businessId === businessId
  );
  return NextResponse.json({ requests: list }, { status: 200 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: businessId } = await context.params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in required to request full details.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const record = {
    id: requestId,
    businessId,
    buyerId: session.userId,
    buyerName: session.name,
    buyerEmail: session.email,
    status: "PENDING" as const,
    confidentialityAgreed: false,
    createdAt: new Date().toISOString(),
  };

  detailRequestsStore.set(requestId, record);

  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      await prisma.listingDetailRequest.upsert({
        where: {
          businessId_buyerId: {
            businessId,
            buyerId: session.userId,
          },
        },
        update: {
          status: "PENDING",
        },
        create: {
          id: requestId,
          businessId,
          buyerId: session.userId,
          status: "PENDING",
        },
      });
    } catch {
      // fallback
    }
  }

  return NextResponse.json({ ok: true, request: record }, { status: 201 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: businessId } = await context.params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in required.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  let body: { requestId?: string; decision?: "APPROVE" | "DECLINE"; confidentialityAgreed?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON.", code: "INVALID_JSON" }, { status: 400 });
  }

  const { requestId, decision, confidentialityAgreed } = body;
  const req = Array.from(detailRequestsStore.values()).find(
    (r) => r.id === requestId || (r.businessId === businessId && r.status === "PENDING")
  );

  if (!req) {
    return NextResponse.json({ error: "Request not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  req.status = decision === "APPROVE" ? "APPROVED" : "DECLINED";
  req.confidentialityAgreed = Boolean(confidentialityAgreed);

  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      await prisma.listingDetailRequest.update({
        where: { id: req.id },
        data: {
          status: req.status,
          confidentialityAgreed: req.confidentialityAgreed,
          approvedAt: req.status === "APPROVED" ? new Date() : null,
        },
      });
    } catch {
      // fallback
    }
  }

  return NextResponse.json({ ok: true, request: req }, { status: 200 });
}
