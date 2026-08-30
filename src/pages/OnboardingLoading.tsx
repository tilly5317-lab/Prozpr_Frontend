import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import {
  getOnboardingGenerationStatus,
  startOnboardingGeneration,
  type OnboardingGenerationStatus,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useOnboardingStep } from "@/hooks/useOnboardingStep";

const POLL_MS = 1500;

/**
 * Post-signup loading page — polls the REAL personalisation job the "Generate
 * my portfolio" button started (`POST /onboarding/generate`). Shows the
 * backend's actual % and per-task checklist, then lands on /chat. If no job
 * exists yet (e.g. the button's kickoff failed) it starts one itself.
 *
 * The checklist is whatever the backend says it is — nothing is hard-coded
 * here. A user who skipped CAMS has no transactions, so the net-worth history
 * step isn't in their job at all and must not appear on this screen; until the
 * first status lands we show no rows rather than guessing at them.
 */
const OnboardingLoading = () => {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { completeStep } = useOnboardingStep("profile_generation");
  const [job, setJob] = useState<OnboardingGenerationStatus | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumped by "Try again" to restart the polling effect with a forced fresh job.
  const [attempt, setAttempt] = useState(0);
  const forceStartRef = useRef(false);
  // Poll errors are transient (network blips) — only surface after several in a row.
  const pollErrors = useRef(0);
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    void refresh(); // pick up is_onboarding_complete for the route guards
    completeStep();
    // Let the user see 100% / all-done ticks for a beat before moving on.
    window.setTimeout(() => navigate("/chat"), 700);
  }, [refresh, completeStep, navigate]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        let status: OnboardingGenerationStatus;
        if (forceStartRef.current) {
          // Retry path: the latest job is failed — POST starts a fresh one.
          forceStartRef.current = false;
          status = await startOnboardingGeneration();
        } else {
          status = await getOnboardingGenerationStatus();
          if (status.status === "none") {
            status = await startOnboardingGeneration();
          }
        }
        if (cancelled) return;
        pollErrors.current = 0;
        setJob(status);
        if (status.status === "success") {
          finish();
          return;
        }
        if (status.status === "failed") {
          setFailed(true);
          return;
        }
      } catch {
        pollErrors.current += 1;
        // Keep polling through blips; give up to the error state only after ~15s
        // of consecutive failures (the backend may be restarting).
        if (pollErrors.current >= 10) {
          setFailed(true);
          return;
        }
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), POLL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [finish, attempt]);

  const retry = () => {
    forceStartRef.current = true;
    pollErrors.current = 0;
    setFailed(false);
    setJob(null);
    setAttempt((a) => a + 1);
  };

  const progress = Math.min(100, Math.round(job?.progress_pct ?? 0));
  const steps = job?.steps ?? [];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-[340px] flex flex-col items-center text-center">
        {failed ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">
              We hit a snag setting things up
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {job?.message && job.message.startsWith("Failed")
                ? "Part of your personalisation couldn't finish. You can retry, or continue — everything also builds in the background as you use the app."
                : "We couldn't reach the server. Check your connection and retry, or continue to the app."}
            </p>
            <button
              type="button"
              onClick={retry}
              className="mt-5 w-full rounded-xl bg-foreground py-3 text-[14px] font-semibold text-background transition-all active:scale-[0.98]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                completeStep();
                navigate("/chat");
              }}
              className="mt-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Continue to the app anyway
            </button>
          </>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">
              Personalising your portfolio
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              {job?.message ?? "Getting started…"}
            </p>

            <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-foreground transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">{progress}%</p>

            {/* Real per-task checklist from the backend job — empty until the
                first status arrives, so no step is ever shown that this user's
                job won't actually run. */}
            <div className="mt-5 w-full space-y-2.5 text-left">
              {steps.map((s) => (
                <div key={s.key} className="flex items-center gap-2.5">
                  {s.state === "done" ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-wealth-green text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : s.state === "active" ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    </span>
                  ) : (
                    <span className="h-5 w-5 shrink-0 rounded-full border border-border" />
                  )}
                  <span
                    className={`text-[12px] ${
                      s.state === "pending"
                        ? "text-muted-foreground/60"
                        : s.state === "active"
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OnboardingLoading;
