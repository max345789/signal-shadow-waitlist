import type {
  MatchEvaluationResult,
  SavedThesisRecord,
  ThesisNotificationRecord,
} from "@/lib/domain/matching";
import { createSampleSeedTheses } from "@/lib/listings/sample-data";

export interface LocalMatchRecord extends MatchEvaluationResult {
  id: string;
  thesisId: string;
  alertSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalMatchingState {
  theses: SavedThesisRecord[];
  matches: LocalMatchRecord[];
  notifications: ThesisNotificationRecord[];
}

const globalForMatchingStore = globalThis as unknown as {
  __trustMarketplaceLocalMatching?: LocalMatchingState;
};

export function isLocalDevModeAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.AUTH_PROVIDER === "local-dev"
  );
}

export function getLocalMatchingStore(): LocalMatchingState {
  if (!isLocalDevModeAllowed()) {
    throw new Error("DATABASE_URL is required in production.");
  }
  if (!globalForMatchingStore.__trustMarketplaceLocalMatching) {
    globalForMatchingStore.__trustMarketplaceLocalMatching = {
      theses: [],
      matches: [],
      notifications: [],
    };
  }
  return globalForMatchingStore.__trustMarketplaceLocalMatching;
}

export function resetLocalMatchingStoreForTest(): void {
  globalForMatchingStore.__trustMarketplaceLocalMatching = {
    theses: [],
    matches: [],
    notifications: [],
  };
}
