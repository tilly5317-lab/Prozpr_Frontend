import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const ProfileButton = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const initials =
    [user?.first_name?.[0], user?.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "U";

  return (
    <button
      onClick={() => navigate("/profile")}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-foreground transition-colors hover:bg-muted"
      aria-label="Open profile"
    >
      {initials}
    </button>
  );
};

export default ProfileButton;
