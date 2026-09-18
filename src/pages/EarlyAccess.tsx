import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Calculator,
  Check,
  ChevronDown,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  EARLY_ACCESS_PROFESSIONS,
  getEarlyAccessSeats,
  submitEarlyAccessSignup,
  type EarlyAccessProfession,
  type EarlyAccessSeats,
} from "@/lib/api";
import { isPostHogEnabled, posthog } from "@/lib/posthog";

/**
 * /earlyaccess — recruitment page for the 100-seat early-access programme.
 *
 * Public route (no session needed). Sign-ups go to the backend, which keeps
 * them in a Google Sheet — nothing here creates an app account. While the
 * beta runs, the app's own sign-up is closed (see WelcomeScreen), so this
 * page is the only way in for a new number.
 *
 * Ported from the early-access page in the Prozpr Launch Website
 * design project. The palette is committed to one light look on purpose
 * (a marketing page, not an app screen), so colours are literal hex values
 * rather than the app's theme tokens, and the app's dark mode leaves it alone.
 */

/**
 * How often the live count is re-read while the page is open, matching the
 * backend's own 30s cache — polling faster only returns the same cached
 * number. The meter is the page's one live element, so during a launch push a
 * visitor sees it move without reloading.
 */
const SEATS_POLL_MS = 30_000;

/**
 * Seat figures are shown ONLY when they are real.
 *
 * There is deliberately no invented fallback here. A count that ticks up on a
 * timer is a claim about how many people signed up, made to visitors who have
 * no way to check it, and it would be a lie the moment the real number
 * diverged. When the live figure cannot be read the page simply says less —
 * the meter hides and the buttons drop the number — rather than making one up.
 */
type SeatsStatus = "loading" | "live" | "unavailable";

/** WhatsApp numbers are Indian national numbers, exactly like app accounts:
    ten digits. Mirrors WHATSAPP_DIGITS on the backend, which re-validates.

    +91 is shown beside the field but is NOT sent or stored: Google Sheets
    parses a cell beginning with "+" as a formula, so a stored "+91..." lands
    in the team's register as #ERROR! and the number is lost. The register is
    all-Indian by construction, so the bare digits lose nothing. */
const WHATSAPP_DIGITS = 10;

const SIGNUP_KEY = "prozpr_early_access_signup";

/** No version numbers anywhere a visitor can read. "MVP" is our word for the
    build, and an edition number ("2.0") tells a prospective customer they have
    been handed a numbered pre-release. The programme has a name instead, and
    the backend's ticket mail uses the same one. */
const PAGE_TITLE = "Prozpr Early Access — Become a founding tester";
const PAGE_DESCRIPTION =
  "Join the 100 investors who use the new Prozpr first. A free premium portfolio assessment, unlimited fund analysis, and a direct line to the founders.";

/* ─── Seat state ─── */

interface SeatsState {
  seats: EarlyAccessSeats | null;
  status: SeatsStatus;
  /** Adopt the figures a successful sign-up came back with, so the meter
      reflects the seat the visitor just took without waiting for the poll. */
  apply: (s: EarlyAccessSeats | null) => void;
}

function useSeats(): SeatsState {
  const [seats, setSeats] = useState<EarlyAccessSeats | null>(null);
  const [status, setStatus] = useState<SeatsStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      void getEarlyAccessSeats()
        .then((s) => {
          if (cancelled || !Number.isFinite(s.seats_total)) return;
          setSeats(s);
          setStatus("live");
        })
        .catch(() => {
          // A blip must not blank a meter that was reading correctly a moment
          // ago: keep the last good figure and only fall back to the
          // numberless state if we never had one.
          if (!cancelled) setStatus((prev) => (prev === "live" ? "live" : "unavailable"));
        });
    };

    load();
    const poll = window.setInterval(load, SEATS_POLL_MS);
    // A tab left open for an hour is the common case for a link someone was
    // sent; re-read on return so they are not looking at an hour-old count.
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const apply = (s: EarlyAccessSeats | null) => {
    if (!s || !Number.isFinite(s.seats_total)) return;
    setSeats(s);
    setStatus("live");
  };

  return { seats, status, apply };
}

