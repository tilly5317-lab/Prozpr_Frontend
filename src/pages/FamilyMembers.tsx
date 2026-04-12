import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  UserPlus,
  X,
  Trash2,
  Users,
  Mail,
  Phone,
  Heart,
  ChevronRight,
  ShieldCheck,
  RotateCw,
  AlertTriangle,
  Eye,
  EyeOff,
  UserRoundPlus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { useFamily } from "@/context/FamilyContext";
import {
  addFamilyMember,
  onboardFamilyMember,
  removeFamilyMember,
  verifyFamilyOtp,
  resendFamilyOtp,
  BackendOfflineError,
  type AddFamilyMemberPayload,
  type OnboardFamilyMemberPayload,
} from "@/lib/api";

const RELATIONSHIPS = [
  { value: "spouse", label: "Spouse", icon: "💑" },
  { value: "child", label: "Child", icon: "👶" },
  { value: "parent", label: "Parent", icon: "👨‍👩‍👦" },
  { value: "sibling", label: "Sibling", icon: "👫" },
  { value: "grandparent", label: "Grandparent", icon: "👴" },
  { value: "grandchild", label: "Grandchild", icon: "🧒" },
  { value: "other", label: "Other", icon: "👤" },
];

const RELATIONSHIP_COLORS: Record<string, string> = {
  spouse: "from-pink-500/20 to-rose-500/10 border-pink-200",
  child: "from-blue-500/20 to-sky-500/10 border-blue-200",
  parent: "from-amber-500/20 to-yellow-500/10 border-amber-200",
  sibling: "from-emerald-500/20 to-green-500/10 border-emerald-200",
  grandparent: "from-purple-500/20 to-violet-500/10 border-purple-200",
  grandchild: "from-cyan-500/20 to-teal-500/10 border-cyan-200",
  other: "from-slate-500/20 to-gray-500/10 border-slate-200",
};

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Verified" },
  pending_otp: { bg: "bg-amber-100", text: "text-amber-700", label: "Pending OTP" },
  revoked: { bg: "bg-red-100", text: "text-red-700", label: "Revoked" },
};

const OTP_LENGTH = 6;

type SheetMode = "closed" | "add" | "onboard" | "otp";

