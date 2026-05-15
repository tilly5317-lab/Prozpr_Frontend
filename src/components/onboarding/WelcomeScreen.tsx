import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Shield, TrendingUp, Sparkles, ChevronDown, ArrowLeft, Loader2, FileText, UploadCloud } from "lucide-react";
import CamsStatementPasswordModal from "./CamsStatementPasswordModal";
import prozprLogo from "@/assets/prozpr-logo-v2.png";
import { signup, login, getMe } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";

interface WelcomeScreenProps {
  onNext: () => void;
}

const countryCodes = [
  { code: "+44", label: "UK", flag: "🇬🇧" },
  { code: "+1", label: "US", flag: "🇺🇸" },
  { code: "+91", label: "IN", flag: "🇮🇳" },
  { code: "+61", label: "AU", flag: "🇦🇺" },
  { code: "+971", label: "AE", flag: "🇦🇪" },
  { code: "+65", label: "SG", flag: "🇸🇬" },
];

const DEFAULT_PASSWORD = "asktilly2026";
const MAX_PDF_BYTES = 20 * 1024 * 1024;

type Step = "phone" | "otp" | "pin" | "cams";

const WelcomeScreen = ({ onNext: _onNext }: WelcomeScreenProps) => {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(countryCodes[2]);
  const [showCodes, setShowCodes] = useState(false);
  const [loading, setLoading] = useState(false);

  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [camsFile, setCamsFile] = useState<File | null>(null);
  const [camsPickError, setCamsPickError] = useState("");
  const [showCamsPasswordModal, setShowCamsPasswordModal] = useState(false);

  const isValid = phone.replace(/\s/g, "").length >= 7;

  const handlePhoneSubmit = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    const digits = phone.replace(/\s/g, "");

    // Try login to check if user already exists
    try {
      await login({
        country_code: countryCode.code,
        mobile: digits,
        password: DEFAULT_PASSWORD,
      });
      // User exists — ask for PIN and skip onboarding
      setLoading(false);
      setStep("pin");
      return;
    } catch {
      // User doesn't exist — proceed with OTP signup flow
    }

    setLoading(false);
    setStep("otp");
  };

  const handlePinSubmit = async () => {
    if (pin.length < 4) {
      setPinError("Enter your 4-digit PIN");
      return;
    }
    setPinError("");
    setLoading(true);

    // PIN can be anything for now — user is already logged in from handlePhoneSubmit
    await refresh();
    setLoading(false);

    try {
      sessionStorage.setItem("onboardingComplete", "true");
    } catch { /* ignore */ }
    navigate("/chat");
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 6) {
      setOtpError("Enter the full 6-digit code");
      return;
    }
    setOtpError("");
    setLoading(true);
    const digits = phone.replace(/\s/g, "");
    try {
      await signup({
        country_code: countryCode.code,
        mobile: digits,
        password: DEFAULT_PASSWORD,
        first_name: "User",
      });
    } catch {
      try {
        await login({
          country_code: countryCode.code,
          mobile: digits,
          password: DEFAULT_PASSWORD,
        });
      } catch {
        /* continue even if backend is down */
      }
    }
    await refresh();
    setLoading(false);

    try {
      const me = await getMe();
      if (me.is_onboarding_complete) {
        try {
          sessionStorage.setItem("onboardingComplete", "true");
        } catch {
          /* ignore storage failures */
        }
        navigate("/chat");
        return;
      }
    } catch {
      /* no session or /me failed — continue to CAMS import */
    }

    setStep("cams");
  };

  const handleResend = () => {
    setOtp("");
    setOtpError("");
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

  /* ─── CAMS upload (after OTP verification) ─── */
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
              setStep("otp");
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
                    ? `${(camsFile.size / 1024).toFixed(0)} KB · tap to change file`
                    : "PDF only · up to 20 MB"}
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
            🔒 The password is only used to open the PDF on our servers and is not stored.
          </p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          type="button"
          onClick={() => camsFile && setShowCamsPasswordModal(true)}
          disabled={!camsFile}
          className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold text-primary-foreground tracking-wide transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
        >
          Enter password & extract
          <ArrowRight className="h-4 w-4" />
        </motion.button>

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

  /* ─── PIN Screen (existing user) ─── */
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

          <p className="text-[11px] text-muted-foreground text-center mb-auto">
            Enter any 4-digit PIN to proceed
          </p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          type="button"
          onClick={() => void handlePinSubmit()}
          disabled={pin.length < 4 || loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold text-primary-foreground tracking-wide transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
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

  /* ─── OTP Screen ─── */
  if (step === "otp") {
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
              setOtp("");
              setOtpError("");
            }}
            className="flex items-center gap-1 text-sm text-muted-foreground mb-6 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <h1 className="text-xl font-semibold text-foreground mb-2">
            Verify your number
          </h1>
          <p className="text-xs text-muted-foreground mb-1">
            We sent a 6-digit code to
          </p>
          <p className="text-xs font-semibold text-foreground mb-8">
            {countryCode.code} {phone}
          </p>

          <div className="flex justify-center mb-6">
            <InputOTP maxLength={6} value={otp} onChange={setOtp}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {otpError && (
            <p className="text-xs text-destructive text-center mb-4">{otpError}</p>
          )}

          <button
            type="button"
            onClick={handleResend}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors text-center mb-auto"
          >
            Didn&apos;t receive it? <span className="font-semibold underline">Resend code</span>
          </button>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          type="button"
          onClick={() => void handleVerifyOtp()}
          disabled={otp.length < 6 || loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold text-primary-foreground tracking-wide transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Verify & Continue
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
          <img src={prozprLogo} alt="Prozpr — Wealth, Unified." className="w-[345px] h-auto" />
        </div>

        <div className="mt-0 space-y-2.5 mb-auto">
          {[
            { icon: TrendingUp, label: "Track all investments", sub: "Mutual funds, stocks and more" },
            { icon: Sparkles, label: "Tilly, your own AI wealth advisor", sub: "Personalized recommendations" },
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
          We&apos;ll find accounts linked to this number
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          🔒 After verifying, you can import holdings from your CAMS CAS PDF
        </p>
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        type="button"
        onClick={() => void handlePhoneSubmit()}
        disabled={!isValid || loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold text-primary-foreground tracking-wide transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
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
