import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Pencil, Check, ChevronRight, ChevronDown,
  MessageSquareText, Calculator, BarChart3, Users, Briefcase, AlertCircle, LogOut, UploadCloud, Bug, FileText,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import ReportIssueDialog from "@/components/ReportIssueDialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import {
  updateMe,
  changePin,
  getFullProfile,
  getAboutYouStatus,
  updatePersonalInfo,
  BackendOfflineError,
  type FullProfileResponse,
  type UserUpdatePayload,
} from "@/lib/api";

/* ── tiny helpers ── */

const EmptyHint = ({ label }: { label: string }) => (
  <span className="text-[11px] italic text-muted-foreground/60">
    {label} — tap edit to add
  </span>
);

const FieldRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
    {value ? (
      <p className="text-xs text-foreground">{value}</p>
    ) : (
      <EmptyHint label={`No ${label.toLowerCase()}`} />
    )}
  </div>
);

const SectionCard = ({
  title,
  icon: Icon,
  completeness,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ElementType;
  completeness: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <div className="wealth-card !p-0 overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        {completeness < 100 && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="h-1 flex-1 max-w-[80px] rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${completeness}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{completeness}%</span>
          </div>
        )}
        {completeness === 100 && (
          <span className="text-[10px] font-medium text-[hsl(160,50%,38%)]">Complete</span>
        )}
      </div>
      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
    </button>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="px-3 pb-3 pt-0.5 border-t border-border/30">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

/* ── reusable sub-components (outside Profile to preserve identity across renders) ── */
const ProfileInput = ({ value, onChange, placeholder, prefix }: { value: string; onChange: (v: string) => void; placeholder?: string; prefix?: string }) => (
  <div className="relative">
    {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{prefix}</span>}
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary transition-colors ${prefix ? "pl-6" : ""}`}
    />
  </div>
);

/** 4-digit PIN entry — masked, numeric-only, and capped at 4 so the field can
    never hold something the backend will reject. */
const PinInput = ({
  value,
  onChange,
  placeholder,
  autoFocus,
}: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) => (
  <input
    type="password"
    inputMode="numeric"
    autoComplete="off"
    maxLength={4}
    autoFocus={autoFocus}
    value={value}
    onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
    placeholder={placeholder}
    className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs tracking-[0.4em] text-foreground outline-none focus:border-primary transition-colors placeholder:tracking-normal"
  />
);

const ProfileChip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-all ${active ? "bg-accent text-accent-foreground border-accent" : "bg-card text-muted-foreground border-border hover:border-accent/40"}`}
  >
    {label}
  </button>
);

