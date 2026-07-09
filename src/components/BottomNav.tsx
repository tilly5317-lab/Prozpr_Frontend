import { Home, Compass, MessageSquare, Target, Bell } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { listNotifications } from "@/lib/api";

const tabs = [
  { icon: MessageSquare, label: "Chat", path: "/chat" },
  { icon: Home, label: "Portfolio", path: "/portfolio" },
  { icon: Compass, label: "Invest", path: "/invest/rebalance-explanation" },
  { icon: Target, label: "Goals", path: "/goal-planner" },
  { icon: Bell, label: "Alerts", path: "/notifications" },
];

/** Fired (window event) whenever notifications are read/changed so the badge re-syncs live. */
export const NOTIFICATIONS_CHANGED_EVENT = "notifications:changed";

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  // Drive the Alerts badge off the real unread count. Refetch on mount and
  // whenever the Notifications page signals a change (mark read / mark all read).
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const rows = await listNotifications();
        if (!cancelled) setUnreadCount(rows.filter((n) => !n.is_read).length);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    };
    void refresh();
    const onChanged = () => void refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    };
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-xl border-t border-border/50">
      <div className="max-w-md mx-auto flex items-center justify-around py-2 pb-[env(safe-area-inset-bottom,8px)]">
        {tabs.map((tab) => {
          const isActive =
            location.pathname === tab.path ||
            (tab.path === "/invest/rebalance-explanation" &&
              (location.pathname.startsWith("/invest") ||
                location.pathname === "/execute" ||
                location.pathname.startsWith("/rebalance")));
          // Only the Alerts tab carries a badge, and only when there are unread items.
          const badge = tab.path === "/notifications" ? unreadCount : 0;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="relative flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors"
            >
              <div className="relative">
                <tab.icon
                  className={`h-5 w-5 transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground/60"
                  }`}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-destructive px-0.5 text-[8px] font-bold text-destructive-foreground">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] font-medium transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground/50"
                }`}
              >
                {tab.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="bottomnav-indicator"
                  className="absolute -top-0.5 h-0.5 w-6 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
