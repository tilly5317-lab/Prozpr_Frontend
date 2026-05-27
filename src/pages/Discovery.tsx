import { useNavigate } from "react-router-dom";
import { DiscoverScreen } from "@/components/discover/DiscoverScreen";

const Discovery = () => {
  const navigate = useNavigate();
  const goRebalanceExplanation = () => navigate("/rebalance-explanation");
  return (
    <DiscoverScreen
      title="Discover"
      subtitle="Top-rated funds, curated for you"
      onBack={() => navigate("/")}
      showRecommendedPlanCard
      showPlanReadyPopup
      onRecommendedPlanClick={goRebalanceExplanation}
      onStartInvesting={goRebalanceExplanation}
      onInvestNow={goRebalanceExplanation}
      primaryCtaLabel="Start Investing"
    />
  );
};

export default Discovery;