const FamilyMembers = () => {
  const navigate = useNavigate();
  const { members, refreshMembers, switchToMember } = useFamily();

  const [sheetMode, setSheetMode] = useState<SheetMode>("closed");
  const [submitting, setSubmitting] = useState(false);

  // Add form (step 1)
  const [form, setForm] = useState<AddFamilyMemberPayload>({
    nickname: "",
    phone: "",
    email: "",
    relationship_type: "spouse",
  });

  // Onboard form (step 1b — when phone not found)
  const [onboardForm, setOnboardForm] = useState<OnboardFamilyMemberPayload>({
    nickname: "",
    phone: "",
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    country_code: "+91",
    relationship_type: "spouse",
  });
  const [showPassword, setShowPassword] = useState(false);

  // OTP (step 2)
  const [otpMemberId, setOtpMemberId] = useState<string | null>(null);
  const [otpMemberPhone, setOtpMemberPhone] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const resetAll = () => {
    setSheetMode("closed");
    setForm({ nickname: "", phone: "", email: "", relationship_type: "spouse" });
    setOnboardForm({ nickname: "", phone: "", first_name: "", last_name: "", email: "", password: "", country_code: "+91", relationship_type: "spouse" });
    setOtpMemberId(null);
    setOtpMemberPhone("");
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    setShowPassword(false);
  };

  useEffect(() => {
    if (sheetMode === "otp") {
      setTimeout(() => otpRefs.current[0]?.focus(), 300);
    }
  }, [sheetMode]);

  // ── Add existing user ──

  const handleAdd = useCallback(async () => {
    if (!form.nickname.trim()) { toast.error("Please enter a nickname"); return; }
    if (!form.phone.trim()) { toast.error("Phone number is required"); return; }

    setSubmitting(true);
    try {
      const member = await addFamilyMember({
        ...form,
        nickname: form.nickname.trim(),
        phone: form.phone.trim(),
        country_code: "+91",
        email: form.email?.trim() || undefined,
      });
      toast.success(`OTP sent to ${form.phone}`);
      setOtpMemberId(member.id);
      setOtpMemberPhone(form.phone.trim());
      setSheetMode("otp");
      await refreshMembers();
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      const msg = err instanceof Error ? err.message : "";
      // Detect the structured "member_not_found" error
      if (msg.includes("member_not_found") || msg.includes("No account found")) {
        // Pre-fill the onboard form with what the user already typed
        setOnboardForm((prev) => ({
          ...prev,
          nickname: form.nickname.trim(),
          phone: form.phone.trim(),
          email: form.email?.trim() || "",
          relationship_type: form.relationship_type || "spouse",
        }));
        setSheetMode("onboard");
      } else {
        toast.error(msg || "Failed to add member");
      }
    } finally {
      setSubmitting(false);
    }
  }, [form, refreshMembers]);

  // ── Onboard new user ──

  const handleOnboard = useCallback(async () => {
    if (!onboardForm.first_name.trim()) { toast.error("First name is required"); return; }
    if (!onboardForm.password || onboardForm.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setSubmitting(true);
    try {
      const member = await onboardFamilyMember({
        ...onboardForm,
        nickname: onboardForm.nickname.trim(),
        first_name: onboardForm.first_name.trim(),
        last_name: onboardForm.last_name?.trim() || undefined,
        email: onboardForm.email?.trim() || undefined,
      });
      toast.success(`Account created! OTP sent to ${onboardForm.phone}`);
      setOtpMemberId(member.id);
      setOtpMemberPhone(onboardForm.phone);
      setSheetMode("otp");
      await refreshMembers();
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("already exists") || msg.includes("409")) {
        toast.error("An account already exists for this number. Use “Add member” (link existing user), not “Create account”.");
      } else {
        toast.error(msg || "Failed to create account");
      }
    } finally {
      setSubmitting(false);
    }
  }, [onboardForm, refreshMembers]);

  // ── OTP handlers ──

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otpDigits];
    next[index] = value.slice(-1);
    setOtpDigits(next);
    if (value && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    const next = [...otpDigits];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setOtpDigits(next);
    otpRefs.current[Math.min(text.length, OTP_LENGTH - 1)]?.focus();
  };

  const handleVerify = useCallback(async () => {
    if (!otpMemberId) return;
    const otp = otpDigits.join("");
    if (otp.length !== OTP_LENGTH) { toast.error(`Enter the ${OTP_LENGTH}-digit OTP`); return; }
    setVerifying(true);
    try {
      await verifyFamilyOtp(otpMemberId, otp);
      toast.success("Family member verified successfully!");
      resetAll();
      await refreshMembers();
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(err instanceof Error ? err.message : "Invalid OTP");
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      otpRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }, [otpMemberId, otpDigits, refreshMembers]);

  const handleResend = useCallback(async () => {
    if (!otpMemberId) return;
    setResending(true);
    try { await resendFamilyOtp(otpMemberId); toast.success("OTP resent"); }
    catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(err instanceof Error ? err.message : "Failed to resend");
    }
    finally { setResending(false); }
  }, [otpMemberId]);

  const handleVerifyFromCard = (memberId: string, phone: string) => {
    setOtpMemberId(memberId);
    setOtpMemberPhone(phone);
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    setSheetMode("otp");
  };

  const handleRemove = useCallback(async (memberId: string) => {
    try {
      await removeFamilyMember(memberId);
      toast.success("Family member removed");
      setConfirmDelete(null);
      await refreshMembers();
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }, [refreshMembers]);

  const activeCount = members.filter((m) => m.status === "active").length;
  const pendingCount = members.filter((m) => m.status === "pending_otp").length;
  const sheetOpen = sheetMode !== "closed";

  return (
    <div className="mobile-container bg-background pb-20 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-8 pb-4">
        <button onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-foreground">Family Members</h1>
          <p className="text-[10px] text-muted-foreground">
            {members.length === 0 ? "Add family to manage their accounts" : `${activeCount} verified${pendingCount > 0 ? ` · ${pendingCount} pending` : ""}`}
          </p>
        </div>
        <button onClick={() => setSheetMode("add")} className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
          <UserPlus className="h-3 w-3" />
          Add
        </button>
      </div>

      {/* Empty state */}
      {members.length === 0 && !sheetOpen && (
        <div className="px-5 mt-8">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center py-12 px-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4"><Users className="h-7 w-7 text-primary" /></div>
            <h3 className="text-sm font-semibold text-foreground mb-1.5">Manage your family's wealth together</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[260px] mb-2">Add family members with OTP verification. Once verified, you get full access to manage their portfolio, goals, investments — everything.</p>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />Secured by OTP verification</div>
            <button onClick={() => setSheetMode("add")} className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
              <UserPlus className="h-3.5 w-3.5" />Add Your First Family Member
            </button>
          </motion.div>
        </div>
      )}

      {/* Member list */}
      <div className="px-5 space-y-2">
        {members.map((m, i) => {
          const colorCls = RELATIONSHIP_COLORS[m.relationship_type] || RELATIONSHIP_COLORS.other;
          const statusInfo = STATUS_BADGE[m.status] || STATUS_BADGE.pending_otp;
          const isDeleting = confirmDelete === m.id;
          const isPending = m.status === "pending_otp";
          return (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`relative rounded-xl border bg-gradient-to-br ${colorCls} overflow-hidden`}>
              <div className="flex items-center gap-3 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/60 text-sm font-bold text-foreground shrink-0">{m.member_initials || m.nickname[0].toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-xs font-semibold text-foreground truncate">{m.nickname}</p>
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${statusInfo.bg} ${statusInfo.text}`}>{statusInfo.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="capitalize flex items-center gap-1"><Heart className="h-2.5 w-2.5" />{m.relationship_type}</span>
                    {m.phone && <span className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{m.phone}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isPending && (
                    <button onClick={() => handleVerifyFromCard(m.id, m.phone || "")} className="flex h-7 items-center gap-1 rounded-lg bg-amber-200/60 px-2 text-[10px] font-medium text-amber-800 hover:bg-amber-200/90 transition-colors">
                      <ShieldCheck className="h-3 w-3" />Verify
                    </button>
                  )}
                  {m.status === "active" && (
                    <button onClick={() => { switchToMember(m); navigate("/"); }} className="flex h-7 items-center gap-1 rounded-lg bg-white/50 px-2 text-[10px] font-medium text-foreground hover:bg-white/80 transition-colors">
                      Switch<ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                  <button onClick={() => setConfirmDelete(m.id)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-red-100/60 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
              <AnimatePresence>
                {isDeleting && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="flex items-center justify-between border-t border-red-200/50 bg-red-50/50 px-3 py-2">
                      <p className="text-[10px] text-red-700">Remove {m.nickname}?</p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDelete(null)} className="text-[10px] font-medium text-muted-foreground hover:text-foreground">Cancel</button>
                        <button onClick={() => handleRemove(m.id)} className="text-[10px] font-semibold text-red-600 hover:text-red-800">Remove</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* ────────── Bottom Sheet Overlay ────────── */}
      <AnimatePresence>
        {sheetOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" onClick={resetAll} />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[60] max-h-[90vh] rounded-t-2xl bg-card border-t border-border shadow-2xl overflow-auto pb-safe"
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-muted-foreground/20" />
              </div>

              {/* ── Sheet: Add Member ── */}
              {sheetMode === "add" && (
                <>
                  <div className="flex items-center justify-between px-5 pt-2 pb-3">
                    <h2 className="text-sm font-semibold text-foreground">Add Family Member</h2>
                    <button onClick={resetAll} className="flex h-7 w-7 items-center justify-center rounded-full bg-muted hover:bg-muted/80"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="px-5 pb-10 space-y-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Nickname *</label>
                      <input value={form.nickname} onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))} placeholder="e.g. Mom, Priya, Dad" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground outline-none focus:border-primary transition-colors" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Relationship</label>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {RELATIONSHIPS.map((r) => (
                          <button key={r.value} onClick={() => setForm((f) => ({ ...f, relationship_type: r.value }))} className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-medium border transition-all ${form.relationship_type === r.value ? "bg-primary/10 text-primary border-primary/30" : "bg-card text-muted-foreground border-border hover:border-primary/20"}`}>
                            <span className="text-xs">{r.icon}</span>{r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Phone Number * <span className="normal-case text-muted-foreground/60">(OTP will be sent here)</span></label>
                      <div className="relative mt-1">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" type="tel" className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-xs text-foreground outline-none focus:border-primary transition-colors" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Email <span className="normal-case text-muted-foreground/60">(optional)</span></label>
                      <div className="relative mt-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input value={form.email || ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="member@email.com" type="email" className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-xs text-foreground outline-none focus:border-primary transition-colors" />
                      </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-emerald-800 leading-relaxed">An OTP will be sent to the member's phone for consent verification.</p>
                    </div>
                    <button onClick={handleAdd} disabled={submitting} className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all">
                      {submitting ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> : <UserPlus className="h-3.5 w-3.5" />}
                      {submitting ? "Checking…" : "Add & Send OTP"}
                    </button>
                  </div>
                </>
              )}

              {/* ── Sheet: Onboard (phone not found) ── */}
              {sheetMode === "onboard" && (
                <>
                  <div className="flex items-center justify-between px-5 pt-2 pb-2">
                    <h2 className="text-sm font-semibold text-foreground">Register Family Member</h2>
                    <button onClick={resetAll} className="flex h-7 w-7 items-center justify-center rounded-full bg-muted hover:bg-muted/80"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="px-5 pb-10 space-y-4">
                    {/* Not-found banner */}
                    <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200/60 px-3.5 py-3">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[11px] font-semibold text-amber-800">No account found</p>
                        <p className="text-[10px] text-amber-700 leading-relaxed mt-0.5">
                          <span className="font-medium">{onboardForm.phone}</span> isn't registered yet. Fill in the details below to create an account for your family member.
                        </p>
                      </div>
                    </div>

                    {/* Relationship chips (already selected, shown compactly) */}
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{onboardForm.nickname}</span>
                      <span className="capitalize">· {onboardForm.relationship_type}</span>
                      <span>· {onboardForm.phone}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">First Name *</label>
                        <input value={onboardForm.first_name} onChange={(e) => setOnboardForm((f) => ({ ...f, first_name: e.target.value }))} placeholder="e.g. Priya" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground outline-none focus:border-primary transition-colors" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Last Name</label>
                        <input value={onboardForm.last_name || ""} onChange={(e) => setOnboardForm((f) => ({ ...f, last_name: e.target.value }))} placeholder="e.g. Sharma" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground outline-none focus:border-primary transition-colors" />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Email <span className="normal-case text-muted-foreground/60">(optional)</span></label>
                      <div className="relative mt-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input value={onboardForm.email || ""} onChange={(e) => setOnboardForm((f) => ({ ...f, email: e.target.value }))} placeholder="member@email.com" type="email" className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-xs text-foreground outline-none focus:border-primary transition-colors" />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Set Password * <span className="normal-case text-muted-foreground/60">(min 8 chars)</span></label>
                      <div className="relative mt-1">
                        <input
                          value={onboardForm.password}
                          onChange={(e) => setOnboardForm((f) => ({ ...f, password: e.target.value }))}
                          placeholder="Create a password"
                          type={showPassword ? "text" : "password"}
                          className="w-full rounded-xl border border-border bg-background px-3 pr-9 py-2.5 text-xs text-foreground outline-none focus:border-primary transition-colors"
                        />
                        <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2.5">
                      <UserRoundPlus className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-blue-800 leading-relaxed">
                        This will create a new Ask Tilly account for your family member. An OTP will be sent to their phone for consent verification.
                      </p>
                    </div>

                    <button onClick={handleOnboard} disabled={submitting} className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all">
                      {submitting ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> : <UserRoundPlus className="h-3.5 w-3.5" />}
                      {submitting ? "Creating Account…" : "Create Account & Send OTP"}
                    </button>

                    <button onClick={() => setSheetMode("add")} className="w-full text-center text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors py-1">
                      ← Back to add existing member
                    </button>
                  </div>
                </>
              )}

              {/* ── Sheet: OTP Verification ── */}
              {sheetMode === "otp" && (
                <>
                  <div className="flex items-center justify-between px-5 pt-2 pb-2">
                    <h2 className="text-sm font-semibold text-foreground">Verify OTP</h2>
                    <button onClick={resetAll} className="flex h-7 w-7 items-center justify-center rounded-full bg-muted hover:bg-muted/80"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="px-5 pb-10 space-y-5">
                    <div className="text-center">
                      <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-emerald-100 mb-3"><ShieldCheck className="h-5 w-5 text-emerald-600" /></div>
                      <p className="text-xs text-muted-foreground leading-relaxed">We sent a verification code to</p>
                      <p className="text-sm font-semibold text-foreground mt-0.5">{otpMemberPhone}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Ask your family member to share the OTP</p>
                    </div>
                    <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                      {otpDigits.map((digit, idx) => (
                        <input key={idx} ref={(el) => { otpRefs.current[idx] = el; }} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={(e) => handleOtpChange(idx, e.target.value)} onKeyDown={(e) => handleOtpKeyDown(idx, e)} className="h-12 w-10 rounded-xl border-2 border-border bg-background text-center text-lg font-bold text-foreground outline-none focus:border-primary transition-colors" />
                      ))}
                    </div>
                    <button onClick={handleVerify} disabled={verifying || otpDigits.join("").length !== OTP_LENGTH} className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all">
                      {verifying ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      {verifying ? "Verifying…" : "Verify & Activate"}
                    </button>
                    <div className="text-center">
                      <button onClick={handleResend} disabled={resending} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors">
                        <RotateCw className={`h-3 w-3 ${resending ? "animate-spin" : ""}`} />{resending ? "Sending…" : "Resend OTP"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
};

export default FamilyMembers;
