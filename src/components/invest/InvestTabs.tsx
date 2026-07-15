import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

/**
 * Top toggle for the Invest section — Rebalancing (`/invest/rebalance-explanation`)
 * ↔ SIP (`/invest/sip`). The gold pill is a shared-layout element (`layoutId`)
 * with a bouncy spring, so it slides + wobbles like liquid jelly when you switch.
 * Rendered by `InvestLayout` (persists across the route change) — that
 * persistence is what makes the pill animate instead of re-mounting.
 */
const InvestTabs = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeKey = pathname.startsWith("/invest/sip")
    ? "sip"
    : pathname.startsWith("/invest/lumpsum")
      ? "lumpsum"
      : "rebalance-explanation";

  const tabs = [
    { key: "rebalance-explanation", label: "Rebalancing" },
    { key: "sip", label: "SIP" },
    { key: "lumpsum", label: "Lump sum" },
  ] as const;

  return (
    <div className="px-5 pt-10 pb-1.5">
      <div className="relative flex rounded-full border border-[#D4A868]/25 bg-card p-0.5">
        {tabs.map((t) => {
          const active = t.key === activeKey;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => navigate(`/invest/${t.key}`)}
              className="relative z-10 flex-1 rounded-full py-1.5 text-[12.5px] font-semibold"
            >
              {active && (
                <motion.span
                  layoutId="invest-toggle-pill"
                  className="absolute inset-0 -z-10 rounded-full shadow-sm"
                  style={{ backgroundColor: "#D4A868" }}
                  transition={{ type: "spring", stiffness: 280, damping: 14, mass: 1.1 }}
                />
              )}
              <span
                className={`relative transition-colors duration-200 ${active ? "" : "text-muted-foreground"}`}
                style={active ? { color: "#1a1206" } : undefined}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default InvestTabs;
