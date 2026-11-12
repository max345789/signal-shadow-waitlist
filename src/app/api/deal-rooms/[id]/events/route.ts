import { getServerSession } from "@/lib/auth/session-server";
import { dealRoomFailureResponse } from "@/lib/deal-rooms/http";
import { subscribeToDealRoomEvents } from "@/lib/deal-rooms/realtime";
import { getDealRoomForViewer } from "@/lib/deal-rooms/store";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();

  // Enforce strict participant RBAC & mandatory 2FA before opening SSE stream
  const accessCheck = await getDealRoomForViewer(id, session);
  if (!accessCheck.ok) {
    return dealRoomFailureResponse(accessCheck);
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Stream already closed
        }
      };

      sendEvent("connected", {
        dealRoomId: id,
        at: new Date().toISOString(),
      });

      unsubscribe = subscribeToDealRoomEvents(id, (evt) => {
        sendEvent("deal-update", evt);
      });

      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // Stream closed
        }
      }, 25_000);

      request.signal.addEventListener("abort", () => {
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          // Ignore double-close
        }
      });
    },
    cancel() {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
