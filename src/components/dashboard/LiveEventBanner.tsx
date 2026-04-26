import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Crown, MapPin, Calendar, Clock, X } from "lucide-react";

const GOLD = "#d4a868";
const GOLD_SOFT = "rgba(212, 168, 104, 0.55)";

const EVENT = {
  title: "Beyoncé · Live in Mumbai",
  venue: "Jio World Garden, BKC",
  date: "Sat 14 Nov 2026",
  time: "Doors 7pm · Show 8:30pm",
};

interface Attendee {
  initial: string;
  name: string;
  tagline: string;
  color: string;
}

const ATTENDEES: Attendee[] = [
  { initial: "AM", name: "Aisha Mehta", tagline: "Investor · Mumbai", color: "#7b4f8f" },
  { initial: "RP", name: "Raj Patel", tagline: "Founder · Bangalore", color: "#3d6b7c" },
  { initial: "PI", name: "Priya Iyer", tagline: "Designer · Delhi", color: "#a6614a" },
  { initial: "DW", name: "Daniel Wong", tagline: "VC · Singapore", color: "#5c7c3d" },
  { initial: "SK", name: "Sara Khan", tagline: "Architect · Mumbai", color: "#8c6a2b" },
  { initial: "TP", name: "Tom Patel", tagline: "Friend · Mumbai", color: "#7e5a40" },
];

const TOTAL_ATTENDING = 52;

const LiveEventBanner = () => {
  const [open, setOpen] = useState(false);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative block w-full overflow-hidden rounded-[14px] text-left active:scale-[0.99] transition-transform"
        style={{
          background: "linear-gradient(135deg, #1f1d1a 0%, #2a2622 50%, #1f1d1a 100%)",
          border: `1px solid ${GOLD_SOFT}`,
          boxShadow:
            "0 0 0 1px rgba(212, 168, 104, 0.08), 0 6px 24px -10px rgba(0, 0, 0, 0.45)",
        }}
      >
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Crown className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
            <span
              className="text-[9px] uppercase font-semibold"
              style={{ letterSpacing: "1.5px", color: GOLD }}
            >
              Gold tier · Exclusive
            </span>
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white/80"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              Nov 2026
            </span>
          </div>

          <p className="text-[15px] font-semibold text-white leading-tight">
            Beyoncé · Live in Mumbai
          </p>
          <p className="text-[11px] text-white/55 mt-0.5">
            Prozpr Box Office · Members-only night
          </p>

          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-[10px] text-white/45">{TOTAL_ATTENDING} members joining</span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{
                backgroundColor: "rgba(212, 168, 104, 0.14)",
                color: GOLD,
                border: `1px solid ${GOLD_SOFT}`,
              }}
            >
              Reserve seat
              <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </button>

      <AnimatePresence>{open && <ReserveSheet onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
};

const ReserveSheet = ({ onClose }: { onClose: () => void }) => {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center z-[60] px-0 sm:px-4"
        role="dialog"
        aria-modal="true"
        aria-label="Reserve a seat for Beyoncé · Live in Mumbai"
      >
        <div
          className="mx-auto w-full max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
          style={{
            // Soho-house feel — warm sand in light, deep warm charcoal in dark.
            background: "linear-gradient(180deg, #f5efe3 0%, #efe6d3 100%)",
            color: "#27241f",
            maxHeight: "min(92dvh, 720px)",
            boxShadow: "0 20px 60px -20px rgba(0,0,0,0.6)",
          }}
        >
          {/* Hero strip */}
          <div
            className="relative px-5 pt-5 pb-4"
            style={{
              background:
                "linear-gradient(135deg, #2a2622 0%, #3a322a 50%, #2a2622 100%)",
            }}
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 h-7 w-7 rounded-full flex items-center justify-center text-white/80 hover:text-white"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center gap-1.5 mb-2.5">
              <Crown className="h-3.5 w-3.5" style={{ color: GOLD }} />
              <span
                className="text-[9px] uppercase font-semibold"
                style={{ letterSpacing: "2px", color: GOLD }}
              >
                Members invitation · Gold
              </span>
            </div>

            <h2
              className="font-display text-[28px] leading-tight text-white tracking-tight"
              style={{ fontFamily: "Instrument Serif, Georgia, serif" }}
            >
              Beyoncé
            </h2>
            <p
              className="font-display text-[15px] text-white/75 italic leading-tight mt-0.5"
              style={{ fontFamily: "Instrument Serif, Georgia, serif" }}
            >
              Live in Mumbai
            </p>

            <div className="mt-4 grid grid-cols-1 gap-1.5 text-[11px] text-white/75">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" style={{ color: GOLD }} />
                <span>{EVENT.date}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3" style={{ color: GOLD }} />
                <span>{EVENT.venue}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" style={{ color: GOLD }} />
                <span>{EVENT.time}</span>
              </div>
            </div>
          </div>

          {/* Attendees */}
          <div className="px-5 pt-4 pb-3 overflow-y-auto" style={{ flex: 1 }}>
            <div className="flex items-baseline justify-between mb-2.5">
              <p
                className="text-[10px] uppercase font-semibold"
                style={{ letterSpacing: "1.6px", color: "#5c5247" }}
              >
                Members attending
              </p>
              <p
                className="text-[11px] font-semibold"
                style={{ color: "#27241f", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
                {TOTAL_ATTENDING}+ joining
              </p>
            </div>

            {/* Stacked avatars */}
            <div className="flex items-center mb-4">
              <div className="flex -space-x-2">
                {ATTENDEES.slice(0, 5).map((a) => (
                  <div
                    key={a.name}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{
                      backgroundColor: a.color,
                      border: "2px solid #f5efe3",
                    }}
                    aria-hidden="true"
                  >
                    {a.initial}
                  </div>
                ))}
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{
                    backgroundColor: "#e6dcc6",
                    color: "#5c5247",
                    border: "2px solid #f5efe3",
                  }}
                  aria-hidden="true"
                >
                  +{TOTAL_ATTENDING - ATTENDEES.length}
                </div>
              </div>
              <p className="ml-3 text-[11px]" style={{ color: "#5c5247" }}>
                including <span className="font-semibold" style={{ color: "#27241f" }}>Tom</span> and 5 of your friends
              </p>
            </div>

            {/* Member list */}
            <div className="space-y-2">
              {ATTENDEES.map((a) => (
                <div
                  key={a.name}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: "rgba(255,255,255,0.55)" }}
                >
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold text-white shrink-0"
                    style={{ backgroundColor: a.color }}
                    aria-hidden="true"
                  >
                    {a.initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold leading-tight" style={{ color: "#27241f" }}>
                      {a.name}
                    </p>
                    <p className="text-[10.5px] leading-tight mt-0.5" style={{ color: "#7a6d5e" }}>
                      {a.tagline}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer actions */}
          <div
            className="px-5 py-4 flex items-center gap-2"
            style={{ borderTop: "1px solid rgba(0,0,0,0.08)", backgroundColor: "rgba(255,255,255,0.4)" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full py-2.5 text-[12px] font-medium"
              style={{
                color: "#5c5247",
                border: "1px solid rgba(0,0,0,0.12)",
                backgroundColor: "transparent",
              }}
            >
              Maybe later
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full py-2.5 text-[12px] font-bold flex items-center justify-center gap-1"
              style={{
                backgroundColor: "#27241f",
                color: "#f5efe3",
              }}
            >
              Reserve seat
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default LiveEventBanner;
