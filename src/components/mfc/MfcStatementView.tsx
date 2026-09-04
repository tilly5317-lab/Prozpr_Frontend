import { useMemo, useState } from "react";
import {
  Ban,
  Building2,
  Check,
  ChevronDown,
  Landmark,
  ShieldCheck,
  User,
} from "lucide-react";
import type { MfcPosition, MfcStatementData, MfcTransaction } from "@/lib/api";
import { formatInr0, formatInrCompact } from "@/lib/utils";

/**
 * Everything MF Central returned for one statement.
 *
 * This is deliberately a raw view, not a portfolio view. The app already has
 * screens for holdings and returns, built on what the ingest pipeline stored —
 * this shows what MFC actually SENT, including the fields our schema has no
 * home for yet: the per-folio transactability flags, the registered bank
 * mandate, KYC and nominee status, the demat/non-demat split. Those are the
 * reason to prefer MFC over parsing a PDF, and they should be visible while it
 * is being decided where they belong.
 *
 * Numbers are rendered exactly as MFC stated them. Where our own figures differ
 * (we revalue holdings to today's NAV; MFC quotes the statement NAV) that
 * difference is real and worth being able to see side by side.
 */

interface Props {
  data: MfcStatementData;
}

type Tab = "positions" | "transactions" | "investor";

const TABS: { key: Tab; label: string }[] = [
  { key: "positions", label: "Holdings" },
  { key: "transactions", label: "Transactions" },
  { key: "investor", label: "Investor" },
];

/** MFC's kycStatus codes. "02"/"1" both mean verified depending on which RTA
 * answered, which is itself worth surfacing rather than normalising away. */
const KYC_LABELS: Record<string, string> = {
  "01": "KYC registered",
  "02": "KYC verified",
  "1": "KYC verified",
  "0": "KYC pending",
};

const MfcStatementView = ({ data }: Props) => {
  const [tab, setTab] = useState<Tab>("positions");

  const totals = useMemo(() => {
    const market = data.positions.reduce((sum, p) => sum + (p.market_value || 0), 0);
    const cost = data.positions.reduce((sum, p) => sum + (p.cost_value || 0), 0);
    return { market, cost, gain: market - cost };
  }, [data.positions]);

  return (
    <div className="space-y-4">
      <HeadlineCard data={data} totals={totals} />

      {data.amc_summary.length > 0 && <AmcSummary data={data} />}
      {data.portfolio.length > 0 && <DematSplit data={data} />}

      <div>
        <div className="flex gap-1 rounded-xl bg-secondary p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors ${
                tab === t.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.key === "positions" && ` (${data.positions.length})`}
              {t.key === "transactions" && ` (${data.transactions.length})`}
            </button>
          ))}
        </div>

        <div className="mt-3">
          {tab === "positions" && <PositionList positions={data.positions} />}
          {tab === "transactions" && (
            <TransactionList transactions={data.transactions} />
          )}
          {tab === "investor" && <InvestorCard data={data} />}
        </div>
      </div>
    </div>
  );
};

// --------------------------------------------------------------------------- headline

