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

/**
 * `jonathan@gmail.com` → `j••••••n@gmail.com`.
 *
 * Shared rather than per-page: an identifier that is masked on one screen and
 * printed in full on the next is not masked at all, which is exactly what
 * happened when this lived inside the account page.
 *
 * There is deliberately no reveal control anywhere in the app. A masked value
 * with an eye icon beside it protects nothing — it adds a tap. Someone who
 * needs their own address in full already knows it.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const masked =
    local.length <= 2
      ? `${local[0] ?? "•"}•`
      : `${local[0]}${"•".repeat(local.length - 2)}${local[local.length - 1]}`;
  return `${masked}@${domain}`;
}

/** `9876543210` → `••••••3210`. Keeps the last four, the way a bank statement does. */
export function maskMobile(mobile: string): string {
  return mobile.length <= 4
    ? mobile
    : `${"•".repeat(mobile.length - 4)}${mobile.slice(-4)}`;
}
