import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, Trophy, Users } from "lucide-react";
import type { PortfolioDetail } from "@/lib/api";
import { formatInrCompact } from "@/lib/utils";

const TOM = {
  name: "Tom",
  initial: "T",
  return1Y: 9.8,
  value: 22_00_000,
};

const BENCHMARK = {
  name: "Nifty 50",
  ticker: "NIFTY",
  return1Y: 6.5,
};

const POSITIVE = "hsl(var(--wealth-green))";
const NEGATIVE = "hsl(var(--destructive))";
const ACCENT = "hsl(var(--accent))";
const NEUTRAL = "hsl(var(--muted-foreground))";
const BENCHMARK_COLOR = "hsl(var(--wealth-amber))";
const HAIRLINE = "hsl(var(--hairline))";

const MONTHS = ["May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];

function synthCurve(endReturn: number, n: number, seed: number): number[] {
  const out: number[] = [];
  const amp = Math.max(Math.abs(endReturn) * 0.08, 0.6);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const base = endReturn * t;
    const wobble = Math.sin((i + seed) * 0.85) * amp + Math.cos((i + seed) * 1.4) * amp * 0.6;
    out.push(Math.round((base + wobble) * 100) / 100);
  }
  return out;
}

interface PeerComparisonCardProps {
  portfolio: PortfolioDetail;
  /** Initial of the active user (defaults to "Y"). */
  userInitial?: string;
}

