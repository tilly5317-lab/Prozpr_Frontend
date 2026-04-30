import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Users,
  ChevronDown,
  Check,
  Settings,
  UserPlus,
  ShieldCheck,
  ArrowRightLeft,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useFamily } from "@/context/FamilyContext";
import { useTheme, type ThemeMode } from "@/context/ThemeContext";

const RELATIONSHIP_COLORS: Record<string, string> = {
  spouse: "bg-pink-500/15 text-pink-600",
  child: "bg-blue-500/15 text-blue-600",
  parent: "bg-amber-500/15 text-amber-600",
  sibling: "bg-emerald-500/15 text-emerald-600",
  grandparent: "bg-purple-500/15 text-purple-600",
  grandchild: "bg-cyan-500/15 text-cyan-600",
  other: "bg-slate-500/15 text-slate-600",
};

const ProfileSwitcher = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { members, activeView, switchToSelf, switchToMember, switchToCumulative } = useFamily();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const themeOptions: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
    { id: "light", label: "Light", Icon: Sun },
    { id: "dark", label: "Dark", Icon: Moon },
    { id: "system", label: "System", Icon: Monitor },
  ];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const userInitials =
    [user?.first_name?.[0], user?.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "U";

  const activeMembers = members.filter((m) => m.status === "active");
  const hasFamily = activeMembers.length > 0;

  const getActiveInitials = (): string => {
    if (activeView.type === "self") return userInitials;
    if (activeView.type === "cumulative") return "F";
    return activeView.member.member_initials || activeView.member.nickname[0].toUpperCase();
  };

  const isCumulative = activeView.type === "cumulative";
  const isSelf = activeView.type === "self";
  const isActingAs = activeView.type === "member";

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Active indicator when acting as someone else */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 rounded-full border pl-1 pr-2 py-1 transition-colors ${
          isActingAs
            ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
            : "border-border bg-card hover:bg-muted"
        }`}
        aria-label="Switch profile"
      >
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${
            isCumulative
              ? "bg-gradient-to-br from-primary/20 to-accent/20 text-primary"
              : isActingAs
              ? "bg-primary/15 text-primary"
              : "bg-accent/10 text-accent"
          }`}
        >
          {isCumulative ? (
            <Users className="h-3.5 w-3.5" />
          ) : (
            getActiveInitials()
          )}
        </div>
        {isActingAs && (
          <span className="text-[9px] font-semibold text-primary max-w-[60px] truncate">
            {activeView.member.nickname}
          </span>
        )}
        {(hasFamily || isActingAs) && (
          <ChevronDown
            className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1.5 z-50 w-72 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
          >
            {/* Acting-as banner */}
            {isActingAs && (
              <div className="px-3 py-2 bg-primary/5 border-b border-primary/10 flex items-center gap-2">
                <ArrowRightLeft className="h-3 w-3 text-primary shrink-0" />
                <p className="text-[10px] text-primary font-medium">
                  Acting as <span className="font-semibold">{activeView.member.nickname}</span> — full access
                </p>
              </div>
            )}

            <div className="px-3 pt-2.5 pb-1">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">
                Switch Account
              </p>
            </div>

            {/* Self */}
            <button
              onClick={() => {
                switchToSelf();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent shrink-0">
                {userInitials}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-semibold text-foreground truncate">
                  {[user?.first_name, user?.last_name].filter(Boolean).join(" ") || "My Account"}
                </p>
                <p className="text-[10px] text-muted-foreground">Your account</p>
              </div>
              {isSelf && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>

            {/* Verified family members */}
            {activeMembers.length > 0 && (
              <>
                <div className="h-px bg-border/40 mx-3" />
                <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">
                    Family
                  </p>
                  <ShieldCheck className="h-2.5 w-2.5 text-emerald-500" />
                </div>
                {activeMembers.map((m) => {
                  const isActive =
                    activeView.type === "member" && activeView.member.id === m.id;
                  const colorCls =
                    RELATIONSHIP_COLORS[m.relationship_type] || RELATIONSHIP_COLORS.other;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        switchToMember(m);
                        setOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 ${colorCls}`}
                      >
                        {m.member_initials || m.nickname[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {m.nickname}
                        </p>
                        <p className="text-[10px] text-muted-foreground capitalize">
                          {m.relationship_type} · Full access
                        </p>
                      </div>
                      {isActive && (
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {/* Cumulative */}
            {activeMembers.length > 0 && (
              <>
                <div className="h-px bg-border/40 mx-3" />
                <button
                  onClick={() => {
                    switchToCumulative();
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-accent/15 shrink-0">
                    <Users className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-semibold text-foreground">
                      Family Portfolio
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Combined view · {activeMembers.length + 1} members
                    </p>
                  </div>
                  {isCumulative && (
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </button>
              </>
            )}

            {/* Appearance — Light / Dark / System */}
            <div className="h-px bg-border/40" />
            <div className="px-3 pt-2 pb-1.5">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5">
                Appearance
              </p>
              <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
                {themeOptions.map(({ id, label, Icon }) => {
                  const active = themeMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setThemeMode(id)}
                      className={`flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-[10px] font-medium transition-colors ${
                        active
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      aria-pressed={active}
                      aria-label={`Use ${label.toLowerCase()} theme`}
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="h-px bg-border/40" />
            <div className="px-1.5 py-1.5 flex gap-1">
              <button
                onClick={() => {
                  setOpen(false);
                  navigate("/family");
                }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[10px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              >
                <UserPlus className="h-3 w-3" />
                Manage Family
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  navigate("/profile");
                }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[10px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              >
                <Settings className="h-3 w-3" />
                {isActingAs ? `${activeView.member.nickname}'s Profile` : "My Profile"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProfileSwitcher;
