import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";

import { updateRiskProfile, type RiskProfileResponse } from "@/lib/api";

/**
 * Risk profile and horizon, edited in a sheet.
 *
 * The values stay where they always were — in the allocation card's stats row —
 * and this opens over them. Editing in place would have grown a summary row into
 * a form, which is a lot of chrome for two answers changed once a year.
 *
 * These two answers drive the target allocation, which drives the rebalancing
 * plan — so a change here quietly rewrites what the app will tell the user to
 * buy and sell. That is why the change is staged and confirmed rather than saved
 * on tap: the confirm step exists to state the consequence, not to guard against
 * a mis-tap.
 */

/**
 * `risk_level` is a 0–4 scale; the backend derives the display category from
 * it. Labels here mirror the tell-us wizard's preference letters A–E so the two
 * surfaces can't drift apart.
 */
const RISK_OPTIONS = [
  { level: 0, label: "Conservative", mix: "10% equity · 90% debt" },
  { level: 1, label: "Moderately conservative", mix: "30% equity · 70% debt" },
  { level: 2, label: "Balanced", mix: "50% equity · 50% debt" },
  { level: 3, label: "Moderately aggressive", mix: "70% equity · 30% debt" },
  { level: 4, label: "Aggressive", mix: "90% equity · 10% debt" },
] as const;

const HORIZON_OPTIONS = [
  { label: "< 2 years", sub: "Short-term" },
  { label: "2–5 years", sub: "Medium-term" },
  { label: "5+ years", sub: "Long-term" },
] as const;

/** Match a stored category string onto an option, however it is capitalised. */
function levelFromCategory(category: string | null): number | null {
  if (!category) return null;
  const v = category.trim().toLowerCase();
  const hit = RISK_OPTIONS.find((o) => o.label.toLowerCase() === v);
  if (hit) return hit.level;
  // The wizard and the dial use slightly different wording for the same steps.
  if (v.includes("moderately aggressive") || v.includes("moderate-aggressive")) return 3;
  if (v.includes("moderately conservative") || v.includes("moderate-conservative")) return 1;
  if (v.includes("aggressive")) return 4;
  if (v.includes("conservative")) return 0;
  if (v.includes("balanced") || v.includes("moderate")) return 2;
  return null;
}

/** The wizard stores "Long term"; this control uses year ranges. */
function normaliseHorizon(raw: string | null): string | null {
  if (!raw) return null;
  if (HORIZON_OPTIONS.some((h) => h.label === raw)) return raw;
  const map: Record<string, string> = {
    "Short term": "< 2 years",
    "Medium term": "2–5 years",
    "Long term": "5+ years",
  };
  return map[raw] ?? null;
}

function Choice({
  active,
  title,
  sub,
  onClick,
}: {
  active: boolean;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
        active
          ? "border-[hsl(var(--wealth-blue))] bg-[hsl(var(--wealth-blue))]/8"
          : "border-border bg-card hover:bg-muted/40"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold text-foreground">{title}</span>
        <span className="block text-[10.5px] text-muted-foreground">{sub}</span>
      </span>
      {active && (
        <Check className="h-4 w-4 shrink-0 text-[hsl(var(--wealth-blue))]" />
      )}
    </button>
  );
}

export function RiskProfileSheet({
  open: isOpen,
  onClose,
  riskCategory,
  horizonLabel,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  riskCategory: string | null;
  horizonLabel: string | null;
  /** Fired with the server's response so the page can re-read derived values. */
  onSaved?: (updated: RiskProfileResponse) => void;
}) {
  const savedLevel = levelFromCategory(riskCategory);
  const savedHorizon = normaliseHorizon(horizonLabel);

  const [level, setLevel] = useState<number | null>(savedLevel);
  const [horizon, setHorizon] = useState<string | null>(savedHorizon);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = level !== savedLevel || horizon !== savedHorizon;
  const chosen = RISK_OPTIONS.find((o) => o.level === level);

  // Reset on every open, so a previous abandoned edit can never become the
  // thing being confirmed.
  useEffect(() => {
    if (!isOpen) return;
    setLevel(savedLevel);
    setHorizon(savedHorizon);
    setError(null);
    setConfirming(false);
  }, [isOpen, savedLevel, savedHorizon]);

  const commit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await updateRiskProfile({
        risk_level: level,
        investment_horizon: horizon,
      });
      onSaved?.(res);
      onClose();
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-sm"
            onClick={saving ? undefined : onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-label="Risk profile and horizon"
            className="fixed bottom-0 left-0 right-0 z-[60] max-h-[88vh] overflow-auto rounded-t-2xl border-t border-border bg-card pb-safe shadow-2xl"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/20" />
            </div>
            <div className="flex items-center justify-between px-5 pb-2 pt-1">
              <p className="text-[15px] font-semibold text-foreground">
                {confirming ? "Confirm this change" : "Risk profile & horizon"}
              </p>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                aria-label="Close"
                className="-mr-1 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 pb-6">
      {!confirming ? (
        <>
          <p className="text-[12px] font-semibold text-foreground">Risk profile</p>
          <p className="mb-2 text-[10.5px] text-muted-foreground">
            How much of a fall you're willing to sit through for a higher long-run return.
          </p>
          <div className="space-y-1.5">
            {RISK_OPTIONS.map((o) => (
              <Choice
                key={o.level}
                active={level === o.level}
                title={o.label}
                sub={o.mix}
                onClick={() => setLevel(o.level)}
              />
            ))}
          </div>

          <p className="mt-4 text-[12px] font-semibold text-foreground">Horizon</p>
          <p className="mb-2 text-[10.5px] text-muted-foreground">
            When you expect to need most of this money.
          </p>
          <div className="space-y-1.5">
            {HORIZON_OPTIONS.map((h) => (
              <Choice
                key={h.label}
                active={horizon === h.label}
                title={h.label}
                sub={h.sub}
                onClick={() => setHorizon(h.label)}
              />
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border bg-card py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted/50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!dirty}
              onClick={() => setConfirming(true)}
              className="flex-1 rounded-xl bg-foreground py-2 text-[12px] font-semibold text-background transition-opacity disabled:opacity-40"
            >
              Review change
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(38_74%_48%)]/15 text-[hsl(38_74%_48%)]">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground">Confirm this change</p>
              <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                This changes your target mix, so your next rebalancing plan will propose different
                trades. Nothing is bought or sold now.
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-3">
            {level !== savedLevel && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-muted-foreground">Risk profile</span>
                <span className="text-right text-[12px] font-semibold text-foreground">
                  <span className="text-muted-foreground line-through">
                    {riskCategory ?? "Not set"}
                  </span>{" "}
                  → {chosen?.label}
                </span>
              </div>
            )}
            {horizon !== savedHorizon && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-muted-foreground">Horizon</span>
                <span className="text-right text-[12px] font-semibold text-foreground">
                  <span className="text-muted-foreground line-through">
                    {savedHorizon ?? "Not set"}
                  </span>{" "}
                  → {horizon}
                </span>
              </div>
            )}
            {chosen && (
              <p className="border-t border-border/50 pt-1.5 text-[10.5px] text-muted-foreground">
                Target mix becomes {chosen.mix}.
              </p>
            )}
          </div>

          {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-xl border border-border bg-card py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void commit()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-foreground py-2 text-[12px] font-semibold text-background transition-opacity disabled:opacity-60"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Saving…" : "Confirm change"}
            </button>
          </div>
        </>
      )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default RiskProfileSheet;
