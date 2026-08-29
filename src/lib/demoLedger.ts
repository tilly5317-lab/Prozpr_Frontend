/**
 * A plausible transaction ledger for a fund the user does not actually hold.
 *
 * ⚠️ THIS FABRICATES A PERSONAL HOLDING. ⚠️
 *
 * Every other generated figure on this page is a claim about the market. This
 * one is a claim about the reader — "you own ₹4.9L of this fund, bought from
 * April 2021" — which is a different kind of wrong if it reaches a real user.
 * It exists so the "Your investment" section can be designed and reviewed on
 * any fund, including ones nobody holds.
 *
 * It is used ONLY when the real ledger comes back empty. The moment holdings
 * data is live, delete this module and let the section hide itself again.
 */

import type { FundNavPoint } from "@/components/fund/FundScreenUi";
import type { MfHoldingTransactionItem } from "@/lib/api";

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Stable value in [lo, hi] for this seed and key. */
function pick(seed: string, key: string, lo: number, hi: number): number {
  return lo + ((hash(`${seed}::${key}`) % 1000) / 999) * (hi - lo);
}

/**
 * A monthly SIP with the odd lumpsum, priced off the fund's real NAV series so
 * the resulting gain and XIRR match how the fund actually performed.
 */
export function demoLedger(
  seed: string,
  history: FundNavPoint[],
): MfHoldingTransactionItem[] {
  const pts = history
    .filter((p) => Number.isFinite(p.nav) && p.nav > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return [];

  // NAV on or just before a date, so each purchase prices off the real series.
  const navOn = (iso: string): FundNavPoint => {
    let best = pts[0];
    for (const p of pts) {
      if (p.date <= iso) best = p;
      else break;
    }
    return best;
  };

  const last = new Date(pts[pts.length - 1].date);
  const first = new Date(pts[0].date);
  const start = new Date(last);
  start.setMonth(start.getMonth() - Math.round(pick(seed, "years", 3.2, 5.4) * 12));
  if (start < first) start.setTime(first.getTime());

  const monthly = Math.round(pick(seed, "sip", 3, 12)) * 1000;
  const out: MfHoldingTransactionItem[] = [];
  const cursor = new Date(start);
  let i = 0;

  while (cursor <= last) {
    const iso = cursor.toISOString().slice(0, 10);
    const p = navOn(iso);
    // A lumpsum roughly every couple of years alongside the monthly SIP, so the
    // ledger has the lumpy shape a real one does.
    const isLump = i > 0 && i % 23 === 0;
    const amount = isLump ? monthly * Math.round(pick(seed, `lump${i}`, 8, 20)) : monthly;
    out.push({
      id: `demo-${iso}`,
      transaction_date: iso,
      transaction_type: "BUY",
      folio_number: "DEMO",
      units: amount / p.nav,
      nav: p.nav,
      amount,
      stamp_duty: null,
      source_system: "demo",
      is_inflow: true,
      signed_amount: -amount,
    });
    cursor.setMonth(cursor.getMonth() + 1);
    i++;
  }
  return out;
}
