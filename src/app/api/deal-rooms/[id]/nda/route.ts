import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { dealRoomFailureResponse } from "@/lib/deal-rooms/http";
import { signDealRoomNda } from "@/lib/deal-rooms/store";
import { signAgreementSchema } from "@/lib/deal-rooms/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = signAgreementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid NDA signature payload." },
      { status: 400 }
    );
  }

  const result = await signDealRoomNda(id, parsed.data, session);
  if (!result.ok) {
    return dealRoomFailureResponse(result);
  }

  return NextResponse.json({ dealRoom: result.data }, { status: 200 });
}