const PeerComparisonCard = ({ portfolio, userInitial = "Y" }: PeerComparisonCardProps) => {
  const [expanded, setExpanded] = useState(false);

  const yourReturn = portfolio.total_gain_percentage ?? 0;
  const yourValue = portfolio.total_value;

  const youAhead = yourReturn > TOM.return1Y;
  const margin = Math.abs(yourReturn - TOM.return1Y);

  const data = useMemo(() => {
    const you = synthCurve(yourReturn, MONTHS.length, 3);
    const tom = synthCurve(TOM.return1Y, MONTHS.length, 11);
    const bench = synthCurve(BENCHMARK.return1Y, MONTHS.length, 17);
    return MONTHS.map((m, i) => ({ month: m, you: you[i], tom: tom[i], bench: bench[i] }));
  }, [yourReturn]);

  const benchPositive = BENCHMARK.return1Y >= 0;

  const monoFont = "ui-monospace, SFMono-Regular, Menlo, monospace";

  return (
    <div>
      {/* Hero line */}
      <div className="flex items-start gap-2 mb-2">
        <Users className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[13px] leading-snug text-foreground">
          {youAhead ? (
            <>
              You're{" "}
              <span className="font-bold" style={{ color: POSITIVE }}>
                +{margin.toFixed(1)}%
              </span>{" "}
              ahead of {TOM.name} this year. Nice 🚀
            </>
          ) : margin < 0.05 ? (
            <>
              You and {TOM.name} are <span className="font-bold">neck and neck</span> this year.
            </>
          ) : (
            <>
              {TOM.name} is{" "}
              <span className="font-bold" style={{ color: NEGATIVE }}>
                +{margin.toFixed(1)}%
              </span>{" "}
              ahead this year. Time to catch up 💪
            </>
          )}
        </p>
      </div>

      {/* Scoreboard */}
      <div className="grid grid-cols-2 gap-2">
        <ScoreCard
          name="You"
          initial={userInitial}
          returnPct={yourReturn}
          value={yourValue}
          isLeader={youAhead}
          accent={ACCENT}
          monoFont={monoFont}
        />
        <ScoreCard
          name={TOM.name}
          initial={TOM.initial}
          returnPct={TOM.return1Y}
          value={TOM.value}
          isLeader={!youAhead && margin >= 0.05}
          accent={NEUTRAL}
          monoFont={monoFont}
        />
      </div>

      {/* Benchmark strip — passive comparison line */}
      <div
        className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
        style={{ backgroundColor: "hsl(var(--muted) / 0.4)" }}
      >
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: BENCHMARK_COLOR }}
        />
        <p className="text-[11px] text-muted-foreground flex-1 truncate">
          Benchmark · {BENCHMARK.name} ({BENCHMARK.ticker})
        </p>
        <p
          className="text-[12px] font-semibold shrink-0"
          style={{
            color: benchPositive ? POSITIVE : NEGATIVE,
            fontFamily: monoFont,
          }}
        >
          {benchPositive ? "+" : ""}
          {BENCHMARK.return1Y.toFixed(1)}%
        </p>
      </div>

      {/* Expandable trend section */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="pt-3">
              <div className="h-[88px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                    <XAxis dataKey="month" hide />
                    <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                    <Tooltip
                      cursor={{ stroke: HAIRLINE, strokeDasharray: "2 3" }}
                      contentStyle={{
                        fontSize: 11,
                        borderRadius: 8,
                        border: `1px solid ${HAIRLINE}`,
                        backgroundColor: "hsl(var(--card))",
                        color: "hsl(var(--foreground))",
                      }}
                      formatter={(v: number, name: string) => [
                        `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,
                        name === "you" ? "You" : name === "tom" ? TOM.name : BENCHMARK.name,
                      ]}
                      labelFormatter={(m) => String(m)}
                    />
                    <Line
                      type="monotone"
                      dataKey="you"
                      stroke={ACCENT}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3, fill: ACCENT, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="tom"
                      stroke={NEUTRAL}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="bench"
                      stroke={BENCHMARK_COLOR}
                      strokeWidth={1.25}
                      strokeDasharray="2 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3.5" style={{ backgroundColor: ACCENT }} />
                  You
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block h-0.5 w-3.5"
                    style={{
                      background:
                        "repeating-linear-gradient(90deg, hsl(var(--muted-foreground)) 0 3px, transparent 3px 6px)",
                    }}
                  />
                  {TOM.name}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block h-0.5 w-3.5"
                    style={{
                      background: `repeating-linear-gradient(90deg, ${BENCHMARK_COLOR} 0 2px, transparent 2px 5px)`,
                    }}
                  />
                  {BENCHMARK.name}
                </span>
              </div>

              <button
                type="button"
                className="block w-full mt-3 pt-2 text-[11px] font-medium text-center text-muted-foreground hover:text-foreground transition-colors"
                style={{ borderTop: `1px solid ${HAIRLINE}` }}
              >
                + Add another peer
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expand / collapse toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="block w-full mt-2.5 pt-2 text-[12px] font-medium text-center text-foreground hover:text-accent transition-colors flex items-center justify-center gap-1"
        style={{ borderTop: `1px solid ${HAIRLINE}` }}
      >
        {expanded ? "Hide trend" : "Show trend"}
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="inline-flex"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.span>
      </button>
    </div>
  );
};

interface ScoreCardProps {
  name: string;
  initial: string;
  returnPct: number;
  value: number;
  isLeader: boolean;
  accent: string;
  monoFont: string;
}

const ScoreCard = ({ name, initial, returnPct, value, isLeader, accent, monoFont }: ScoreCardProps) => {
  const positive = returnPct >= 0;
  return (
    <div
      className="relative rounded-xl px-2.5 py-2"
      style={{
        backgroundColor: isLeader
          ? "hsl(var(--wealth-green) / 0.12)"
          : "hsl(var(--muted) / 0.55)",
        border: isLeader
          ? "1px solid hsl(var(--wealth-green) / 0.3)"
          : `1px solid ${HAIRLINE}`,
      }}
    >
      {isLeader && (
        <Trophy
          className="absolute top-1.5 right-1.5 h-3 w-3"
          style={{ color: POSITIVE }}
          aria-label="Leader"
        />
      )}
      <div className="flex items-center gap-1.5 mb-1">
        <div
          className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
          style={{ backgroundColor: accent }}
        >
          {initial}
        </div>
        <p className="text-[11px] font-semibold text-foreground truncate">{name}</p>
      </div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <p
          className="text-[15px] font-bold leading-tight"
          style={{
            color: positive ? POSITIVE : NEGATIVE,
            fontFamily: monoFont,
          }}
        >
          {positive ? "+" : ""}
          {returnPct.toFixed(1)}%
        </p>
        <p
          className="text-[10px] text-muted-foreground"
          style={{ fontFamily: monoFont }}
        >
          {formatInrCompact(value)}
        </p>
      </div>
    </div>
  );
};

export default PeerComparisonCard;
