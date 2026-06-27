import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Live Indian comma-grouping for a money input *as the user types*
 * (e.g. "1234567" → "12,34,567"). Leaves free-form shorthand like "1.2 Cr"
 * untouched so that style of entry still works, and preserves an in-progress
 * trailing decimal (e.g. "12,345." while typing). Use in an input's onChange:
 *   onChange={(e) => setValue(formatMoneyInput(e.target.value))}
 * Strip commas with `value.replace(/,/g, "")` before parsing to a number.
 */
export function formatMoneyInput(raw: string): string {
  const noCommas = raw.replace(/,/g, "");
  if (!/^\d+(\.\d*)?$/.test(noCommas)) return raw;
  const [int, dec] = noCommas.split(".");
  const grouped = int === "" ? "" : Number(int).toLocaleString("en-IN");
  return dec !== undefined ? `${grouped}.${dec}` : grouped;
}

/** Full rupee amount with Indian grouping and two decimal places (paisa). */
export function formatInrPaisa(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Full rupee amount with Indian grouping and no decimals. */
export function formatInr0(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** Compact INR format for tight spaces (e.g. ₹13.00L, ₹78.89k). */
export function formatInrCompact(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(2)}k`;
  return `₹${n.toFixed(2)}`;
}

/**
 * Compact INR using international (millions) grouping for chat surfaces
 * (e.g. ₹1.30M, ₹78.89k) — never lakh/crore.
 */
export function formatInrMillions(n: number): string {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v >= 1e9) return `${sign}₹${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}₹${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${sign}₹${(v / 1e3).toFixed(2)}k`;
  return `${sign}₹${v.toFixed(2)}`;
}
