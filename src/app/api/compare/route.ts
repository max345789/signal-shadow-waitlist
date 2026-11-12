import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { getListingsForCompare } from "@/lib/matching/store";
import { parseCompareBusinessIds } from "@/lib/matching/validation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsedIds = parseCompareBusinessIds(url.searchParams.get("ids"));
  if (!parsedIds.ok) {
    return NextResponse.json({ error: parsedIds.error }, { status: 400 });
  }

  const thesisId = url.searchParams.get("thesisId");
  const session = await getServerSession();
  const result = await getListingsForCompare({
    ids: parsedIds.ids,
    thesisId,
    session,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  return NextResponse.json(
    {
      listings: result.listings,
      thesis: result.thesis,
      evaluationsByBusinessId: result.evaluationsByBusinessId,
    },
    { status: 200 }
  );
}
