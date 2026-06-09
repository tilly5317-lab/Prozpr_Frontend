// Mock proposed-rebalance trades shared by the explanation page and the
// per-trade detail page. When the backend exposes real rebalance trades with
// scheme codes, swap this for an API call (see RebalanceTradeDetail for the
// NAV-synthesis note).

export type TradeBucket = "equity" | "debt" | "gold" | "cash";

export type Trade = {
  id: string;
  type: "BUY" | "SELL";
  bucket: TradeBucket;
  amount: string;
  subtitle: string;
  fund: {
    name: string;
    category: string;
    amc: string;
    benchmark: string;
    risk: "Low" | "Moderate" | "High";
    stars: number;
    aum: string;
    nav: string;
    expenseRatio: string;
    returns1Y: string;
    returns3Y: string;
    rationale: string;
    series: { label: string; fund: number; benchmark: number }[];
  };
};

export const trades: Trade[] = [
  {
    id: "parag-parikh",
    type: "SELL",
    bucket: "equity",
    amount: "₹45,000",
    subtitle: "Trim equity overweight",
    fund: {
      name: "Parag Parikh Flexi Cap",
      category: "Flexi Cap Equity",
      amc: "PPFAS",
      benchmark: "Nifty 500 TRI",
      risk: "Moderate",
      stars: 5,
      aum: "₹69,400 Cr",
      nav: "₹84.21",
      expenseRatio: "0.64%",
      returns1Y: "+19.4%",
      returns3Y: "+18.2%",
      rationale:
        "High overlap with existing equity sleeve and currently above target weight. Partial trim helps normalize equity risk without full exit.",
      series: [
        { label: "Start", fund: 0, benchmark: 0 },
        { label: "1Y", fund: 19.4, benchmark: 15.1 },
        { label: "3Y", fund: 38.2, benchmark: 30.5 },
        { label: "5Y", fund: 82.7, benchmark: 63.1 },
      ],
    },
  },
  {
    id: "mirae-large-cap",
    type: "SELL",
    bucket: "equity",
    amount: "₹30,000",
    subtitle: "Trim equity overweight",
    fund: {
      name: "Mirae Large Cap",
      category: "Large Cap Equity",
      amc: "Mirae Asset",
      benchmark: "Nifty 100 TRI",
      risk: "Moderate",
      stars: 4,
      aum: "₹41,250 Cr",
      nav: "₹122.47",
      expenseRatio: "0.52%",
      returns1Y: "+16.8%",
      returns3Y: "+14.1%",
      rationale:
        "Large-cap bucket is overweight against target. This sell keeps core equity exposure while reducing concentration.",
      series: [
        { label: "Start", fund: 0, benchmark: 0 },
        { label: "1Y", fund: 16.8, benchmark: 13.3 },
        { label: "3Y", fund: 31.2, benchmark: 27.5 },
        { label: "5Y", fund: 58.6, benchmark: 49.2 },
      ],
    },
  },
  {
    id: "icici-corp-bond",
    type: "BUY",
    bucket: "debt",
    amount: "₹50,000",
    subtitle: "Restore debt allocation",
    fund: {
      name: "ICICI Prudential Corp Bond",
      category: "Corporate Bond",
      amc: "ICICI Prudential",
      benchmark: "CRISIL Corporate Bond A-II",
      risk: "Low",
      stars: 5,
      aum: "₹29,800 Cr",
      nav: "₹28.92",
      expenseRatio: "0.25%",
      returns1Y: "+7.8%",
      returns3Y: "+7.4%",
      rationale:
        "Debt is under target. This buy stabilizes drawdown risk and improves balance between growth and preservation buckets.",
      series: [
        { label: "Start", fund: 0, benchmark: 0 },
        { label: "1Y", fund: 7.8, benchmark: 7.2 },
        { label: "3Y", fund: 15.6, benchmark: 14.5 },
        { label: "5Y", fund: 32.4, benchmark: 29.8 },
      ],
    },
  },
  {
    id: "sgb-series-x",
    type: "BUY",
    bucket: "gold",
    amount: "₹25,000",
    subtitle: "Restore gold allocation",
    fund: {
      name: "SGB Series X (Nov '24)",
      category: "Sovereign Gold Bond",
      amc: "RBI",
      benchmark: "Domestic Gold Spot",
      risk: "Moderate",
      stars: 4,
      aum: "Govt issue",
      nav: "Issue linked",
      expenseRatio: "Nil",
      returns1Y: "+12.4%",
      returns3Y: "+11.1%",
      rationale:
        "Gold allocation is below target and helps improve macro hedge coverage during equity volatility windows.",
      series: [
        { label: "Start", fund: 0, benchmark: 0 },
        { label: "1Y", fund: 12.4, benchmark: 11.8 },
        { label: "3Y", fund: 24.7, benchmark: 22.9 },
        { label: "5Y", fund: 46.1, benchmark: 42.4 },
      ],
    },
  },
];

export function getTradeById(id: string): Trade | undefined {
  return trades.find((t) => t.id === id);
}
