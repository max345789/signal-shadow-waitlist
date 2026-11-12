import type { RawDealRoomRecord } from "@/lib/domain/deal-room";

const globalForDealRooms = globalThis as unknown as {
  __trustMarketplaceLocalDealRooms?: RawDealRoomRecord[];
};

function isLocalDevModeAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.AUTH_PROVIDER === "local-dev"
  );
}

export function getLocalDealRoomsStore(): RawDealRoomRecord[] {
  if (!isLocalDevModeAllowed()) {
    throw new Error("DATABASE_URL is required in production.");
  }
  if (!globalForDealRooms.__trustMarketplaceLocalDealRooms) {
    globalForDealRooms.__trustMarketplaceLocalDealRooms = [];
  }
  return globalForDealRooms.__trustMarketplaceLocalDealRooms;
}

export function resetLocalDealRoomsStoreForTest(): void {
  globalForDealRooms.__trustMarketplaceLocalDealRooms = [];
}

export function hasLocalBuyerSignedNdaForBusiness(
  businessId: string,
  userId: string
): boolean {
  if (!isLocalDevModeAllowed()) {
    return false;
  }
  const rooms = getLocalDealRoomsStore();
  return rooms.some(
    (r) =>
      r.businessId === businessId &&
      r.buyerUserId === userId &&
      r.ndaSignedAt !== null
  );
}
