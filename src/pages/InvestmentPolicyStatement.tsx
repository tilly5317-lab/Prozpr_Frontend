import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/context/AuthContext";
import {
  getFullProfile,
  RISK_CATEGORIES,
  type FullProfileResponse,
} from "@/lib/api";

const fmt = (n: number | null | undefined): string => {
  if (n == null || n === 0) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
};

const pct = (n: number | null | undefined): string =>
  n != null ? `${n}%` : "—";

const arr = (a: string[] | null | undefined): string =>
  a?.length ? a.join(", ") : "—";

const str = (s: string | null | undefined): string => s || "—";

const bool = (b: boolean | null | undefined): string =>
  b == null ? "—" : b ? "Yes" : "No";

type IpsField = { label: string; value: string };
type IpsSection = { title: string; fields: IpsField[] };

function buildSections(p: FullProfileResponse | null, userName: string): IpsSection[] {
  const pi = p?.personal_info;
  const ip = p?.investment_profile;
  const rp = p?.risk_profile;
  const ic = p?.investment_constraint;
  const tp = p?.tax_profile;
  const rv = p?.review_preference;

  return [
    {
      title: "Who are you?",
      fields: [
        { label: "Name", value: str(userName) },
        { label: "Occupation", value: str(pi?.occupation) },
        { label: "Family situation", value: str(pi?.family_status) },
        { label: "Wealth source", value: arr(pi?.wealth_sources) },
        { label: "Values / exclusions", value: arr(pi?.personal_values) },
        { label: "Currency", value: str(pi?.currency) },
        { label: "Address", value: str(pi?.address) },
      ],
    },
    {
      title: "What are you trying to achieve?",
      fields: [
        { label: "Primary objectives", value: arr(ip?.objectives) },
        {
          label: "Detailed goals",
          value: ip?.detailed_goals?.length
            ? ip.detailed_goals
                .map((g) => {
                  const desc = (g as Record<string, string>).description ?? "";
                  const yr = (g as Record<string, string>).year ?? "";
                  return yr ? `${desc} (${yr})` : desc;
                })
                .filter(Boolean)
                .join("; ") || "—"
            : "—",
        },
        { label: "Current portfolio value", value: fmt(ip?.portfolio_value) },
        { label: "Monthly savings", value: fmt(ip?.monthly_savings) },
        { label: "Target corpus", value: fmt(ip?.target_corpus) },
        { label: "Target timeline", value: str(ip?.target_timeline) },
        { label: "Annual income", value: fmt(ip?.annual_income) },
        { label: "Retirement age", value: ip?.retirement_age ? String(ip.retirement_age) : "—" },
        { label: "Income needed from portfolio", value: fmt(ip?.income_needs) },
      ],
    },
    {
      title: "How much risk can you handle?",
      fields: [
        {
          label: "Risk tolerance",
          value: rp?.risk_level != null ? RISK_CATEGORIES[rp.risk_level] ?? "—" : "—",
        },
        { label: "Risk category (computed)", value: str(rp?.risk_category) },
        { label: "Risk capacity", value: str(rp?.risk_capacity) },
        { label: "Investment experience", value: str(rp?.investment_experience) },
        { label: "Investment horizon", value: str(rp?.investment_horizon) },
        { label: "Reaction to 20% drop", value: str(rp?.drop_reaction) },
        { label: "Max acceptable drawdown", value: rp?.max_drawdown != null ? `${rp.max_drawdown}%` : "—" },
        { label: "Comfortable asset classes", value: arr(rp?.comfort_assets) },
      ],
    },
    {
      title: "Your financial picture",
      fields: [
        { label: "Investable assets", value: fmt(ip?.investable_assets) },
        { label: "Total liabilities / debts", value: fmt(ip?.total_liabilities) },
        { label: "Property owned", value: fmt(ip?.property_value) },
        { label: "Outstanding mortgage", value: fmt(ip?.mortgage_amount) },
        { label: "Expected inflows", value: fmt(ip?.expected_inflows) },
        { label: "Regular outgoings", value: fmt(ip?.regular_outgoings) },
        { label: "Planned large expenses", value: fmt(ip?.planned_major_expenses) },
        { label: "Emergency fund", value: fmt(ip?.emergency_fund) },
        { label: "Emergency fund coverage", value: str(ip?.emergency_fund_months) },
        { label: "Liquidity needs", value: str(ip?.liquidity_needs) },
      ],
    },
    {
      title: "Rules & limits",
      fields: [
        { label: "Permitted asset types", value: arr(ic?.permitted_assets) },
        { label: "Prohibited investments", value: arr(ic?.prohibited_instruments) },
        { label: "Leverage allowed", value: bool(ic?.is_leverage_allowed) },
        { label: "Derivatives allowed", value: bool(ic?.is_derivatives_allowed) },
        { label: "Diversification notes", value: str(ic?.diversification_notes) },
        ...(ic?.allocation_constraints?.length
          ? ic.allocation_constraints.map((ac) => ({
              label: `${ac.asset_class} allocation`,
              value: `${ac.min_allocation ?? 0}% – ${ac.max_allocation ?? 100}%`,
            }))
          : []),
      ],
    },
    {
      title: "Time horizon",
      fields: [
        { label: "Multi-phase horizon", value: bool(ip?.is_multi_phase_horizon) },
        { label: "Phase description", value: str(ip?.phase_description) },
        { label: "Total horizon", value: str(ip?.total_horizon) },
      ],
    },
    {
      title: "Tax situation",
      fields: [
        { label: "Income tax rate", value: pct(tp?.income_tax_rate) },
        { label: "Capital gains tax rate", value: pct(tp?.capital_gains_tax_rate) },
        { label: "Additional notes", value: str(tp?.notes) },
      ],
    },
    {
      title: "Staying involved",
      fields: [
        { label: "Review frequency", value: str(rv?.frequency) },
        { label: "Review triggers", value: arr(rv?.triggers) },
        { label: "Update process preference", value: str(rv?.update_process) },
      ],
    },
  ];
}