function useSignupDone(): [boolean, () => void] {
  const [done, setDone] = useState(() => {
    try {
      return Boolean(localStorage.getItem(SIGNUP_KEY));
    } catch {
      return false;
    }
  });
  const markDone = () => {
    try {
      localStorage.setItem(SIGNUP_KEY, JSON.stringify({ at: Date.now() }));
    } catch {
      /* private mode — the in-memory flag still carries this visit */
    }
    setDone(true);
  };
  return [done, markDone];
}

/* ─── What the page says about availability ─── */

/**
 * Exact figures are published only over the closing stretch.
 *
 * A precise "3 of 100 seats claimed" on the first morning is an empty room
 * rendered as a statistic: it argues the visitor out of the seat the page
 * exists to fill. The same precision over the last stretch is what makes the
 * urgency credible, because by then the number is the point. So the page
 * states the stage it has genuinely reached, and names the figure once naming
 * it helps.
 *
 * Every line below is a FACT about the live count, not a dial. The stage is
 * derived from the figure the backend reports, so "less than half remain"
 * appears only when less than half really do; and when the count cannot be
 * read, `describeSeats` returns null and the page says nothing about
 * availability at all rather than guessing a stage.
 */
const EXACT_COUNT_FROM = 20;

type SeatStage = "open" | "half" | "closing" | "full";

interface SeatCopy {
  stage: SeatStage;
  /** Compact status beside a heading. */
  pill: string;
  /** Shorter still, for the nav's gold chip. */
  badge: string;
  /** The availability card's lead line. */
  headline: string;
  /** Primary button label. */
  cta: string;
  /** The closing section's headline. */
  closing: string;
}

function describeSeats(seats: EarlyAccessSeats | null): SeatCopy | null {
  if (!seats || !Number.isFinite(seats.seats_total)) return null;
  const total = seats.seats_total;
  const left = Math.max(0, seats.seats_left);

  if (left <= 0)
    return {
      stage: "full",
      pill: "Standby list open",
      badge: "Standby",
      headline: "Every seat in this round is taken",
      cta: "Join the standby list",
      closing: "Every seat in this round is taken.",
    };

  if (left <= EXACT_COUNT_FROM) {
    const seatWord = `${left} ${left === 1 ? "seat" : "seats"}`;
    return {
      stage: "closing",
      pill: `${seatWord} available`,
      badge: `${left} left`,
      headline: `${seatWord} available of ${total}`,
      cta: `Claim one of the last ${left}`,
      closing: `${seatWord} available.`,
    };
  }

  // Strictly fewer than half, so the headline is true as written: at exactly
  // half remaining the page falls through to "filling fast" rather than
  // claiming a milestone the register has not reached.
  if (left * 2 < total)
    return {
      stage: "half",
      pill: "Over half claimed",
      badge: "Half claimed",
      headline: "Less than half the seats remain",
      cta: "Claim your seat now",
      closing: "Less than half the seats remain.",
    };

  return {
    stage: "open",
    pill: "Filling fast",
    badge: "Filling fast",
    headline: "Seats are filling fast",
    cta: "Claim your seat",
    closing: "Seats are filling fast.",
  };
}

/** The three milestones the track lights up, in order. Each one is a true
    statement about the register by the time its segment fills. */
const STAGE_TRACK: { stage: SeatStage; label: string }[] = [
  { stage: "open", label: "Registration open" },
  { stage: "half", label: "Over half claimed" },
  { stage: "closing", label: "Final seats" },
];

const stagesLit = (stage: SeatStage): number =>
  stage === "open" ? 1 : stage === "half" ? 2 : 3;

