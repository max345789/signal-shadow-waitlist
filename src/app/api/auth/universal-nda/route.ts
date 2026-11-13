import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/session-server";
import {
  getUniversalNdaForUser,
  signUniversalNdaForUser,
  UNIVERSAL_NDA_TERMS,
  UNIVERSAL_NDA_VERSION,
} from "@/lib/auth/universal-nda";

const signNdaSchema = z.object({
  signerName: z.string().trim().min(2, "Enter your full legal name."),
  signerTitle: z.string().trim().max(100).optional(),
  entityName: z.string().trim().max(150).optional(),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the confidentiality terms to proceed." }),
  }),
});

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const record = await getUniversalNdaForUser(session.userId);
  return NextResponse.json({
    signed: Boolean(record),
    record: record ?? null,
    terms: UNIVERSAL_NDA_TERMS,
    version: UNIVERSAL_NDA_VERSION,
  });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = signNdaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid submission data." },
      { status: 400 }
    );
  }

  const forwardedFor = request.headers.get("x-forwarded-for") ?? "local";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "local";

  const record = await signUniversalNdaForUser({
    userId: session.userId,
    email: session.email,
    signerName: parsed.data.signerName,
    signerTitle: parsed.data.signerTitle,
    entityName: parsed.data.entityName,
    ipAddress: clientIp,
  });

  return NextResponse.json({
    ok: true,
    message: "Master Buyer Confidentiality & NDA Agreement recorded successfully.",
    record,
  });
}
