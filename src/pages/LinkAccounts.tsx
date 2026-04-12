import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronRight, ChevronDown, Shield, ArrowLeft, ArrowRight, X, Search, Plus, Landmark, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BarChart3, TrendingUp, Package } from "lucide-react";
import AccountDiscoveryModal from "@/components/onboarding/AccountDiscoveryModal";
import {
  listLinkedAccounts,
  getMyPortfolio,
  BackendOfflineError,
  type LinkAccountInfo,
  type PortfolioDetail,
} from "@/lib/api";

function isActiveLinked(a: LinkAccountInfo): boolean {
  return a.status === "active";
}

/** MF row: linked folio, or portfolio already has MF holdings / MF bucket allocations from SimBanks sync. */
function hasMutualFundExposure(linked: LinkAccountInfo[], portfolio: PortfolioDetail | null): boolean {
  const linkedMf = linked.some((a) => isActiveLinked(a) && a.account_type === "mutual_fund");
  if (linkedMf) return true;
  if (!portfolio) return false;

  const holdings = portfolio.holdings ?? [];
  if (holdings.some((h) => h.instrument_type === "mutual_fund")) return true;

  // SimBanks maps MF schemes into Debt / Other (and Equity for equity MFs). Linked row is only created
  // for CAMS-style MF XML; bucket lines still reflect MF when sync ingested MF holdings.
  const allocations = portfolio.allocations ?? [];
  const hasMfBuckets = allocations.some(
    (row) =>
      (row.asset_class === "Debt" || row.asset_class === "Other") &&
      typeof row.amount === "number" &&
      row.amount > 0.01
  );
  if (hasMfBuckets) return true;

  return false;
}

const BROKERS = [
  { name: "Zerodha" },
  { name: "Groww" },
  { name: "Upstox" },
  { name: "Angel One" },
  { name: "ICICI Direct" },
  { name: "HDFC Securities" },
  { name: "Motilal Oswal" },
  { name: "5Paisa" },
];

