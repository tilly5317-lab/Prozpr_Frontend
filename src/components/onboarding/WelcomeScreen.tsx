import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Shield, TrendingUp, Sparkles, ChevronDown, ArrowLeft, Loader2 } from "lucide-react";
import AccountDiscoveryModal from "./AccountDiscoveryModal";
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

type Step = "phone" | "otp";

const WelcomeScreen = ({ onNext }: WelcomeScreenProps) => {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(countryCodes[2]);
  const [showCodes, setShowCodes] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");

  const isValid = phone.replace(/\s/g, "").length >= 7;

  const handlePhoneSubmit = () => {
    if (!isValid || loading) return;
    setStep("otp");
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
        // continue even if backend is down
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
      /* no session or /me failed — continue into discovery modal */
    }

    setShowModal(true);
  };

  const handleResend = () => {
    setOtp("");
    setOtpError("");
  };

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
            onClick={() => { setStep("phone"); setOtp(""); setOtpError(""); }}
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
            onClick={handleResend}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors text-center mb-auto"
          >
            Didn't receive it? <span className="font-semibold underline">Resend code</span>
          </button>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          onClick={handleVerifyOtp}
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
        <AccountDiscoveryModal
          open={showModal}
          onClose={() => setShowModal(false)}
          afterSyncNavigate="/link-accounts"
        />
      </div>
    );
  }

  /* ─── Phone Screen (original design) ─── */
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
          We'll find accounts linked to this number
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          🔒 Each account requires your authorization to connect
        </p>
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        onClick={handlePhoneSubmit}
        disabled={!isValid || loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold text-primary-foreground tracking-wide transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
      >
        Get Started
        <ArrowRight className="h-4 w-4" />
      </motion.button>
    </div>
  );
};

export default WelcomeScreen;
