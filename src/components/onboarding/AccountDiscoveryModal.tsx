import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { X, Loader2, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  discoverSimBankAccounts,
  syncSimBankAccounts,
  BackendOfflineError,
  type SimBankDiscoveredAccount,
} from "@/lib/api";
import { formatInrCompact } from "@/lib/utils";

interface AccountDiscoveryModalProps {
  open: boolean;
  onClose: () => void;
  /** After successful SimBanks sync */
  onSynced?: () => void;
  /** Navigate after sync (default /link-accounts). Pass null to stay on the current route. */
  afterSyncNavigate?: string | null;
}

function kindLabel(kind: SimBankDiscoveredAccount["kind"]): string {
  if (kind === "mutual_fund") return "Mutual funds";
  if (kind === "equity") return "Stocks / demat";
  return "Bank / deposit";
}

const AccountDiscoveryModal = ({
  open,
  onClose,
  onSynced,
  afterSyncNavigate = "/link-accounts",
}: AccountDiscoveryModalProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [accounts, setAccounts] = useState<SimBankDiscoveredAccount[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDiscover = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await discoverSimBankAccounts();
      setAccounts(res.accounts);
      const initial: Record<string, boolean> = {};
      for (const a of res.accounts) {
        initial[a.account_ref_no] = true;
      }
      setSelected(initial);
    } catch (e: unknown) {
      const msg =
        e instanceof BackendOfflineError
          ? "Cannot reach the server. Check that the backend is running."
          : e instanceof Error
            ? e.message
            : "Could not load accounts.";
      setLoadError(msg);
      setAccounts([]);
      setSelected({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadDiscover();
  }, [open, loadDiscover]);

  const toggleAccount = (refNo: string) => {
    setSelected((prev) => ({ ...prev, [refNo]: !prev[refNo] }));
  };

  const handleConsent = async () => {
    const accepted = accounts.filter((a) => selected[a.account_ref_no]).map((a) => a.account_ref_no);
    if (accepted.length === 0) {
      toast({
        title: "Select at least one account",
        description: "Choose the accounts you want to connect, or skip for now.",
        variant: "destructive",
      });
      return;
    }
    setSyncing(true);
    try {
      await syncSimBankAccounts(accepted);
      try {
        sessionStorage.setItem("simbanksSynced", "true");
      } catch {
        /* ignore */
      }
      toast({
        title: "Accounts connected",
        description: "Your portfolio has been updated from the account aggregator.",
      });
      onSynced?.();
      onClose();
      if (afterSyncNavigate != null) {
        navigate(afterSyncNavigate);
      }
    } catch (e: unknown) {
      const msg =
        e instanceof BackendOfflineError
          ? "Backend unreachable. Try again when the server is online."
          : e instanceof Error
            ? e.message
            : "Sync failed.";
      toast({ title: "Could not sync accounts", description: msg, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handleSkip = () => {
    onClose();
    if (afterSyncNavigate != null) {
      navigate(afterSyncNavigate);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !syncing && onClose()}
        >
          <motion.div
            className="relative bg-card shadow-xl"
            style={{
              width: "88%",
              maxWidth: 340,
              borderRadius: 16,
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
          >
            <button
              type="button"
              onClick={() => !syncing && onClose()}
              className="absolute right-4 top-4 rounded-sm text-muted-foreground transition-opacity hover:text-foreground"
              disabled={syncing}
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="font-medium text-foreground" style={{ fontSize: 17 }}>
              We found your accounts
            </h2>
            <p className="text-muted-foreground" style={{ fontSize: 12, marginTop: 4 }}>
              Via SimBanks (account aggregator simulator) — same flow as Finvu-style consent
            </p>

            {loading && (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground text-center">Discovering accounts for your mobile…</p>
              </div>
            )}

            {!loading && loadError && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-destructive">{loadError}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => void loadDiscover()}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    Retry
                  </Button>
                  <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={handleSkip}>
                    Skip
                  </Button>
                </div>
              </div>
            )}

            {!loading && !loadError && accounts.length === 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground text-center">
                  No accounts returned for your profile. You can continue onboarding and link later.
                </p>
                <Button type="button" className="w-full" size="lg" onClick={handleSkip}>
                  Continue
                </Button>
              </div>
            )}

            {!loading && !loadError && accounts.length > 0 && (
              <>
                <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
                  {accounts.map((account) => (
                    <label
                      key={account.account_ref_no}
                      className="flex cursor-pointer items-center justify-between rounded-lg border bg-background transition-colors hover:bg-accent/40"
                      style={{ padding: "12px 14px" }}
                      htmlFor={`discovery-${account.account_ref_no}`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="font-medium text-foreground" style={{ fontSize: 13 }}>
                          {account.provider_name}
                        </span>
                        <span className="text-muted-foreground" style={{ fontSize: 11 }}>
                          {kindLabel(account.kind)} · {account.account_type}
                          {account.masked_identifier ? ` · ${account.masked_identifier}` : ""}
                        </span>
                        <span className="text-[10px] text-muted-foreground/80 mt-0.5">
                          {formatInrCompact(account.current_value)}
                          {account.holdings_count != null && account.holdings_count > 0
                            ? ` · ${account.holdings_count} holdings`
                            : ""}
                        </span>
                      </div>
                      <Checkbox
                        id={`discovery-${account.account_ref_no}`}
                        checked={selected[account.account_ref_no] ?? false}
                        onCheckedChange={() => toggleAccount(account.account_ref_no)}
                      />
                    </label>
                  ))}
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => void handleConsent()}
                  disabled={syncing}
                  style={{ marginTop: 16 }}
                >
                  {syncing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Connecting…
                    </>
                  ) : (
                    "Give consent & connect"
                  )}
                </Button>

                <button
                  type="button"
                  className="w-full text-center text-[11px] text-muted-foreground mt-2 hover:text-foreground"
                  onClick={handleSkip}
                  disabled={syncing}
                >
                  Skip for now
                </button>
              </>
            )}

            <p className="text-center text-muted-foreground" style={{ fontSize: 11, marginTop: 12 }}>
              🔒 Powered by RBI-regulated account aggregator framework
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AccountDiscoveryModal;