const HeadlineCard = ({
  data,
  totals,
}: {
  data: MfcStatementData;
  totals: { market: number; cost: number; gain: number };
}) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Value as MF Central states it
        </p>
        <p className="mt-1 text-2xl font-semibold text-foreground">
          {formatInr0(totals.market)}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
          data.variant === "detailed"
            ? "bg-wealth-green/10 text-wealth-green"
            : "bg-amber-500/10 text-amber-600"
        }`}
      >
        {data.variant === "detailed" ? "Detailed CAS" : "Summary CAS"}
      </span>
    </div>

    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3">
      <Stat label="Invested" value={formatInr0(totals.cost)} />
      <Stat
        label="Gain / loss"
        value={formatInr0(totals.gain)}
        tone={totals.gain >= 0 ? "up" : "down"}
      />
      <Stat label="Folios" value={String(data.counts.folios)} />
      <Stat label="Fund houses" value={String(data.counts.amcs)} />
    </div>

    {(data.statement_from || data.statement_to) && (
      <p className="mt-3 text-[11px] text-muted-foreground">
        Statement period {data.statement_from ?? "—"} to {data.statement_to ?? "—"}
      </p>
    )}
  </div>
);

const Stat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) => (
  <div>
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p
      className={`text-[13px] font-medium ${
        tone === "up"
          ? "text-wealth-green"
          : tone === "down"
            ? "text-destructive"
            : "text-foreground"
      }`}
    >
      {value}
    </p>
  </div>
);

// --------------------------------------------------------------------------- rollups

const AmcSummary = ({ data }: { data: MfcStatementData }) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
      By fund house
    </h4>
    <div className="mt-2.5 space-y-2">
      {data.amc_summary.map((row, i) => (
        <div key={`${row.amc}-${i}`} className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-[12px] text-foreground">
            {row.amc_name ?? row.amc ?? "Unknown"}
          </p>
          <p className="shrink-0 text-[12px] font-medium text-foreground">
            {formatInrCompact(row.market_value)}
          </p>
          <p
            className={`w-16 shrink-0 text-right text-[11px] ${
              row.gain_loss >= 0 ? "text-wealth-green" : "text-destructive"
            }`}
          >
            {row.gain_loss >= 0 ? "+" : ""}
            {row.gain_loss_pct.toFixed(1)}%
          </p>
        </div>
      ))}
    </div>
  </div>
);

/** MFC reports demat and non-demat holdings as separate portfolios. Ours is a
 * single number, so this is the one place the distinction is visible. */
const DematSplit = ({ data }: { data: MfcStatementData }) => {
  const rows = data.portfolio.filter((p) => p.market_value > 0 || p.cost_value > 0);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h4 className="text-[12px] font-semibold text-foreground">
        Held in demat vs. with the registrar
      </h4>
      <div className="mt-2.5 space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-foreground">
              {row.is_demat === "Y" ? "Demat account" : "Registrar (non-demat)"}
            </p>
            <p className="text-[12px] font-medium text-foreground">
              {formatInrCompact(row.market_value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

// --------------------------------------------------------------------------- positions

const PositionList = ({ positions }: { positions: MfcPosition[] }) => {
  if (positions.length === 0) {
    return <EmptyNote text="MF Central returned no holdings for this PAN." />;
  }
  return (
    <div className="space-y-2">
      {positions.map((p, i) => (
        <PositionRow key={`${p.folio}-${p.isin}-${i}`} position={p} />
      ))}
    </div>
  );
};

const PositionRow = ({ position: p }: { position: MfcPosition }) => {
  const [open, setOpen] = useState(false);
  const gain = p.gain_loss ?? (p.cost_value != null ? p.market_value - p.cost_value : null);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-accent/30"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground">
            {p.scheme_name ?? "Unnamed scheme"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {p.amc_name ?? "—"} · Folio {p.folio ?? "—"}
            {p.asset_type ? ` · ${p.asset_type}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13px] font-medium text-foreground">
            {formatInrCompact(p.market_value)}
          </p>
          {gain != null && (
            <p
              className={`text-[11px] ${
                gain >= 0 ? "text-wealth-green" : "text-destructive"
              }`}
            >
              {gain >= 0 ? "+" : ""}
              {formatInrCompact(gain)}
            </p>
          )}
        </div>
        <ChevronDown
          className={`mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-border bg-secondary/30 px-3.5 py-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Field label="Units" value={p.units.toLocaleString("en-IN")} />
            <Field
              label="NAV"
              value={p.nav != null ? `${p.nav} (${p.nav_date ?? "—"})` : "—"}
            />
            <Field
              label="Invested"
              value={p.cost_value != null ? formatInr0(p.cost_value) : "—"}
            />
            <Field label="ISIN" value={p.isin ?? "—"} mono />
            <Field label="Registrar" value={p.rta_name ?? "—"} />
            <Field label="Plan" value={p.plan_mode ?? p.scheme_option ?? "—"} />
            {p.broker_name && (
              <Field label="Distributor" value={`${p.broker_name} (${p.broker_code ?? "—"})`} />
            )}
            {p.mode_of_holding && (
              <Field label="Holding mode" value={p.mode_of_holding} />
            )}
            {p.opening_units != null && (
              <Field label="Opening units" value={p.opening_units.toLocaleString("en-IN")} />
            )}
            {p.last_txn_date && (
              <Field label="Last transaction" value={p.last_txn_date} />
            )}
          </dl>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.kyc_status && (
              <Pill icon={ShieldCheck}>
                {KYC_LABELS[p.kyc_status] ?? `KYC ${p.kyc_status}`}
              </Pill>
            )}
            {p.nominee_status && (
              <Pill icon={p.nominee_status === "Y" ? Check : Ban}>
                {p.nominee_status === "Y" ? "Nominee registered" : "No nominee"}
              </Pill>
            )}
            {p.is_demat === "Y" && <Pill icon={Landmark}>Held in demat</Pill>}
          </div>

          {p.allows && <AllowsGrid allows={p.allows} />}
          {p.bank && <BankBlock bank={p.bank} />}
        </div>
      )}
    </div>
  );
};

/**
 * The transactability flags. Nothing in the PDF path carries these, and a
 * rebalancing plan that ignores them proposes trades the registrar rejects —
 * so they are shown per folio, not summarised away.
 */
const AllowsGrid = ({ allows }: { allows: NonNullable<MfcPosition["allows"]> }) => {
  const entries: [string, boolean][] = [
    ["Purchase", allows.purchase],
    ["Redeem", allows.redeem],
    ["Switch", allows.switch],
    ["SIP", allows.sip],
    ["STP", allows.stp],
    ["SWP", allows.swp],
  ];
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-[11px] font-medium text-muted-foreground">
        What this folio accepts
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {entries.map(([label, ok]) => (
          <span
            key={label}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${
              ok
                ? "bg-wealth-green/10 text-wealth-green"
                : "bg-muted text-muted-foreground line-through"
            }`}
          >
            {ok ? <Check className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};