const InvestmentPolicyStatement = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<FullProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await getFullProfile();
      setProfile(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const userName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "";
  const sections = buildSections(profile, userName);

  const filledCount = sections.reduce(
    (sum, s) => sum + s.fields.filter((f) => f.value !== "—").length,
    0,
  );
  const totalCount = sections.reduce((sum, s) => sum + s.fields.length, 0);
  const completeness = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;

  return (
    <div className="mobile-container bg-background pb-20 min-h-screen">
      {/* Header */}
      <div className="px-5 pt-10 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/profile")} className="text-foreground">
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
          <h1 className="text-base font-semibold text-foreground">Investment Policy Statement</h1>
        </div>
        <button
          onClick={fetchProfile}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Completeness bar */}
      <div className="px-5 pt-2 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground">{filledCount} of {totalCount} fields populated</span>
          <span className="text-[10px] font-medium text-muted-foreground">{completeness}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-accent"
            initial={{ width: 0 }}
            animate={{ width: `${completeness}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>
        {completeness < 100 && (
          <button
            onClick={() => navigate("/profile/complete")}
            className="mt-2 text-[10px] font-medium text-accent hover:underline"
          >
            Complete your profile to fill remaining fields →
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Loading your IPS…</p>
          </div>
        </div>
      ) : error ? (
        <div className="px-5 py-10 text-center">
          <p className="text-xs text-destructive mb-2">{error}</p>
          <button onClick={fetchProfile} className="text-xs text-accent hover:underline">
            Try again
          </button>
        </div>
      ) : (
        <div className="px-5 space-y-3">
          {sections.map((section, sIdx) => (
            <motion.div
              key={sIdx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: sIdx * 0.04 }}
              className="wealth-card !p-4 space-y-3"
            >
              <h2 className="text-xs font-semibold text-foreground">{section.title}</h2>
              {section.fields.map((field, fIdx) => {
                const isEmpty = field.value === "—";
                return (
                  <div key={fIdx}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                      {field.label}
                    </p>
                    <p className={`text-sm leading-relaxed ${isEmpty ? "text-muted-foreground/40 italic" : "text-foreground"}`}>
                      {field.value}
                    </p>
                  </div>
                );
              })}
            </motion.div>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default InvestmentPolicyStatement;
