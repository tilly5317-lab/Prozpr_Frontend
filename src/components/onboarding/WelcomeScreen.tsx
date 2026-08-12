import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Sparkles, ChevronDown, Mail } from "lucide-react";
import OnboardingNav from "./OnboardingNav";
import prozprLogoLight from "@/assets/prozpr-logo-light.png";
import prozprLogoDark from "@/assets/prozpr-logo-dark.png";
import {
  signup,
  login,
  getMe,
  updateMe,
  checkMobileStatus,
  requestPinReset,
  confirmPinReset,
} from "@/lib/api";
import { resolveOnboardingResumeRoute } from "@/lib/onboardingResume";
import { useEnterSubmit } from "@/hooks/useEnterSubmit";
import {
  trackOnboardingStepViewed,
  trackOnboardingStepCompleted,
} from "@/lib/onboardingAnalytics";
import { useAuth } from "@/context/AuthContext";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

interface WelcomeScreenProps {
  onNext: () => void;
  onExistingUserLogin?: () => void;
}

/** Regional-indicator flags from ISO 3166-1 alpha-2 (avoids emoji encoding issues in source files). */
const flagEmoji = (iso2: string) =>
  iso2
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0)))
    .join("");

const countryCodes = [
  { code: "+44", label: "UK", flag: flagEmoji("GB") },
  { code: "+1", label: "US", flag: flagEmoji("US") },
  { code: "+91", label: "IN", flag: flagEmoji("IN") },
  { code: "+61", label: "AU", flag: flagEmoji("AU") },
  { code: "+971", label: "AE", flag: flagEmoji("AE") },
  { code: "+65", label: "SG", flag: flagEmoji("SG") },
];

/**
 * Account setup only — phone, then either the returning-user PIN or the
 * new-user setup page. The CAMS import lives on its own route (/cams-upload),
 * which this screen hands off to once the account exists. "reset" is the
 * forgot-PIN detour off the PIN step; it returns there when done.
 */
type Step = "phone" | "setup" | "pin" | "reset";

/** Accounts are keyed on a 10-digit national number; the country code is
    picked separately and is never part of this count. Mirrors the backend
    rule in `identity/schemas/auth.py` — keep the two in step. */
const MOBILE_DIGITS = 10;

/**
 * Forgot-PIN (screen below, `/auth/pin-reset/*` on the backend), now live.
 *
 * Kept as a kill switch rather than deleted: the flow depends on an outside
 * mail provider (Resend), and if sending breaks — key revoked, domain
 * verification lapsed, quota hit — a request tells the user a code is on its
 * way and then fails. Setting this back to `false` hides the entry point
 * entirely (no link, no notice) until the provider is healthy again.
 *
 * Sending requires `RESEND_API_KEY` on the backend AND the sending domain in
 * `RESEND_FROM_EMAIL` verified in Resend by DNS — Resend delivers from a
 * verified domain only.
 */
const FORGOT_PIN_ENABLED = true;

