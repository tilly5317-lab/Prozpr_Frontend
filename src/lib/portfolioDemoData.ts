/**
 * Static portfolio + profile snapshots for UI fallback when the API is unavailable.
 * Used by PortfolioDashboard; keeps the /portfolio screen usable with zero backend.
 */
import type {
  CumulativePortfolioResponse,
  FullProfileResponse,
  PortfolioDetail,
} from "./api";

const DEMO_TS = "2025-03-01T12:00:00.000Z";

export const demoSelfPortfolio: PortfolioDetail = {
  id: "port-primary-demo",
  name: "Primary",
  total_value: 24_50_000,
  total_invested: 21_00_000,
  total_gain_percentage: 16.67,
  is_primary: true,
  created_at: DEMO_TS,
  updated_at: DEMO_TS,
  allocations: [
    { id: "a1", asset_class: "Equity", allocation_percentage: 58, amount: 14_21_000, performance_percentage: 18.2 },
    { id: "a2", asset_class: "Debt", allocation_percentage: 32, amount: 7_84_000, performance_percentage: 7.1 },
    { id: "a3", asset_class: "Gold", allocation_percentage: 10, amount: 2_45_000, performance_percentage: 12.4 },
  ],
  holdings: [
    {
      id: "h1",
      instrument_name: "Parag Parikh Flexi Cap Fund",
      instrument_type: "Mutual Fund",
      ticker_symbol: null,
      quantity: null,
      average_cost: null,
      current_price: null,
      current_value: 6_20_000,
      allocation_percentage: 25.3,
    },
    {
      id: "h2",
      instrument_name: "HDFC Corporate Bond Fund",
      instrument_type: "Mutual Fund",
      ticker_symbol: null,
      quantity: null,
      average_cost: null,
      current_price: null,
      current_value: 4_10_000,
      allocation_percentage: 16.7,
    },
  ],
};

export const demoFullProfile: FullProfileResponse = {
  personal_info: {
    occupation: "Technology",
    family_status: "Married",
    wealth_sources: ["Salary", "Investments"],
    personal_values: ["Long-term growth"],
    address: "Mumbai, India",
    currency: "INR",
  },
  investment_profile: {
    id: "inv-demo",
    updated_at: DEMO_TS,
    objectives: ["Wealth Growth", "Retirement Planning"],
    detailed_goals: [],
    portfolio_value: 24_50_000,
    monthly_savings: 45_000,
    target_corpus: 2_00_00_000,
    target_timeline: "15–20 years",
    annual_income: 18_00_000,
    retirement_age: 58,
    investable_assets: 22_00_000,
    total_liabilities: 5_00_000,
    property_value: 85_00_000,
    mortgage_amount: 35_00_000,
    expected_inflows: null,
    regular_outgoings: 90_000,
    planned_major_expenses: null,
    emergency_fund: 6_00_000,
    emergency_fund_months: "6 months",
    liquidity_needs: "Moderate",
    income_needs: null,
    is_multi_phase_horizon: false,
    phase_description: null,
    total_horizon: "10–15 years",
  },
  risk_profile: {
    id: "risk-demo",
    updated_at: DEMO_TS,
    risk_level: 3,
    risk_capacity: "Moderate",
    investment_experience: "Intermediate",
    investment_horizon: "10–15 years",
    drop_reaction: "Hold and review",
    max_drawdown: 20,
    comfort_assets: ["Equity", "Debt"],
    risk_category: "Moderate",
  },
  investment_constraint: {
    id: "con-demo",
    updated_at: DEMO_TS,
    permitted_assets: ["Equity", "Debt", "Gold"],
    prohibited_instruments: ["Crypto"],
    is_leverage_allowed: false,
    is_derivatives_allowed: false,
    diversification_notes: "Prefer diversified mutual funds.",
    allocation_constraints: [
      { asset_class: "Equity", min_allocation: 40, max_allocation: 70 },
      { asset_class: "Debt", min_allocation: 20, max_allocation: 50 },
    ],
  },
  tax_profile: {
    id: "tax-demo",
    updated_at: DEMO_TS,
    income_tax_rate: 30,
    capital_gains_tax_rate: 10,
    notes: "Indian tax resident",
  },
  review_preference: {
    id: "rev-demo",
    updated_at: DEMO_TS,
    frequency: "Quarterly",
    triggers: ["Major market moves", "Rebalancing"],
    update_process: "Email summary",
  },
};

/** ~60-day shaped sparkline (same math as api mock history), scaled for NetWorthSparkline. */
export function buildDemoSparkline(): number[] {
  const n = 60;
  let v = demoSelfPortfolio.total_invested * 0.92;
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i--) {
    v *= 1 + (Math.sin(i / 7) * 0.002 + 0.0015);
    out.push(Math.round(v) / 100000);
  }
  out[out.length - 1] = demoSelfPortfolio.total_value / 100000;
  return out;
}

export function cloneDemoCumulativePortfolio(): CumulativePortfolioResponse {
  const self = {
    member_id: "self",
    nickname: "You",
    relationship_type: "Self",
    portfolio_value: demoSelfPortfolio.total_value,
    total_invested: demoSelfPortfolio.total_invested,
    gain_percentage: demoSelfPortfolio.total_gain_percentage,
  };
  const spouse = {
    member_id: "fam-demo",
    nickname: "Spouse",
    relationship_type: "Spouse",
    portfolio_value: 12_00_000,
    total_invested: 10_50_000,
    gain_percentage: 14.3,
  };
  const members = [self, spouse];
  const total_value = members.reduce((s, m) => s + m.portfolio_value, 0);
  const total_invested = members.reduce((s, m) => s + m.total_invested, 0);
  return {
    total_value,
    total_invested,
    total_gain_percentage:
      total_invested > 0 ? Math.round(((total_value - total_invested) / total_invested) * 1000) / 10 : null,
    member_count: members.length,
    members,
    combined_allocations: [
      { asset_class: "Equity", total_amount: Math.round(total_value * 0.56), allocation_percentage: 56 },
      { asset_class: "Debt", total_amount: Math.round(total_value * 0.34), allocation_percentage: 34 },
      { asset_class: "Gold", total_amount: Math.round(total_value * 0.1), allocation_percentage: 10 },
    ],
  };
}

export function cloneDemoMemberPortfolio(nickname = "Member"): PortfolioDetail {
  return {
    id: "port-member-demo",
    name: `${nickname}'s portfolio`,
    total_value: 12_00_000,
    total_invested: 10_50_000,
    total_gain_percentage: 14.3,
    is_primary: false,
    created_at: DEMO_TS,
    updated_at: DEMO_TS,
    allocations: [
      { id: "ma1", asset_class: "Equity", allocation_percentage: 55, amount: 6_60_000, performance_percentage: 15 },
      { id: "ma2", asset_class: "Debt", allocation_percentage: 45, amount: 5_40_000, performance_percentage: 6 },
    ],
    holdings: [],
  };
}

export function cloneDemoSelfPortfolio(): PortfolioDetail {
  return structuredClone(demoSelfPortfolio);
}

export function cloneDemoFullProfile(): FullProfileResponse {
  return structuredClone(demoFullProfile);
}
