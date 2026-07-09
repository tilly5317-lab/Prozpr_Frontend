import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { BarChart3, Check, ArrowLeft, ArrowRight, Shield, Loader2, FileUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  listLinkedAccounts,
  getMyPortfolio,
  BackendOfflineError,
  type LinkAccountInfo,
  type PortfolioDetail,
} from "@/lib/api";
import { useOnboardingStep } from "@/hooks/useOnboardingStep";

function isActiveLinked(a: LinkAccountInfo): boolean {
  return a.status === "active";
}

/** MF row: linked folio, or portfolio already has MF holdings / MF bucket allocations from a CAMS import. */
function hasMutualFundExposure(linked: LinkAccountInfo[], portfolio: PortfolioDetail | null): boolean {
  const linkedMf = linked.some((a) => isActiveLinked(a) && a.account_type === "mutual_fund");
  if (linkedMf) return true;
  if (!portfolio) return false;

  const holdings = portfolio.holdings ?? [];
  if (holdings.some((h) => h.instrument_type === "mutual_fund")) return true;

  const allocations = portfolio.allocations ?? [];
  const hasMfBuckets = allocations.some(
    (row) =>
      (row.asset_class === "Debt" || row.asset_class === "Others") &&
      typeof row.amount === "number" &&
      row.amount > 0.01
  );
  return hasMfBuckets;
}

/**
 * Simplified accounts step. The CAMS statement is now uploaded on its own page
 * (`/cams-upload`) one step earlier, and CAMS is the only source we use for now —
 * so this page just confirms what was imported and lets the user continue (or go
 * back to upload if they skipped).
 */
const LinkAccounts = () => {
  const navigate = useNavigate();
  const { completeStep } = useOnboardingStep("link_accounts");
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
            : "Could not load your accounts.";
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

  // CAMS is compulsory during onboarding: the user can't continue until their
  // statement is imported. We also honour the just-uploaded session flag so a
  // brief portfolio-refresh lag right after upload doesn't block them.
  const camsImportedThisSession =
    typeof window !== "undefined" &&
    sessionStorage.getItem("camsStatementImported") === "true";
  const camsConnected = hasMF || camsImportedThisSession;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 pt-8 pb-6">
      {/* Stepper — Accounts active, About you inactive */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-0 mb-6 w-full max-w-[340px]"
      >
        <div className="flex flex-col items-center">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground">
            <span className="text-xs font-semibold text-primary-foreground">1</span>
          </div>
          <span className="text-[11px] text-foreground font-medium mt-1.5">Accounts</span>
        </div>
        <div className="flex-1 h-[1.5px] bg-border mx-2 mt-[-16px]" />
        <div className="flex flex-col items-center">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary">
            <span className="text-xs font-semibold text-muted-foreground">2</span>
          </div>
          <span className="text-[11px] text-muted-foreground mt-1.5">About you</span>
        </div>
      </motion.div>

      {/* Page title */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-[340px] mb-5"
      >
        <h1 className="text-lg font-semibold text-foreground">Your accounts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {hasMF
            ? "Your mutual fund holdings are connected."
            : "We use your CAMS statement to build your portfolio."}
        </p>
      </motion.div>

      {linkedError && (
        <p className="w-full max-w-[340px] text-[11px] text-amber-700 dark:text-amber-400 mb-2">{linkedError}</p>
      )}

      {/* Mutual funds — status from the CAMS import */}
      <div className="w-full max-w-[340px]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className={`flex items-center gap-3 rounded-[10px] border px-3.5 py-3 ${
            hasMF ? "border-wealth-green/40 bg-wealth-green-light" : "border-border bg-card"
          }`}
        >
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              hasMF ? "bg-wealth-green/15" : "bg-secondary"
            }`}
          >
            <BarChart3 className={`h-4 w-4 ${hasMF ? "text-wealth-green" : "text-muted-foreground"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-foreground">Mutual funds</p>
            <p className="text-[11px] text-muted-foreground">CAMS / KFintech statement</p>
          </div>
          <div className="flex items-center gap-1.5">
            {linkedLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : hasMF ? (
              <>
                <span className="text-[11px] font-medium text-wealth-green">Connected</span>
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-wealth-green">
                  <Check className="h-3 w-3 text-white" />
                </div>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">Not added</span>
            )}
          </div>
        </motion.div>

        {/* Re-upload / add CAMS if it wasn't imported yet */}
        {!linkedLoading && !camsConnected && (
          <button
            type="button"
            onClick={() => navigate("/cams-upload")}
            className="mt-2 flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10"
          >
            <FileUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <span className="block text-[13px] font-medium text-foreground">
                Upload your CAMS statement (PDF)
              </span>
              <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                Folios, holdings &amp; transactions
              </span>
            </span>
          </button>
        )}
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
          Your statement is processed securely
        </span>
      </motion.div>

      {/* Bottom actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
        className="w-full max-w-[340px] flex flex-col items-center gap-3"
      >
        <button
          onClick={() => navigate("/cams-upload")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        {!linkedLoading && !camsConnected && (
          <p className="text-[11px] text-muted-foreground text-center">
            Upload your CAMS statement to continue.
          </p>
        )}
        <button
          onClick={() => {
            if (!camsConnected) {
              navigate("/cams-upload");
              return;
            }
            completeStep({ has_mf: hasMF });
            sessionStorage.setItem("completedLinkAccounts", "true");
            navigate("/about-you");
          }}
          disabled={linkedLoading || !camsConnected}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-foreground px-5 py-3.5 text-[15px] font-semibold text-background disabled:opacity-40 disabled:pointer-events-none"
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </motion.div>
    </div>
  );
};

export default LinkAccounts;