const BankBlock = ({ bank }: { bank: NonNullable<MfcPosition["bank"]> }) => (
  <div className="mt-3 border-t border-border pt-3">
    <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      <Landmark className="h-3 w-3" />
      Registered bank mandate
    </p>
    <p className="mt-1 text-[12px] text-foreground">
      {bank.name ?? "—"} {bank.account_no ? `· ${bank.account_no}` : ""}
    </p>
    <p className="text-[11px] text-muted-foreground">
      {[bank.account_type, bank.ifsc, bank.city].filter(Boolean).join(" · ") || "—"}
    </p>
  </div>
);

// --------------------------------------------------------------------------- transactions

/** Rows the ingest pipeline drops: they move no units, so they are history but
 * not holdings. Labelling them keeps the count here from looking like a bug
 * against the "transactions imported" number on the success screen. */
const NON_LEDGER_KINDS = new Set([
  "UNKNOWN",
  "DIVIDEND_PAYOUT",
  "STAMP_DUTY_TAX",
  "STT_TAX",
  "TDS_TAX",
  "SEGREGATION",
  "REVERSAL",
]);

const KIND_LABELS: Record<string, string> = {
  PURCHASE: "Purchase",
  PURCHASE_SIP: "SIP",
  REDEMPTION: "Redemption",
  SWITCH_IN: "Switch in",
  SWITCH_OUT: "Switch out",
  SWITCH_IN_MERGER: "Merger in",
  DIVIDEND_REINVEST: "IDCW reinvest",
  DIVIDEND_PAYOUT: "IDCW payout",
  STAMP_DUTY_TAX: "Stamp duty",
  STT_TAX: "STT",
  TDS_TAX: "TDS",
  UNKNOWN: "Non-financial",
};

const TransactionList = ({ transactions }: { transactions: MfcTransaction[] }) => {
  const [showAll, setShowAll] = useState(false);
  const [includeNonLedger, setIncludeNonLedger] = useState(true);

  const filtered = includeNonLedger
    ? transactions
    : transactions.filter((t) => !NON_LEDGER_KINDS.has(t.kind));
  const shown = showAll ? filtered : filtered.slice(0, 40);
  const nonLedgerCount = transactions.filter((t) => NON_LEDGER_KINDS.has(t.kind)).length;

  if (transactions.length === 0) {
    return (
      <EmptyNote text="This is a Summary statement — MF Central sends no transaction history with it. Choose the Detailed option to get the full ledger." />
    );
  }

  return (
    <div>
      {nonLedgerCount > 0 && (
        <label className="mb-2 flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={includeNonLedger}
            onChange={(e) => setIncludeNonLedger(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border"
          />
          Show the {nonLedgerCount} non-financial row(s) — address and KYC updates
          that move no units and are not imported
        </label>
      )}

      <div className="space-y-1.5">
        {shown.map((t, i) => (
          <div
            key={`${t.folio}-${t.date}-${i}`}
            className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] text-foreground">
                {t.description ?? KIND_LABELS[t.kind] ?? t.kind}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {t.date ?? "—"} · {t.scheme_name ?? "—"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[12px] font-medium text-foreground">
                {t.amount ? formatInrCompact(t.amount) : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t.units ? `${t.units} units` : KIND_LABELS[t.kind] ?? t.kind}
              </p>
            </div>
          </div>
        ))}
      </div>

      {filtered.length > shown.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2.5 w-full rounded-lg border border-border py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-accent/40"
        >
          Show all {filtered.length} transactions
        </button>
      )}
    </div>
  );
};

// --------------------------------------------------------------------------- investor

const InvestorCard = ({ data }: { data: MfcStatementData }) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
      <User className="h-3.5 w-3.5 text-muted-foreground" />
      As registered with the fund houses
    </h4>
    <dl className="mt-3 space-y-2.5">
      <Field label="Name" value={data.investor.name ?? "—"} block />
      <Field label="PAN" value={data.investor.pan ?? "—"} block mono />
      <Field label="Email" value={data.investor.email ?? "—"} block />
      <Field label="Mobile" value={data.investor.mobile ?? "—"} block />
      <Field label="Address" value={data.investor.address ?? "—"} block />
    </dl>
    <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
      These are the details your fund houses hold, which can differ from your
      Prozpr profile. We fill blank profile fields from a statement but never
      overwrite anything you have set yourself.
    </p>
  </div>
);

// --------------------------------------------------------------------------- shared

const Field = ({
  label,
  value,
  mono,
  block,
}: {
  label: string;
  value: string;
  mono?: boolean;
  block?: boolean;
}) => (
  <div className={block ? "" : "min-w-0"}>
    <dt className="text-[11px] text-muted-foreground">{label}</dt>
    <dd
      className={`text-[12px] text-foreground ${mono ? "font-mono" : ""} ${
        block ? "" : "truncate"
      }`}
    >
      {value}
    </dd>
  </div>
);

const Pill = ({
  icon: Icon,
  children,
}: {
  icon: typeof Check;
  children: React.ReactNode;
}) => (
  <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
    <Icon className="h-3 w-3" />
    {children}
  </span>
);

const EmptyNote = ({ text }: { text: string }) => (
  <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[12px] leading-relaxed text-muted-foreground">
    {text}
  </p>
);

export default MfcStatementView;
