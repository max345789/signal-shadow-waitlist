import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SignInClient } from "@/components/auth/signin-client";
import { getServerSession } from "@/lib/auth/session-server";
import { getLocalDevSampleAccountHints } from "@/lib/auth/store";
import { getCurrentTotpTokenForDev } from "@/lib/auth/crypto";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { isAuth0Configured } from "@/lib/auth0";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await getServerSession();
  const sampleHints = getLocalDevSampleAccountHints().map((acc) => ({
    email: acc.email,
    role: acc.role,
    currentTotpCode: acc.totpSecret
      ? getCurrentTotpTokenForDev(acc.totpSecret, acc.email)
      : "",
  }));

  return (
    <AppShell
      activeNav="signin"
      trustBanner={{
        canTrustAnswer:
          "Sessions use HTTP-only signed cookies with scrypt password verification and RFC 6238 TOTP two-factor authentication.",
        nextStepAnswer:
          "Sign in, then complete the 6-digit 2FA check to unlock deal-room permissions.",
      }}
    >
      <SignInClient
        initialSession={session}
        sampleAccounts={sampleHints}
        databaseConfigured={isDatabaseConfigured()}
        auth0Configured={isAuth0Configured}
        supabaseConfigured={isSupabaseConfigured()}
      />
    </AppShell>
  );
}
