import { useEffect, useRef, useState, type FormEvent } from "react";
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
 * /earlyaccess — recruitment page for the 100-seat MVP 2.0 private beta.
 *
 * Public route (no session needed). Sign-ups go to the backend, which keeps
 * them in a Google Sheet — nothing here creates an app account. While the
 * beta runs, the app's own sign-up is closed (see WelcomeScreen), so this
 * page is the only way in for a new number.
 *
 * Ported from the "Prozpr MVP2 Beta" page in the Prozpr Launch Website
 * design project. The palette is committed to one light look on purpose
 * (a marketing page, not an app screen), so colours are literal hex values
 * rather than the app's theme tokens, and the app's dark mode leaves it alone.
 */

/** Denominator shown before the live figure lands; the backend owns the real
    one (`EARLY_ACCESS_SEATS`) and its value replaces this as soon as it loads. */
const BETA_SEATS = 100;

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
    ten digits behind a fixed +91. Mirrors WHATSAPP_DIGITS on the backend —
    it re-validates and stores `+91XXXXXXXXXX`, so keep the two in step. */
const WHATSAPP_DIGITS = 10;
const WHATSAPP_COUNTRY_CODE = "+91";

const SIGNUP_KEY = "prozpr_early_access_signup";

const PAGE_TITLE = "Prozpr MVP 2.0 — Become a founding tester";
const PAGE_DESCRIPTION =
  "Test Prozpr MVP 2.0 before anyone else. Free premium portfolio assessment, unlimited fund analysis, and a direct line to the founders. 100 seats.";

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

/* ─── Small pieces ─── */

const LivePulse = ({ size = "h-2 w-2" }: { size?: string }) => (
  <span className={`relative flex ${size}`}>
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C8321F] opacity-60" />
    <span className={`relative inline-flex ${size} rounded-full bg-[#C8321F]`} />
  </span>
);

