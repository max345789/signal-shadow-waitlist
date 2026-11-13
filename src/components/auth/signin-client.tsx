"use client";

import * as React from "react";
import Link from "next/link";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
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
  const [authMode, setAuthMode] = React.useState<"signin" | "signup">("signin");
  const [signUpName, setSignUpName] = React.useState("");
  const [signUpRole, setSignUpRole] = React.useState<"BUYER" | "SELLER">("BUYER");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [totpCode, setTotpCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "signup") {
        setAuthMode("signup");
      }
    }
  }, []);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStatusMessage(null);

    if (!signUpName.trim() || signUpName.trim().length < 2) {
      setError("Please enter your full legal name (at least 2 characters).");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: signUpName.trim(),
          email: email.trim().toLowerCase(),
          password,
          role: signUpRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed.");
        return;
      }
      setSession(data.session);
      setStatusMessage("Account created successfully. Redirecting to platform...");
      window.location.href = data.redirectUrl || "/listings";
    } catch {
      setError("Network error while creating account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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
          {authMode === "signup" ? "Create your Baton account" : "Sign in to Baton"}
        </h1>
        <p className="text-16 text-slate">
          {authMode === "signup"
            ? "Register to explore vetted acquisition opportunities and connect with business owners."
            : "Access your business listings, deals, and administrator console."}
        </p>
      </div>

      <Card className="bg-white border-mist shadow-none">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle as="h2" className="text-20 font-semibold text-deep-navy">
              {session
                ? "Active Account Session"
                : authMode === "signup"
                  ? "Customer Registration"
                  : "Account Sign In"}
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
            Secure platform authentication & verification.
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
            <div className="flex flex-col gap-4">
              {/* Tab Selector: Sign in vs Sign up */}
              <div className="grid grid-cols-2 p-1 rounded-md bg-cloud border border-mist gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signin");
                    setError(null);
                  }}
                  className={cn(
                    "py-2 px-3 text-14 font-semibold rounded transition-colors text-center cursor-pointer leading-none",
                    authMode === "signin"
                      ? "bg-white text-deep-navy shadow-none border border-mist"
                      : "text-slate hover:text-deep-navy border border-transparent"
                  )}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signup");
                    setError(null);
                  }}
                  className={cn(
                    "py-2 px-3 text-14 font-semibold rounded transition-colors text-center cursor-pointer leading-none",
                    authMode === "signup"
                      ? "bg-white text-deep-navy shadow-none border border-mist"
                      : "text-slate hover:text-deep-navy border border-transparent"
                  )}
                >
                  Create Account (Sign Up)
                </button>
              </div>

              {authMode === "signin" ? (
                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                  <Input
                    label="Email address"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
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
                <form onSubmit={handleSignUp} className="flex flex-col gap-4">
                  <Input
                    label="Full Name"
                    type="text"
                    required
                    value={signUpName}
                    onChange={(e) => setSignUpName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="min-h-12"
                  />
                  <Input
                    label="Email address"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="min-h-12"
                  />
                  <Input
                    label="Password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="min-h-12"
                  />

                  <div className="flex flex-col gap-1.5">
                    <span className="text-14 font-medium text-deep-navy">Account Type</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSignUpRole("BUYER")}
                        className={cn(
                          "py-2.5 px-3 rounded border text-14 font-medium text-center cursor-pointer transition-colors leading-none",
                          signUpRole === "BUYER"
                            ? "border-trust-blue bg-pale-blue text-trust-blue font-semibold"
                            : "border-mist bg-white text-slate hover:border-deep-navy"
                        )}
                      >
                        Buyer / Investor
                      </button>
                      <button
                        type="button"
                        onClick={() => setSignUpRole("SELLER")}
                        className={cn(
                          "py-2.5 px-3 rounded border text-14 font-medium text-center cursor-pointer transition-colors leading-none",
                          signUpRole === "SELLER"
                            ? "border-trust-blue bg-pale-blue text-trust-blue font-semibold"
                            : "border-mist bg-white text-slate hover:border-deep-navy"
                        )}
                      >
                        Business Seller
                      </button>
                    </div>
                  </div>

                  <Button type="submit" variant="action" loading={loading} className="w-full min-h-12 text-16 font-semibold">
                    Create Customer Account
                  </Button>

                  <p className="text-13 text-slate text-center m-0">
                    By registering, you agree to the Baton listing rules and privacy policy.
                  </p>
                </form>
              )}
            </div>
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
