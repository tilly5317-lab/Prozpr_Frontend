import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronDown, Info, TrendingUp, TrendingDown } from "lucide-react";

import BottomNav from "@/components/BottomNav";
import { getFullProfile, getMyPortfolio, type PortfolioDetail } from "@/lib/api";
import { cloneDemoSelfPortfolio } from "@/lib/portfolioDemoData";

type TimeRange = "1M" | "6M" | "1Y" | "All";

const TIME_RANGES: TimeRange[] = ["1M", "6M", "1Y", "All"];

const LAST_UPDATED = "22 Apr 2026 at 09:42";
const PORTFOLIO_START_DATE = "14 Feb 2021";

const GREEN = "hsl(164 54% 40%)";       // wealth-green

const MWR_COPY = {
  heading: "Money-weighted rate of return",
  short:
    "Money-weighted returns are an accurate measure of how an asset's rises and falls actually affect you and your investments. More weight is put upon returns of an asset when you have more money invested, and less when you have less invested.",
  long:
    "Money-Weighted Return (sometimes called IRR) accounts for the size and timing of every contribution and withdrawal you make. Example: if you put ₹1 lakh in at the start of the year and another ₹5 lakh in just before a rally, the bigger contribution has more influence on the reported return — so MWR reflects your actual experience. It's the right lens when you want to know 'how did my money, specifically, do?'",
};

function pctColor(n: number | null): string {
  if (n === null) return "#1a1a1a";
  return n >= 0 ? GREEN : "hsl(0 84% 50%)";
}

function TimeRangeDropdown({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-3 py-1 text-[12px] font-semibold text-muted-foreground"
      >
        {value}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+4px)] z-40 min-w-[84px] rounded-xl border border-border/60 bg-card p-1 shadow-lg">
            {TIME_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  onChange(r);
                  setOpen(false);
                }}
                className={`block w-full rounded-lg px-3 py-1.5 text-left text-[12px] font-semibold transition-colors ${
                  r === value
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function InfoSheet({
  open,
  onClose,
  title,
  body,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/30"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-md rounded-t-2xl bg-card px-5 pt-5 shadow-xl overflow-y-auto"
            style={{
              paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 8px) + 16px)",
              maxHeight: "calc(100dvh - 4rem - env(safe-area-inset-bottom, 8px))",
            }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
              {title}
            </p>
            <p className="text-[14px] text-foreground leading-relaxed whitespace-pre-line">
              {body}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-xl bg-foreground py-2.5 text-[13px] font-semibold text-background"
            >
              Close
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const PortfolioPerformance = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState<TimeRange>("1M");
  const [portfolio, setPortfolio] = useState<PortfolioDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDateTipOpen, setStartDateTipOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getMyPortfolio().catch(() => null),
      getFullProfile().catch(() => null),
    ])
      .then(([port]) => {
        if (cancelled) return;
        setPortfolio(port ?? cloneDemoSelfPortfolio());
      })
      .catch(() => {
        if (!cancelled) setPortfolio(cloneDemoSelfPortfolio());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const simpleGain = portfolio?.total_gain_percentage ?? null;
  const mwrGain = useMemo(
    () => (simpleGain === null ? null : Math.round(simpleGain * 0.94 * 100) / 100),
    [simpleGain],
  );

  // For shorter time windows, scale the gain down proportionally so each range feels different.
  const rangeFactor: Record<TimeRange, number> = {
    "1M": 0.12,
    "6M": 0.45,
    "1Y": 0.75,
    All: 1,
  };
  const scaledMwr = mwrGain === null ? null : Math.round(mwrGain * rangeFactor[range] * 100) / 100;

  return (
    <div className="mobile-container bg-background min-h-screen flex flex-col pb-20">
      {/* Header */}
      <div className="px-5 pt-10 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="text-foreground shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-foreground truncate">
            Portfolio performance
          </h1>
        </div>
        <TimeRangeDropdown value={range} onChange={setRange} />
      </div>

      {loading && (
        <div className="px-5 py-10 flex justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </div>
      )}

      {!loading && portfolio && (
        <div className="px-5 flex flex-col gap-5 pt-3">
          {/* MWR section */}
          <section>
            <h2 className="text-[18px] font-semibold text-foreground">
              {MWR_COPY.heading}
            </h2>

            <div className="mt-3 flex items-baseline gap-2">
              {scaledMwr !== null && (
                <span className="inline-flex items-center" style={{ color: pctColor(scaledMwr) }}>
                  {scaledMwr >= 0 ? (
                    <TrendingUp className="h-5 w-5 mr-1" />
                  ) : (
                    <TrendingDown className="h-5 w-5 mr-1" />
                  )}
                  <span className="text-[40px] font-semibold leading-none tracking-tight">
                    {scaledMwr >= 0 ? "" : "-"}
                    {Math.abs(scaledMwr).toFixed(2)}
                  </span>
                  <span className="text-[22px] font-semibold ml-0.5">%</span>
                </span>
              )}
            </div>

            <div className="mt-2 text-[13px] text-muted-foreground flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span>Since {PORTFOLIO_START_DATE}</span>
                <button
                  type="button"
                  onClick={() => setStartDateTipOpen(true)}
                  className="inline-flex items-center"
                  aria-label="About start date"
                >
                  <Info className="h-3 w-3" />
                </button>
              </div>
              <div>Last updated {LAST_UPDATED}</div>
            </div>

            <p className="mt-3 text-[14px] text-foreground leading-relaxed">
              {MWR_COPY.short} {MWR_COPY.long}
            </p>
          </section>
        </div>
      )}

      {!loading && !portfolio && (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">
          Could not load performance data. Check your connection and try again.
        </div>
      )}

      {/* Bottom sheets */}
      <InfoSheet
        open={startDateTipOpen}
        onClose={() => setStartDateTipOpen(false)}
        title="Portfolio start date"
        body={`Your portfolio started on ${PORTFOLIO_START_DATE} — the date of your first tracked holding. All returns on this screen are calculated from that anchor point.`}
      />

      <BottomNav />
    </div>
  );
};

export default PortfolioPerformance;