const WelcomeScreen = ({ onNext, onExistingUserLogin }: WelcomeScreenProps) => {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(countryCodes[2]);
  const [showCodes, setShowCodes] = useState(false);
  const [loading, setLoading] = useState(false);

  const [returningUserOnboardingDone, setReturningUserOnboardingDone] = useState(false);

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  // New-user account setup (first login)
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");

  // Forgot-PIN reset (emailed 6-digit code)
  const [resetSent, setResetSent] = useState(false);
  const [resetHint, setResetHint] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState("");
  const [resetPin, setResetPin] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetNotice, setResetNotice] = useState("");
  const [resetExpiryMinutes, setResetExpiryMinutes] = useState<number | null>(null);
  /** Masked address for this number, learned from the check-mobile call the
      phone step already makes — so the reset screen can name the inbox before
      a code is sent, without a second request. */
  const [accountEmailHint, setAccountEmailHint] = useState<string | null>(null);

  // The input only ever holds digits, so this is a plain length check.
  const isValid = phone.length === MOBILE_DIGITS;

  // Enter anywhere = the step's primary (highlighted) button.
  useEnterSubmit(() => void handlePhoneSubmit(), step === "phone" && !showCodes);
  useEnterSubmit(() => void handlePinSubmit(), step === "pin");
  useEnterSubmit(() => void handleCreateAccount(), step === "setup");
  useEnterSubmit(
    () => void (resetSent ? handleResetConfirm() : handleResetRequest()),
    step === "reset",
  );

  // WelcomeScreen is a single component that swaps between internal sub-steps,
  // so the onboarding "viewed" events are emitted here on each sub-step change
  // rather than via useOnboardingStep (which is for route-mounted screens).
  useEffect(() => {
    if (step === "phone") trackOnboardingStepViewed("phone_entry");
    else if (step === "setup") trackOnboardingStepViewed("account_setup");
  }, [step]);

  // Back from either post-phone step returns to the number entry with that
  // step's inputs cleared, so nothing half-typed leaks into a different number.
  const backToPhone = () => {
    setStep("phone");
    setPin("");
    setName("");
    setNewPin("");
    setConfirmPin("");
    setEmail("");
    setNameError("");
    setPinError("");
    setEmailError("");
  };

  const handlePhoneSubmit = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    const digits = phone.replace(/\s/g, "");

    let exists = false;
    try {
      const status = await checkMobileStatus({
        country_code: countryCode.code,
        mobile: digits,
      });
      exists = status.exists;
      setReturningUserOnboardingDone(status.exists && status.is_onboarding_complete);
      setAccountEmailHint(status.email_hint ?? null);
    } catch {
      setReturningUserOnboardingDone(false);
      setAccountEmailHint(null);
    }

    setLoading(false);
    trackOnboardingStepCompleted("phone_entry", {
      user_type: exists ? "returning" : "new",
    });
    // Returning users go straight to the PIN prompt; new users set up their
    // account (name + PIN + confirm + email) on one page before onboarding.
    setStep(exists ? "pin" : "setup");
  };

  const finishOnboardedSession = () => {
    try {
      sessionStorage.setItem("onboardingComplete", "true");
    } catch {
      /* ignore */
    }
    if (onExistingUserLogin) {
      onExistingUserLogin();
    } else {
      navigate("/");
    }
  };

  // A returning user with unfinished onboarding lands EXACTLY where they left
  // off — resolved from backend state (holdings imported / CAMS deferred), so
  // progress survives any time away or a different device.
  const resumeOnboarding = async () => {
    setLoading(true);
    try {
      navigate(await resolveOnboardingResumeRoute());
      return;
    } catch {
      /* resolution failed → fall back to the first onboarding step */
    }
    setLoading(false);
    onNext(); // /cams-upload — the step right after account setup
  };

  // Returning user: verify the PIN they set at signup and drop them into the app.
  const handlePinSubmit = async () => {
    if (pin.length < 4) {
      setPinError("Enter your 4-digit PIN");
      return;
    }
    setPinError("");
    setLoading(true);
    const digits = phone.replace(/\s/g, "");
    const creds = {
      country_code: countryCode.code,
      mobile: digits,
      password: pin,
    };

    // A failed PIN must FAIL. There used to be a retry here that called
    // login() without the password, which signed the user in on any wrong PIN
    // and made the PIN decorative. Accounts that never set one still sign in,
    // because the backend only checks a password when a hash exists.
    try {
      await login(creds);
    } catch {
      setPinError(
        FORGOT_PIN_ENABLED
          ? "That PIN doesn't match. Try again, or reset it below."
          : "That PIN doesn't match. Please try again.",
      );
      setLoading(false);
      return;
    }
    await refresh();
    setLoading(false);
    try {
      const me = await getMe();
      if (me.is_onboarding_complete || returningUserOnboardingDone) {
        finishOnboardedSession();
        return;
      }
    } catch {
      if (returningUserOnboardingDone) {
        finishOnboardedSession();
        return;
      }
    }
    await resumeOnboarding();
  };

  const openReset = () => {
    setStep("reset");
    setResetSent(false);
    // Seeded from check-mobile, so the screen opens already naming the inbox.
    setResetHint(accountEmailHint);
    setResetCode("");
    setResetPin("");
    setResetConfirm("");
    setResetError("");
    setResetNotice("");
    setResetExpiryMinutes(null);
  };

  const backToPin = () => {
    setStep("pin");
    setPin("");
    setPinError("");
  };

  /** Ask for a code. The backend answers the same whether or not the number is
      registered, so a "sent" state here is never proof an account exists. */
  const handleResetRequest = async () => {
    if (loading) return;
    setResetError("");
    setLoading(true);
    try {
      const res = await requestPinReset({
        country_code: countryCode.code,
        mobile: phone,
      });
      setResetHint(res.email_hint);
      setResetExpiryMinutes(res.expires_in_minutes);
      setResetSent(true);
      // When there's an address to name, it gets its own block below rather
      // than a sentence — which inbox to open is the one thing the user needs
      // off this screen. The plain message is kept for the deliberately vague
      // answer a number with no account on file gets.
      setResetNotice(res.email_hint ? "" : res.message);
    } catch (e) {
      setResetError(
        e instanceof Error ? e.message : "Could not send a reset code. Try again.",
      );
    }
    setLoading(false);
  };

  const handleResetConfirm = async () => {
    if (loading) return;
    if (resetCode.length !== 6) {
      setResetError("Enter the 6-digit code from your email");
      return;
    }
    if (resetPin.length !== 4) {
      setResetError("Choose a 4-digit PIN");
      return;
    }
    if (resetPin !== resetConfirm) {
      setResetError("The two PINs don't match");
      return;
    }
    setResetError("");
    setLoading(true);
    try {
      await confirmPinReset({
        country_code: countryCode.code,
        mobile: phone,
        code: resetCode,
        new_pin: resetPin,
      });
    } catch (e) {
      setResetError(
        e instanceof Error ? e.message : "Could not reset your PIN. Try again.",
      );
      setLoading(false);
      return;
    }
    setLoading(false);
    // Straight back to the PIN prompt rather than auto-signing in: typing the
    // new PIN once confirms it landed, and keeps one sign-in path.
    backToPin();
    setPinError("PIN updated — sign in with your new PIN.");
  };

  const isEmailValid = (v: string) => {
    const t = v.trim().toLowerCase();
    return t.includes("@") && (t.split("@")[1] ?? "").includes(".");
  };

  // New user: validate every field on the single setup page, then create the
  // account, making sure each response is persisted before onboarding continues.
  const handleCreateAccount = async () => {
    setNameError("");
    setPinError("");
    setEmailError("");

    let ok = true;
    if (!name.trim()) {
      setNameError("Please tell us what to call you");
      ok = false;
    }
    if (newPin.length < 4) {
      setPinError("Choose a 4-digit PIN");
      ok = false;
    } else if (confirmPin.length < 4) {
      setPinError("Re-enter your 4-digit PIN to confirm");
      ok = false;
    } else if (confirmPin !== newPin) {
      setPinError("PINs don't match. Please try again.");
      setConfirmPin("");
      ok = false;
    }
    if (!isEmailValid(email)) {
      setEmailError("Enter a valid email address");
      ok = false;
    }
    if (!ok) return;

    setLoading(true);
    const digits = phone.replace(/\s/g, "");
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const creds = {
      country_code: countryCode.code,
      mobile: digits,
      password: newPin,
    };

    try {
      await signup({ ...creds, first_name: cleanName, email: cleanEmail });
    } catch (e) {
      // The phone may already have an account — try signing in with the PIN.
      // If that also fails, surface the real reason (e.g. email already in use).
      const signupMsg = e instanceof Error ? e.message : "";
      try {
        await login(creds);
      } catch {
        setEmailError(signupMsg || "Could not create your account. Please try again.");
        setLoading(false);
        return;
      }
    }

    // Safety net: guarantee name + email land in the users table even if the
    // phone record already existed (so no response the user gave is lost).
    try {
      await updateMe({ first_name: cleanName, email: cleanEmail });
    } catch {
      /* non-fatal — these were already sent on signup */
    }

    await refresh();
    setLoading(false);
    trackOnboardingStepCompleted("account_setup");
    // First onboarding step after account setup: upload the CAMS statement.
    navigate("/cams-upload");
  };

  /* ─── New user: account setup (name + PIN + confirm + email on one page) ─── */
  if (step === "setup") {
    return (
      <div className="mobile-container flex flex-col bg-background px-6 pb-6 pt-12">
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="flex-1 flex flex-col overflow-y-auto"
        >
          <h1 className="text-xl font-semibold text-foreground mb-2">Set up your account</h1>
          <p className="text-xs text-muted-foreground mb-1">
            A few quick details to get you started.
          </p>
          <p className="text-xs font-semibold text-foreground mb-6">
            {countryCode.code} {phone}
          </p>

          {/* Name */}
          <div className="mb-5">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              What should we call you?
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary"
            />
            {nameError && (
              <p className="text-xs text-destructive mt-2">{nameError}</p>
            )}
          </div>

          {/* PIN */}
          <div className="mb-5">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Set a 4-digit PIN
            </label>
            <InputOTP maxLength={4} value={newPin} onChange={setNewPin}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {/* Confirm PIN */}
          <div className="mb-5">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Confirm PIN
            </label>
            <InputOTP maxLength={4} value={confirmPin} onChange={setConfirmPin}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>
            <p className="text-[11px] text-muted-foreground mt-2">
              You&apos;ll use this PIN to sign in next time.
            </p>
            {pinError && (
              <p className="text-xs text-destructive mt-2">{pinError}</p>
            )}
          </div>

          {/* Email */}
          <div className="mb-2">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Your email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary"
            />
            {emailError && (
              <p className="text-xs text-destructive mt-2">{emailError}</p>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="mt-4"
        >
          <OnboardingNav
            nextLabel="Create account"
            onNext={() => void handleCreateAccount()}
            nextLoading={loading}
            loadingLabel="Creating your account…"
            onBack={backToPhone}
            backLabel="Back to phone number"
          />
        </motion.div>
      </div>
    );
  }

  /* ─── Forgot PIN: emailed code → new PIN ─── */
  if (step === "reset") {
    return (
      <div className="mobile-container flex flex-col bg-background px-6 pb-6 pt-12">
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="flex-1 flex flex-col"
        >
          <h1 className="text-xl font-semibold text-foreground mb-2">Reset your PIN</h1>
          {/* Say EMAIL, and then show the inbox. Leading with the phone number
              invites the assumption that a text is coming, and someone waiting
              on an SMS never opens the inbox the code is actually sitting in. */}
          <p className="text-xs text-muted-foreground mb-1">
            {resetSent
              ? "Enter the 6-digit code from your email, then choose a new PIN."
              : resetHint
                ? "We'll email a 6-digit code to:"
                : "We'll email you a 6-digit code — it goes to the email address on your account, not to this number."}
          </p>
          {/* The address once it is known, the number only as a fallback: an
              account with no email on file still has to see WHICH account is
              being reset. Hidden after sending, where the block below says it
              with the expiry attached. */}
          {!(resetSent && resetHint) && (
            <p className="mb-6 truncate text-xs font-semibold text-foreground">
              {resetHint ?? `${countryCode.code} ${phone}`}
            </p>
          )}

          {/* The address the code went to, named as plainly as the masking
              allows. The backend masks it; the app never sees it in full. */}
          {resetSent && resetHint && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Code sent to</p>
                <p className="truncate text-xs font-semibold text-foreground">
                  {resetHint}
                </p>
                {resetExpiryMinutes !== null && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Expires in {resetExpiryMinutes} minutes. Check spam if it
                    hasn't arrived.
                  </p>
                )}
              </div>
            </div>
          )}

          {resetNotice && (
            <p className="text-[11px] text-muted-foreground mb-4 leading-relaxed">
              {resetNotice}
            </p>
          )}

          {resetSent && (
            <div className="space-y-5">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  6-digit code
                </label>
                <InputOTP maxLength={6} value={resetCode} onChange={setResetCode}>
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  New 4-digit PIN
                </label>
                <InputOTP maxLength={4} value={resetPin} onChange={setResetPin}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Confirm new PIN
                </label>
                <InputOTP maxLength={4} value={resetConfirm} onChange={setResetConfirm}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
          )}

          {resetError && (
            <p className="text-xs text-destructive mt-4">{resetError}</p>
          )}

          <div className="mb-auto" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <OnboardingNav
            nextLabel={resetSent ? "Set new PIN" : "Email me a code"}
            onNext={() =>
              void (resetSent ? handleResetConfirm() : handleResetRequest())
            }
            nextLoading={loading}
            loadingLabel={resetSent ? "Updating your PIN…" : "Sending the code…"}
            onBack={backToPin}
            backLabel="Back to sign in"
            secondary={
              resetSent ? (
                <button
                  type="button"
                  onClick={() => void handleResetRequest()}
                  disabled={loading}
                  className="text-[12px] font-medium text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
                >
                  Send a new code
                </button>
              ) : undefined
            }
          />
        </motion.div>
      </div>
    );
  }

  /* ─── Returning user: PIN ─── */
  if (step === "pin") {
    return (
      <div className="mobile-container flex flex-col bg-background px-6 pb-6 pt-12">
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="flex-1 flex flex-col"
        >
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Welcome back
          </h1>
          <p className="text-xs text-muted-foreground mb-1">
            Enter your 4-digit PIN to continue
          </p>
          <p className="text-xs font-semibold text-foreground mb-8">
            {countryCode.code} {phone}
          </p>

          <div className="flex justify-center mb-6">
            <InputOTP maxLength={4} value={pin} onChange={setPin}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {pinError && (
            <p className="text-xs text-destructive text-center mb-4">{pinError}</p>
          )}

          {/* Nothing is shown while the flow is off — no link, no notice. The
              spacer keeps the Continue button pinned to the bottom either way. */}
          {FORGOT_PIN_ENABLED && (
            <button
              type="button"
              onClick={openReset}
              className="mx-auto text-[12px] font-medium text-primary underline-offset-2 transition-colors hover:underline"
            >
              Forgot your PIN?
            </button>
          )}
          <div className="mb-auto" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <OnboardingNav
            nextLabel="Continue"
            onNext={() => void handlePinSubmit()}
            nextDisabled={pin.length < 4}
            nextLoading={loading}
            loadingLabel="Signing you in…"
            onBack={backToPhone}
            backLabel="Back to phone number"
          />
        </motion.div>
      </div>
    );
  }


  /* ─── Phone Screen ─── */
  return (
    <div className="mobile-container flex flex-col bg-background px-6 pb-6 pt-12">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 flex flex-col"
      >
        <div className="flex flex-col items-center text-center mb-4 mt-12">
          {/* Theme-aware: light logo on light background, dark logo on dark. */}
          <img src={prozprLogoLight} alt="Prozpr - Wealth, Unified." className="w-[220px] max-w-full h-auto dark:hidden" />
          <img src={prozprLogoDark} alt="Prozpr - Wealth, Unified." className="hidden w-[220px] max-w-full h-auto dark:block" />
        </div>

        <div className="mt-6 space-y-2.5 mb-auto">
          {[
            { icon: TrendingUp, label: "Track all investments", sub: "Mutual funds, stocks and more" },
            { icon: Sparkles, label: "Prozpr, your own AI wealth advisor", sub: "Personalized recommendations" },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-3 rounded-xl bg-card p-3 border border-border/60"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg wealth-gradient">
                <item.icon className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground tracking-tight">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.sub}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Phone input */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="mt-1 mb-2"
      >
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowCodes(!showCodes)}
              className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <span>{countryCode.flag}</span>
              <span className="text-xs">{countryCode.code}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
            {showCodes && (
              <div className="absolute top-full left-0 mt-1 z-20 w-40 rounded-xl bg-card border border-border shadow-wealth-lg overflow-hidden">
                {countryCodes.map((cc) => (
                  <button
                    key={cc.code}
                    type="button"
                    onClick={() => {
                      setCountryCode(cc);
                      setShowCodes(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <span>{cc.flag}</span>
                    <span className="text-xs text-muted-foreground">{cc.label}</span>
                    <span className="ml-auto text-xs font-medium">{cc.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Digits only, capped at the exact length the backend accepts —
              letters and separators are dropped as they're typed rather than
              failing on submit. */}
          <input
            type="tel"
            inputMode="numeric"
            maxLength={MOBILE_DIGITS}
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value.replace(/\D/g, "").slice(0, MOBILE_DIGITS))
            }
            placeholder={`${MOBILE_DIGITS}-digit mobile number`}
            className="flex-1 bg-transparent py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.85, duration: 0.5 }}
        className="text-center mb-3"
      >
        <p className="text-xs text-muted-foreground leading-relaxed">
          Existing users sign in with a 4-digit PIN and go straight to the app.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          New users set a PIN, then can import holdings from a CAMS CAS PDF.
        </p>
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed mt-1">
          Enter your {MOBILE_DIGITS}-digit number without the country code.
        </p>
      </motion.div>

      {/* Entry point of the whole flow — nothing precedes it, so no Back. */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
      >
        <OnboardingNav
          nextLabel="Get Started"
          onNext={() => void handlePhoneSubmit()}
          nextDisabled={!isValid}
          nextLoading={loading}
          loadingLabel="Checking your number…"
        />
      </motion.div>
    </div>
  );
};

export default WelcomeScreen;
