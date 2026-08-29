import * as XLSX from "xlsx";

import type { FundNavPoint } from "@/components/fund/FundScreenUi";
import type { UnrealisedTax } from "@/lib/unrealisedTax";
import {
  CREDIT_TIERS,
  PERIODS,
  RETURN_RANGES,
  type CategoryProfile,
  type FundProfile,
  type ReturnRange,
  cumulativeSeries,
  ord,
  pctInRange,
  quarterLabels,
  toneLabel,
} from "@/lib/fundCategory";

/**
 * Workbook export for the fund analysis screen.
 *
 * Mirrors what's on screen, one sheet per section, so a reader can check the
 * working or take it into their own model. A "Source" column marks each figure
 * as measured from the NAV series, taken from scheme metadata, or generated —
 * the sheet says out loud what the screen currently does not.
 */

const round = (n: number | null | undefined, d = 2): number | string =>
  n == null || !Number.isFinite(n) ? "" : Math.round(n * 10 ** d) / 10 ** d;

type Row = (string | number)[];

/** Column widths from the header row, with a wider first column. */
function fit(ws: XLSX.WorkSheet, headers: string[], firstWidth = 34) {
  ws["!cols"] = headers.map((h, i) => ({ wch: i === 0 ? firstWidth : Math.max(13, h.length + 2) }));
}

export interface FundExportInput {
  schemeCode: string;
  schemeName: string;
  amc: string | null;
  isin: string | null;
  category: string;
  assetClass: string | null;
  planType: string | null;
  optionType: string | null;
  riskLabel: string | null;
  expenseRatio: number | null;
  exitLoad: string | null;
  navLatest: number | null;
  navDate: string | null;
  history: FundNavPoint[];
  fund: FundProfile;
  cat: CategoryProfile;
  ratioSpecs: { k: string; label: string; hi: boolean; suf?: string }[];
  /** Null when the user doesn't hold the fund — the sheet is then skipped. */
  unrealisedTax: UnrealisedTax | null;
}

