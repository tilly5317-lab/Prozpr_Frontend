import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { TONE_COLOR, TONE_LABEL, toneColor, toneLabel } from "@/lib/fundCategory";
import { InfoTip } from "@/components/fund/InfoTip";

/** Colour for the fund's own marks — the app's blue, used across compare too. */
export const FUND_COLOR = "hsl(217 91% 58%)";
/** Colour for the category reference — muted amber. */
export const CAT_COLOR = "hsl(38 42% 58%)";

/**
 * Tinted chip carrying a quartile verdict. Colour-at-low-alpha with the colour
 * as ink, rather than a solid fill with white text — it survives dark mode and
 * matches the chips used elsewhere in the app.
 */
export function ToneChip({ pct }: { pct: number }) {
  const c = toneColor(pct);
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-semibold"
      style={{ backgroundColor: `${c}26`, color: c }}
    >
      {toneLabel(pct)}
    </span>
  );
}

/** The four-step scale, spelled out once per section that uses colour. */
export function ToneLegend() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 border-t border-border/60 pt-2.5">
      {TONE_LABEL.map((l, i) => (
        <span key={l} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: TONE_COLOR[i] }}
          />
          {l}
        </span>
      ))}
    </div>
  );
}

/** Pill row — same treatment as the NAV chart's range control. */
export function Seg({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={active}
            className={`rounded-full px-3 py-1 text-[11.5px] font-semibold tabular-nums transition-colors ${
              active
                ? "bg-foreground text-background"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export interface StripRow {
  label: string;
  value: number;
  display: string;
  color: string;
  /** The category reference row — drawn hollow so it reads as a benchmark. */
  dim?: boolean;
  /** Verdict colour for the number on the right. */
  tone?: string;
}

/**
 * The collapsed-section summary: one track, the fund's mark and the category's,
 * with the figure on the right. Lets a reader skim every section's headline
 * without opening anything.
 */
export function Strip({ rows, min, max }: { rows: StripRow[]; min: number; max: number }) {
  const span = max - min || 1;
  return (
    <div className="grid gap-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[64px_1fr_60px] items-center gap-2">
          <span
            className={`truncate text-[11px] ${
              r.dim ? "text-muted-foreground" : "font-semibold text-foreground"
            }`}
          >
            {r.label}
          </span>
          <div className="relative h-3.5">
            <div className="absolute inset-x-0 top-1.5 h-[3px] rounded-full bg-muted" />
            <span
              className="absolute top-0 block h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-card"
              style={{
                left: `${Math.max(2, Math.min(98, ((r.value - min) / span) * 100))}%`,
                backgroundColor: r.color,
              }}
            />
          </div>
          <span
            className="text-right text-[11.5px] font-bold tabular-nums"
            style={{ color: r.tone ?? (r.dim ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))") }}
          >
            {r.display}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * A numbered, collapsible analysis section. Collapsed it shows a caption plus
 * the summary strip; open it shows the full detail. Everything starts closed —
 * the page is long, and a reader should choose what to dig into.
 */
export function SectionShell({
  n,
  title,
  term,
  sub,
  cap,
  summary,
  open,
  onToggle,
  children,
}: {
  n?: number;
  title: string;
  /** Glossary key, when the section title is itself a term worth explaining. */
  term?: string;
  sub?: string;
  cap?: string;
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="block w-full px-4 pb-3 pt-3.5 text-left"
      >
        <div className="flex items-start gap-2.5">
          {n != null && (
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--wealth-blue))]/12 text-[10.5px] font-bold text-[hsl(var(--wealth-blue))]">
              {n}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[13.5px] font-semibold leading-tight text-foreground">
              {title}
              {term && <InfoTip term={term} />}
            </p>
            {sub && (
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{sub}</p>
            )}
          </div>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
        {!open && summary && (
          <div className="mt-3">
            {cap && (
              <p className="mb-2 text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">
                {cap}
              </p>
            )}
            {summary}
          </div>
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

/** Shared row for the "vs category" readouts under each chart. */
export function CompareReadout({
  label,
  value,
  pct,
  catLabel,
  catValue,
}: {
  label: string;
  value: string;
  pct?: number;
  catLabel: string;
  catValue: string;
}) {
  return (
    <div className="mt-2.5 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2 py-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: FUND_COLOR }}
          />
          <span className="truncate text-[11.5px] text-foreground">{label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-[12.5px] font-bold tabular-nums text-foreground">{value}</span>
          {pct != null && <ToneChip pct={pct} />}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/50 pt-1.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: CAT_COLOR }}
          />
          <span className="truncate text-[11.5px] text-muted-foreground">{catLabel}</span>
        </span>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">
          {catValue}
        </span>
      </div>
    </div>
  );
}

