import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Shield, TrendingUp, Sparkles, ChevronDown, ArrowLeft, Loader2, FileText, UploadCloud } from "lucide-react";
import CamsStatementPasswordModal from "./CamsStatementPasswordModal";
import prozprLogo from "@/assets/prozpr-logo-v2.png";
import { signup, login, getMe, updateMe, checkMobileStatus } from "@/lib/api";
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

const MAX_PDF_BYTES = 20 * 1024 * 1024;

type Step = "phone" | "setup" | "pin" | "cams";

const WelcomeScreen = ({ onExistingUserLogin }: WelcomeScreenProps) => {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(countryCodes[2]);
  const [showCodes, setShowCodes] = useState(false);
  const [loading, setLoading] = useState(false);

  const [isReturningUser, setIsReturningUser] = useState(false);
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [camsFile, setCamsFile] = useState<File | null>(null);
  const [camsPickError, setCamsPickError] = useState("");
  const [showCamsPasswordModal, setShowCamsPasswordModal] = useState(false);

  const isValid = phone.replace(/\s/g, "").length >= 7;

  // WelcomeScreen is a single component that swaps between internal sub-steps,
  // so the onboarding "viewed" events are emitted here on each sub-step change
  // rather than via useOnboardingStep (which is for route-mounted screens).
  useEffect(() => {
    if (step === "phone") trackOnboardingStepViewed("phone_entry");
    else if (step === "setup") trackOnboardingStepViewed("account_setup");
  }, [step]);

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
      setIsReturningUser(status.exists);
      setReturningUserOnboardingDone(status.exists && status.is_onboarding_complete);
    } catch {
      setIsReturningUser(false);
      setReturningUserOnboardingDone(false);
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

  const resumeOnboarding = () => {
    navigate("/link-accounts");
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

    try {
      await login(creds);
    } catch {
      try {
        await login({ country_code: creds.country_code, mobile: creds.mobile });
      } catch {
        setPinError("Could not sign in. Check your PIN and try again.");
        setLoading(false);
        return;
      }
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
    resumeOnboarding();
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

  const pickCamsFile = (f: File | null) => {
    setCamsPickError("");
    if (!f) {
      setCamsFile(null);
      return;
    }
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setCamsPickError("Please choose a PDF (CAMS or KFintech Consolidated Account Statement).");
      setCamsFile(null);
      return;
    }
    if (f.size > MAX_PDF_BYTES) {
      setCamsPickError("That PDF is larger than 20 MB. Try a shorter statement period.");
      setCamsFile(null);
      return;
    }
    setCamsFile(f);
    setShowCamsPasswordModal(true);
  };

  /* â”€â”€â”€ CAMS upload (new users only) â”€â”€â”€ */
  if (step === "cams") {
    return (
      <div className="mobile-container flex flex-col bg-background px-6 pb-6 pt-12">
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="flex-1 flex flex-col"
        >
          <button
            type="button"
            onClick={() => {
              setStep("pin");
              setCamsFile(null);
              setCamsPickError("");
              setShowCamsPasswordModal(false);
            }}
            className="flex items-center gap-1 text-sm text-muted-foreground mb-6 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <h1 className="text-xl font-semibold text-foreground mb-2">
            Upload your CAMS statement
          </h1>
          <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
            Add your CAMS or KFintech Consolidated Account Statement (CAS) as a PDF. After you choose
            the file, we&apos;ll ask for the PDF password on the next step to read folios and holdings.
          </p>

          <div className="mb-6">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-card px-3.5 py-4 text-left transition-colors hover:bg-accent/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                {camsFile ? (
                  <FileText className="h-5 w-5 text-foreground" />
                ) : (
                  <UploadCloud className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {camsFile ? camsFile.name : "Choose CAMS / KFintech CAS PDF"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {camsFile
                    ? `${(camsFile.size / 1024).toFixed(0)} KB Â· tap to change file`
                    : "PDF only Â· up to 20 MB"}
                </p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => pickCamsFile(e.target.files?.[0] ?? null)}
            />
            {camsPickError && (
              <p className="text-xs text-destructive mt-3">{camsPickError}</p>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed mb-auto">
            The password is only used to open the PDF on our servers and is not stored.
          </p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          type="button"
          onClick={() => camsFile && setShowCamsPasswordModal(true)}
          disabled={!camsFile}
          className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold text-primary-foreground tracking-wide transition-all active:scale-[0.98] disabled:opacity-90 disabled:pointer-events-none"
        >
          Enter password & extract
          <ArrowRight className="h-4 w-4" />
        </motion.button>

        <button
          type="button"
          onClick={() => navigate("/link-accounts")}
          className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now — link accounts later
        </button>

        <CamsStatementPasswordModal
          open={showCamsPasswordModal}
          file={camsFile}
          onClose={() => {
            setShowCamsPasswordModal(false);
          }}
          onImportedContinue={() => navigate("/link-accounts")}
        />
      </div>
    );
  }

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
          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setName("");
              setNewPin("");
              setConfirmPin("");
              setEmail("");
              setNameError("");
              setPinError("");
              setEmailError("");
            }}
            className="flex items-center gap-1 text-sm text-muted-foreground mb-6 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

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
              onKeyDown={(e) => e.key === "Enter" && void handleCreateAccount()}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary"
            />
            {emailError && (
              <p className="text-xs text-destructive mt-2">{emailError}</p>
            )}
          </div>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          type="button"
          onClick={() => void handleCreateAccount()}
          disabled={loading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold text-primary-foreground tracking-wide transition-all active:scale-[0.98] disabled:opacity-90 disabled:pointer-events-none"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Create account
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </motion.button>
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
          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setPin("");
              setPinError("");
            }}
            className="flex items-center gap-1 text-sm text-muted-foreground mb-6 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

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

          {isReturningUser && (
            <p className="text-[11px] text-muted-foreground text-center mb-auto">
              Seeded test accounts may use any 4-digit PIN, or the PIN set at signup.
            </p>
          )}
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          type="button"
          onClick={() => void handlePinSubmit()}
          disabled={pin.length < 4 || loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold text-primary-foreground tracking-wide transition-all active:scale-[0.98] disabled:opacity-90 disabled:pointer-events-none"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Continue
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </motion.button>
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
          <img src={prozprLogo} alt="Prozpr - Wealth, Unified." className="w-[345px] h-auto" />
        </div>

        <div className="mt-0 space-y-2.5 mb-auto">
          {[
            { icon: TrendingUp, label: "Track all investments", sub: "Mutual funds, stocks and more" },
            { icon: Sparkles, label: "Prozpr, your own AI wealth advisor", sub: "Personalized recommendations" },
            { icon: Shield, label: "Bank-grade security", sub: "256-bit encryption" },
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
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number"
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
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        type="button"
        onClick={() => void handlePhoneSubmit()}
        disabled={!isValid || loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold text-primary-foreground tracking-wide transition-all active:scale-[0.98] disabled:opacity-90 disabled:pointer-events-none"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Get Started
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </motion.button>
    </div>
  );
};

export default WelcomeScreen;
