import { ArrowRight, Crown } from "lucide-react";

const LiveEventBanner = () => {
  return (
    <button
      type="button"
      className="relative block w-full overflow-hidden rounded-[14px] text-left active:scale-[0.99] transition-transform animate-glow-pulse"
      style={{
        background:
          "linear-gradient(135deg, #8a5a14 0%, #c89234 35%, #f4d089 55%, #c89234 80%, #8a5a14 100%)",
        border: "1px solid rgba(255, 220, 130, 0.55)",
      }}
    >
      {/* Diagonal sheen sweep — moves left → right on a loop */}
      <span
        className="animate-shimmer-sweep absolute top-0 -left-1/3 h-full w-1/3 pointer-events-none"
        style={{
          background:
            "linear-gradient(to right, transparent, rgba(255,255,255,0.55), transparent)",
        }}
        aria-hidden="true"
      />

      {/* Subtle dark vignette so white text always reads even on the bright gold sheen */}
      <span
        className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 100%)" }}
        aria-hidden="true"
      />

      <div className="relative px-4 py-3.5">
        {/* Top row: tier badge + date pill */}
        <div className="flex items-center gap-1.5 mb-2">
          <Crown className="h-3.5 w-3.5 text-white" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }} />
          <span
            className="text-[9px] uppercase font-bold text-white"
            style={{ letterSpacing: "1.5px", textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
          >
            Gold tier · Exclusive
          </span>
          <span
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-black/25 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-white"
            style={{ border: "1px solid rgba(255,255,255,0.25)" }}
          >
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-80 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            Nov 2026
          </span>
        </div>

        {/* Title + subtitle */}
        <p
          className="text-[16px] font-bold text-white leading-tight"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
        >
          Beyoncé · Live in Mumbai 🎤
        </p>
        <p
          className="text-[11px] text-white/90 mt-0.5"
          style={{ textShadow: "0 1px 1px rgba(0,0,0,0.25)" }}
        >
          Prozpr Box Office · Members-only night
        </p>

        {/* CTA row */}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="text-[10px] text-white/85" style={{ textShadow: "0 1px 1px rgba(0,0,0,0.25)" }}>
            Limited seats — gold tier first
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-bold"
            style={{ color: "#7a4f0d" }}
          >
            Reserve seat
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </button>
  );
};

export default LiveEventBanner;
