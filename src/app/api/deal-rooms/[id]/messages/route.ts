import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { dealRoomFailureResponse } from "@/lib/deal-rooms/http";
import { postDealRoomMessage } from "@/lib/deal-rooms/store";
import { postMessageSchema } from "@/lib/deal-rooms/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();

  if (session) {
    const rate = await checkRateLimit(
      `dealrooms:chat:${session.userId}:${id}`,
      20,
      60_000
    );
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: "Chat rate limit reached. Wait briefly before sending more messages.",
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

  const parsed = postMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid message payload." },
      { status: 400 }
    );
  }

  const result = await postDealRoomMessage(id, parsed.data, session);
  if (!result.ok) {
    return dealRoomFailureResponse(result);
  }

  return NextResponse.json({ dealRoom: result.data }, { status: 201 });
}
