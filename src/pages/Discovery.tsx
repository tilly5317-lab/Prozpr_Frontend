import { useNavigate } from "react-router-dom";
import { MfExploreHub } from "@/components/discover/MfExploreHub";

const Discovery = () => {
  const navigate = useNavigate();
  return <MfExploreHub onBack={() => navigate("/")} />;
};

export default Discovery;
