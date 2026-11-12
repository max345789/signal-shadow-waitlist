export type RoleName = "BUYER" | "SELLER" | "ADMIN" | "REVIEWER";

export interface AuthSession {
  userId: string;
  email: string;
  name: string;
  roles: RoleName[];
  twoFactorEnabled: boolean;
  twoFactorVerifiedAt: string | null;
  authMode: "database" | "local-dev";
  isSampleAccount: boolean;
}

export interface StoredUserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  roles: RoleName[];
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  authMode: "database" | "local-dev";
  isSampleAccount: boolean;
}
