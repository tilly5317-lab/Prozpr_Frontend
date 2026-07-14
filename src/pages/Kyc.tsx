import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import {
  getFpStatus,
  getMe,
  getPersonalInfo,
  runFpKycSetup,
  updatePersonalInfo,
  type FpKycSetupResponse,
  type FpStatusResponse,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";

const PAN_RE = /^[A-Z]{3}P[A-Z][0-9]{4}[A-Z]$/;

/**
 * KYC page (`/kyc`) — the gate that enables transactions on the SIP /
 * Rebalancing / Lumpsum pages. Asks only for the PAN; the name and date of
 * birth come from the user's identity on our backend. Submitting runs the FP
 * Pre-Verification check and, once it completes, the backend mints the FP
 * investor profile + investment account. `?returnTo=` brings the user back to
 * the page that sent them here.
 */
const Kyc = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") || "/invest/sip";
  const { user } = useAuth();

  const [status, setStatus] = useState<FpStatusResponse | null>(null);
  const [dob, setDob] = useState<string | null>(null);
  const [dobInput, setDobInput] = useState("");
  const [nameFromApi, setNameFromApi] = useState("");
  const [pan, setPan] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FpKycSetupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Name + DOB were captured at onboarding — always fetch them fresh from the
  // backend rather than trusting the (possibly not-yet-hydrated) auth context.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [st, info, me] = await Promise.all([
          getFpStatus(),
          getPersonalInfo(),
          getMe().catch(() => null),
        ]);
        if (cancelled) return;
        setStatus(st);
        setDob(info.date_of_birth ?? null);
        if (me) {
          setNameFromApi(
            [me.first_name, me.last_name].filter(Boolean).join(" ").trim(),
          );
        }
        if (st.account?.pan) setPan(st.account.pan);
      } catch {
        /* page still renders; submit surfaces errors */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fullName = useMemo(() => {
    const fromContext = [user?.first_name, user?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    return nameFromApi || fromContext;
  }, [user, nameFromApi]);

  const panClean = pan.trim().toUpperCase();
  const panValid = PAN_RE.test(panClean);
  const kycComplete = result?.ready_to_transact || status?.ready_to_transact || false;
  const kycFailed =
    !kycComplete && (result?.account.kyc_status === "failed" || status?.account?.kyc_status === "failed");

  const submit = async () => {
    if (submitting) return;
    setError(null);

    // DOB must exist on the profile first — save it if the user just typed one.
    if (!dob) {
      if (!dobInput) { setError("Please add your date of birth."); return; }
      setSubmitting(true);
      try {
        await updatePersonalInfo({ date_of_birth: dobInput });
        setDob(dobInput);
      } catch (e) {
        setSubmitting(false);
        setError(e instanceof Error ? e.message : "Couldn't save your date of birth.");
        return;
      }
      setSubmitting(false);
    }
    if (!panValid) { setError("Enter a valid PAN (e.g. ARRPP7775N — 4th letter P)."); return; }

    setSubmitting(true);
    try {
      let res = await runFpKycSetup(panClean);
      // Pre-Verification is async (accepted → completed) — re-poll a few times.
      let attempts = 0;
      while (!res.ready_to_transact && res.account.kyc_status === "submitted" && attempts < 5) {
        await new Promise((r) => setTimeout(r, 2000));
        res = await runFpKycSetup();
        attempts += 1;
      }
      setResult(res);
      if (res.ready_to_transact) {
        toast({ title: "KYC complete", description: "Transactions are now enabled." });
      } else if (res.account.kyc_status === "failed") {
        toast({
          title: "KYC verification failed",
          description: "The identity check didn't verify your details.",
          variant: "destructive",
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "KYC check failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mobile-container min-h-screen bg-background pb-10">
      <div className="px-5 pt-10">
        <button
          type="button"
          onClick={() => navigate(returnTo)}
          className="mb-4 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[#D4A868]" />
          <h1 className="text-lg font-bold text-foreground">Complete your KYC</h1>
        </div>
        <p className="mb-4 text-[11.5px] leading-snug text-muted-foreground">
          A one-time identity check that enables transactions — SIPs, lumpsum
          purchases and rebalancing orders. We verify your PAN against your name
          and date of birth.
        </p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 pt-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : kycComplete ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <p className="text-sm font-semibold text-foreground">KYC verified</p>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
              Your investment account is ready
              {(result?.account ?? status?.account)?.pan
                ? ` (PAN ${(result?.account ?? status?.account)?.pan})`
                : ""}
              . You can now place orders.
            </p>
            <button
              type="button"
              onClick={() => navigate(returnTo)}
              className="mt-3 w-full rounded-full bg-foreground py-2.5 text-[12.5px] font-semibold text-background transition-opacity hover:opacity-90"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4">
            {/* Identity from our backend — read-only */}
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Your identity</p>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5">
                <span className="text-[11px] text-muted-foreground">Name</span>
                <span className="text-[12px] font-medium text-foreground">{fullName || "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5">
                <span className="text-[11px] text-muted-foreground">Date of birth</span>
                {dob ? (
                  <span className="text-[12px] font-medium text-foreground">{dob}</span>
                ) : (
                  <input
                    type="date"
                    value={dobInput}
                    onChange={(e) => setDobInput(e.target.value)}
                    className="bg-transparent text-right text-[12px] font-medium text-foreground outline-none"
                  />
                )}
              </div>
            </div>
            {!dob && (
              <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                We don&apos;t have your date of birth yet — it&apos;s saved to your profile.
              </p>
            )}

            {/* PAN input */}
            <p className="mt-4 text-[10px] uppercase tracking-wide text-muted-foreground">PAN</p>
            <input
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase().slice(0, 10))}
              placeholder="ABCPE1234F"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={submitting}
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium uppercase tracking-widest text-foreground outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground/60"
            />
            {pan && !panValid && (
              <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                10 characters, e.g. ABCPE1234F — the 4th letter must be P (individual).
              </p>
            )}

            {kycFailed && !submitting && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#C24C3A]/30 bg-[#C24C3A]/5 p-2.5">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#C24C3A]" />
                <p className="text-[11px] leading-snug text-foreground">
                  The identity check couldn&apos;t verify these details. Check your PAN
                  and try again.
                </p>
              </div>
            )}
            {error && <p className="mt-2 text-[11px] leading-snug text-[#C24C3A]">{error}</p>}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || (!panValid && !!dob) || (!dob && !dobInput)}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-[#D4A868] py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? "Verifying…" : "Verify KYC"}
            </button>
            <p className="mt-2 text-center text-[10px] leading-snug text-muted-foreground">
              Sandbox identity check — verifies PAN, name and date of birth match.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Kyc;
