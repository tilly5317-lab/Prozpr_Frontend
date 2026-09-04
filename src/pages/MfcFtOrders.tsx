import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  BackendOfflineError,
  confirmMfcFtOtp,
  confirmMfcFtPayment,
  getMfcConfig,
  getMfcFtMasters,
  getMfcFtOrderStatus,
  listMfcFtOrders,
  placeMfcFtOrder,
  requestMfcFtOtp,
  validateMfcSipChange,
  type MfcConfig,
  type MfcFtKind,
  type MfcFtMasters,
  type MfcFtOrder,
  type MfcFtOrderInput,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { formatInr0 } from "@/lib/utils";

/**
 * Place orders with MF Central — the outbound half of the integration.
 *
 * /mfc-cas reads the portfolio out of the registrars; this writes back to them:
 * purchases, redemptions, switches, SIP/STP/SWP registrations and SIP
 * pause/cancel.
 *
 * The four-call chain (place → OTP → consent → poll) is shown as four explicit
 * steps rather than hidden behind one button, because the investor types a code
 * in the middle of it and because each step has a different failure meaning: a
 * rejected placement is final, a wrong OTP is retryable, and a poll that says
 * "under process" is neither.
 *
 * This is an operator/testing surface, not the customer-facing invest flow. It
 * exposes MFC's own vocabulary — AMC codes, ISINs, folios, registrar status
 * strings — because the person using it is checking what MFC did, and
 * translating that into friendlier words would hide exactly what they came to
 * see.
 */

const KIND_HELP: Record<string, string> = {
  purchase: "Buy into a scheme, or start a SIP by setting a frequency.",
  additional: "Add to a folio you already hold, lumpsum or additional SIP.",
  redeem: "Sell units — by amount, by unit count, or the whole holding.",
  switch: "Move money from one scheme to another inside the same fund house.",
  stp: "Transfer a fixed amount, on a cadence, from one scheme to another.",
  swp: "Withdraw a fixed amount, on a cadence, out to your bank.",
  sip_pause: "Pause a running SIP for a number of instalments.",
  sip_cancel: "Stop a running SIP permanently.",
};

/** Which fields a family actually uses. MFC ignores the rest, but showing them
 * all would imply they matter. */
const SHOWS = {
  toIsin: new Set(["switch", "stp"]),
  units: new Set(["redeem", "switch"]),
  cadence: new Set(["purchase", "additional", "stp", "swp"]),
  bank: new Set(["purchase", "additional", "redeem"]),
  sipRef: new Set(["sip_pause", "sip_cancel"]),
  amount: new Set(["purchase", "additional", "redeem", "switch", "stp", "swp"]),
};

const STATUS_TONE: Record<string, string> = {
  success: "text-wealth-green",
  rejected: "text-destructive",
  failed: "text-destructive",
  processing: "text-amber-600",
};

