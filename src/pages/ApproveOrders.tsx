import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Check, CheckCircle2, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";

// ── Mock approval + order-placement flow ─────────────────────────────────────
// UI mock: FP (fund-platform) order states are simulated with timers, not a real
// backend. Swap runOrder()/placeAll() for real API calls when FP is wired.

type OrderStatus = "pending" | "submitted" | "succeeded" | "failed";
type OrderKind = "redemption" | "purchase";

interface OrderInput {
  id: string;
  kind: OrderKind;
  name: string;
  /** Pre-formatted ₹ amount (e.g. "₹1,20,000"). */
  amount: string;
}
interface Order extends OrderInput {
  status: OrderStatus;
  fpOrderId: string | null;
  /** Mock only: fail the first attempt so the retry path is demonstrable. */
  willFailOnce: boolean;
}

// Match the plan page's trade tones (SELL = orange, BUY = green).
const REDEEM_TONE = "#E0772F";
const BUY_TONE = "#2E9C7E";

const MOCK_ORDERS: OrderInput[] = [
  { id: "m1", kind: "redemption", name: "HDFC Balanced Advantage Fund", amount: "₹1,20,000" },
  { id: "m2", kind: "redemption", name: "ICICI Pru Bluechip Fund", amount: "₹80,000" },
  { id: "m3", kind: "purchase", name: "Parag Parikh Flexi Cap Fund", amount: "₹1,10,000" },
  { id: "m4", kind: "purchase", name: "UTI Nifty 50 Index Fund", amount: "₹90,000" },
];

const fpId = () => "FP-" + Math.random().toString(36).slice(2, 9).toUpperCase();
const toneOf = (kind: OrderKind) => (kind === "redemption" ? REDEEM_TONE : BUY_TONE);
const labelOf = (kind: OrderKind) => (kind === "redemption" ? "REDEEM" : "BUY");

const STATUS_BADGE: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-muted text-muted-foreground" },
  submitted: { label: "Submitted", cls: "bg-accent/15 text-accent" },
  succeeded: { label: "Succeeded", cls: "bg-wealth-green/15 text-wealth-green" },
  failed: { label: "Failed", cls: "bg-destructive/15 text-destructive" },
};

function StatusIcon({ status }: { status: OrderStatus }) {
  if (status === "submitted") return <Loader2 className="h-4 w-4 animate-spin text-accent" />;
  if (status === "succeeded") return <CheckCircle2 className="h-4 w-4 text-wealth-green" />;
  if (status === "failed") return <X className="h-4 w-4 text-destructive" />;
  return <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />;
}

/** Small tone badge + fund name + signed amount — mirrors the plan's trade rows. */
function TradeBadge({ kind }: { kind: OrderKind }) {
  const tone = toneOf(kind);
  return (
    <span
      className="w-[54px] shrink-0 rounded-md py-1 text-center text-[11px] font-bold tracking-wide"
      style={{ backgroundColor: `${tone}1f`, color: tone }}
    >
      {labelOf(kind)}
    </span>
  );
}

function SectionHeader({ title, count, tone }: { title: string; count: number; tone: string }) {
  return (
    <div className="flex items-center gap-2 pb-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: tone }}>
        {title}
      </p>
      <span
        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
        style={{ backgroundColor: `${tone}1f`, color: tone }}
      >
        {count}
      </span>
      <div className="h-px flex-1" style={{ backgroundColor: `${tone}55` }} />
    </div>
  );
}