const EditSaveBtn = ({ editing, onEdit, onSave }: { editing: boolean; onEdit: () => void; onSave: () => void }) => (
  <button
    onClick={editing ? onSave : onEdit}
    className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
  >
    {editing ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
    {editing ? "Save" : "Edit"}
  </button>
);

/* ── main ── */
const Profile = () => {
  const navigate = useNavigate();
  const { user, refresh, signOut } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<FullProfileResponse | null>(null);
  const [openSection, setOpenSection] = useState<string | null>(null);
  /* Whether all four "Tell Us More About You" sections are confirmed — drives
     the nudge dot on that card. Defaults to false so the dot shows until we
     know the profile is fully complete. */
  const [aboutYouConfirmed, setAboutYouConfirmed] = useState(false);

  /* editable contact fields */
  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState({
    first_name: "",
    last_name: "",
    email: "",
  });

  /* PIN change — kept out of `contactDraft` so a credential is never written by
     the same Save that edits a display name. */
  const [changingPin, setChangingPin] = useState(false);
  const [pinDraft, setPinDraft] = useState({ current: "", next: "", confirm: "" });
  const [pinError, setPinError] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  /* editable personal info */
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [personalDraft, setPersonalDraft] = useState({
    occupation: "",
    family_status: "",
    wealth_sources: [] as string[],
    personal_values: "",
    address: "",
  });

  /* ── load data ── */
  useEffect(() => {
    if (user) {
      setContactDraft({
        first_name: user.first_name ?? "",
        last_name: user.last_name ?? "",
        email: user.email ?? "",
      });
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getFullProfile();
        if (cancelled) return;
        setProfile(p);

        if (p.personal_info) {
          const pi = p.personal_info;
          setPersonalDraft({
            occupation: pi.occupation ?? "",
            family_status: pi.family_status ?? "",
            wealth_sources: pi.wealth_sources ?? [],
            personal_values: pi.personal_values?.join(", ") ?? "",
            address: pi.address ?? "",
          });
        }

      } catch {
        // first-time user
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* "Tell Us More About You" completeness — same rule as CompleteProfile's
     section cards. Resolved independently so it never blocks the page render. */
  useEffect(() => {
    let cancelled = false;
    getAboutYouStatus()
      .then((s) => { if (!cancelled) setAboutYouConfirmed(s.allConfirmed); })
      .catch(() => { /* leave the dot visible if status can't be resolved */ });
    return () => { cancelled = true; };
  }, []);

  /* ── save handlers ── */
  const saveContact = useCallback(async () => {
    try {
      const payload: UserUpdatePayload = {};
      if (contactDraft.first_name) payload.first_name = contactDraft.first_name;
      if (contactDraft.last_name) payload.last_name = contactDraft.last_name;
      if (contactDraft.email) payload.email = contactDraft.email;
      await updateMe(payload);
      await refresh();
      setEditingContact(false);
      toast.success("Contact info updated");
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }, [contactDraft, refresh]);

  const closePinForm = useCallback(() => {
    setChangingPin(false);
    setPinDraft({ current: "", next: "", confirm: "" });
    setPinError("");
  }, []);

  const savePin = useCallback(async () => {
    const { current, next, confirm } = pinDraft;
    if (!/^\d{4}$/.test(next)) {
      setPinError("Your new PIN must be exactly 4 digits");
      return;
    }
    if (next !== confirm) {
      setPinError("The two new PINs don't match");
      return;
    }
    if (next === current) {
      setPinError("That's already your PIN — pick a different one");
      return;
    }
    setPinError("");
    setSavingPin(true);
    try {
      // `current` is sent even when blank; the backend decides whether an
      // account without a PIN yet may set one without proving the old one.
      await changePin({ current_pin: current || undefined, new_pin: next });
      closePinForm();
      toast.success("PIN updated — use it next time you sign in");
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      setPinError(err instanceof Error ? err.message : "Could not update your PIN");
    } finally {
      setSavingPin(false);
    }
  }, [pinDraft, closePinForm]);

  const savePersonal = useCallback(async () => {
    try {
      const res = await updatePersonalInfo({
        occupation: personalDraft.occupation || null,
        family_status: personalDraft.family_status || null,
        wealth_sources: personalDraft.wealth_sources.length ? personalDraft.wealth_sources : null,
        personal_values: personalDraft.personal_values
          ? personalDraft.personal_values.split(",").map((s) => s.trim()).filter(Boolean)
          : null,
        address: personalDraft.address || null,
      });
      setProfile((prev) => prev ? { ...prev, personal_info: res } : prev);
      setEditingPersonal(false);
      toast.success("Personal info updated");
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }, [personalDraft]);

  /* ── completeness ── */
  const personalCompleteness = (() => {
    const pi = profile?.personal_info;
    if (!pi) return 0;
    const fields = [pi.occupation, pi.family_status, pi.wealth_sources?.length ? "y" : null, pi.address];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  })();

  const overallCompleteness = personalCompleteness;

  const toggleSection = (key: string) =>
    setOpenSection((prev) => (prev === key ? null : key));

  /* ── display ── */
  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "User";
  const displayEmail = user?.email ?? "";
  const displayPhone = user ? `${user.country_code} ${user.mobile}` : "";
  const pi = profile?.personal_info;

  if (loading) {
    return (
      <div className="mobile-container bg-background min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Loading profile…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container bg-background pb-20 min-h-screen">
      <div className="px-5 pt-10 pb-2">
        <h1 className="text-lg font-semibold text-foreground">Profile</h1>
      </div>

      {/* Profile header */}
      <div className="px-5 flex flex-col items-center pt-1 mb-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 mb-1.5"
        >
          <span className="text-sm font-bold text-accent">
            {(user?.first_name?.[0] ?? "U").toUpperCase()}
            {(user?.last_name?.[0] ?? "").toUpperCase()}
          </span>
        </motion.div>
        <p className="text-sm font-semibold text-foreground">{displayName}</p>
        <p className="text-[11px] text-muted-foreground">{displayEmail || displayPhone}</p>
      </div>

      {/* Overall completeness */}
      {overallCompleteness < 100 && (
        <div className="px-5 mb-3">
          <div className="rounded-xl bg-[hsl(38_80%_95%)] px-3 py-2.5 flex items-center gap-2.5">
            <AlertCircle className="h-3.5 w-3.5 text-[hsl(38,80%,48%)] shrink-0" />
            <div className="flex-1">
              <p className="text-[11px] font-medium text-[hsl(38,80%,30%)]">Profile {overallCompleteness}% complete</p>
              <div className="h-1 w-full rounded-full bg-[hsl(38,80%,85%)] mt-1 overflow-hidden">
                <div className="h-full rounded-full bg-[hsl(38,80%,48%)] transition-all duration-500" style={{ width: `${overallCompleteness}%` }} />
              </div>
            </div>
            <button
              onClick={() => navigate("/profile/complete")}
              className="text-[11px] font-semibold text-[hsl(38,80%,38%)] hover:underline shrink-0"
            >
              Complete →
            </button>
          </div>
        </div>
      )}

      {/* Contact Information */}
      <div className="px-5 mb-2">
        <div className="wealth-card !p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-semibold text-foreground">Account Details</h3>
            <EditSaveBtn editing={editingContact} onEdit={() => setEditingContact(true)} onSave={saveContact} />
          </div>
          <div className="space-y-1.5">
            {editingContact ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">First Name</p>
                    <ProfileInput value={contactDraft.first_name} onChange={(v) => setContactDraft((d) => ({ ...d, first_name: v }))} placeholder="First name" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Last Name</p>
                    <ProfileInput value={contactDraft.last_name} onChange={(v) => setContactDraft((d) => ({ ...d, last_name: v }))} placeholder="Last name" />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Email</p>
                  <ProfileInput value={contactDraft.email} onChange={(v) => setContactDraft((d) => ({ ...d, email: v }))} placeholder="email@example.com" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Phone</p>
                  <p className="text-xs text-muted-foreground">{displayPhone || "Not set"}</p>
                </div>
              </>
            ) : (
              <>
                <FieldRow label="Name" value={displayName !== "User" ? displayName : null} />
                <FieldRow label="Email" value={displayEmail} />
                <FieldRow label="Phone" value={displayPhone} />
              </>
            )}

            {/* Sign-in PIN — its own control rather than a field of the Save
                above, so changing a credential is always a deliberate act. */}
            <div className="border-t border-border/40 pt-1.5">
              {changingPin ? (
                <div className="space-y-1.5">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Current PIN</p>
                    <PinInput
                      autoFocus
                      value={pinDraft.current}
                      onChange={(v) => setPinDraft((d) => ({ ...d, current: v }))}
                      placeholder="Leave blank if you've never set one"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">New PIN</p>
                      <PinInput
                        value={pinDraft.next}
                        onChange={(v) => setPinDraft((d) => ({ ...d, next: v }))}
                      />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Confirm</p>
                      <PinInput
                        value={pinDraft.confirm}
                        onChange={(v) => setPinDraft((d) => ({ ...d, confirm: v }))}
                      />
                    </div>
                  </div>
                  {pinError && <p className="text-[11px] text-destructive">{pinError}</p>}
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      onClick={savePin}
                      disabled={savingPin}
                      className="rounded-lg bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background transition-opacity disabled:opacity-50"
                    >
                      {savingPin ? "Updating…" : "Update PIN"}
                    </button>
                    <button
                      onClick={closePinForm}
                      disabled={savingPin}
                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-end justify-between">
                  <FieldRow label="Sign-in PIN" value="••••" />
                  <button
                    onClick={() => setChangingPin(true)}
                    className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                    Change
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* Navigation rows */}
      {([
        { icon: User, title: "Tell Us More About You", sub: "Goals, risk tolerance & mandates", route: "/profile/complete", showDot: !aboutYouConfirmed },
        { icon: UploadCloud, title: "Update Holdings", sub: "Upload your latest CAMS / KFintech statement", route: "/cams-upload?from=profile", showDot: false },
        { icon: FileText, title: "My CAS Statements", sub: "Download statements you've imported", route: "/cas-statements", showDot: false },
      ]).map((item) => (
        <div key={item.title} className="px-5 mb-1.5">
          <button
            onClick={() => navigate(item.route)}
            className="wealth-card !p-2.5 w-full text-left flex items-center gap-2.5 active:scale-[0.98] transition-transform"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <item.icon className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold text-foreground">{item.title}</h3>
              <p className="text-[11px] text-muted-foreground">{item.sub}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {item.showDot && (
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "hsl(38, 80%, 48%)" }} />
              )}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </button>
        </div>
      ))}

      {/* Report an Issue */}
      <div className="px-5 mb-1.5">
        <ReportIssueDialog>
          <button className="wealth-card !p-2.5 w-full text-left flex items-center gap-2.5 active:scale-[0.98] transition-transform">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <Bug className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold text-foreground">Report an Issue</h3>
              <p className="text-[11px] text-muted-foreground">Something broken or off? Tell us</p>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        </ReportIssueDialog>
      </div>

      {/* Coming Soon items */}
      {([
        { icon: Users, title: "Family Members", sub: undefined },
        { icon: BarChart3, title: "Reports", sub: "Track performance & analytics" },
        { icon: Calculator, title: "Tax Optimisation", sub: "Smart tax-efficient strategies" },
      ]).map((item) => (
        <div key={item.title} className="px-5 mb-1.5">
          <div className="wealth-card !p-2.5 w-full flex items-center gap-2.5 opacity-60 cursor-default">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <item.icon className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold text-foreground">{item.title}</h3>
              {item.sub && <p className="text-[11px] text-muted-foreground">{item.sub}</p>}
            </div>
            <Badge variant="secondary" className="text-[10px] font-medium shrink-0">Coming Soon</Badge>
          </div>
        </div>
      ))}

      {/* Sign Out */}
      <div className="px-5 mt-3 mb-4">
        <button
          onClick={() => {
            signOut();
            navigate("/");
          }}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/30 py-2.5 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>

      <BottomNav />
    </div>
  );
};

export default Profile;
