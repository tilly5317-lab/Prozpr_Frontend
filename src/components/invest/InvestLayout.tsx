import { Outlet } from "react-router-dom";
import InvestTabs from "@/components/invest/InvestTabs";

/**
 * Shared layout for the Invest section. Renders the top toggle ONCE so it
 * PERSISTS across the Rebalancing ↔ SIP ↔ Lump sum ↔ Preferences route change
 * — that persistence is what lets the gold pill slide/wobble instead of
 * re-mounting.
 */
const InvestLayout = () => {
  return (
    <>
      <div className="mx-auto max-w-md bg-background">
        <InvestTabs />
      </div>
      <Outlet />
    </>
  );
};

export default InvestLayout;
