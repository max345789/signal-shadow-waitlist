"use client";

import * as React from "react";
import Link from "next/link";
import { ShieldCheck, ArrowRight } from "lucide-react";
import type { AuthSession } from "@/lib/auth/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";

interface SampleAccountHint {
  email: string;
  role: string;
  currentTotpCode: string;
}

export function SignInClient({
  initialSession,
  sampleAccounts,
  databaseConfigured,
  auth0Configured = false,
  supabaseConfigured = false,
}: {
  initialSession: AuthSession | null;
  sampleAccounts: SampleAccountHint[];
  databaseConfigured: boolean;
  auth0Configured?: boolean;
  supabaseConfigured?: boolean;
}) {
  const [session, setSession] = React.useState<AuthSession | null>(initialSession);
  const [email, setEmail] = React.useState(sampleAccounts[0]?.email ?? "thewyyc@gmail.com");
  const [password, setPassword] = React.useState("");
  const [totpCode, setTotpCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed.");
        return;
      }
      setSession(data.session);

      if (data.session?.roles?.includes("ADMIN")) {
        setStatusMessage("Admin verified. Redirecting to Executive Console...");
        window.location.href = "/boost";
        return;
      }

      setStatusMessage("Signed in successfully.");
    } catch {
      setError("Network error while signing in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify2fa(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "2FA verification failed.");
        return;
      }
      setSession(data.session);
      setTotpCode("");
      setStatusMessage("Two-factor authentication verified. Deal room gate unlocked.");
    } catch {
      setError("Network error while verifying 2FA code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    setLoading(true);
    setError(null);
    setStatusMessage(null);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setSession(null);
      setStatusMessage("Signed out cleanly.");
    } catch {
      setError("Could not sign out.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSupabaseMagicLink() {
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address first.");
      return;
    }
    setLoading(true);
    setError(null);
    setStatusMessage(null);

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      if (!supabase) {
        setError("Supabase is not configured.");
        return;
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        },
      });

      if (otpError) {
        setError(otpError.message);
      } else {
        setStatusMessage(
          `Magic sign-in link sent to ${email}. Check your email to sign in.`
        );
      }
    } catch {
      setError("Network error sending Supabase magic link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto w-full py-2 sm:py-4 flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-36">
          Sign in to Baton
        </h1>
        <p className="text-16 text-slate">
          Access your business listings, deals, and administrator console.
        </p>
      </div>

      <Card className="bg-white border-mist shadow-none">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle as="h2" className="text-20 font-semibold text-deep-navy">
              {session ? "Active Account Session" : "Account Sign In"}
            </CardTitle>
            <StatusChip
              tone={
                session?.twoFactorVerifiedAt
                  ? "verified"
                  : session
                    ? "pending"
                    : "neutral"
              }
              label={
                session?.roles?.includes("ADMIN")
                  ? "Administrator"
                  : session?.twoFactorVerifiedAt
                    ? "Verified"
                    : session
                      ? "Signed In"
                      : "Signed out"
              }
            />
          </div>
          <CardDescription>
            {supabaseConfigured && databaseConfigured
              ? "Connected to Supabase PostgreSQL & Auth backend."
              : "Secure platform authentication & verification."}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {error ? (
            <div
              role="alert"
              className="rounded border border-brick-red bg-white p-4 text-16 font-medium text-brick-red"
            >
              {error}
            </div>
          ) : null}

          {statusMessage ? (
            <div
              role="status"
              className="rounded border border-mist bg-pale-blue p-4 text-16 text-deep-navy"
            >
              {statusMessage}
            </div>
          ) : null}

          {!session ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <Input
                label="Email address"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="thewyyc@gmail.com"
                className="min-h-12"
              />
              <Input
                label="Password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="min-h-12"
              />
              <Button type="submit" variant="primary" loading={loading} className="w-full min-h-12 text-16 font-medium">
                Sign in with Email
              </Button>

              <div className="flex flex-col gap-3 pt-2 border-t border-mist/40 text-center">
                <Link
                  href="/boost/reset"
                  className="text-14 font-medium text-trust-blue hover:underline"
                >
                  Forgot password? Reset with OTP
                </Link>

                {supabaseConfigured && (
                  <Button
                    type="button"
                    variant="secondary"
                    loading={loading}
                    onClick={handleSupabaseMagicLink}
                    className="w-full min-h-10 text-14"
                  >
                    Send Supabase Magic Link
                  </Button>
                )}
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-6">
              {session.roles.includes("ADMIN") ? (
                <div className="flex flex-col gap-4">
                  <div className="rounded border border-verified-green bg-cloud p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-verified-green font-semibold">
                      <ShieldCheck className="h-5 w-5" />
                      <span>Executive Administrator Authorized</span>
                    </div>
                    <p className="text-14 text-slate">
                      Authenticated as <strong className="text-deep-navy">{session.email}</strong>.
                    </p>
                  </div>

                  <Button asChild variant="primary" className="min-h-12 w-full text-16">
                    <Link href="/boost">
                      <span>Open Baton Admin Console</span>
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>

                  <Button variant="secondary" onClick={handleSignOut} loading={loading} className="w-full min-h-11">
                    Sign out
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="rounded border border-mist bg-cloud p-4">
                    <dl className="flex flex-col gap-2 text-16">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate">Account</dt>
                        <dd className="font-medium text-deep-navy">{session.name}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate">Email</dt>
                        <dd className="font-medium text-ink">{session.email}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate">Roles</dt>
                        <dd className="font-medium text-ink">{session.roles.join(", ")}</dd>
                      </div>
                    </dl>
                  </div>

                  {!session.twoFactorVerifiedAt && (
                    <form onSubmit={handleVerify2fa} className="flex flex-col gap-4">
                      <Input
                        label="6-digit authenticator code (2FA)"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        placeholder="123456"
                        helperText="Required before entering deal rooms."
                      />
                      <Button type="submit" variant="action" loading={loading} className="min-h-12">
                        Verify 2FA Code
                      </Button>
                    </form>
                  )}

                  <Button asChild variant="primary" className="min-h-12 w-full">
                    <Link href="/listings">
                      <span>View Listings Directory</span>
                    </Link>
                  </Button>

                  <Button variant="secondary" onClick={handleSignOut} loading={loading} className="w-full min-h-11">
                    Sign out
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-14 text-slate">
        Protected with HTTP-only encrypted session cookies and scrypt authentication.
      </p>
    </div>
  );
}
