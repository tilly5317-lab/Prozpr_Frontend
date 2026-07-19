import { motion } from "framer-motion";
import { Gift, ChevronRight, TrendingUp, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav, { NOTIFICATIONS_CHANGED_EVENT } from "@/components/BottomNav";
import {
  listNotifications,
  markNotificationAsRead,
  type NotificationInfo,
} from "@/lib/api";

/** Notify the bottom-nav badge that the unread count may have changed. */
const notifyNotificationsChanged = () =>
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));

const Notifications = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const rows = await listNotifications();
        setItems(rows);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const getIcon = (type: string) => {
    const t = (type || "").toLowerCase();
    if (t.includes("call") || t.includes("meeting")) return Video;
    return t.includes("rebalance") || t.includes("portfolio") ? TrendingUp : Gift;
  };

  const openNotification = async (item: NotificationInfo) => {
    if (!item.is_read) {
      try {
        await markNotificationAsRead(item.id);
      } catch {
        // Ignore read errors and still allow navigation.
      }
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
      notifyNotificationsChanged();
    }
    if (item.action_url) {
      // External links (e.g. a Zoom join URL) open in a new tab; app paths navigate in-place.
      if (/^https?:\/\//i.test(item.action_url)) {
        window.open(item.action_url, "_blank", "noopener,noreferrer");
      } else {
        navigate(item.action_url);
      }
      return;
    }
    navigate("/profile/complete");
  };

  return (
    <div className="mobile-container bg-background pb-20 min-h-screen">
      <div className="px-5 pt-10 pb-3">
        <h1 className="text-lg font-semibold text-foreground">Notifications</h1>
      </div>

      <div className="px-5">
        {loading ? (
          <p className="text-sm text-muted-foreground/70">Loading notifications...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground/70">No notifications yet.</p>
        ) : (
          items.map((item, idx) => {
            const Icon = getIcon(item.notification_type);
            return (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(idx, 5) * 0.05 }}
                onClick={() => void openNotification(item)}
                className="w-full text-left wealth-card !p-4 border border-accent/15 relative overflow-hidden mt-3 first:mt-0"
              >
                {!item.is_read ? (
                  <div className="absolute top-2.5 right-2.5">
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">New</span>
                  </div>
                ) : null}
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                    <Icon className="h-4 w-4 text-accent" />
                  </div>
                  <div className="flex-1 pr-8">
                    <p className="text-sm font-semibold text-foreground mb-0.5">{item.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.message}</p>
                  </div>
                </div>
                <div className="flex items-center justify-end mt-2">
                  <span className="text-[11px] font-medium text-accent flex items-center gap-0.5">
                    Open <ChevronRight className="h-3 w-3" />
                  </span>
                </div>
              </motion.button>
            );
          })
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Notifications;