const SeatsLeftPill = ({ left }: { left: number }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FBEFEC] px-2.5 py-1 text-[12px] font-bold text-[#C8321F]">
    <LivePulse />
    {left} {left === 1 ? "seat" : "seats"} left
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
  const left = seats?.seats_left;
  const full = left !== undefined && left <= 0;

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[#1F7A5A]/30 bg-[#DDEFE7] p-5 text-left">
        <div className="flex items-center gap-2 font-semibold text-[#1F7A5A]">
          <Check className="h-5 w-5" /> You&apos;re on the list.
        </div>
        <p className="mt-1.5 text-sm text-[#111113]/80">
          Watch your inbox. Your invite and the WhatsApp group link arrive before the beta
          opens. Seats are confirmed in sign-up order.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative inline-flex h-14 w-full max-w-sm items-center justify-center gap-2.5 rounded-2xl bg-[#111113] px-8 text-[16px] font-semibold text-[#F7F3EC] shadow-[0_8px_24px_rgba(17,17,19,0.25)] transition-all hover:-translate-y-0.5 hover:bg-[#2F2F33]"
      >
        {full
          ? "Join the waitlist"
          : left !== undefined
            ? `Claim 1 of the last ${left} seats`
            : "Claim your seat"}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C8321F] opacity-60" />
          <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-[#F7F3EC] bg-[#C8321F]" />
        </span>
      </button>
      <p className="mt-2.5 text-[12px] text-[#8A8275]">
        Takes 30 seconds. Free, and we never ask for payment details.
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
  seats: EarlyAccessSeats;
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
  const left = seats?.seats_left;

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
        whatsapp: cleanPhone ? `${WHATSAPP_COUNTRY_CODE}${cleanPhone}` : null,
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
            {left !== undefined && <SeatsLeftPill left={Math.max(0, left)} />}
            <h3
              id="early-access-title"
              className={`text-xl font-semibold tracking-tight${left !== undefined ? " mt-2.5" : ""}`}
            >
              {left !== undefined && left <= 0 ? "Join the waitlist" : "Claim your seat"}
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
            No spam, no sales calls. Your details are used only to run the beta.
          </p>
        </form>
      </div>
    </div>
  );
}

const METER_SHELL =
  "mx-auto mt-6 w-full max-w-md rounded-2xl border border-[#E8E2D2] bg-white p-4 text-left";

function SeatMeter({ seats, status }: { seats: EarlyAccessSeats | null; status: SeatsStatus }) {
  const total = seats?.seats_total || BETA_SEATS;
  const claimed = seats ? Math.min(total, seats.seats_claimed) : 0;
  const [n, setN] = useState(0);
  // What the counter is currently showing. The animation runs from here rather
  // than from zero, so a poll that moves the figure by one ticks up by one
  // instead of replaying the whole count every 30 seconds.
  const shown = useRef(0);

  useEffect(() => {
    if (!seats) return;
    const from = shown.current;
    const delta = claimed - from;
    if (delta === 0) return;
    let raf = 0;
    let t0 = 0;
    const tick = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min((t - t0) / 900, 1);
      const v = Math.round(from + delta * (1 - Math.pow(1 - p, 3)));
      shown.current = v;
      setN(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [claimed, seats]);

  if (status === "loading") {
    return (
      <div className={METER_SHELL} aria-hidden>
        <div className="flex items-baseline justify-between gap-3">
          <span className="h-5 w-40 animate-pulse rounded bg-[#EDE6D6]" />
          <span className="h-6 w-24 animate-pulse rounded-full bg-[#EDE6D6]" />
        </div>
        <div className="mt-2 h-2.5 animate-pulse rounded-full bg-[#EDE6D6]" />
        <p className="mt-2 text-[12px] text-[#8A8275]">
          Seats are confirmed in sign-up order. When the bar fills, the beta closes.
        </p>
      </div>
    );
  }

  // Live count unreadable and never read. The page says less rather than
  // showing a number it cannot stand behind — the copy below still carries the
  // scarcity, and the button falls back to "Claim your seat".
  if (!seats) return null;

  return (
    <div className={METER_SHELL}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">
          <span className="text-xl font-bold tabular-nums">{n}</span> of {total} seats claimed
        </span>
        <SeatsLeftPill left={Math.max(0, seats.seats_left)} />
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#EDE6D6]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#E0B84A] to-[#C8321F] transition-[width] duration-1000 ease-out"
          style={{ width: `${total > 0 ? (n / total) * 100 : 0}%` }}
        />
      </div>
      <p className="mt-2 text-[12px] text-[#8A8275]">
        Seats are confirmed in sign-up order. When the bar fills, the beta closes.
      </p>
    </div>
  );
}

/* ─── Sections ─── */

function Nav({ left }: { left: number | undefined }) {
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
            MVP 2.0 Beta
          </span>
        </div>
        <a
          href="#join"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#111113] px-4 text-sm font-semibold text-[#F7F3EC] hover:bg-[#2F2F33] hover:text-[#F7F3EC]"
        >
          Become a tester
          {left !== undefined && (
            <span className="rounded-full bg-[#E0B84A] px-1.5 py-0.5 text-[10px] font-bold text-[#111113]">
              {Math.max(0, left)} left
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
        <SectionLabel>Private beta · 100 seats · Free</SectionLabel>
        <h1 className="mt-4 text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-6xl sm:leading-[1.08]">
          Be one of the <em className="font-display font-normal italic">100</em> who test the new
          Prozpr.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[#57534A]">
          MVP 2.0 is ready. Before we open it to everyone, we want 100 real investors to use it,
          break it, and shape it, and get the premium experience free while doing it.
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
    body: "Join a select circle of 100. All testers keep premium free for 6 months after launch. Top-grade testers hold the Founding Tester badge for life, with access to exclusive networking and investing events plus unique in-app benefits.",
    tag: "Lifetime badge",
  },
  {
    icon: Users,
    title: "A direct line to the builders",
    body: "A private WhatsApp group with the founders. Report something broken and watch it get fixed in days. Suggest a feature and see it ship. Your name in our launch credits, if you want it.",
    tag: "Shape the product",
  },
  {
    icon: Wallet,
    title: "Free premium portfolio assessment",
    body: "Upload or link your current mutual fund holdings and get a full premium health check: overlap, risk, expense drag, goal fit, with clear insights on what to fix. Paid at launch; free for testers.",
    tag: "Premium, free",
  },
  {
    icon: TrendingUp,
    title: "Unlimited advanced fund analysis",
    body: "Deep analysis and rankings across every mutual fund in India: returns, consistency, downside behaviour, manager record. No caps and no locked screens during the beta.",
    tag: "Unlimited",
  },
  {
    icon: Calculator,
    title: "A one-on-one portfolio review",
    body: "Every tester gets one 45-minute, one-on-one session: a thorough walkthrough of your portfolio, what is working, what is dragging, and how to structure it around your goals.",
    tag: "45 min, 1:1",
  },
  {
    icon: ShieldCheck,
    title: "Zero risk, zero cost",
    body: "No payment details, no real-money commitment, and read-only analysis of your portfolio. Leave the beta at any time and your data is deleted on request.",
    tag: "Safe by design",
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
    body: "Drop your email and WhatsApp number. Seats are confirmed in sign-up order, and you will hear from us within a day.",
  },
  {
    n: "02",
    title: "Get your invite",
    body: "You receive your beta login and join the testers' WhatsApp group. Setup takes under five minutes.",
  },
  {
    n: "03",
    title: "Use it like it's yours",
    body: "Assess your portfolio, analyse funds, and chat with Prozpr. About 15 minutes a week, on your schedule.",
  },
  {
    n: "04",
    title: "Tell us the truth",
    body: "One short feedback prompt a week. What confused you, what you loved, what's missing. That's the whole job.",
  },
];

function HowItWorks() {
  return (
    <section className="px-5 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <SectionLabel className="text-center">How the beta works</SectionLabel>
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
  "You enjoy being early, and don't mind telling us when something's rough.",
];

function WhoFor() {
  return (
    <section className="border-t border-[#E8E2D2] bg-[#111113] px-5 py-16 text-[#F7F3EC] sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionLabel className="!text-[#E0B84A]">Who we're looking for</SectionLabel>
          <h2 className="mt-3 text-[26px] font-semibold tracking-tight sm:text-4xl">
            This beta is for you if…
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#F7F3EC]/70">
            We're not looking for professional reviewers. We're looking for 100 everyday investors
            whose honest reactions decide what Prozpr becomes.
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

const FAQS = [
  {
    q: "Does it cost anything?",
    a: "No. The beta is completely free, including features that will be paid at launch. Testers also keep premium free for 6 months after launch.",
  },
  {
    q: "Do I have to invest real money?",
    a: "No. Prozpr 2.0 analyses and plans. You can test everything without moving a rupee, and what you do with the insights is entirely up to you.",
  },
  {
    q: "Is my data safe?",
    a: "Yes. Portfolio access is read-only, your details are used only to run the beta, and you can ask us to delete everything at any time.",
  },
  {
    q: "How much time does it take?",
    a: "Around 15 minutes a week. Use the product normally and answer one short feedback prompt. No calls or meetings unless you want them.",
  },
  {
    q: "Why do you need my WhatsApp number?",
    a: "The beta runs on WhatsApp: invites, updates, and the testers' group with the founders. We never use it for marketing.",
  },
  {
    q: "What if I sign up after all 100 seats are filled?",
    a: "You join the waitlist in order. Testers who go inactive free up seats every week, so waitlisted sign-ups do get in.",
  },
  {
    q: "Are you SEBI or AMFI registered?",
    a: "Not yet. We are in the process of obtaining AMFI and SEBI registration. During the beta, Prozpr provides educational analysis and insights only, not regulated investment advice or transactions.",
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
  const left = seats ? Math.max(0, seats.seats_left) : undefined;
  return (
    <section className="border-t border-[#E8E2D2] bg-white px-5 py-16 sm:py-20">
      <div className="mx-auto max-w-xl text-center">
        <h2 className="text-[26px] font-semibold tracking-tight sm:text-4xl">
          {left === undefined
            ? "The beta is filling up."
            : left > 0
              ? `${left} ${left === 1 ? "seat" : "seats"} left.`
              : "All seats are taken."}{" "}
          <em className="font-display font-normal italic">
            {left !== undefined && left <= 0 ? "The waitlist is open." : "Then the doors close."}
          </em>
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-[#57534A]">
          Free premium assessment, unlimited fund analysis, and a product that listens to you, in
          exchange for your honest opinion.
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
      <Nav left={seats?.seats_left} />
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
