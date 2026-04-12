import { useNavigate } from "react-router-dom";
import { DiscoverScreen } from "@/components/discover/DiscoverScreen";

const Discovery = () => {
  const navigate = useNavigate();
  const goExecute = () => navigate("/execute");
  return (
    <DiscoverScreen
      title="Discover"
      subtitle="Top-rated funds, curated for you"
      onBack={() => navigate("/")}
      showRecommendedPlanCard
      showPlanReadyPopup
      onRecommendedPlanClick={goExecute}
      onStartInvesting={goExecute}
      onInvestNow={goExecute}
      primaryCtaLabel="Start Investing"
    />
  );
};

export default Discovery;
