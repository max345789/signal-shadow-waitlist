import { NextResponse } from "next/server";
import { canReviewAdminQueue } from "@/lib/auth/permissions";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { dealRoomFailureResponse } from "@/lib/deal-rooms/http";
import { resolveDealRoomDisputeAsAdmin } from "@/lib/deal-rooms/store";
import { adminResolveDisputeSchema } from "@/lib/deal-rooms/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();
  const perm = canReviewAdminQueue(session);
  if (!perm.allowed) {
    return NextResponse.json(
      { error: perm.reason, code: perm.code },
      { status: perm.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const rateLimit = await checkRateLimit(
    `admin:dispute-resolve:${session!.userId}`,
    30,
    60_000
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many dispute resolution actions. Wait before trying again.",
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
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = adminResolveDisputeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Dispute decision and resolution note are required.",
      },
      { status: 400 }
    );
  }

  const result = await resolveDealRoomDisputeAsAdmin(id, parsed.data, session);
  if (!result.ok) {
    return dealRoomFailureResponse(result);
  }

  return NextResponse.json(
    { dispute: result.data.dispute, dealRoom: result.data.dealRoom },
    { status: 200 }
  );
}
