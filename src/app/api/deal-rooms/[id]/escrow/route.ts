import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { dealRoomFailureResponse } from "@/lib/deal-rooms/http";
import { handleDealRoomEscrowAction } from "@/lib/deal-rooms/store";
import { escrowActionSchema } from "@/lib/deal-rooms/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();
  if (session) {
    const rate = await checkRateLimit(`deal-escrow:${session.userId}:${id}`, 30, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: "Too many escrow requests. Wait before trying again.",
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

  const parsed = escrowActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid escrow action payload." },
      { status: 400 }
    );
  }

  const result = await handleDealRoomEscrowAction(id, parsed.data, session);
  if (!result.ok) {
    return dealRoomFailureResponse(result);
  }

  return NextResponse.json(
    { dealRoom: result.data },
    { status: parsed.data.action === "INITIATE" ? 201 : 200 }
  );
}
