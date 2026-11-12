import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { dealRoomFailureResponse } from "@/lib/deal-rooms/http";
import { downloadWatermarkedDocument } from "@/lib/deal-rooms/store";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await context.params;
  const session = await getServerSession();
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json(
      { error: "Signed download token is required.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress = forwarded ? forwarded.split(",")[0]?.trim() ?? null : null;
  const userAgent = request.headers.get("user-agent") ?? null;

  const result = await downloadWatermarkedDocument({
    dealRoomId: id,
    documentId: docId,
    token,
    session,
    ipAddress,
    userAgent,
  });

  if (!result.ok) {
    return dealRoomFailureResponse(result);
  }

  const previewMode = url.searchParams.get("mode") === "preview";
  const bodyUint8 = new Uint8Array(result.data.bytes);

  const safeWatermarkHeader = result.data.watermarkNotice
    .replace(/[^\x20-\x7E]/g, "-")
    .slice(0, 250);

  return new NextResponse(bodyUint8, {
    status: 200,
    headers: {
      "Content-Type": result.data.mimeType,
      "Content-Disposition": `${previewMode ? "inline" : "attachment"}; filename="${result.data.filename}"`,
      "X-Content-Type-Options": "nosniff",
      "X-Watermark-Notice": safeWatermarkHeader,
      "Cache-Control": "no-store, private",
    },
  });
}
