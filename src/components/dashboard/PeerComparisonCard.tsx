import { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Trophy, Users } from "lucide-react";
import type { PortfolioDetail } from "@/lib/api";
import { formatInrCompact } from "@/lib/utils";

const TOM = {
  name: "Tom",
  initial: "T",
  return1Y: 9.8,
  value: 22_00_000,
  description: "Friend · 32 · Mumbai",
};

const POSITIVE = "hsl(var(--wealth-green))";
const NEGATIVE = "hsl(var(--destructive))";
const ACCENT = "hsl(var(--accent))";
const NEUTRAL = "hsl(var(--muted-foreground))";
const HAIRLINE = "hsl(var(--hairline))";

const MONTHS = ["May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];

// Deterministic 12-point cumulative-return curve from 0 → endReturn with gentle wobble.
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
  const yourReturn = portfolio.total_gain_percentage ?? 0;
  const yourValue = portfolio.total_value;

  const youAhead = yourReturn > TOM.return1Y;
  const margin = Math.abs(yourReturn - TOM.return1Y);

  const data = useMemo(() => {
    const you = synthCurve(yourReturn, MONTHS.length, 3);
    const tom = synthCurve(TOM.return1Y, MONTHS.length, 11);
    return MONTHS.map((m, i) => ({ month: m, you: you[i], tom: tom[i] }));
  }, [yourReturn]);

  const monoFont = "ui-monospace, SFMono-Regular, Menlo, monospace";

  return (
    <div>
      {/* Hero line */}
      <div className="flex items-start gap-2 mb-2.5">
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

      {/* 1Y line chart */}
      <div className="h-[100px] w-full">
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
                name === "you" ? "You" : TOM.name,
              ]}
              labelFormatter={(m) => String(m)}
            />
            <Line
              type="monotone"
              dataKey="you"
              stroke={ACCENT}
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 3, fill: ACCENT, stroke: "hsl(var(--card))", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="tom"
              stroke={NEUTRAL}
              strokeWidth={1.75}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Tiny legend tied to chart */}
      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
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
      </div>

      {/* Scoreboard */}
      <div className="grid grid-cols-2 gap-2 mt-3">
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

      {/* Action */}
      <button
        type="button"
        className="block w-full mt-3 pt-2 text-[12px] font-medium text-center text-foreground hover:text-accent transition-colors"
        style={{ borderTop: `1px solid ${HAIRLINE}` }}
      >
        + Add another peer
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
      className="relative rounded-xl px-3 py-2.5"
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
          className="absolute top-2 right-2 h-3 w-3"
          style={{ color: POSITIVE }}
          aria-label="Leader"
        />
      )}
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: accent }}
        >
          {initial}
        </div>
        <p className="text-[11px] font-semibold text-foreground truncate">{name}</p>
      </div>
      <p
        className="text-[16px] font-bold leading-tight"
        style={{
          color: positive ? POSITIVE : NEGATIVE,
          fontFamily: monoFont,
        }}
      >
        {positive ? "+" : ""}
        {returnPct.toFixed(1)}%
      </p>
      <p
        className="text-[10px] text-muted-foreground mt-0.5"
        style={{ fontFamily: monoFont }}
      >
        {formatInrCompact(value)}
      </p>
    </div>
  );
};

export default PeerComparisonCard;