const ApproveOrders = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const incoming = (location.state as { orders?: OrderInput[] } | null)?.orders;

  const [phase, setPhase] = useState<"confirm" | "placing">("confirm");
  const [agreed, setAgreed] = useState(false);
  const timers = useRef<number[]>([]);

  const [orders, setOrders] = useState<Order[]>(() => {
    const src = incoming && incoming.length ? incoming : MOCK_ORDERS;
    const lastPurchaseId = [...src].reverse().find((o) => o.kind === "purchase")?.id;
    return src.map((o) => ({
      ...o,
      status: "pending",
      fpOrderId: null,
      willFailOnce: o.id === lastPurchaseId, // mock: exercise retry once
    }));
  });

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  // Drive one order: pending → submitted (FP id) → succeeded/failed.
  const runOrder = useCallback((id: string) => {
    const t1 = window.setTimeout(() => {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === id ? { ...o, status: "submitted", fpOrderId: o.fpOrderId ?? fpId() } : o,
        ),
      );
      const t2 = window.setTimeout(() => {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === id
              ? { ...o, status: o.willFailOnce ? "failed" : "succeeded", willFailOnce: false }
              : o,
          ),
        );
      }, 1100);
      timers.current.push(t2);
    }, 700);
    timers.current.push(t1);
  }, []);

  const placeAll = () => {
    setPhase("placing");
    orders.forEach((o, i) => {
      const t = window.setTimeout(() => runOrder(o.id), i * 550);
      timers.current.push(t);
    });
  };

  const retry = (id: string) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "pending" } : o)));
    runOrder(id);
  };

  const allTerminal = orders.every((o) => o.status === "succeeded" || o.status === "failed");
  const succeeded = useMemo(() => orders.filter((o) => o.status === "succeeded"), [orders]);
  const failed = useMemo(() => orders.filter((o) => o.status === "failed"), [orders]);
  const showResult = phase === "placing" && allTerminal;

  const redemptions = orders.filter((o) => o.kind === "redemption");
  const purchases = orders.filter((o) => o.kind === "purchase");
  const total = orders.length;

  return (
    <div className="mobile-container bg-background min-h-screen pb-10">
      <header className="sticky top-0 z-30 bg-background">
        <div className="flex items-center gap-2 px-5 pt-10 pb-3">
          {phase === "confirm" && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="-ml-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted/60"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <h1 className="text-lg font-semibold text-foreground">
            {showResult ? "Result" : phase === "confirm" ? "Confirm & place orders" : "Placing orders"}
          </h1>
        </div>
      </header>

      <div className="px-5 pb-8 space-y-4">
        {/* ── Result banner ── */}
        {showResult && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border bg-card p-5 text-center"
          >
            <div
              className={`mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full ${
                failed.length ? "bg-amber-500/15" : "bg-wealth-green/15"
              }`}
            >
              {failed.length ? (
                <RefreshCw className="h-5 w-5 text-amber-600" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-wealth-green" />
              )}
            </div>
            <p className="text-[15px] font-semibold text-foreground">
              {succeeded.length} of {total} orders placed
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              {failed.length === 0
                ? "All redemptions and purchases succeeded."
                : `${failed.length} order${failed.length > 1 ? "s" : ""} failed — retry below, or come back later.`}
            </p>
          </motion.div>
        )}

        {/* ── Confirmation ── */}
        {phase === "confirm" && (
          <>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Prozpr redeems first, then buys with the freed-up funds. Review the
              orders below and approve to place them.
            </p>

            {redemptions.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-4">
                <SectionHeader title="Redemptions" count={redemptions.length} tone={REDEEM_TONE} />
                <div className="space-y-1.5">
                  {redemptions.map((o) => (
                    <div key={o.id} className="flex items-center gap-3 py-1">
                      <TradeBadge kind={o.kind} />
                      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{o.name}</p>
                      <p className="shrink-0 text-[14px] font-semibold tabular-nums" style={{ color: REDEEM_TONE }}>
                        −{o.amount}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {purchases.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-4">
                <SectionHeader title="Purchases" count={purchases.length} tone={BUY_TONE} />
                <div className="space-y-1.5">
                  {purchases.map((o) => (
                    <div key={o.id} className="flex items-center gap-3 py-1">
                      <TradeBadge kind={o.kind} />
                      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{o.name}</p>
                      <p className="shrink-0 text-[14px] font-semibold tabular-nums" style={{ color: BUY_TONE }}>
                        +{o.amount}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Explicit, non-pre-checked confirmation */}
            <button
              type="button"
              onClick={() => setAgreed((a) => !a)}
              className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/30"
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  agreed ? "border-foreground bg-foreground" : "border-border bg-background"
                }`}
              >
                {agreed && <Check className="h-3.5 w-3.5 text-background" />}
              </span>
              <span className="text-[12px] leading-relaxed text-foreground">
                I approve these orders and authorise Prozpr to place the redemption(s)
                and purchase(s) on my behalf.
              </span>
            </button>

            <button
              type="button"
              onClick={placeAll}
              disabled={!agreed}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-[15px] font-semibold tracking-wide text-background transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              <ShieldCheck className="h-4 w-4" />
              Approve &amp; Place Orders
            </button>
          </>
        )}

        {/* ── Per-order progress / status list ── */}
        {phase === "placing" && (
          <div className="space-y-1.5">
            {orders.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <TradeBadge kind={o.kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">{o.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {o.amount}
                    {o.fpOrderId ? ` · ${o.fpOrderId}` : ""}
                  </p>
                </div>
                {o.status === "failed" && o.kind === "purchase" ? (
                  <button
                    type="button"
                    onClick={() => retry(o.id)}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/25"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry
                  </button>
                ) : (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StatusIcon status={o.status} />
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[o.status].cls}`}
                    >
                      {STATUS_BADGE[o.status].label}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {showResult && (
              <button
                type="button"
                onClick={() => navigate("/portfolio")}
                className="mt-3 flex w-full items-center justify-center rounded-xl bg-foreground py-3.5 text-[15px] font-semibold tracking-wide text-background transition-all active:scale-[0.98]"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ApproveOrders;
