import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Mail, ShieldCheck, Smartphone, Phone } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { maskEmail, maskMobile } from "@/lib/utils";
import {
  BackendOfflineError,
  confirmSensitiveChange,
  requestSensitiveChange,
  type SensitiveField,
} from "@/lib/api";

/* ── per-field copy and input rules ─────────────────────────────────────── */

interface FieldSpec {
  title: string;
  /** Sits under the title. Says what will happen, before anything happens. */
  blurb: string;
  icon: React.ElementType;
  label: string;
  placeholder: string;
  /** Why this field is gated. Shown once the code step is reached. */
  inputMode?: "email" | "numeric" | "text";
  maxLength?: number;
  uppercase?: boolean;
  /** Client-side check, so an obvious typo never costs a code. */
  validate: (v: string) => string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const SPECS: Record<SensitiveField, FieldSpec> = {
  email: {
    title: "Change email address",
    blurb:
      "Your email is how you recover your account, so we'll send a code to the address on file before moving it.",
    icon: Mail,
    label: "New email address",
    placeholder: "you@example.com",
    inputMode: "email",
    validate: (v) => (EMAIL_RE.test(v.trim()) ? null : "That doesn't look like an email address"),
  },
  mobile: {
    title: "Change mobile number",
    blurb:
      "Your mobile number is what you sign in with. We'll confirm the change by email first, so the new number can't be set by someone holding your session.",
    icon: Phone,
    label: "New mobile number",
    placeholder: "9876543210",
    inputMode: "numeric",
    maxLength: 10,
    validate: (v) =>
      /^\d{10}$/.test(v.replace(/\D/g, "")) ? null : "Enter a 10-digit mobile number",
  },
  pan: {
    title: "Change PAN",
    blurb:
      "Your PAN is what your statements and holdings are matched against. Changing it needs a code sent to your email.",
    icon: Smartphone,
    label: "PAN",
    placeholder: "ABCDE1234F",
    maxLength: 10,
    uppercase: true,
    validate: (v) =>
      PAN_RE.test(v.trim().toUpperCase()) ? null : "PAN format is ABCDE1234F",
  },
};

const COUNTRY_CODES = ["+91", "+1", "+44", "+61", "+65", "+971"];

/**
 * /account/:field — one screen per sensitive change (email, mobile, PAN).
 *
 * A page rather than a sheet. These flows are two steps with an email round
 * trip in the middle, which is more than a sheet should hold — and the sheet
 * version had to fight the bottom nav for space. A route also means the back
 * button does the obvious thing and the step survives a reload landing here.
 */
const SensitiveChange = () => {
  const navigate = useNavigate();
  const { field } = useParams<{ field: string }>();
  const { user, refresh } = useAuth();

  const [value, setValue] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"value" | "code">("value");
  const [hint, setHint] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const spec = useMemo(
    () => (field && field in SPECS ? SPECS[field as SensitiveField] : null),
    [field],
  );

  const current = useMemo(() => {
    if (!user || !field) return null;
    if (field === "email") return user.email ? maskEmail(user.email) : null;
    if (field === "mobile") return `${user.country_code} ${maskMobile(user.mobile)}`;
    if (field === "pan") return user.pan_masked ?? null;
    return null;
  }, [user, field]);

  const submitValue = useCallback(async () => {
    if (!spec || !field) return;
    const problem = spec.validate(value);
    if (problem) { setError(problem); return; }
    setError("");
    setBusy(true);
    try {
      const res = await requestSensitiveChange(
        field as SensitiveField,
        value.trim(),
        field === "mobile" ? countryCode : undefined,
      );
      if (!res.verification_required) {
        await refresh();
        toast.success(res.message);
        navigate("/account");
        return;
      }
      setHint(res.email_hint);
      setExpiresIn(res.expires_in_minutes);
      setStage("code");
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      setError(err instanceof Error ? err.message : "Could not start that change");
    } finally {
      setBusy(false);
    }
  }, [spec, field, value, countryCode, refresh, navigate]);

  const submitCode = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      await confirmSensitiveChange(code);
      await refresh();
      toast.success(`Your ${spec?.title.replace("Change ", "")} was updated`);
      navigate("/account");
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      setCode("");
      setError(err instanceof Error ? err.message : "That code didn't work");
    } finally {
      setBusy(false);
    }
  }, [code, refresh, navigate, spec]);

  if (!spec) {
    return (
      <div className="mobile-container bg-background min-h-screen px-5 pt-16">
        <p className="text-sm text-muted-foreground">
          There&apos;s nothing to change here.
        </p>
        <button
          onClick={() => navigate("/account")}
          className="mt-3 text-[12px] font-semibold text-accent"
        >
          Back to Account Centre
        </button>
      </div>
    );
  }

  const Icon = spec.icon;

  return (
    <div className="mobile-container bg-background min-h-screen pb-10">
      <div className="px-5 pt-10 pb-4 flex items-center gap-3">
        <button
          onClick={() => (stage === "code" ? setStage("value") : navigate("/account"))}
          aria-label="Back"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">{spec.title}</h1>
      </div>

      <motion.div
        key={stage}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="px-5"
      >
        {stage === "value" ? (
          <>
            <div className="wealth-card !p-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  {current && (
                    <>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Current
                      </p>
                      <p className="font-mono text-[13px] text-foreground">{current}</p>
                    </>
                  )}
                  <p className="text-[12px] leading-relaxed text-muted-foreground mt-1.5">
                    {spec.blurb}
                  </p>
                </div>
              </div>

              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                {spec.label}
              </label>
              <div className="flex gap-2">
                {field === "mobile" && (
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="rounded-lg border border-border bg-background px-2 py-2.5 text-[13px] text-foreground outline-none focus:border-primary transition-colors"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
                <input
                  autoFocus
                  value={value}
                  inputMode={spec.inputMode}
                  maxLength={spec.maxLength}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setValue(
                      field === "mobile"
                        ? raw.replace(/\D/g, "").slice(0, 10)
                        : spec.uppercase
                          ? raw.toUpperCase()
                          : raw,
                    );
                    setError("");
                  }}
                  placeholder={spec.placeholder}
                  className="flex-1 min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] text-foreground outline-none focus:border-primary transition-colors"
                />
              </div>
              {error && <p className="text-[11px] text-destructive mt-2">{error}</p>}

              <button
                onClick={submitValue}
                disabled={busy || !value.trim()}
                className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-foreground py-3 text-[12px] font-semibold text-background transition-opacity disabled:opacity-40"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Continue
              </button>
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground mt-3 px-1">
              Nothing changes until you enter the code. If you don&apos;t finish, your{" "}
              {spec.title.replace("Change ", "")} stays exactly as it is.
            </p>
          </>
        ) : (
          <>
            <div className="wealth-card !p-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">
                    Enter the 6-digit code
                  </p>
                  <p className="text-[12px] leading-relaxed text-muted-foreground mt-1">
                    Sent to {hint ?? "the email on your account"}
                    {expiresIn ? `. It expires in ${expiresIn} minutes.` : "."}
                  </p>
                </div>
              </div>

              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
                placeholder="000000"
                className="w-full rounded-xl border border-border bg-background px-3 py-3 text-center font-mono text-[20px] tracking-[0.5em] text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/30"
              />
              {error && <p className="text-[11px] text-destructive mt-2">{error}</p>}

              <button
                onClick={submitCode}
                disabled={busy || code.length !== 6}
                className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-foreground py-3 text-[12px] font-semibold text-background transition-opacity disabled:opacity-40"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm change
              </button>
              <button
                onClick={() => { setStage("value"); setCode(""); setError(""); }}
                disabled={busy}
                className="mt-2 w-full text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                Use a different one
              </button>
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground mt-3 px-1">
              The code goes to the email already on your account, never to the new
              details — that&apos;s what stops someone with your session from taking
              the account with them.
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default SensitiveChange;
