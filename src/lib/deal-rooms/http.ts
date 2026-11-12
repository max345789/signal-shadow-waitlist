import { NextResponse } from "next/server";
import type { DealRoomOperationFailure } from "@/lib/deal-rooms/store";

export function dealRoomFailureResponse(
  failure: DealRoomOperationFailure
): NextResponse {
  const status =
    failure.code === "UNAUTHENTICATED"
      ? 401
      : failure.code === "FORBIDDEN" ||
          failure.code === "TWO_FACTOR_REQUIRED" ||
          failure.code === "TWO_FACTOR_EXPIRED"
        ? 403
        : failure.code === "NOT_FOUND"
          ? 404
          : 400;

  return NextResponse.json(
    { error: failure.reason, code: failure.code },
    { status }
  );
}
