import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { answerListingQuestion } from "@/lib/listings/store";
import { answerQuestionSchema } from "@/lib/listings/validation";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; questionId: string }> }
) {
  const { id, questionId } = await context.params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in as the listing owner to post an answer." },
      { status: 401 }
    );
  }

  const rateLimit = await checkRateLimit(`qa:answer:${session.userId}`, 20, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many Q&A updates. Wait before posting again.",
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

  const parsed = answerQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter a valid answer." },
      { status: 400 }
    );
  }

  const result = await answerListingQuestion(
    id,
    questionId,
    parsed.data.answer,
    session
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.code === "NOT_FOUND" ? 404 : 403 }
    );
  }

  return NextResponse.json({ question: result.question }, { status: 200 });
}
