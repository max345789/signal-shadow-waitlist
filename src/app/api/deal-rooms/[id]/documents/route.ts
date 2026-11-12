import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { dealRoomFailureResponse } from "@/lib/deal-rooms/http";
import { uploadDealRoomDocument } from "@/lib/deal-rooms/store";
import {
  DOCUMENT_CATEGORIES,
  resolveAllowedDocumentMimeType,
  uploadDocumentJsonSchema,
} from "@/lib/deal-rooms/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();

  if (session) {
    const rate = await checkRateLimit(
      `dealrooms:upload:${session.userId}:${id}`,
      10,
      60_000
    );
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: "Upload rate limit reached. Wait briefly before uploading another file.",
          retryAfterSeconds: rate.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        }
      );
    }
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid multipart upload payload." },
        { status: 400 }
      );
    }

    const title = String(formData.get("title") ?? "").trim();
    const category = String(formData.get("category") ?? "OTHER").trim();
    const file = formData.get("file");

    if (title.length < 3 || title.length > 120) {
      return NextResponse.json(
        { error: "Document title must be between 3 and 120 characters." },
        { status: 400 }
      );
    }
    if (!DOCUMENT_CATEGORIES.includes(category as (typeof DOCUMENT_CATEGORIES)[number])) {
      return NextResponse.json(
        { error: "Invalid document category." },
        { status: 400 }
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A document file is required." },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Document exceeds maximum 5 MB upload size." },
        { status: 400 }
      );
    }

    const filename = file.name || "upload.txt";
    const mimeType = resolveAllowedDocumentMimeType(file.type, filename);
    if (!mimeType) {
      return NextResponse.json(
        {
          error:
            "Unsupported file type or extension. Allowed types: TXT, MD, CSV, JSON, PDF, PNG, JPG.",
        },
        { status: 400 }
      );
    }

    const arrayBuf = await file.arrayBuffer();
    const result = await uploadDealRoomDocument(
      id,
      {
        title,
        category: category as (typeof DOCUMENT_CATEGORIES)[number],
        filename,
        mimeType,
        contentBuffer: Buffer.from(arrayBuf),
      },
      session
    );

    if (!result.ok) {
      return dealRoomFailureResponse(result);
    }
    return NextResponse.json({ dealRoom: result.data }, { status: 201 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = uploadDocumentJsonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid document payload." },
      { status: 400 }
    );
  }

  const mimeType = resolveAllowedDocumentMimeType(
    parsed.data.mimeType,
    parsed.data.filename
  );
  if (!mimeType) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type or extension. Allowed types: TXT, MD, CSV, JSON, PDF, PNG, JPG.",
      },
      { status: 400 }
    );
  }

  if (parsed.data.contentBase64.length > 7_200_000) {
    return NextResponse.json(
      { error: "Document exceeds maximum 5 MB upload size." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(parsed.data.contentBase64, "base64");
  const result = await uploadDealRoomDocument(
    id,
    {
      title: parsed.data.title,
      category: parsed.data.category,
      filename: parsed.data.filename,
      mimeType,
      contentBuffer: buffer,
    },
    session
  );

  if (!result.ok) {
    return dealRoomFailureResponse(result);
  }

  return NextResponse.json({ dealRoom: result.data }, { status: 201 });
}
