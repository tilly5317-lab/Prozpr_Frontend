import { Home, Compass, MessageSquare, Target, LayoutGrid, Bell, Droplet } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listNotifications } from "@/lib/api";

const tabs = [
  { icon: MessageSquare, label: "Chat", path: "/chat" },
  { icon: Home, label: "Portfolio", path: "/portfolio" },
  { icon: Compass, label: "Invest", path: "/invest/rebalance-explanation" },
  { icon: Target, label: "Goals", path: "/goal-planner" },
];

// Options collapsed under the "More" tab.
const moreItems = [
  { icon: Bell, label: "Alerts", path: "/notifications", showBadge: true, comingSoon: false },
  { icon: Droplet, label: "Liquid funds", path: "/liquid-funds", showBadge: false, comingSoon: true },
];

/**
 * CSS variable (on <html>) holding this bar's measured height. The height is not
 * a constant: the safe-area inset adds to it on a home-screen install and is
 * zero inside a browser tab. Anything pinned directly above the bar reads this
 * rather than assuming a number — a guess leaves a gap or an overlap.
 */
export const BOTTOM_NAV_HEIGHT_VAR = "--bottom-nav-h";

/** Fired (window event) whenever notifications are read/changed so the badge re-syncs live. */
export const NOTIFICATIONS_CHANGED_EVENT = "notifications:changed";

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

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

  // Publish the bar's height (see BOTTOM_NAV_HEIGHT_VAR). Left in place on
  // unmount: every screen that reads it mounts its own BottomNav, which
  // overwrites it, and clearing here could wipe the next screen's value.
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty(BOTTOM_NAV_HEIGHT_VAR, `${el.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const moreActive = moreItems.some((m) => m.path === location.pathname);

  const go = (path: string) => {
    setMoreOpen(false);
    navigate(path);
  };

  return (
    <>
      {/* More menu — Alerts + Liquid funds, floating above the nav bar */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setMoreOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="fixed bottom-[72px] left-0 right-0 z-50 px-3"
            >
              <div className="mx-auto flex max-w-md justify-end">
                <div className="w-48 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                  {moreItems.map((item) => {
                    const active = location.pathname === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => go(item.path)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                      >
                        <div className="relative">
                          <item.icon
                            className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`}
                            strokeWidth={1.8}
                          />
                          {item.showBadge && unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold text-destructive-foreground">
                              {unreadCount > 9 ? "9+" : unreadCount}
                            </span>
                          )}
                        </div>
                        <span className={`text-[13px] font-medium ${active ? "text-primary" : "text-foreground"}`}>
                          {item.label}
                        </span>
                        {item.comingSoon && (
                          <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Soon
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav ref={navRef} className="fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-xl border-t border-border/50">
        <div className="max-w-md mx-auto flex items-center justify-around py-2 pb-[env(safe-area-inset-bottom,8px)]">
          {tabs.map((tab) => {
            const isActive =
              location.pathname === tab.path ||
              (tab.path === "/invest/rebalance-explanation" &&
                (location.pathname.startsWith("/invest") ||
                  location.pathname.startsWith("/rebalance")));
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
                </div>
                <span
                  className={`text-[11px] font-medium transition-colors ${
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

          {/* More tab — toggles the menu with Alerts + Liquid funds */}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className="relative flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors"
            aria-label="More"
          >
            <div className="relative">
              <LayoutGrid
                className={`h-5 w-5 transition-colors ${
                  moreActive || moreOpen ? "text-primary" : "text-muted-foreground/60"
                }`}
                strokeWidth={moreActive || moreOpen ? 2.2 : 1.8}
              />
              {/* Surface the unread badge on the collapsed More tab too. */}
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            <span
              className={`text-[11px] font-medium transition-colors ${
                moreActive || moreOpen ? "text-primary" : "text-muted-foreground/50"
              }`}
            >
              More
            </span>
            {moreActive && (
              <motion.div
                layoutId="bottomnav-indicator"
                className="absolute -top-0.5 h-0.5 w-6 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        </div>
      </nav>
    </>
  );
};

export default BottomNav;