const LinkAccounts = () => {
  const navigate = useNavigate();
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkAccountInfo[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioDetail | null>(null);
  const [linkedLoading, setLinkedLoading] = useState(true);
  const [linkedError, setLinkedError] = useState<string | null>(null);

  const refreshLinked = useCallback(async () => {
    setLinkedLoading(true);
    setLinkedError(null);
    try {
      const res = await listLinkedAccounts();
      setLinkedAccounts(res.accounts);
      try {
        setPortfolio(await getMyPortfolio());
      } catch {
        setPortfolio(null);
      }
    } catch (e: unknown) {
      const msg =
        e instanceof BackendOfflineError
          ? "Backend unreachable — showing local UI only."
          : e instanceof Error
            ? e.message
            : "Could not load linked accounts.";
      setLinkedError(msg);
      setLinkedAccounts([]);
      setPortfolio(null);
    } finally {
      setLinkedLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLinked();
  }, [refreshLinked]);

  const hasMF = useMemo(
    () => hasMutualFundExposure(linkedAccounts, portfolio),
    [linkedAccounts, portfolio]
  );
  const hasBank = useMemo(
    () => linkedAccounts.some((a) => a.account_type === "bank_account" && a.status === "active"),
    [linkedAccounts]
  );
  const hasDemat = useMemo(
    () => linkedAccounts.some((a) => a.account_type === "stock_demat" && a.status === "active"),
    [linkedAccounts]
  );

  const [showStocksModal, setShowStocksModal] = useState(false);
  const [stockSearch, setStockSearch] = useState("");
  const [selectedBrokers, setSelectedBrokers] = useState<Set<string>>(new Set());
  const [othersExpanded, setOthersExpanded] = useState(false);
  const [otherAssets, setOtherAssets] = useState([{ name: "", amount: "" }]);

  const filteredBrokers = BROKERS.filter(
    (b) => b.name.toLowerCase().includes(stockSearch.toLowerCase())
  );

  const toggleBroker = (name: string) => {
    setSelectedBrokers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const addAssetRow = () => setOtherAssets((prev) => [...prev, { name: "", amount: "" }]);

  const updateAsset = (idx: number, field: "name" | "amount", value: string) => {
    setOtherAssets((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a)));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 pt-8 pb-6">
      {/* Stepper — Step 1 active, Step 2 inactive */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-0 mb-6 w-full max-w-[340px]"
      >
        {/* Step 1 — active */}
        <div className="flex flex-col items-center">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground">
            <span className="text-xs font-semibold text-primary-foreground">1</span>
          </div>
          <span className="text-[10px] text-foreground font-medium mt-1.5">Link accounts</span>
          <span className="text-[10px] text-muted-foreground">~90 secs</span>
        </div>

        {/* Divider */}
        <div className="flex-1 h-[1.5px] bg-border mx-2 mt-[-22px]" />

        {/* Step 2 — inactive */}
        <div className="flex flex-col items-center">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary">
            <span className="text-xs font-semibold text-muted-foreground">2</span>
          </div>
          <span className="text-[10px] text-muted-foreground mt-1.5">About you</span>
          <span className="text-[10px] text-muted-foreground">~30 secs</span>
        </div>
      </motion.div>

      {/* Page title */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-[340px] mb-5"
      >
        <h1 className="text-xl font-semibold text-foreground">Link your accounts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Select accounts to get a complete picture
        </p>
      </motion.div>

      {linkedError && (
        <p className="w-full max-w-[340px] text-[11px] text-amber-700 dark:text-amber-400 mb-2">{linkedError}</p>
      )}

      {/* Account aggregator — SimBanks discover/sync */}
      <div className="w-full max-w-[340px] mb-3">
        <button
          type="button"
          onClick={() => setShowDiscovery(true)}
          className="w-full rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left text-[13px] font-medium text-foreground hover:bg-primary/10 transition-colors"
        >
          {linkedLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading linked accounts…
            </span>
          ) : (
            <>
              Connect via SimBanks / account aggregator
              <span className="block text-[11px] font-normal text-muted-foreground mt-0.5">
                Discovers accounts for your mobile and syncs portfolio to the backend
              </span>
            </>
          )}
        </button>
      </div>

      {/* Account cards — status from backend linked accounts */}
      <div className="w-full max-w-[340px] flex flex-col gap-1.5">
        {[
          {
            icon: BarChart3,
            title: "Mutual funds",
            subtitle: "CAMS, Karvy & all AMCs",
            connected: hasMF,
          },
          {
            icon: Landmark,
            title: "Bank account",
            subtitle: "All banks via account aggregator",
            connected: hasBank,
          },
        ].map((acc, i) => (
          <motion.div
            key={acc.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.05 }}
            className={`flex items-center gap-3 border rounded-[10px] px-3.5 py-3 ${
              acc.connected ? "" : "opacity-90"
            }`}
            style={
              acc.connected
                ? { backgroundColor: "hsl(120 30% 96%)", borderColor: "hsl(120 30% 75%)" }
                : { backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }
            }
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={
                acc.connected
                  ? { backgroundColor: "hsl(120 30% 93%)" }
                  : { backgroundColor: "hsl(var(--secondary))" }
              }
            >
              <acc.icon
                className="h-4 w-4"
                style={acc.connected ? { color: "hsl(120 40% 45%)" } : { color: "hsl(var(--muted-foreground))" }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground">{acc.title}</p>
              <p className="text-[11px] text-muted-foreground">{acc.subtitle}</p>
            </div>
            <div className="flex items-center gap-1.5">
              {acc.connected ? (
                <>
                  <span className="text-[11px] font-medium" style={{ color: "hsl(120 40% 45%)" }}>
                    Connected
                  </span>
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full"
                    style={{ backgroundColor: "hsl(120 40% 45%)" }}
                  >
                    <Check className="h-3 w-3 text-white" />
                  </div>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground">Not linked</span>
              )}
            </div>
          </motion.div>
        ))}

        {/* Stocks card — opens modal */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex items-center gap-3 border border-border rounded-[10px] bg-card px-3.5 py-3 cursor-pointer hover:bg-accent/10 transition-colors"
          onClick={() => setShowStocksModal(true)}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-foreground">Stocks</p>
            <p className="text-[11px] text-muted-foreground">NSE, BSE via CDSL / NSDL</p>
          </div>
          {hasDemat ? (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-medium text-wealth-green">Linked</span>
              <Check className="h-3.5 w-3.5 text-wealth-green" />
            </div>
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </motion.div>

        {/* Others card — expandable inline */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="border border-border rounded-[10px] bg-card overflow-hidden"
        >
          <div
            className="flex items-center gap-3 px-3.5 py-3 cursor-pointer hover:bg-accent/10 transition-colors"
            onClick={() => setOthersExpanded(!othersExpanded)}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground">Others</p>
              <p className="text-[11px] text-muted-foreground">NPS, PPF, Gold, Real estate...</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${othersExpanded ? "rotate-180" : ""}`} />
          </div>

          <AnimatePresence>
            {othersExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="px-3.5 pb-3 space-y-2">
                  {otherAssets.map((asset, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. NPS"
                        value={asset.name}
                        onChange={(e) => updateAsset(idx, "name", e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
                      />
                      <input
                        type="number"
                        placeholder="₹ Amount"
                        value={asset.amount}
                        onChange={(e) => updateAsset(idx, "amount", e.target.value)}
                        className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>
                  ))}
                  <button
                    onClick={addAssetRow}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Add another asset
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Trust badge */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex items-center justify-center gap-1.5 mt-8 mb-4"
      >
        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">
          Secured by RBI-regulated account aggregator
        </span>
      </motion.div>

      {/* Bottom actions — centered, stacked */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
        className="w-full max-w-[340px] flex flex-col items-center gap-3"
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <button
          onClick={() => {
            sessionStorage.setItem("completedLinkAccounts", "true");
            navigate("/about-you");
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl px-5 py-3.5 text-[15px] font-semibold text-primary-foreground"
          style={{ backgroundColor: "hsl(222 47% 14%)" }}
        >
          Tell us about you
          <ArrowRight className="h-4 w-4" />
        </button>
      </motion.div>

      {/* Stocks Modal */}
      <AnimatePresence>
        {showStocksModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowStocksModal(false)}
          >
            <motion.div
              className="relative bg-card shadow-xl flex flex-col"
              style={{ width: "88%", maxWidth: 340, borderRadius: 16, padding: 24, maxHeight: "80vh" }}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
            >
              <button
                onClick={() => setShowStocksModal(false)}
                className="absolute right-4 top-4 rounded-sm text-muted-foreground transition-opacity hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>

              <h2 className="font-medium text-foreground" style={{ fontSize: 17 }}>
                Link Stock Account
              </h2>

              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search providers..."
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="flex-1 overflow-y-auto mt-3 -mx-1 px-1 space-y-1.5" style={{ maxHeight: 280 }}>
                {filteredBrokers.map((broker) => {
                  const isSelected = selectedBrokers.has(broker.name);
                  return (
                    <button
                      key={broker.name}
                      onClick={() => toggleBroker(broker.name)}
                      className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? "border-primary/40 bg-primary/5"
                          : "border-border bg-background hover:bg-accent/40"
                      }`}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-foreground">{broker.name}</p>
                      </div>
                      {isSelected && (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="text-[10px] text-muted-foreground text-center mt-3">
                🔒 Secured by SEBI-regulated account aggregator
              </p>

              <button
                onClick={() => setShowStocksModal(false)}
                disabled={selectedBrokers.size === 0}
                className="w-full mt-3 rounded-xl py-3 text-sm font-semibold text-primary-foreground transition-all disabled:opacity-40 disabled:pointer-events-none"
                style={{ backgroundColor: "hsl(222 47% 14%)" }}
              >
                Link selected
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AccountDiscoveryModal
        open={showDiscovery}
        onClose={() => setShowDiscovery(false)}
        onSynced={() => void refreshLinked()}
        afterSyncNavigate={null}
      />
    </div>
  );
};

export default LinkAccounts;
