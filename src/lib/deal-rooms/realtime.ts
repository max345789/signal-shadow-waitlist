import { EventEmitter } from "node:events";

export type DealRoomRealtimeEventType =
  | "DEAL_ROOM_CREATED"
  | "STAGE_UPDATED"
  | "NDA_UPDATED"
  | "AGREEMENT_UPDATED"
  | "MESSAGE_CREATED"
  | "DOCUMENT_CREATED"
  | "DOCUMENT_VIEWED"
  | "OFFER_UPDATED"
  | "CHECKLIST_UPDATED"
  | "ESCROW_UPDATED"
  | "ESCROW_RELEASED"
  | "ESCROW_DISPUTED"
  | "DISPUTE_RESOLVED";

export interface DealRoomRealtimeEvent {
  type: DealRoomRealtimeEventType;
  dealRoomId: string;
  at: string;
}

const globalForRealtime = globalThis as unknown as {
  __trustMarketplaceDealEmitter?: EventEmitter;
};

function getEmitter(): EventEmitter {
  if (!globalForRealtime.__trustMarketplaceDealEmitter) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(100);
    globalForRealtime.__trustMarketplaceDealEmitter = emitter;
  }
  return globalForRealtime.__trustMarketplaceDealEmitter;
}

export function publishDealRoomEvent(
  dealRoomId: string,
  type: DealRoomRealtimeEventType
): void {
  const payload: DealRoomRealtimeEvent = {
    type,
    dealRoomId,
    at: new Date().toISOString(),
  };
  getEmitter().emit(`deal:${dealRoomId}`, payload);
}

export function subscribeToDealRoomEvents(
  dealRoomId: string,
  listener: (event: DealRoomRealtimeEvent) => void
): () => void {
  const emitter = getEmitter();
  const channel = `deal:${dealRoomId}`;
  emitter.on(channel, listener);
  return () => {
    emitter.off(channel, listener);
  };
}
