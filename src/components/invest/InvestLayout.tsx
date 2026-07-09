import { Outlet } from "react-router-dom";
import InvestTabs from "@/components/invest/InvestTabs";

/**
 * Shared layout for the Invest section. Renders the top toggle ONCE so it
 * PERSISTS across the Rebalancing ↔ SIP route change — that persistence is what
 * lets the gold pill slide/wobble (the "liquid jelly" layout animation) instead
 * of re-mounting. Each child page keeps its own mobile-container + BottomNav; the
 * toggle sits in a matching max-w-md strip directly above it.
 */
const InvestLayout = () => (
  <>
    <div className="mx-auto max-w-md bg-background">
      <InvestTabs />
    </div>
    <Outlet />
  </>
);

export default InvestLayout;