/* ─── Small pieces ─── */

const LivePulse = ({ size = "h-2 w-2" }: { size?: string }) => (
  <span className={`relative flex ${size}`}>
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C8321F] opacity-60" />
    <span className={`relative inline-flex ${size} rounded-full bg-[#C8321F]`} />
  </span>
);

const AvailabilityPill = ({ copy }: { copy: SeatCopy }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#FBEFEC] px-2.5 py-1 text-[12px] font-bold text-[#C8321F]">
    <LivePulse />
    {copy.pill}
  </span>
);

const SectionLabel = ({ children, className = "" }: { children: string; className?: string }) => (
  <p className={`text-[10px] font-medium uppercase tracking-[1.5px] text-[#8A8275] ${className}`}>
    {children}
  </p>
);

const Wordmark = ({ tagline = false }: { tagline?: boolean }) => (
  <span className="inline-flex flex-col leading-none">
    <span className="font-display text-[26px] tracking-tight">
      prozp₹<span className="text-[#E0B84A]">.</span>
    </span>
    {tagline && (
      <span className="mt-0.5 font-display text-[11px] italic text-[#8A8275]">
        Smarter wealth decisions
      </span>
    )}
  </span>
);

/* ─── Sign-up ─── */

interface SignupProps {
  /** Null until the live count lands, and if it never does. Every caller has
      to render a sensible numberless version rather than guess a figure. */
  seats: EarlyAccessSeats | null;
  done: boolean;
  onDone: (seats: EarlyAccessSeats | null) => void;
}