export function exportFundAnalysisXls(input: FundExportInput, filename?: string): void {
  const {
    schemeCode,
    schemeName,
    amc,
    isin,
    category,
    assetClass,
    planType,
    optionType,
    riskLabel,
    expenseRatio,
    exitLoad,
    navLatest,
    navDate,
    history,
    fund,
    cat,
    ratioSpecs,
    unrealisedTax,
  } = input;

  const wb = XLSX.utils.book_new();
  const generatedOn = new Date().toISOString().slice(0, 10);

  /* ── Overview ── */
  const overviewHeaders = ["Field", "Value", "Category", "Source"];
  const overview: Row[] = [
    ["Fund analysis"],
    [schemeName],
    [`Generated on: ${generatedOn}`],
    [],
    overviewHeaders,
    ["Scheme code", schemeCode, "", "Scheme metadata"],
    ["ISIN", isin ?? "", "", "Scheme metadata"],
    ["AMC", amc ?? "", "", "Scheme metadata"],
    ["Category", category, "", "Scheme metadata"],
    ["Asset class", assetClass ?? "", "", "Scheme metadata"],
    ["Plan", planType ?? "", "", "Scheme metadata"],
    ["Payout option", optionType ?? "", "", "Scheme metadata"],
    ["SEBI risk label", riskLabel ?? "", "", "Scheme metadata"],
    ["Latest NAV", round(navLatest, 4), "", "NAV series"],
    ["NAV as on", navDate ?? "", "", "NAV series"],
    [
      "Expense ratio %",
      round(expenseRatio),
      round(cat.expense),
      expenseRatio == null ? "Not available" : "Scheme metadata / category GENERATED",
    ],
    ["Exit load", exitLoad ?? "", "", "Scheme metadata"],
    ["Fund size (AUM)", fund.aum, cat.aum, "GENERATED"],
    ["Age of fund", fund.age, "", "NAV series span"],
    ["Manager tenure", fund.managerTenure, "", "GENERATED"],
    ["Investment strategy", fund.strategy, "", "GENERATED"],
    ["Funds in category", cat.size, "", "GENERATED"],
  ];
  const wsOverview = XLSX.utils.aoa_to_sheet(overview);
  fit(wsOverview, overviewHeaders, 30);
  XLSX.utils.book_append_sheet(wb, wsOverview, "Overview");

  /* ── Returns ── */
  const retHeaders = [
    "Year",
    "Fund return %",
    "Category avg %",
    "Category worst %",
    "Category best %",
    "Percentile",
    "Verdict",
    "Source",
  ];
  const returns: Row[] = [
    ["Calendar-year returns"],
    [],
    retHeaders,
    ...fund.yearly.map((r) => {
      const b = fund.yearBand[r.year];
      const p = b ? pctInRange(r.pct, b.lo, b.hi, true, b.avg) : null;
      return [
        r.year,
        round(r.pct),
        b ? round(b.avg) : "",
        b ? round(b.lo) : "",
        b ? round(b.hi) : "",
        p ?? "",
        p != null ? toneLabel(p) : "",
        "Fund: NAV series · Category: GENERATED",
      ];
    }),
    [],
    ["Rolling 3-year annualised returns"],
    ["Year ending", "Fund %", "", "", "", "", "", "NAV series"],
    ...fund.rolling.map((r) => [r.year, round(r.pct), "", "", "", "", "", "NAV series"]),
  ];
  const wsReturns = XLSX.utils.aoa_to_sheet(returns);
  fit(wsReturns, retHeaders, 16);
  XLSX.utils.book_append_sheet(wb, wsReturns, "Returns");

  /* ── Trailing returns (cumulative, per window) ── */
  const trailHeaders = ["Window", "Fund %", "Index fund %", "Category avg %", "Source"];
  const windows: readonly ReturnRange[] = RETURN_RANGES;
  const trailing: Row[] = [
    ["Cumulative return by window"],
    [],
    trailHeaders,
    ...windows.flatMap((w): Row[] => {
      const s = cumulativeSeries(history, w, schemeCode);
      if (s.length < 2) return [];
      const last = s[s.length - 1];
      return [
        [
          w,
          round(last.fund),
          round(last.index),
          round(last.category),
          "Fund: NAV series · Index & category: GENERATED",
        ],
      ];
    }),
  ];
  const wsTrail = XLSX.utils.aoa_to_sheet(trailing);
  fit(wsTrail, trailHeaders, 16);
  XLSX.utils.book_append_sheet(wb, wsTrail, "Trailing returns");

  /* ── Performance ── */
  const perfHeaders = ["Metric", "Value", "Category", "Verdict", "Source"];
  const quarters = fund.quart.slice(-20);
  const qLabels = quarterLabels(quarters.length);
  const performance: Row[] = [
    ["Performance against category"],
    [],
    perfHeaders,
    ...PERIODS.map((p): Row => {
      const v = fund.pct[p];
      return [
        `Percentile · ${p}`,
        v == null ? "Fund too young" : ord(v),
        "50th",
        v == null ? "" : toneLabel(v),
        "GENERATED",
      ];
    }),
    [],
    ["Rank in category"],
    ...(["1Y", "3Y", "5Y"] as const).map((w): Row => {
      const r = fund.rank[w];
      const p = (r / cat.size) * 100;
      return [
        `Rank · ${w}`,
        `${r} of ${cat.size}`,
        `${Math.round(cat.size / 2)} of ${cat.size}`,
        toneLabel(p),
        "GENERATED",
      ];
    }),
    [],
    ["Quarterly track record"],
    ["Quarter", "Quartile", "Verdict", "", "GENERATED"],
    ...quarters.map((q, i): Row => [
      qLabels[i],
      q,
      toneLabel((q - 0.5) * 25),
      "",
      "GENERATED",
    ]),
  ];
  const wsPerf = XLSX.utils.aoa_to_sheet(performance);
  fit(wsPerf, perfHeaders, 22);
  XLSX.utils.book_append_sheet(wb, wsPerf, "Performance");

  /* ── Valuation & risk ── */
  const NAV_DERIVED = new Set(["mdd", "mean3", "sharpe", "sortino"]);
  const ratioHeaders = [
    "Metric",
    "Fund",
    "Category avg",
    "Category min",
    "Category max",
    "Better",
    "Percentile",
    "Verdict",
    "Source",
  ];
  const ratios: Row[] = [
    ["Valuation & risk"],
    [],
    ratioHeaders,
    ...ratioSpecs.map((r): Row => {
      const [avg, min, max] = cat.ratios[r.k];
      const v = fund.ratios[r.k];
      const p = pctInRange(v, min, max, r.hi, avg);
      return [
        r.label,
        round(v),
        round(avg),
        round(min),
        round(max),
        r.hi ? "higher" : "lower",
        p,
        toneLabel(p),
        NAV_DERIVED.has(r.k)
          ? "Fund: NAV series · Category: GENERATED"
          : "GENERATED",
      ];
    }),
  ];
  const wsRatios = XLSX.utils.aoa_to_sheet(ratios);
  fit(wsRatios, ratioHeaders, 26);
  XLSX.utils.book_append_sheet(wb, wsRatios, "Valuation & risk");

  /* ── Holdings ── */
  const holdHeaders = ["Bucket", "Item", "Fund %", "Category %", "Source"];
  const holdings: Row[] = [
    ["What the fund holds"],
    [],
    holdHeaders,
    ["Company size", "Large cap", round(fund.mcap.large), round(cat.mcap.large), "Scheme metadata / category GENERATED"],
    ["Company size", "Mid cap", round(fund.mcap.mid), round(cat.mcap.mid), "Scheme metadata / category GENERATED"],
    ["Company size", "Small cap", round(fund.mcap.small), round(cat.mcap.small), "Scheme metadata / category GENERATED"],
    [],
    ...Object.keys(cat.sectors).map((s): Row => [
      "Sector",
      s,
      round(fund.sectors[s]),
      round(cat.sectors[s]),
      "GENERATED",
    ]),
    [],
    ...CREDIT_TIERS.map((t): Row => [
      "Credit quality",
      t,
      round(fund.debt[t]),
      round(cat.debt[t]),
      "GENERATED",
    ]),
    [],
    ...Object.keys(fund.others).map((o): Row => [
      "Other",
      o,
      round(fund.others[o]),
      "",
      o === "Cash" ? "Scheme metadata" : "GENERATED",
    ]),
  ];
  const wsHold = XLSX.utils.aoa_to_sheet(holdings);
  fit(wsHold, holdHeaders, 18);
  XLSX.utils.book_append_sheet(wb, wsHold, "Holdings");

  /* ── Tax if sold today — REAL, from the user's own ledger. ── */
  if (unrealisedTax && !unrealisedTax.empty) {
    const taxHeaders = ["Line", "Long term", "Short term", "Source"];
    const L = unrealisedTax.long;
    const S = unrealisedTax.short;
    const pair = (
      label: string,
      get: (b: NonNullable<typeof L>) => number,
    ): Row => [label, L ? round(get(L)) : "", S ? round(get(S)) : "", "Transaction ledger"];

    const wsTax = XLSX.utils.aoa_to_sheet([
      ["Tax if you sold today"],
      [`Valued at NAV ${round(unrealisedTax.navUsed, 4)} as on ${unrealisedTax.navDate ?? ""}`],
      [],
      taxHeaders,
      pair("Units held", (b) => b.units),
      pair("Current value", (b) => b.currentValue),
      pair("Exit load", (b) => -b.exitLoad),
      pair("Amount realised", (b) => b.amountRealised),
      pair("Less: investment value", (b) => -b.investmentValue),
      pair("Gains", (b) => b.gains),
      pair("Less: annual exemption", (b) => -b.exemption),
      pair("Taxable gains", (b) => b.taxable),
      ["Tax rate %", L ? L.ratePct : "", S ? S.ratePct : "", "Statutory"],
      pair("Tax", (b) => b.tax),
      [],
      ["Total unrealised tax", round(unrealisedTax.totalTax), "", "Transaction ledger"],
      [],
      ["Lots are matched oldest-first (FIFO). The ₹1,25,000 long-term allowance is a"],
      ["yearly limit shared across all equity holdings, and is applied in full here."],
    ] as Row[]);
    fit(wsTax, taxHeaders, 26);
    XLSX.utils.book_append_sheet(wb, wsTax, "Tax if sold today");
  }

  /* ── NAV history — the raw series everything real is derived from. ── */
  const navHeaders = ["Date", "NAV"];
  const nav: Row[] = [navHeaders, ...history.map((p): Row => [p.date, round(p.nav, 4)])];
  const wsNav = XLSX.utils.aoa_to_sheet(nav);
  fit(wsNav, navHeaders, 14);
  XLSX.utils.book_append_sheet(wb, wsNav, "NAV history");

  /* ── Notes ── */
  const wsNotes = XLSX.utils.aoa_to_sheet([
    ["Notes"],
    [],
    ["Source column"],
    ["NAV series", "Measured from this fund's own NAV history."],
    ["Scheme metadata", "Taken from the scheme record."],
    ["GENERATED", "Placeholder. Not a real figure — see below."],
    [],
    ["What is generated, and why"],
    ["Prozpr does not yet carry peer aggregates, a holdings feed, or a per-fund"],
    ["benchmark series. Percentiles, ranks, quartiles, category ranges and averages,"],
    ["sector weights, credit quality, P/E, P/B, P/S, dividend yield, alpha,"],
    ["information ratio, tracking error, AUM and manager tenure are placeholders"],
    ["generated from the scheme code. They are stable per fund and internally"],
    ["consistent, which makes them look plausible. Do not rely on them."],
    [],
    ["Real figures in this workbook"],
    ["Calendar-year and rolling returns, cumulative returns by window, maximum"],
    ["drawdown, Sharpe, Sortino, mean return and volatility are all measured from"],
    ["the NAV history in the last sheet. Expense ratio, exit load, plan, option,"],
    ["SEBI risk label and the large/mid/small cap split come from scheme metadata."],
    [],
    ["Sharpe and Sortino assume a risk-free rate of 6.5% a year."],
    ["Past performance does not predict future returns."],
  ]);
  wsNotes["!cols"] = [{ wch: 22 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsNotes, "Notes");

  const safe = schemeName.replace(/[^a-z0-9]+/gi, "_").slice(0, 60) || schemeCode;
  XLSX.writeFile(wb, filename ?? `${safe}_analysis_${generatedOn}.xlsx`);
}
