import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Pre-launch holding page. Every route renders this while the product is gated
 * (see App.tsx).
 *
 *   1. intro   — the "Prozpr" logo + tagline fade in slowly.
 *   2. compact — the logo + tagline shrink and rise, then "Coming Soon"
 *                (the headline message) fades in, centred.
 *
 * Built as live type so it adapts to system light/dark.
 */
const ComingSoon = () => {
  const reduce = useReducedMotion();
  const [compact, setCompact] = useState(reduce);

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setCompact(true), 3000);
    return () => clearTimeout(t);
  }, [reduce]);

  const ease = [0.22, 1, 0.36, 1] as const;
  const reveal = (delay: number) => ({
    delay: reduce ? 0 : delay,
    duration: reduce ? 0 : 1.1,
    ease,
  });

  return (
    <div className="cs-root">
      <style>{cssText}</style>

      {/* Logo lockup — fades in, then shrinks and rises on `compact` */}
      <motion.div
        className="cs-logo"
        animate={compact ? { scale: 0.62, y: -78 } : { scale: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.9, ease }}
      >
        <motion.h1
          className="cs-wordmark"
          aria-label="Prozpr"
          initial={{ opacity: 0, y: 16, filter: "blur(12px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={reveal(0.2)}
        >
          Pr<span className="cs-o">o</span>zpr
        </motion.h1>

        <motion.div
          className="cs-tagline"
          initial={{ opacity: 0, letterSpacing: "0.6em" }}
          animate={{ opacity: 1, letterSpacing: "0.38em" }}
          transition={reveal(0.7)}
        >
          Wealth, Unified.
        </motion.div>
      </motion.div>

      {/* Coming Soon — the headline message; centred, appears after compaction */}
      <motion.div
        className="cs-soon"
        initial={{ opacity: 0, y: 18 }}
        animate={compact ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
        transition={{ delay: reduce ? 0 : 0.45, duration: reduce ? 0 : 0.85, ease }}
      >
        <span className="cs-soon-dot" />
        Coming Soon
      </motion.div>
    </div>
  );
};

const cssText = `
.cs-root {
  --cs-gold: #c1922f;

  position: fixed;
  inset: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  font-family: "DM Sans", system-ui, sans-serif;
  color: #1a2238;
  background:
    radial-gradient(900px 600px at 50% 34%, rgba(193,146,47,0.10) 0%, rgba(193,146,47,0) 60%),
    linear-gradient(160deg, #faf9f5 0%, #eef0f4 100%);
}
:where(html.dark) .cs-root {
  --cs-gold: #e2bd6b;
  color: #f0efe9;
  background:
    radial-gradient(900px 600px at 50% 32%, rgba(226,189,107,0.13) 0%, rgba(226,189,107,0) 60%),
    linear-gradient(160deg, #16181c 0%, #0c0d0f 100%);
}

/* ── Logo lockup ── */
.cs-logo {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.cs-wordmark {
  font-family: "Instrument Serif", Georgia, serif;
  font-weight: 400;
  font-size: clamp(52px, 13vw, 86px);
  line-height: 1;
  letter-spacing: -0.005em;
  margin: 0;
  white-space: nowrap;
}
.cs-o { color: var(--cs-gold); }

.cs-tagline {
  margin-top: 16px;
  font-size: clamp(10px, 2.6vw, 13px);
  font-weight: 600;
  text-transform: uppercase;
  color: var(--cs-gold);
}

/* ── Coming Soon (headline message, centred) ── */
.cs-soon {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  font-size: clamp(24px, 6vw, 40px);
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.92;
}
.cs-soon-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--cs-gold);
  animation: cs-ping 2.4s ease-in-out infinite;
}
@keyframes cs-ping {
  0%   { box-shadow: 0 0 0 0 rgba(193,146,47,0.55); }
  70%  { box-shadow: 0 0 0 14px rgba(193,146,47,0); }
  100% { box-shadow: 0 0 0 0 rgba(193,146,47,0); }
}

@media (prefers-reduced-motion: reduce) {
  .cs-soon-dot { animation: none; }
}
`;

export default ComingSoon;
