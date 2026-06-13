import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Full rupee amount with Indian grouping and two decimal places (paisa). */
export function formatInrPaisa(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
