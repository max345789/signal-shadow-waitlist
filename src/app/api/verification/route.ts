import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import {
  CONNECTOR_PROVIDER_SPECS,
  IDENTITY_PROVIDER_SPECS,
  PROOF_OF_FUNDS_PROVIDER_SPECS,
} from "@/lib/verification/connectors";
import { getVerificationCentreState } from "@/lib/verification/store";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to access Verification Centre.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  const state = await getVerificationCentreState(session);
  return NextResponse.json(
    {
      ...state,
      providers: {
        identity: IDENTITY_PROVIDER_SPECS,
        proofOfFunds: PROOF_OF_FUNDS_PROVIDER_SPECS,
        connectors: CONNECTOR_PROVIDER_SPECS,
      },
    },
    { status: 200 }
  );
}
