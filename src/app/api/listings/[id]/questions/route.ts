import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { addListingQuestion } from "@/lib/listings/store";
import { createQuestionSchema } from "@/lib/listings/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to submit a question about this listing." },
      { status: 401 }
    );
  }

  const rateLimit = await checkRateLimit(`qa:ask:${session.userId}`, 10, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many questions submitted. Wait before posting another question.",
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

  const parsed = createQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter a valid question." },
      { status: 400 }
    );
  }

  const result = await addListingQuestion(id, parsed.data.question, session);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.code === "NOT_FOUND" ? 404 : 403 }
    );
  }

  return NextResponse.json({ question: result.question }, { status: 201 });
}
