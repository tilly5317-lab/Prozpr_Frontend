import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Camera, Check, ChevronDown, KeyRound, Loader2, Lock,
  Mail, Pencil, Phone, Smartphone, Trash2, TriangleAlert, UserRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { maskEmail, maskMobile } from "@/lib/utils";
import {
  BackendOfflineError,
  deleteMyAccount,
  getAvatarUrl,
  getConsentState,
  removeAvatar,
  uploadAvatar,
  updateMe,
} from "@/lib/api";

/* ── helpers ────────────────────────────────────────────────────────────── */

const AVATAR_PX = 512;

const squareDownscale = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const side = Math.min(img.width, img.height);
      const size = Math.min(side, AVATAR_PX);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Your browser can't process that image")); return; }
      ctx.drawImage(
        img,
        (img.width - side) / 2, (img.height - side) / 2, side, side,
        0, 0, size, size,
      );
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Could not read that image")),
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That file isn't an image we can read"));
    };
    img.src = objectUrl;
  });

/* ── layout primitives ──────────────────────────────────────────────────── */

const Section = ({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) => (
  <section className="px-5 mb-5">
    <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 px-0.5">
      {title}
    </h2>
    <div className="wealth-card !p-0 overflow-hidden divide-y divide-border/40">
      {children}
    </div>
    {caption && (
      <p className="text-[11px] leading-relaxed text-muted-foreground mt-1.5 px-0.5">
        {caption}
      </p>
    )}
  </section>
);

/** One label / value / action line. The action slot is where every mutation
    lives, so a row is never accidentally editable by tapping the value. */
const Row = ({
  icon: Icon,
  label,
  value,
  hint,
  action,
  children,
}: {
  icon?: React.ElementType;
  label: string;
  value?: React.ReactNode;
  hint?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) => (
  <div className="px-3.5 py-3">
    <div className="flex items-start gap-3">
      {Icon && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary mt-0.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        {value !== undefined && (
          <div className="text-[13px] text-foreground mt-0.5 break-words">{value}</div>
        )}
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {action && <div className="shrink-0 pt-0.5">{action}</div>}
    </div>
    {children && <div className="mt-2.5">{children}</div>}
  </div>
);

const TextButton = ({
  onClick,
  children,
  tone = "muted",
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: "muted" | "danger";
  disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
      tone === "danger"
        ? "text-destructive hover:text-destructive/80"
        : "text-muted-foreground hover:text-foreground"
    }`}
  >
    {children}
  </button>
);

const Field = ({
  value,
  onChange,
  placeholder,
  autoFocus,
  maxLength,
  uppercase,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
  uppercase?: boolean;
}) => (
  <input
    value={value}
    autoFocus={autoFocus}
    maxLength={maxLength}
    onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
    placeholder={placeholder}
    className={`w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[13px] text-foreground outline-none focus:border-primary transition-colors ${
      uppercase ? "tracking-wide" : ""
    }`}
  />
);

const PrimaryButton = ({
  onClick,
  busy,
  children,
  tone = "default",
  disabled,
}: {
  onClick: () => void;
  busy?: boolean;
  children: React.ReactNode;
  tone?: "default" | "danger";
  disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={busy || disabled}
    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-opacity disabled:opacity-50 ${
      tone === "danger"
        ? "bg-destructive text-destructive-foreground"
        : "bg-foreground text-background"
    }`}
  >
    {busy && <Loader2 className="h-3 w-3 animate-spin" />}
    {children}
  </button>
);

/* ── page ───────────────────────────────────────────────────────────────── */

/**
 * /account — the one place identity and credentials live.
 *
 * Split out of /profile deliberately. The profile page is a dashboard people
 * open constantly; account controls are things they touch a handful of times
 * ever, and mixing the two put a credential change one mis-tap away from a
 * display-name edit. Everything destructive or identity-bearing is behind an
 * explicit action here, and account closure is behind a disclosure on top of
 * that.
 */
const AccountCenter = () => {
  const navigate = useNavigate();
  const { user, refresh, signOut, avatarUrl, refreshAvatar } = useAuth();

  /* name */
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState({ first_name: "", last_name: "" });
  const [savingName, setSavingName] = useState(false);

  /* profile picture — the URL itself lives in AuthContext so the dashboard
     switcher and profile header pick up an upload without their own fetch. */
  const [avatarBusy, setAvatarBusy] = useState(false);

  /* The privacy endpoints ship with the DPDP branch. Until that is
     deployed they 404, so account closure says so rather than looking
     broken when someone taps it. */
  const [consentUnavailable, setConsentUnavailable] = useState(false);

  /* close account — collapsed by default, then typed confirmation */
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState("");
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (user) {
      setNameDraft({
        first_name: user.first_name ?? "",
        last_name: user.last_name ?? "",
      });
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    getConsentState().catch(() => { if (!cancelled) setConsentUnavailable(true); });
    return () => { cancelled = true; };
  }, []);

  /* ── profile picture ── */
  const handleAvatarPick = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setAvatarBusy(true);
    try {
      await uploadAvatar(await squareDownscale(file));
      // refresh() flips user.avatar_set, which is what the context watches to
      // mint the URL — so this one call updates every avatar in the app.
      await refresh();
      await refreshAvatar();
      toast.success("Profile picture updated");
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(err instanceof Error ? err.message : "Could not save that picture");
    } finally {
      setAvatarBusy(false);
    }
  }, [refresh, refreshAvatar]);

  const handleAvatarRemove = useCallback(async () => {
    setAvatarBusy(true);
    try {
      await removeAvatar();
      await refresh();
      await refreshAvatar();
      toast.success("Profile picture removed");
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(err instanceof Error ? err.message : "Could not remove it");
    } finally {
      setAvatarBusy(false);
    }
  }, [refresh, refreshAvatar]);

  /* ── name ── */
  const saveName = useCallback(async () => {
    setSavingName(true);
    try {
      await updateMe({
        first_name: nameDraft.first_name.trim() || undefined,
        last_name: nameDraft.last_name.trim() || undefined,
      });
      await refresh();
      setEditingName(false);
      toast.success("Name updated");
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(err instanceof Error ? err.message : "Could not save your name");
    } finally {
      setSavingName(false);
    }
  }, [nameDraft, refresh]);

  /* ── close account ── */
  const handleClose = useCallback(async () => {
    setClosing(true);
    try {
      const res = await deleteMyAccount();
      const purge = new Date(res.purge_scheduled_for).toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
      });
      toast.success("Your account is closed", {
        description: `Your data is scheduled for deletion on ${purge}.`,
      });
      signOut();
      navigate("/");
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(err instanceof Error ? err.message : "Could not close your account");
      setClosing(false);
    }
  }, [navigate, signOut]);

  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "User";
  const email = user?.email ?? "";

  return (
    <div className="mobile-container bg-background pb-20 min-h-screen">
      <div className="px-5 pt-10 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/profile")}
          aria-label="Back to profile"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Account Centre</h1>
          <p className="text-[11px] text-muted-foreground">
            Your details and sign-in
          </p>
        </div>
      </div>

      {/* identity strip */}
      <div className="px-5 mb-5">
        <div className="wealth-card !p-3.5 flex items-center gap-3.5">
          <div className="relative shrink-0">
            <UserAvatar size={56} />
            {/* The input is the control; the label is what people see. Keeps the
                native file picker without shipping a second click target. */}
            <label
              className={`absolute -bottom-0.5 -right-0.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 border-card bg-foreground text-background transition-opacity ${
                avatarBusy ? "opacity-50 pointer-events-none" : "hover:opacity-90"
              }`}
              aria-label={avatarUrl ? "Change profile picture" : "Add a profile picture"}
            >
              {avatarBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Camera className="h-3 w-3" />
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={avatarBusy}
                onChange={(e) => {
                  void handleAvatarPick(e.target.files?.[0]);
                  // Reset so picking the same file twice still fires onChange.
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
            <p className="text-[11px] text-muted-foreground">
              {user ? `${user.country_code} ${maskMobile(user.mobile)}` : ""}
            </p>
            {avatarUrl && (
              <button
                onClick={handleAvatarRemove}
                disabled={avatarBusy}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
              >
                <Trash2 className="h-3 w-3" /> Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── personal details ── */}
      <Section
        title="Personal details"
        caption="Your email and PAN are what an account takeover would target, so changing either needs a code sent to the email already on your account."
      >
        <Row
          icon={UserRound}
          label="Name"
          value={editingName ? undefined : displayName}
          action={
            editingName ? (
              <TextButton onClick={saveName} disabled={savingName}>
                {savingName ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Save
              </TextButton>
            ) : (
              <TextButton onClick={() => setEditingName(true)}>
                <Pencil className="h-3 w-3" /> Edit
              </TextButton>
            )
          }
        >
          {editingName && (
            <div className="grid grid-cols-2 gap-2">
              <Field
                autoFocus
                value={nameDraft.first_name}
                onChange={(v) => setNameDraft((d) => ({ ...d, first_name: v }))}
                placeholder="First name"
              />
              <Field
                value={nameDraft.last_name}
                onChange={(v) => setNameDraft((d) => ({ ...d, last_name: v }))}
                placeholder="Last name"
              />
            </div>
          )}
        </Row>

        <Row
          icon={Mail}
          label="Email"
          value={
            email ? (
              <span className="font-mono text-[12px]">{maskEmail(email)}</span>
            ) : (
              <span className="text-[11px] italic text-muted-foreground/70">Not set</span>
            )
          }
          action={
            <TextButton onClick={() => navigate("/account/email")}>
              <Pencil className="h-3 w-3" /> Change
            </TextButton>
          }
        />

        <Row
          icon={Smartphone}
          label="PAN"
          value={
            user?.pan_set ? (
              <span className="font-mono text-[12px] tracking-wide">{user.pan_masked}</span>
            ) : (
              <span className="text-[11px] italic text-muted-foreground/70">Not set</span>
            )
          }
          hint={user?.pan_set ? undefined : "Used to match your statements and holdings"}
          action={
            <TextButton onClick={() => navigate("/account/pan")}>
              <Pencil className="h-3 w-3" /> {user?.pan_set ? "Change" : "Add"}
            </TextButton>
          }
        />

        <Row
          icon={Phone}
          label="Mobile"
          value={
            user ? (
              <span className="font-mono text-[12px]">
                {user.country_code} {maskMobile(user.mobile)}
              </span>
            ) : (
              ""
            )
          }
          hint="What you sign in with"
          action={
            <TextButton onClick={() => navigate("/account/mobile")}>
              <Pencil className="h-3 w-3" /> Change
            </TextButton>
          }
        />
      </Section>

      {/* ── security ── */}
      <Section
        title="Security"
        caption="Resetting sends a code to the email on your account, so a forgotten PIN and a stolen session are handled the same way — neither can set a new PIN without the inbox."
      >
        <Row
          icon={Lock}
          label="Sign-in PIN"
          value="••••"
          hint="4 digits, asked for every time you sign in"
          action={
            <TextButton onClick={() => navigate("/account/pin")}>
              <KeyRound className="h-3 w-3" /> Reset
            </TextButton>
          }
        />
      </Section>

      {/* ── close account ──
           A labelled row rather than a bare heading: the first version was a
           small uppercase caption, which hid it so well it read as a section
           title and nobody found the control. It is still collapsed, and still
           needs CLOSE typed to arm — discoverable is not the same as easy. */}
      <section className="px-5 mb-6">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 px-0.5">
          Danger zone
        </h2>
        <button
          onClick={() => { setCloseOpen((o) => !o); setCloseConfirm(""); }}
          className="wealth-card !p-3 w-full text-left flex items-center gap-3 active:scale-[0.98] transition-transform"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
            <TriangleAlert className="h-3.5 w-3.5 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-semibold text-destructive">Close my account</h3>
            <p className="text-[11px] text-muted-foreground">
              Permanently delete your account and data
            </p>
          </div>
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${closeOpen ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence>
          {closeOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="wealth-card !p-3.5 border-destructive/30 mt-1.5">
                <div className="flex items-start gap-2.5 mb-2">
                  <TriangleAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-semibold text-foreground">
                      This cannot be undone
                    </p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground mt-1">
                      You'll be signed out straight away and won't be able to sign back in.
                      Your holdings, goals, plans and chat history are scheduled for permanent
                      deletion after a 30-day grace period. Backups aren't edited — copies age
                      out of our backup set within its retention window.
                    </p>
                  </div>
                </div>
                {consentUnavailable ? (
                  <p className="text-[11px] text-muted-foreground">
                    Closing your account isn&apos;t available yet. Use Report an Issue on
                    your profile and we&apos;ll close it for you.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground mb-1.5">
                    Type <span className="font-mono font-semibold text-foreground">CLOSE</span> to confirm.
                  </p>
                )}
                <div className={`flex items-center gap-2 ${consentUnavailable ? "hidden" : ""}`}>
                  <div className="flex-1">
                    <Field value={closeConfirm} onChange={setCloseConfirm} placeholder="CLOSE" uppercase />
                  </div>
                  <PrimaryButton
                    tone="danger"
                    onClick={handleClose}
                    busy={closing}
                    disabled={closeConfirm.trim() !== "CLOSE"}
                  >
                    {closing ? "Closing" : "Close account"}
                  </PrimaryButton>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <BottomNav />
    </div>
  );
};

export default AccountCenter;
