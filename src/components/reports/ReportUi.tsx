/**
 * Shared chrome for the two statements on `/reports` — filter bar, stat tiles
 * and the scrolling table shell. Both statements render wide tables inside a
 * ~max-w-md mobile shell, so the table ALWAYS lives in its own `overflow-x-auto`
 * box; the page body itself must never scroll sideways.
 */
import type { ReactNode } from "react";
import { Download, FileDown } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const GOLD = "#D4A868";

/** A labelled dropdown in the filter bar. */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-[11.5px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-[11.5px]">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** One headline number above a statement's table. */
export function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const color =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-[13.5px] font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

/** Signed-number colouring used in every gain/loss cell. */
export function toneFor(n: number | null | undefined): "neutral" | "positive" | "negative" {
  if (n == null || n === 0) return "neutral";
  return n > 0 ? "positive" : "negative";
}

export function GainCell({ text, value }: { text: string; value: number | null }) {
  const tone = toneFor(value);
  return (
    <span
      className={
        tone === "positive"
          ? "text-emerald-600 dark:text-emerald-400"
          : tone === "negative"
            ? "text-rose-600 dark:text-rose-400"
            : "text-foreground"
      }
    >
      {text}
    </span>
  );
}

/** Horizontally scrolling table shell — keeps wide statements off the page body. */
export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[11.5px]">{children}</table>
      </div>
    </div>
  );
}

export function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`whitespace-nowrap border-b border-border bg-secondary/60 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children = null,
  align = "left",
  className = "",
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`border-b border-border/60 px-2.5 py-2 ${
        align === "right" ? "text-right tabular-nums" : "text-left"
      } ${className}`}
    >
      {children}
    </td>
  );
}

/**
 * What the header's download control needs from whichever statement is on
 * screen. Each statement publishes one (its Excel export closes over the rows
 * the user is actually looking at) and the page renders it beside the title.
 */
export interface ExportHandle {
  onExcel: () => void;
  pdfHref: string;
  disabled: boolean;
}

/** "XLS · PDF" pair that sits on the right of the page title. */
export function HeaderDownload({ handle }: { handle: ExportHandle | null }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => handle?.onExcel()}
        disabled={!handle || handle.disabled}
        className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-opacity active:scale-[0.98] disabled:opacity-40"
        style={{ backgroundColor: GOLD, color: "#1a1206" }}
      >
        <Download className="h-3 w-3" />
        XLS
      </button>
      <a
        href={handle?.pdfHref ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!handle}
        className={`flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary active:scale-[0.98] ${
          handle ? "" : "pointer-events-none opacity-40"
        }`}
      >
        <FileDown className="h-3 w-3" />
        PDF
      </a>
    </div>
  );
}

/** Empty / loading / error placeholder inside a statement. */
export function StatementNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[12px] text-muted-foreground">
      {children}
    </div>
  );
}

/** Small print under a statement — how the numbers were derived. */
export function ReportFootnote({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 text-[10.5px] leading-relaxed text-muted-foreground/70">{children}</p>
  );
}

/** "2 Aug 2026" — the as-of / generated-on stamp on every export. */
export function todayLabel(): string {
  return new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
