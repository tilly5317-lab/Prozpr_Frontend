import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { getFpStatus, type FpStatusResponse } from "@/lib/api";

/**
 * FP transaction-readiness signal shared by the SIP / Rebalancing / Lumpsum
 * pages: `ready` = KYC complete + FP investment account minted, so order CTAs
 * can show. While `loading`, show neither the banner nor the CTA.
 */
export function useFpStatus() {
  const [status, setStatus] = useState<FpStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getFpStatus());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, ready: status?.ready_to_transact ?? false, refresh };
}

/**
 * "Complete KYC to enable transactions" — the gold mark shown on the invest
 * pages until the one-time KYC check passes. Tapping it opens the KYC page,
 * which returns to the current page when done.
 */
export function KycBanner({ hidden }: { hidden?: boolean }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (hidden) return null;
  return (
    <div className="mb-3 rounded-2xl border border-[#D4A868]/35 bg-[#D4A868]/10 p-3.5">
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#D4A868]" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-foreground">
            Complete KYC to enable transactions
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            A one-time identity check unlocks placing SIP, lumpsum and
            rebalancing orders.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigate(`/kyc?returnTo=${encodeURIComponent(pathname)}`)}
        className="mt-2.5 w-full rounded-full bg-[#D4A868] py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        Complete KYC
      </button>
    </div>
  );
}
