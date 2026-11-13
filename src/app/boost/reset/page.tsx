"use client";

import React, { useState } from "react";
import Link from "next/link";
import { KeyRound, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function BoostResetPasswordPage() {
  const [email, setEmail] = useState("admin@baton.com");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<"REQUEST_OTP" | "ENTER_OTP" | "SUCCESS">("REQUEST_OTP");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDevOtpCode(null);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_otp", email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate OTP.");
        return;
      }

      if (data.devOtp) {
        setDevOtpCode(data.devOtp);
      }
      setSuccessMsg("6-digit verification code generated! Enter it below to reset your password.");
      setStep("ENTER_OTP");
    } catch {
      setError("Network error while requesting OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_and_reset",
          email,
          otp,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to reset password.");
        return;
      }

      setStep("SUCCESS");
      setSuccessMsg("Password reset successfully! You can now log into the admin console with your new password.");
    } catch {
      setError("Network error while resetting password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cloud flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <KeyRound className="h-8 w-8 text-trust-blue" />
          <span className="font-serif text-28 font-bold text-deep-navy">Baton Security</span>
        </div>

        <Card className="bg-white border-mist">
          <CardHeader>
            <CardTitle as="h2" className="text-20 font-semibold text-deep-navy">
              Reset Admin Password
            </CardTitle>
            <CardDescription className="text-14 text-slate">
              Enter your admin email to receive a 6-digit one-time password (OTP) verification code.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-white border border-brick-red text-brick-red text-14 rounded">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-center gap-2 p-3 bg-white border border-verified-green text-verified-green text-14 rounded">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {devOtpCode && (
              <div className="p-3 bg-cloud border border-trust-blue rounded flex flex-col gap-1">
                <span className="text-12 font-medium text-slate uppercase">Your Verification OTP</span>
                <span className="text-24 font-mono font-bold text-trust-blue tracking-widest">{devOtpCode}</span>
                <span className="text-12 text-slate">Valid for 10 minutes</span>
              </div>
            )}

            {step === "REQUEST_OTP" && (
              <form onSubmit={handleRequestOtp} className="flex flex-col gap-4">
                <Input
                  label="Admin Email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@baton.com"
                  className="min-h-12"
                />

                <Button type="submit" variant="primary" loading={loading} className="w-full min-h-12">
                  Request 6-Digit OTP
                </Button>
              </form>
            )}

            {step === "ENTER_OTP" && (
              <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
                <Input
                  label="6-Digit Verification OTP"
                  type="text"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="min-h-12 font-mono text-18 tracking-widest text-center"
                />

                <Input
                  label="New Password"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="min-h-12"
                />

                <Input
                  label="Confirm New Password"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="min-h-12"
                />

                <div className="flex flex-col gap-2 pt-2">
                  <Button type="submit" variant="primary" loading={loading} className="w-full min-h-12">
                    Verify OTP &amp; Update Password
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setStep("REQUEST_OTP");
                      setDevOtpCode(null);
                    }}
                    className="w-full min-h-12"
                  >
                    Resend / Change Email
                  </Button>
                </div>
              </form>
            )}

            {step === "SUCCESS" && (
              <div className="flex flex-col gap-4 py-2">
                <p className="text-14 text-ink">
                  Your credentials have been updated securely. You can now log into your account using your new password.
                </p>
                <Button asChild variant="primary" className="w-full min-h-12">
                  <Link href="/auth/signin">
                    <span>Proceed to Sign In</span>
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>
            )}

            <div className="pt-2 text-center">
              <Link href="/auth/signin" className="text-14 font-medium text-trust-blue hover:underline">
                Back to Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