function SignupForm({ seats, done, onDone }: SignupProps) {
  const [open, setOpen] = useState(false);
  const copy = describeSeats(seats);

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[#1F7A5A]/30 bg-[#DDEFE7] p-5 text-left">
        <div className="flex items-center gap-2 font-semibold text-[#1F7A5A]">
          <Check className="h-5 w-5" /> You&apos;re on the list.
        </div>
        <p className="mt-1.5 text-sm text-[#111113]/80">
          Watch your inbox. Your invite and the WhatsApp group link arrive before early
          access opens. Seats are confirmed in registration order.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {/* No notification dot on the button. A pinging red badge on a call to
          action is a nudge borrowed from a messaging app, and this page is
          asking someone to trust us with their portfolio. The live pulse still
          appears where it means something — beside a figure that is genuinely
          live. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex h-14 w-full max-w-sm items-center justify-center gap-2.5 rounded-2xl bg-[#111113] px-8 text-[16px] font-semibold text-[#F7F3EC] shadow-[0_8px_24px_rgba(17,17,19,0.18)] transition-all hover:-translate-y-0.5 hover:bg-[#2F2F33]"
      >
        {copy ? copy.cta : "Claim your seat"}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </button>
      <p className="mt-2.5 text-[12px] text-[#8A8275]">
        Takes 30 seconds, and stays free throughout. No payment details needed.
      </p>
      {open && <SignupModal seats={seats} onClose={() => setOpen(false)} onDone={onDone} />}
    </div>
  );
}

const FIELD =
  "h-12 w-full rounded-xl border border-[#E8E2D2] bg-white px-4 text-[15px] text-[#111113] outline-none placeholder:text-[#6F6858] focus:border-[#111113]";

function SignupModal({
  seats,
  onClose,
  onDone,
}: {
  seats: EarlyAccessSeats | null;
  onClose: () => void;
  onDone: (seats: EarlyAccessSeats | null) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profession, setProfession] = useState<EarlyAccessProfession | "">("");
  /** Honeypot — hidden from people, so a value here means a bot filled it.
      NOT named after anything a browser can autofill: see the field below. */
  const [referrerNote, setReferrerNote] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const copy = describeSeats(seats);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    if (cleanName.length < 2) return setErr("Please enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
      return setErr("Please enter a valid email address.");
    // Length is checked against the constant rather than built into a RegExp:
    // inside a template literal `\d` is not an escape sequence and collapses to
    // a plain "d", so the pattern would quietly match the letter instead of a
    // digit. The literal below has no such trap.
    if (cleanPhone && (cleanPhone.length !== WHATSAPP_DIGITS || !/^\d+$/.test(cleanPhone)))
      return setErr(
        `Please enter a ${WHATSAPP_DIGITS}-digit WhatsApp number, or leave it blank.`,
      );
    if (!profession) return setErr("Please pick your profession.");
    setErr("");
    setSubmitting(true);
    try {
      const res = await submitEarlyAccessSignup({
        name: cleanName,
        email: cleanEmail,
        whatsapp: cleanPhone || null,
        profession,
        source: "earlyaccess_page",
        referrer_note: referrerNote,
      });
      if (isPostHogEnabled) {
        posthog.capture("early_access_signup_completed", {
          profession,
          has_whatsapp: Boolean(cleanPhone),
          waitlisted: Boolean(res.waitlisted),
          already_registered: Boolean(res.already_registered),
        });
      }
      onDone(Number.isFinite(res.seats_total) ? res : null);
      onClose();
    } catch (ex) {
      setErr(
        ex instanceof Error && ex.message
          ? ex.message
          : "Could not save your sign-up. Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#111113]/50 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-[#F7F3EC] p-6 text-[#111113] shadow-2xl sm:rounded-3xl sm:p-7"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="early-access-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            {copy && <AvailabilityPill copy={copy} />}
            <h3
              id="early-access-title"
              className={`text-xl font-semibold tracking-tight${copy ? " mt-2.5" : ""}`}
            >
              {copy?.stage === "full" ? "Join the standby list" : "Claim your seat"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[#8A8275] hover:bg-[#EDE6D6] hover:text-[#111113]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="mt-5 flex flex-col gap-2.5 text-left">
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className={FIELD}
          />
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className={FIELD}
          />
          {/* +91 is a fixed prefix, not something to type: the field takes the
              ten national digits only (same rule as an app account). Non-digits
              are stripped on the way in and the length is capped, so an
              over-long or mis-pasted number cannot be entered at all rather
              than being caught later by a validation message. */}
          <div className={`${FIELD} flex items-center gap-2 px-0`}>
            {/* A label, not part of the value — the payload is ten bare
                digits. See WHATSAPP_DIGITS for why no +91 is stored. */}
            <span className="flex h-full select-none items-center border-r border-[#E8E2D2] px-4 text-[15px] text-[#57534A]">
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={WHATSAPP_DIGITS}
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, "").slice(0, WHATSAPP_DIGITS))
              }
              placeholder="WhatsApp number (optional)"
              className="h-full w-full bg-transparent pr-4 text-[15px] text-[#111113] outline-none placeholder:text-[#6F6858]"
            />
          </div>
          <select
            required
            value={profession}
            onChange={(e) => setProfession(e.target.value as EarlyAccessProfession | "")}
            className={`${FIELD} appearance-none ${profession ? "" : "text-[#6F6858]"}`}
          >
            <option value="" disabled>
              Profession
            </option>
            {EARLY_ACCESS_PROFESSIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {/* Honeypot: off-screen and skipped by keyboard/screen readers.
              Not display:none — some bots skip fields that are. */}
          {/* Honeypot. It was once name="company" with a "Company" label, and
              Chrome duly recognised it as the organization field and filled it
              from the visitor's saved profile — so every applicant with
              autofill on was discarded behind a success screen. tabIndex and
              autoComplete="off" did not help: browsers ignore both for fields
              they think they recognise. The fix is a name and id that match
              nothing in that vocabulary, and no label text to re-introduce the
              hint. Keep it that way. */}
          <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <input
              id="early-access-referrer-note"
              type="text"
              name="referrer_note"
              tabIndex={-1}
              autoComplete="off"
              value={referrerNote}
              onChange={(e) => setReferrerNote(e.target.value)}
            />
          </div>
          {err && <p className="text-[13px] font-medium text-[#C8321F]">{err}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="group mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#111113] text-[15px] font-semibold text-[#F7F3EC] transition-colors hover:bg-[#2F2F33] disabled:opacity-60"
          >
            {submitting ? "Saving your seat…" : "Confirm my seat"}
            {!submitting && (
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
          <p className="text-center text-[12px] text-[#8A8275]">
            Your details stay with us, and are used only to run early access.
          </p>
        </form>
      </div>
    </div>
  );
}

const METER_SHELL =
  "mx-auto mt-6 w-full max-w-md rounded-2xl border border-[#E8E2D2] bg-white p-4 text-left";

/**
 * The availability card.
 *
 * A milestone track rather than a percentage bar, for the same reason the copy
 * withholds the figure until the closing stretch: a bar filled to its true 3%
 * publishes the exact count to anyone holding a ruler, and a bar filled to a
 * flattering width publishes a number we made up. Three segments, each lighting
 * only once the register has genuinely reached that milestone, says where the
 * round stands and nothing it cannot support.
 */
function SeatMeter({ seats, status }: { seats: EarlyAccessSeats | null; status: SeatsStatus }) {
  const copy = describeSeats(seats);

  if (status === "loading") {
    return (
      <div className={METER_SHELL} aria-hidden>
        <div className="flex items-baseline justify-between gap-3">
          <span className="h-5 w-44 animate-pulse rounded bg-[#EDE6D6]" />
          <span className="h-6 w-24 animate-pulse rounded-full bg-[#EDE6D6]" />
        </div>
        <div className="mt-3 flex gap-1.5">
          {STAGE_TRACK.map((t) => (
            <span key={t.stage} className="h-1.5 flex-1 animate-pulse rounded-full bg-[#EDE6D6]" />
          ))}
        </div>
        <div className="mt-3 h-4 w-56 animate-pulse rounded bg-[#EDE6D6]" />
      </div>
    );
  }

  // Live count unreadable and never read. The page says less rather than
  // showing a stage it cannot stand behind — the copy elsewhere still carries
  // the invitation, and the button falls back to "Claim your seat".
  if (!copy) return null;

  const lit = stagesLit(copy.stage);

  return (
    <div className={METER_SHELL}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <span className="text-[15px] font-semibold">{copy.headline}</span>
        <AvailabilityPill copy={copy} />
      </div>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {STAGE_TRACK.map((t, i) => (
          <span
            key={t.stage}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-700 ${
              i < lit ? "bg-gradient-to-r from-[#E0B84A] to-[#C8321F]" : "bg-[#EDE6D6]"
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-[12px] text-[#8A8275]">
        {STAGE_TRACK[lit - 1].label} · seats are confirmed in registration order.
      </p>
    </div>
  );
}

/* ─── Sections ─── */

function Nav({ copy }: { copy: SeatCopy | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#E8E2D2]/80 bg-[#F7F3EC]/90 backdrop-blur">
      <div className="bg-[#111113] px-4 py-1.5 text-center text-[11px] font-medium tracking-wide text-[#F7F3EC]/80 sm:text-[12px]">
        Prozpr Private Limited · AMFI &amp; SEBI registration in process · Educational insights,
        not investment advice
      </div>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          <Wordmark />
          <span className="ml-1 hidden rounded-full border border-[#E0B84A] bg-[#F7ECCC] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#9B8030] sm:inline">
            Early access
          </span>
        </div>
        <a
          href="#join"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#111113] px-4 text-sm font-semibold text-[#F7F3EC] hover:bg-[#2F2F33] hover:text-[#F7F3EC]"
        >
          Become a tester
          {copy && (
            <span className="whitespace-nowrap rounded-full bg-[#E0B84A] px-1.5 py-0.5 text-[10px] font-bold text-[#111113]">
              {copy.badge}
            </span>
          )}
        </a>
      </div>
    </header>
  );
}

function Hero({ seats, status, done, onDone }: SignupProps & { status: SeatsStatus }) {
  return (
    <section className="px-5 pb-16 pt-14 text-center sm:pt-20">
      <div className="mx-auto max-w-3xl">
        <SectionLabel>Early access · 100 seats · Free</SectionLabel>
        <h1 className="mt-4 text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-6xl sm:leading-[1.08]">
          Be one of the <em className="font-display font-normal italic">100</em> who test the new
          Prozpr.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[#57534A]">
          The new Prozpr is ready. Before it opens to everyone, we are giving 100 real
          investors the run of it — to use it, stress-test it and shape it, with the full
          premium experience free while they do.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-sm text-[#8A8275]">
          Built by IIT and Ivy League MBA graduates.
        </p>
        <div id="join" className="mx-auto mt-8 max-w-xl scroll-mt-24">
          <SignupForm seats={seats} done={done} onDone={onDone} />
        </div>
        <SeatMeter seats={seats} status={status} />
      </div>
    </section>
  );
}

interface Perk {
  icon: LucideIcon;
  title: string;
  body: string;
  tag: string;
}

const PERKS: Perk[] = [
  {
    icon: Sparkles,
    title: "The Founding Tester community",
    body: "A select circle of 100. Every tester keeps premium free for six months after launch, and our most engaged testers hold the Founding Tester badge for life — with invitations to networking and investing events, and benefits reserved for them in the app.",
    tag: "Lifetime badge",
  },
  {
    icon: Users,
    title: "A direct line to the builders",
    body: "A private WhatsApp group with the founders. Flag something and watch it get fixed in days. Suggest a feature and see it ship. Your name in our launch credits, if you would like it there.",
    tag: "Shape the product",
  },
  {
    icon: Wallet,
    title: "Free premium portfolio assessment",
    body: "Link your mutual fund holdings and get the full premium health check: overlap, risk, expense drag and goal fit, with clear guidance on what to act on. A paid feature at launch, and free for testers.",
    tag: "Premium, free",
  },
  {
    icon: TrendingUp,
    title: "Unlimited advanced fund analysis",
    body: "Deep analysis and rankings across every mutual fund in India: returns, consistency, downside behaviour and manager record. Every screen stays open to you, with no usage limits.",
    tag: "Unlimited",
  },
  {
    icon: Calculator,
    title: "A one-on-one portfolio review",
    body: "Every tester gets a 45-minute session with us: a thorough walkthrough of your portfolio, what is working well, what is holding it back, and how to structure it around your goals.",
    tag: "45 min, 1:1",
  },
  {
    icon: ShieldCheck,
    title: "Free, and safe by design",
    body: "Your portfolio is analysed read-only, everything stays free, and you keep full control: step away whenever you like, and we delete your data the moment you ask.",
    tag: "Read-only",
  },
];

function Perks() {
  return (
    <section className="border-t border-[#E8E2D2] bg-white px-5 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <SectionLabel className="text-center">What you get as a tester</SectionLabel>
        <h2 className="mx-auto mt-3 max-w-2xl text-center text-[26px] font-semibold tracking-tight sm:text-4xl">
          A <em className="font-display font-normal italic">head start</em> for you.
        </h2>
        <div className="mt-8 grid gap-3.5 sm:mt-10 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {PERKS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-[#E8E2D2] bg-[#FDFBF6] p-6">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#F7ECCC] text-[#9B8030]">
                  <p.icon className="h-5 w-5" />
                </span>
                <span className="rounded-full bg-[#F0E9D6] px-2.5 py-1 text-[11px] font-semibold text-[#57534A]">
                  {p.tag}
                </span>
              </div>
              <h3 className="mt-4 text-[17px] font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#57534A]">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Register",
    body: "Leave your email and WhatsApp number. Seats are confirmed in registration order, and you hear from us within a day.",
  },
  {
    n: "02",
    title: "Get your invite",
    body: "Your login arrives and you join the testers' WhatsApp group. Setup takes under five minutes.",
  },
  {
    n: "03",
    title: "Use it like it's yours",
    body: "Assess your portfolio, analyse funds, and put Prozpr to work. About 15 minutes a week, entirely on your own schedule.",
  },
  {
    n: "04",
    title: "Tell us the truth",
    body: "One short feedback prompt a week: what worked, what confused you, what is still missing. That is the whole job.",
  },
];

function HowItWorks() {
  return (
    <section className="px-5 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <SectionLabel className="text-center">How early access works</SectionLabel>
        <h2 className="mt-3 text-center text-[26px] font-semibold tracking-tight sm:text-4xl">
          Four steps.{" "}
          <em className="font-display font-normal italic">Fifteen minutes a week.</em>
        </h2>
        <div className="mt-8 grid gap-3.5 sm:mt-10 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-[#E8E2D2] bg-white p-6">
              <span className="font-display text-3xl italic text-[#E0B84A]">{s.n}</span>
              <h3 className="mt-3 text-[16px] font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#57534A]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const WHO_FOR = [
  "You hold mutual funds (or plan to start SIPs) and wonder whether your mix is actually right.",
  "You've outgrown star ratings and want real analysis before you pick a fund.",
  "You'd rather ask a question in plain English than decode a factsheet.",
  "You enjoy being early, and you're happy to say so when something still feels rough.",
];

function WhoFor() {
  return (
    <section className="border-t border-[#E8E2D2] bg-[#111113] px-5 py-16 text-[#F7F3EC] sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionLabel className="!text-[#E0B84A]">Who we're looking for</SectionLabel>
          <h2 className="mt-3 text-[26px] font-semibold tracking-tight sm:text-4xl">
            Early access is for you if…
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#F7F3EC]/70">
            We're looking for 100 everyday investors whose honest reactions decide what
            Prozpr becomes. Your own perspective is the whole qualification.
          </p>
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-[#F7F3EC]/80">
            <p className="font-semibold text-[#E0B84A]">Who's building this</p>
            <p className="mt-1">
              A founding team of IIT and Ivy League MBA graduates, building Prozpr for how India
              actually invests.
            </p>
          </div>
        </div>
        <ul className="flex flex-col gap-3">
          {WHO_FOR.map((r) => (
            <li
              key={r}
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-[15px] leading-relaxed"
            >
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#E0B84A]" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Answers lead with what IS true, not with a "No".
 *
 * Seven questions in a row that opened "No." / "Not yet." read as a list of
 * things Prozpr will not do, which is a strange note to strike on the page
 * asking someone to join. The facts are unchanged — the costs, the limits and
 * the registration status are all still stated plainly, including in the one
 * answer where the honest response is genuinely a qualified one. */
const FAQS = [
  {
    q: "What does early access cost?",
    a: "Nothing at all. Everything is free, including the features that will be paid at launch, and testers keep premium free for six months afterwards.",
  },
  {
    q: "Do I need to invest real money?",
    a: "You can explore all of it without moving a rupee. Prozpr analyses and plans; whether you act on what it shows you is entirely your call.",
  },
  {
    q: "How is my data handled?",
    a: "Carefully. Portfolio access is read-only, your details are used only to run early access, and we delete everything the moment you ask us to.",
  },
  {
    q: "How much time does it take?",
    a: "Around 15 minutes a week. Use the product as you normally would and answer one short feedback prompt. Calls and meetings are entirely optional.",
  },
  {
    q: "Why do you ask for a WhatsApp number?",
    a: "Early access runs on WhatsApp: invites, updates, and the testers' group with the founders. We keep it to exactly that, and never use it for marketing.",
  },
  {
    q: "What if I register once all 100 seats are taken?",
    a: "You join the standby list in order. Places free up most weeks as testers move on, so standby registrations do come through.",
  },
  {
    q: "Are you SEBI or AMFI registered?",
    a: "Our AMFI and SEBI registrations are in progress. Throughout early access Prozpr offers educational analysis and insights, rather than regulated investment advice or transactions.",
  },
];

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="px-5 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <SectionLabel className="text-center">Questions</SectionLabel>
        <h2 className="mt-3 text-center text-[26px] font-semibold tracking-tight sm:text-3xl">
          Fair questions, straight answers.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-[#57534A]">
          Anything still unanswered, ask us in the testers&apos; group once you are in.
        </p>
        <div className="mt-8 divide-y divide-[#E8E2D2] rounded-2xl border border-[#E8E2D2] bg-white">
          {FAQS.map((f, i) => (
            <div key={f.q}>
              <button
                type="button"
                onClick={() => setOpen(open === i ? -1 : i)}
                aria-expanded={open === i}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold"
              >
                {f.q}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[#8A8275] transition-transform ${open === i ? "rotate-180" : ""}`}
                />
              </button>
              {open === i && (
                <p className="px-5 pb-4 text-sm leading-relaxed text-[#57534A]">{f.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ seats, done, onDone }: SignupProps) {
  const copy = describeSeats(seats);
  return (
    <section className="border-t border-[#E8E2D2] bg-white px-5 py-16 sm:py-20">
      <div className="mx-auto max-w-xl text-center">
        <h2 className="text-[26px] font-semibold tracking-tight sm:text-4xl">
          {copy ? copy.closing : "Early access is filling up."}{" "}
          <em className="font-display font-normal italic">
            {copy?.stage === "full" ? "The standby list is open." : "Claim yours now."}
          </em>
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-[#57534A]">
          A free premium assessment, unlimited fund analysis, and a product that listens to
          you — in exchange for your honest opinion.
        </p>
        <div className="mt-7">
          <SignupForm seats={seats} done={done} onDone={onDone} />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#E8E2D2] px-5 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-[13px] text-[#8A8275] sm:flex-row">
        <Wordmark tagline />
        <p className="text-center sm:text-right">
          Prozpr Private Limited · Educational insights, not investment advice. AMFI &amp; SEBI
          registration in process. © 2026.
        </p>
      </div>
    </footer>
  );
}

/* ─── Page ─── */

const EarlyAccess = () => {
  const { seats, status, apply: applySeats } = useSeats();
  const [done, markDone] = useSignupDone();

  // The SPA shell's <title>/<meta> describe the app; this page is shared as a
  // link on its own, so it carries its own while mounted.
  useEffect(() => {
    const prevTitle = document.title;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDescription = meta?.content;
    document.title = PAGE_TITLE;
    if (meta) meta.content = PAGE_DESCRIPTION;
    return () => {
      document.title = prevTitle;
      if (meta && prevDescription !== undefined) meta.content = prevDescription;
    };
  }, []);

  const handleDone = (fresh: EarlyAccessSeats | null) => {
    // The sign-up response carries the count including the seat just taken,
    // so the meter moves immediately instead of waiting for the next poll.
    applySeats(fresh);
    markDone();
  };

  return (
    <div className="early-access min-h-screen bg-[#F7F3EC] font-sans text-[#111113] antialiased selection:bg-[#111113] selection:text-[#F7F3EC]">
      <Nav copy={describeSeats(seats)} />
      <main>
        <Hero seats={seats} status={status} done={done} onDone={handleDone} />
        <Perks />
        <HowItWorks />
        <WhoFor />
        <Faq />
        <FinalCta seats={seats} done={done} onDone={handleDone} />
      </main>
      <Footer />
    </div>
  );
};

export default EarlyAccess;
