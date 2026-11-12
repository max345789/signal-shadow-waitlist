"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
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
  const [email, setEmail] = React.useState(sampleAccounts[0]?.email ?? "");
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
      setStatusMessage(
        "Signed in. Complete 6-digit authenticator verification to unlock deal rooms."
      );
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
          Sign in &amp; two-factor authentication
        </h1>
        <p className="text-16 text-slate">
          Every account entering a deal room requires verified sign-in and a current
          6-digit TOTP authenticator check.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle as="h2">
                {session ? "Session & Mandatory 2FA" : "Sign in to Trust Marketplace"}
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
                session?.twoFactorVerifiedAt
                  ? "2FA Verified"
                  : session
                    ? "2FA Required"
                    : "Signed out"
              }
            />
          </div>
          <CardDescription>
            {supabaseConfigured && databaseConfigured
              ? "Connected to Supabase PostgreSQL & Auth backend."
              : databaseConfigured
                ? "Connected to PostgreSQL session store."
                : "Running in local development mode (DATABASE_URL not configured)."}
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
                placeholder="name@company.com"
              />
              <Input
                label="Password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                helperText="Minimum 8 characters. Login attempts are rate-limited."
              />
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Button type="submit" variant="primary" loading={loading}>
                  Sign in with Email
                </Button>
                {supabaseConfigured ? (
                  <Button
                    type="button"
                    variant="secondary"
                    loading={loading}
                    onClick={handleSupabaseMagicLink}
                  >
                    Supabase Magic Link
                  </Button>
                ) : null}
                {auth0Configured ? (
                  <Button asChild variant="secondary">
                    <a href="/auth/login">Sign in with Auth0 (SSO &amp; 2FA)</a>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled
                    title="Configure AUTH0_* environment credentials to enable Auth0 Universal Login & SSO"
                  >
                    Auth0 (Configure credentials)
                  </Button>
                )}
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="rounded border border-mist bg-cloud p-4">
                <dl className="flex flex-col gap-2 text-16">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-slate">Account</dt>
                    <dd className="font-medium text-deep-navy">{session.name}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-slate">Roles</dt>
                    <dd className="font-medium text-ink">{session.roles.join(", ")}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-slate">Deal room access</dt>
                    <dd className="font-medium text-ink">
                      {session.twoFactorVerifiedAt ? "Unlocked" : "Blocked until 2FA"}
                    </dd>
                  </div>
                </dl>
              </div>

              {!session.twoFactorVerifiedAt ? (
                <form onSubmit={handleVerify2fa} className="flex flex-col gap-4">
                  <Input
                    label="6-digit authenticator code (Mandatory 2FA)"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="123456"
                    helperText="Validated using RFC 6238 TOTP. Required before entering any deal room."
                  />
                  <Button type="submit" variant="action" loading={loading}>
                    Verify 2FA Code
                  </Button>
                </form>
              ) : (
                <div className="flex items-center gap-2 rounded border border-verified-green bg-white p-4 text-16 font-medium text-verified-green">
                  <ShieldCheck className="h-6 w-6 shrink-0" aria-hidden="true" />
                  <span>Two-factor check active for Deal Room entry.</span>
                </div>
              )}

              <div>
                <Button variant="secondary" onClick={handleSignOut} loading={loading}>
                  Sign out
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle as="h2">Development &amp; Security Policy</CardTitle>
            {sampleAccounts.length > 0 ? (
              <StatusChip tone="neutral" label="Sample data" />
            ) : null}
          </div>
          <CardDescription>
            Deal room endpoints strictly reject requests lacking an active session and
            recent 2FA timestamp.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sampleAccounts.length > 0 ? (
            <div className="flex flex-col gap-4">
              <p className="text-16 text-ink">
                Because PostgreSQL is not configured locally, explicit sample dev
                accounts are available for Phase 0 testing (using env{" "}
                <code>LOCAL_DEV_SAMPLE_PASSWORD</code> or default{" "}
                <code>SampleDevPass!2026</code>):
              </p>
              <div className="flex flex-col gap-2">
                {sampleAccounts.map((acc) => (
                  <div
                    key={acc.email}
                    className="flex flex-col gap-2 rounded border border-mist bg-cloud p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-16 font-semibold text-deep-navy">
                        {acc.email}
                      </span>
                      <StatusChip tone="neutral" label={acc.role} />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-14 text-slate tabular-figures">
                      <span>Current TOTP code: {acc.currentTotpCode}</span>
                      <Button
                        variant="link"
                        onClick={() => {
                          setEmail(acc.email);
                          setPassword("SampleDevPass!2026");
                          setTotpCode(acc.currentTotpCode);
                        }}
                      >
                        Prefill email &amp; code
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-16 text-slate">
              Database authentication mode is active. Sample development hints are hidden.
            </p>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