const MfcFtOrders = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<MfcConfig | null>(null);
  const [masters, setMasters] = useState<MfcFtMasters | null>(null);
  const [orders, setOrders] = useState<MfcFtOrder[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<MfcFtOrderInput>({
    kind: "purchase",
    amc: "H",
    isin: "INF179K01608",
    folio: "17064219",
    scheme_name: "HDFC Flexi Cap Fund - Regular Plan - Growth",
    amount: 25000,
    pan_no: "AATPJ9485B",
    mobile: "9876543210",
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [active, setActive] = useState<MfcFtOrder | null>(null);
  const [nextStep, setNextStep] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [log, setLog] = useState<{ at: string; text: string; bad?: boolean }[]>([]);

  const say = useCallback((text: string, bad = false) => {
    setLog((l) =>
      [{ at: new Date().toLocaleTimeString("en-IN"), text, bad }, ...l].slice(0, 40),
    );
  }, []);

  const refreshOrders = useCallback(async () => {
    try {
      setOrders((await listMfcFtOrders(25)).orders);
    } catch {
      /* the order book is context, not the point of the screen */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMfcConfig(), getMfcFtMasters()])
      .then(([c, m]) => {
        if (cancelled) return;
        setConfig(c);
        setMasters(m);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof BackendOfflineError
            ? "Backend is unreachable."
            : err instanceof Error
              ? err.message
              : "Could not load MF Central.",
        );
      });
    void refreshOrders();
    return () => {
      cancelled = true;
    };
  }, [refreshOrders]);

  const set = <K extends keyof MfcFtOrderInput>(k: K, v: MfcFtOrderInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const fail = useCallback(
    (err: unknown, what: string) => {
      const msg =
        err instanceof BackendOfflineError
          ? "Backend is unreachable."
          : err instanceof Error
            ? err.message
            : `${what} failed.`;
      say(`${what}: ${msg}`, true);
      toast({ title: what, description: msg, variant: "destructive" });
    },
    [say],
  );

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      if (busy) return;
      setBusy(label);
      try {
        await fn();
      } catch (err) {
        fail(err, label);
      } finally {
        setBusy(null);
        void refreshOrders();
      }
    },
    [busy, fail, refreshOrders],
  );

  const doPlace = () =>
    run("Place order", async () => {
      const res = await placeMfcFtOrder(form);
      setActive(res.order);
      setNextStep(res.next_step);
      setOtp("");
      say(
        `Placed ${res.order.kind} — MFC reference ${res.order.req_id}. ${res.message}`,
      );
    });

  const doValidate = () =>
    run("Validate SIP change", async () => {
      const res = await validateMfcSipChange(form);
      say(`Pre-flight: ${res.ok ? "eligible" : "not eligible"} — ${res.message}`, !res.ok);
    });

  const doOtp = () =>
    run("Request OTP", async () => {
      if (!active) return;
      const res = await requestMfcFtOtp(active.id);
      setActive(res.order);
      setNextStep(res.next_step);
      say(res.message);
    });

  const doConsent = () =>
    run("Confirm OTP", async () => {
      if (!active) return;
      const res = await confirmMfcFtOtp(active.id, otp.trim());
      setActive(res.order);
      setNextStep(res.next_step);
      setOtp("");
      say(res.message);
    });

  const doPayment = () =>
    run("Confirm payment", async () => {
      if (!active) return;
      const res = await confirmMfcFtPayment(active.id, {
        umrn: "YESB7010408220000010",
      });
      setActive(res.order);
      setNextStep(res.next_step);
      say(res.message);
    });

  const doStatus = () =>
    run("Poll status", async () => {
      if (!active) return;
      const res = await getMfcFtOrderStatus(active.id);
      setActive(res.order);
      say(
        `Registrar says "${res.order.rta_status ?? "—"}" → ${res.order.status}` +
          (res.order.user_trxn_no ? ` (txn ${res.order.user_trxn_no})` : ""),
      );
    });

  const kind = form.kind;
  const isPauseOrCancel = SHOWS.sipRef.has(kind);
  const otpHint = useMemo(() => {
    // The UAT rule MFC publishes: 00 + the last four digits of the PAN. Shown
    // only against the mock, where no message is actually delivered anywhere.
    const pan = (form.pan_no ?? "").trim().toUpperCase();
    return pan.length === 10 ? `00${pan.slice(5, 9)}` : null;
  }, [form.pan_no]);

  if (loadError) {
    return (
      <Shell onBack={() => navigate("/portfolio")}>
        <Notice tone="error" title="MF Central" body={loadError} />
      </Shell>
    );
  }
  if (!config || !masters) {
    return (
      <Shell onBack={() => navigate("/portfolio")}>
        <div className="flex items-center gap-2 py-8 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading MF Central…
        </div>
      </Shell>
    );
  }
  if (!config.enabled) {
    return (
      <Shell onBack={() => navigate("/portfolio")}>
        <Notice
          tone="warn"
          title="MF Central isn't configured on this server"
          body="Set the MFC_* credentials to place orders."
        />
      </Shell>
    );
  }

  return (
    <Shell onBack={() => navigate("/portfolio")}>
      {config.environment === "mock" && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Local mock.</span> No
            orders reach a real registrar and no money moves. The chain is real;
            the fund house is not.
            {otpHint && (
              <>
                {" "}
                The mock&apos;s OTP follows MF Central&apos;s UAT rule —{" "}
                <span className="font-mono text-foreground">{otpHint}</span>.
              </>
            )}
          </p>
        </div>
      )}

      {/* ── the order ── */}
      <Section title="1 · What to place">
        <Field label="Transaction">
          <select
            value={kind}
            onChange={(e) => set("kind", e.target.value as MfcFtKind)}
            className={inputClass}
          >
            {masters.transaction_kinds.map((k) => (
              <option key={k.code} value={k.code}>
                {k.label}
              </option>
            ))}
          </select>
          <Hint>{KIND_HELP[kind]}</Hint>
        </Field>

        <Field label="Fund house">
          <select
            value={form.amc ?? ""}
            onChange={(e) => set("amc", e.target.value || null)}
            className={inputClass}
          >
            <option value="">Infer from the scheme name</option>
            {masters.amcs.map((a) => (
              <option key={a.code} value={a.code}>
                {a.short_name} ({a.code})
              </option>
            ))}
          </select>
          <Hint>
            MF Central wants a code, not a name. Left blank, the backend infers
            it from the scheme — and refuses rather than guessing.
          </Hint>
        </Field>

        <Field label={SHOWS.toIsin.has(kind) ? "From ISIN" : "ISIN"}>
          <input
            value={form.isin ?? ""}
            onChange={(e) => set("isin", e.target.value.toUpperCase())}
            placeholder="INF179K01608"
            className={`${inputClass} font-mono`}
          />
        </Field>

        {SHOWS.toIsin.has(kind) && (
          <Field label="To ISIN">
            <input
              value={form.to_isin ?? ""}
              onChange={(e) => set("to_isin", e.target.value.toUpperCase())}
              placeholder="INF179K01442"
              className={`${inputClass} font-mono`}
            />
          </Field>
        )}

        <Field label="Folio">
          <input
            value={form.folio ?? ""}
            onChange={(e) => set("folio", e.target.value)}
            placeholder="17064219"
            className={inputClass}
          />
        </Field>

        {SHOWS.amount.has(kind) && (
          <Field label="Amount (whole rupees)">
            <input
              type="number"
              value={form.amount ?? ""}
              onChange={(e) =>
                set("amount", e.target.value ? Number(e.target.value) : null)
              }
              className={inputClass}
            />
            <Hint>MF Central rejects decimals on purchase amounts.</Hint>
          </Field>
        )}

        {SHOWS.units.has(kind) && (
          <>
            <Field label="Units (instead of an amount)">
              <input
                type="number"
                value={form.units ?? ""}
                onChange={(e) =>
                  set("units", e.target.value ? Number(e.target.value) : null)
                }
                className={inputClass}
              />
            </Field>
            <label className="flex items-center gap-2 text-[12px] text-foreground">
              <input
                type="checkbox"
                checked={!!form.all_units}
                onChange={(e) => set("all_units", e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border"
              />
              Everything in this folio
            </label>
          </>
        )}

        {SHOWS.cadence.has(kind) && (
          <>
            <Field label="Frequency">
              <select
                value={form.frequency ?? ""}
                onChange={(e) => set("frequency", e.target.value || null)}
                className={inputClass}
              >
                <option value="">One-off (no cadence)</option>
                {masters.frequencies.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.label} ({f.code})
                  </option>
                ))}
              </select>
              {kind === "purchase" && (
                <Hint>
                  Setting a frequency is what turns this into a SIP — MF Central
                  has no separate endpoint for one.
                </Hint>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start (DD-MMM-YYYY)">
                <input
                  value={form.start_date ?? ""}
                  onChange={(e) => set("start_date", e.target.value)}
                  placeholder="10-Oct-2026"
                  className={inputClass}
                />
              </Field>
              <Field label="End">
                <input
                  value={form.end_date ?? ""}
                  onChange={(e) => set("end_date", e.target.value)}
                  placeholder="10-Oct-2031"
                  className={inputClass}
                />
              </Field>
            </div>
          </>
        )}

        {isPauseOrCancel && (
          <>
            <Field label="Registrar transaction number">
              <input
                value={form.user_trxn_no ?? ""}
                onChange={(e) => set("user_trxn_no", e.target.value)}
                placeholder="37822295"
                className={inputClass}
              />
              <Hint>
                The registrar&apos;s own number for the running SIP. Validate
                first — a wrong one is only caught after the investor has been
                sent a code.
              </Hint>
            </Field>
            {kind === "sip_pause" && (
              <Field label="Pause for (instalments)">
                <input
                  type="number"
                  value={form.pause_installments ?? ""}
                  onChange={(e) =>
                    set(
                      "pause_installments",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  className={inputClass}
                />
              </Field>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="PAN">
            <input
              value={form.pan_no ?? ""}
              onChange={(e) => set("pan_no", e.target.value.toUpperCase())}
              maxLength={10}
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field label="Mobile for the OTP">
            <input
              value={form.mobile ?? ""}
              onChange={(e) => set("mobile", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="flex gap-2 pt-1">
          {isPauseOrCancel && (
            <button
              type="button"
              onClick={doValidate}
              disabled={!!busy}
              className="flex-1 rounded-xl border border-border py-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent/40 disabled:opacity-50"
            >
              {busy === "Validate SIP change" ? "Checking…" : "Check eligibility"}
            </button>
          )}
          <button
            type="button"
            onClick={doPlace}
            disabled={!!busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-[13px] font-semibold text-background transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {busy === "Place order" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Place order
          </button>
        </div>
      </Section>

      {/* ── the chain ── */}
      {active && (
        <Section title="2 · Confirm it">
          <div className="rounded-xl border border-border bg-card px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground">
                  {active.kind} · {active.amc_name ?? active.amc}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  MFC ref {active.req_id ?? "—"} · folio {active.folio ?? "—"}
                  {active.amount ? ` · ${formatInr0(active.amount)}` : ""}
                </p>
              </div>
              <StatusPill order={active} />
            </div>
            {active.rta_status && (
              <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                Registrar: &ldquo;{active.rta_status}&rdquo;
                {active.user_trxn_no ? ` · txn ${active.user_trxn_no}` : ""}
              </p>
            )}
            {active.error && (
              <p className="mt-2 text-[11px] leading-relaxed text-destructive">
                {active.error}
              </p>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <StepButton
              label="Send OTP"
              highlight={nextStep === "otp"}
              disabled={!!busy}
              busy={busy === "Request OTP"}
              onClick={doOtp}
            />
            <StepButton
              label="Poll status"
              highlight={nextStep === "status"}
              disabled={!!busy}
              busy={busy === "Poll status"}
              onClick={doStatus}
            />
          </div>

          {(nextStep === "consent" || active.status === "otp_sent") && (
            <div className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3.5">
              <p className="text-[12px] text-foreground">
                Enter the code MF Central sent to{" "}
                <strong>{active.otp_destination ?? "the investor"}</strong>.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder={otpHint ?? "OTP"}
                  className={`${inputClass} flex-1 font-mono tracking-widest`}
                />
                <button
                  type="button"
                  onClick={doConsent}
                  disabled={!!busy || otp.trim().length < 4}
                  className="rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background transition-all active:scale-[0.98] disabled:opacity-40"
                >
                  {busy === "Confirm OTP" ? "…" : "Confirm"}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                A wrong code is not fatal — MF Central accepts a retry against
                the same reference.
              </p>
            </div>
          )}

          {nextStep === "payment" && (
            <button
              type="button"
              onClick={doPayment}
              disabled={!!busy}
              className="mt-3 w-full rounded-xl border border-primary/50 bg-primary/5 py-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              {busy === "Confirm payment"
                ? "Sending…"
                : "Confirm payment — the registrar holds the order until this lands"}
            </button>
          )}
        </Section>
      )}

      {/* ── what happened ── */}
      {log.length > 0 && (
        <Section title="Activity">
          <div className="space-y-1">
            {log.map((l, i) => (
              <p
                key={i}
                className={`text-[11px] leading-relaxed ${
                  l.bad ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                <span className="font-mono opacity-60">{l.at}</span> {l.text}
              </p>
            ))}
          </div>
        </Section>
      )}

      <Section
        title={`Order book (${orders.length})`}
        action={
          <button
            type="button"
            onClick={() => void refreshOrders()}
            className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        }
      >
        {orders.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="space-y-1.5">
            {orders.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setActive(o);
                  setNextStep(null);
                }}
                className="flex w-full items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-foreground">
                    {o.kind} · {o.amc_name ?? o.amc ?? "—"}
                    {o.amount ? ` · ${formatInr0(o.amount)}` : ""}
                    {o.units ? ` · ${o.units} units` : ""}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("en-IN")}
                    {o.req_id ? ` · ref ${o.req_id}` : ""}
                  </p>
                </div>
                <StatusPill order={o} />
              </button>
            ))}
          </div>
        )}
      </Section>
    </Shell>
  );
};

// --------------------------------------------------------------------------- bits

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] text-foreground outline-none transition-colors focus:border-primary";

const Shell = ({
  children,
  onBack,
}: {
  children: React.ReactNode;
  onBack: () => void;
}) => (
  <div className="mobile-container flex min-h-screen flex-col bg-background px-6 pb-12 pt-12">
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-1 flex-col"
    >
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 self-start text-[12px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>
      <h1 className="mb-2 text-lg font-semibold text-foreground">
        Place an MF Central order
      </h1>
      <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
        Purchases, redemptions, switches, SIP/STP/SWP and SIP changes, sent to
        CAMS and KFintech. Every order is confirmed by the investor with an OTP
        before it reaches the registrar.
      </p>
      {children}
    </motion.div>
  </div>
);

const Section = ({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="mb-6">
    <div className="mb-2.5 flex items-center justify-between">
      <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {action}
    </div>
    <div className="space-y-3">{children}</div>
  </section>
);

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="block">
    <span className="mb-1.5 block text-[12px] font-medium text-foreground">
      {label}
    </span>
    {children}
  </label>
);

const Hint = ({ children }: { children: React.ReactNode }) => (
  <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
    {children}
  </span>
);

const StepButton = ({
  label,
  highlight,
  disabled,
  busy,
  onClick,
}: {
  label: string;
  highlight: boolean;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-medium transition-colors disabled:opacity-50 ${
      highlight
        ? "bg-foreground text-background"
        : "border border-border text-foreground hover:bg-accent/40"
    }`}
  >
    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
    {label}
  </button>
);

const StatusPill = ({ order }: { order: MfcFtOrder }) => {
  const Icon =
    order.status === "success"
      ? CheckCircle2
      : order.status === "rejected" || order.status === "failed"
        ? XCircle
        : order.status === "processing"
          ? Clock
          : ShieldCheck;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-medium ${
        STATUS_TONE[order.status] ?? "text-muted-foreground"
      }`}
    >
      <Icon className="h-3 w-3" />
      {order.status}
    </span>
  );
};

const Notice = ({
  tone,
  title,
  body,
}: {
  tone: "error" | "warn";
  title: string;
  body: string;
}) => (
  <div
    className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${
      tone === "error"
        ? "border-destructive/30 bg-destructive/5"
        : "border-amber-500/30 bg-amber-500/5"
    }`}
  >
    <AlertTriangle
      className={`mt-0.5 h-4 w-4 shrink-0 ${
        tone === "error" ? "text-destructive" : "text-amber-600"
      }`}
    />
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  </div>
);

export default MfcFtOrders;
