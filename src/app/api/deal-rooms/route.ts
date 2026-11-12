import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { dealRoomFailureResponse } from "@/lib/deal-rooms/http";
import {
  createOrOpenDealRoom,
  listDealRoomsForUser,
} from "@/lib/deal-rooms/store";
import { createDealRoomSchema } from "@/lib/deal-rooms/validation";

export async function GET() {
  const session = await getServerSession();
  const result = await listDealRoomsForUser(session);
  if (!result.ok) {
    return dealRoomFailureResponse(result);
  }
  return NextResponse.json({ dealRooms: result.data }, { status: 200 });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (session) {
    const rate = await checkRateLimit(`dealrooms:create:${session.userId}`, 15, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: "Too many deal room requests. Wait briefly before trying again.",
          retryAfterSeconds: rate.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        }
      );
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = createDealRoomSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Business ID is required." },
      { status: 400 }
    );
  }

  const result = await createOrOpenDealRoom(parsed.data.businessId, session);
  if (!result.ok) {
    return dealRoomFailureResponse(result);
  }

  return NextResponse.json({ dealRoom: result.data }, { status: 201 });
}
