import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Check, ChevronDown, Download, Eye, EyeOff, Loader2, Lock,
  Mail, MessageSquareWarning, Pencil, Phone, ShieldCheck, Smartphone,
  TriangleAlert, UserRound, X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/context/AuthContext";
import {
  BackendOfflineError,
  changePin,
  confirmSensitiveChange,
  deleteMyAccount,
  exportMyData,
  getConsentState,
  raiseGrievance,
  requestSensitiveChange,
  revealPan,
  updateConsent,
  updateMe,
  type ConsentPurpose,
  type ConsentState,
  type GrievanceCategory,
  type SensitiveField,
} from "@/lib/api";

/* ── helpers ────────────────────────────────────────────────────────────── */

/**
 * `jonathan@gmail.com` → `j••••••n@gmail.com`.
 *
 * Shoulder-surfing protection only, and honest about it: the full address is
 * already in this client, because `/auth/me` returns it. That is fine — the
 * address is the account's own login hint. The PAN is the opposite case: it is
 * masked by the BACKEND and the full value only arrives from `revealPan()`.
 */
const maskEmail = (email: string): string => {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const masked =
    local.length <= 2
      ? `${local[0] ?? "•"}•`
      : `${local[0]}${"•".repeat(local.length - 2)}${local[local.length - 1]}`;
  return `${masked}@${domain}`;
};

const maskMobile = (mobile: string): string =>
  mobile.length <= 4 ? mobile : `${"•".repeat(mobile.length - 4)}${mobile.slice(-4)}`;

const FIELD_LABEL: Record<SensitiveField, string> = {
  email: "email address",
  pan: "PAN",
};

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

const PinField = ({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) => (
  <input
    type="password"
    inputMode="numeric"
    autoComplete="off"
    maxLength={4}
    autoFocus={autoFocus}
    value={value}
    onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
    placeholder={placeholder}
    className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[13px] tracking-[0.4em] text-foreground outline-none focus:border-primary transition-colors placeholder:tracking-normal"
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

type SensitiveStage = "value" | "code";

interface SensitiveFlow {
  field: SensitiveField;
  stage: SensitiveStage;
  value: string;
  code: string;
  hint: string | null;
  expiresIn: number | null;
  error: string;
  busy: boolean;
}

/**
 * /account — the one place identity, credentials and privacy rights live.
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
  const { user, refresh, signOut } = useAuth();

  /* name */
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState({ first_name: "", last_name: "" });
  const [savingName, setSavingName] = useState(false);

  /* reveals — never persisted, reset on every mount */
  const [emailShown, setEmailShown] = useState(false);
  const [panPlain, setPanPlain] = useState<string | null>(null);
  const [revealingPan, setRevealingPan] = useState(false);

  /* step-up flow for email / PAN */
  const [flow, setFlow] = useState<SensitiveFlow | null>(null);

  /* PIN */
  const [changingPin, setChangingPin] = useState(false);
  const [pinDraft, setPinDraft] = useState({ current: "", next: "", confirm: "" });
  const [pinError, setPinError] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  /* privacy */
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentUnavailable, setConsentUnavailable] = useState(false);
  const [savingPurpose, setSavingPurpose] = useState<ConsentPurpose | null>(null);
  const [exporting, setExporting] = useState(false);

  /* grievance */
  const [grievanceOpen, setGrievanceOpen] = useState(false);
  const [grievance, setGrievance] = useState({ category: "general" as GrievanceCategory, message: "" });
  const [sendingGrievance, setSendingGrievance] = useState(false);

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
    getConsentState()
      .then((c) => { if (!cancelled) setConsent(c); })
      .catch(() => {
        // The privacy endpoints ship with the DPDP branch. Until that is
        // deployed this 404s, and the section says so rather than looking broken.
        if (!cancelled) setConsentUnavailable(true);
      });
    return () => { cancelled = true; };
  }, []);

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

  /* ── PAN reveal ── */
  const handleRevealPan = useCallback(async () => {
    if (panPlain) { setPanPlain(null); return; }
    setRevealingPan(true);
    try {
      setPanPlain(await revealPan());
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error("Could not fetch your PAN");
    } finally {
      setRevealingPan(false);
    }
  }, [panPlain]);

  /* ── step-up flow ── */
  const startFlow = (field: SensitiveField) =>
    setFlow({
      field, stage: "value", value: "", code: "",
      hint: null, expiresIn: null, error: "", busy: false,
    });

  const submitValue = useCallback(async () => {
    if (!flow) return;
    setFlow({ ...flow, busy: true, error: "" });
    try {
      const res = await requestSensitiveChange(flow.field, flow.value.trim());
      if (!res.verification_required) {
        // First PAN on the account, or a bypass domain — already applied.
        await refresh();
        setPanPlain(null);
        setFlow(null);
        toast.success(res.message);
        return;
      }
      setFlow({
        ...flow, busy: false, stage: "code", code: "",
        hint: res.email_hint, expiresIn: res.expires_in_minutes, error: "",
      });
    } catch (err) {
      if (err instanceof BackendOfflineError) { setFlow({ ...flow, busy: false }); return; }
      setFlow({
        ...flow, busy: false,
        error: err instanceof Error ? err.message : "Could not start that change",
      });
    }
  }, [flow, refresh]);

  const submitCode = useCallback(async () => {
    if (!flow) return;
    setFlow({ ...flow, busy: true, error: "" });
    try {
      await confirmSensitiveChange(flow.code);
      await refresh();
      setPanPlain(null);
      const label = FIELD_LABEL[flow.field];
      setFlow(null);
      toast.success(`Your ${label} was updated`);
    } catch (err) {
      if (err instanceof BackendOfflineError) { setFlow({ ...flow, busy: false }); return; }
      setFlow({
        ...flow, busy: false, code: "",
        error: err instanceof Error ? err.message : "That code didn't work",
      });
    }
  }, [flow, refresh]);

  /* ── PIN ── */
  const closePinForm = useCallback(() => {
    setChangingPin(false);
    setPinDraft({ current: "", next: "", confirm: "" });
    setPinError("");
  }, []);

  const savePin = useCallback(async () => {
    const { current, next, confirm } = pinDraft;
    if (!/^\d{4}$/.test(next)) { setPinError("Your new PIN must be exactly 4 digits"); return; }
    if (next !== confirm) { setPinError("The two new PINs don't match"); return; }
    if (next === current) { setPinError("That's already your PIN — pick a different one"); return; }
    setPinError("");
    setSavingPin(true);
    try {
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

  /* ── privacy ── */
  const togglePurpose = useCallback(async (purpose: ConsentPurpose, granted: boolean) => {
    setSavingPurpose(purpose);
    try {
      setConsent(await updateConsent([{ purpose, granted }]));
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(err instanceof Error ? err.message : "Could not update that preference");
    } finally {
      setSavingPurpose(null);
    }
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const data = await exportMyData();
      // Built and revoked in place: an artifact of the user's own data should
      // not outlive the click that asked for it.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prozpr-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Your data file has downloaded");
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(err instanceof Error ? err.message : "Could not build your export");
    } finally {
      setExporting(false);
    }
  }, []);

  const sendGrievance = useCallback(async () => {
    if (grievance.message.trim().length < 10) {
      toast.error("Tell us a little more — at least a sentence");
      return;
    }
    setSendingGrievance(true);
    try {
      await raiseGrievance(grievance.category, grievance.message.trim());
      setGrievance({ category: "general", message: "" });
      setGrievanceOpen(false);
      toast.success("Complaint registered", {
        description: "We'll come back to you at the email on your account.",
      });
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(err instanceof Error ? err.message : "Could not register that");
    } finally {
      setSendingGrievance(false);
    }
  }, [grievance]);

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
  const optionalPurposes = consent?.purposes.filter((p) => !p.necessary) ?? [];

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
            Your details, sign-in and privacy controls
          </p>
        </div>
      </div>

      {/* identity strip */}
      <div className="px-5 mb-5">
        <div className="wealth-card !p-3.5 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10">
            <span className="text-[13px] font-bold text-accent">
              {(user?.first_name?.[0] ?? "U").toUpperCase()}
              {(user?.last_name?.[0] ?? "").toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
            <p className="text-[11px] text-muted-foreground">
              {user ? `${user.country_code} ${maskMobile(user.mobile)}` : ""}
            </p>
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
              <span className="inline-flex items-center gap-2">
                <span className="font-mono text-[12px]">
                  {emailShown ? email : maskEmail(email)}
                </span>
                <button
                  onClick={() => setEmailShown((s) => !s)}
                  aria-label={emailShown ? "Hide email" : "Show email"}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {emailShown ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
              </span>
            ) : (
              <span className="text-[11px] italic text-muted-foreground/70">Not set</span>
            )
          }
          action={
            <TextButton onClick={() => startFlow("email")}>
              <Pencil className="h-3 w-3" /> Change
            </TextButton>
          }
        />

        <Row
          icon={Smartphone}
          label="PAN"
          value={
            user?.pan_set ? (
              <span className="inline-flex items-center gap-2">
                <span className="font-mono text-[12px] tracking-wide">
                  {panPlain ?? user.pan_masked}
                </span>
                <button
                  onClick={handleRevealPan}
                  aria-label={panPlain ? "Hide PAN" : "Show PAN"}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {revealingPan ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : panPlain ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                </button>
              </span>
            ) : (
              <span className="text-[11px] italic text-muted-foreground/70">Not set</span>
            )
          }
          hint={user?.pan_set ? undefined : "Used to match your statements and holdings"}
          action={
            <TextButton onClick={() => startFlow("pan")}>
              <Pencil className="h-3 w-3" /> {user?.pan_set ? "Change" : "Add"}
            </TextButton>
          }
        />

        <Row
          icon={Phone}
          label="Mobile"
          value={user ? `${user.country_code} ${user.mobile}` : ""}
          hint="Your mobile number is your account ID and can't be changed here"
        />
      </Section>

      {/* ── security ── */}
      <Section title="Security">
        <Row
          icon={Lock}
          label="Sign-in PIN"
          value={changingPin ? undefined : "••••"}
          hint={changingPin ? undefined : "4 digits, asked for every time you sign in"}
          action={
            changingPin ? (
              <TextButton onClick={closePinForm} disabled={savingPin}>
                <X className="h-3 w-3" /> Cancel
              </TextButton>
            ) : (
              <TextButton onClick={() => setChangingPin(true)}>
                <Pencil className="h-3 w-3" /> Change
              </TextButton>
            )
          }
        >
          {changingPin && (
            <div className="space-y-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Current PIN
                </p>
                <PinField
                  autoFocus
                  value={pinDraft.current}
                  onChange={(v) => setPinDraft((d) => ({ ...d, current: v }))}
                  placeholder="Leave blank if you've never set one"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">New</p>
                  <PinField value={pinDraft.next} onChange={(v) => setPinDraft((d) => ({ ...d, next: v }))} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Confirm</p>
                  <PinField value={pinDraft.confirm} onChange={(v) => setPinDraft((d) => ({ ...d, confirm: v }))} />
                </div>
              </div>
              {pinError && <p className="text-[11px] text-destructive">{pinError}</p>}
              <PrimaryButton onClick={savePin} busy={savingPin}>
                {savingPin ? "Updating" : "Update PIN"}
              </PrimaryButton>
            </div>
          )}
        </Row>
      </Section>

      {/* ── privacy ── */}
      <Section
        title="Privacy and data"
        caption={
          consentUnavailable
            ? undefined
            : "You can withdraw any optional permission at any time. Withdrawing stops future processing; it doesn't undo what was already done."
        }
      >
        <Row
          icon={ShieldCheck}
          label="Permissions"
          value={
            consentUnavailable
              ? <span className="text-[11px] italic text-muted-foreground/70">Not available yet</span>
              : consent
                ? `${optionalPurposes.filter((p) => p.granted).length} of ${optionalPurposes.length} optional permissions on`
                : "Loading"
          }
          action={
            !consentUnavailable && consent ? (
              <TextButton onClick={() => setConsentOpen((o) => !o)}>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${consentOpen ? "rotate-180" : ""}`} />
                {consentOpen ? "Hide" : "Manage"}
              </TextButton>
            ) : undefined
          }
        >
          <AnimatePresence>
            {consentOpen && consent && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="space-y-2.5 pt-1">
                  {consent.purposes.map((p) => (
                    <div key={p.purpose} className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-foreground">{p.title}</p>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">{p.detail}</p>
                      </div>
                      {p.necessary ? (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0 pt-0.5">
                          Required
                        </span>
                      ) : (
                        <button
                          role="switch"
                          aria-checked={p.granted === true}
                          aria-label={p.title}
                          disabled={savingPurpose === p.purpose}
                          onClick={() => togglePurpose(p.purpose, !(p.granted === true))}
                          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                            p.granted ? "bg-accent" : "bg-muted"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform ${
                              p.granted ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      )}
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground pt-0.5">
                    Notice version {consent.policy_version}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Row>

        <Row
          icon={Download}
          label="Download my data"
          hint="Everything we hold about you, as a JSON file"
          action={
            <TextButton onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              {exporting ? "Building" : "Download"}
            </TextButton>
          }
        />

        <Row
          icon={MessageSquareWarning}
          label="Raise a complaint"
          hint="About how your data is handled"
          action={
            <TextButton onClick={() => setGrievanceOpen((o) => !o)}>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${grievanceOpen ? "rotate-180" : ""}`} />
              {grievanceOpen ? "Close" : "Open"}
            </TextButton>
          }
        >
          <AnimatePresence>
            {grievanceOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap gap-1.5">
                    {(["access", "correction", "erasure", "consent", "general"] as GrievanceCategory[]).map((c) => (
                      <button
                        key={c}
                        onClick={() => setGrievance((g) => ({ ...g, category: c }))}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium border capitalize transition-all ${
                          grievance.category === c
                            ? "bg-accent text-accent-foreground border-accent"
                            : "bg-card text-muted-foreground border-border hover:border-accent/40"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    value={grievance.message}
                    onChange={(e) => setGrievance((g) => ({ ...g, message: e.target.value }))}
                    placeholder="What's the problem?"
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[13px] text-foreground outline-none focus:border-primary transition-colors resize-none"
                  />
                  <PrimaryButton onClick={sendGrievance} busy={sendingGrievance}>
                    {sendingGrievance ? "Sending" : "Submit complaint"}
                  </PrimaryButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Row>
      </Section>

      {/* ── close account: collapsed, then a typed confirmation ── */}
      <section className="px-5 mb-6">
        <button
          onClick={() => { setCloseOpen((o) => !o); setCloseConfirm(""); }}
          className="w-full flex items-center justify-between px-0.5 py-1.5 text-left"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Close account
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${closeOpen ? "rotate-180" : ""}`} />
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
              <div className="wealth-card !p-3.5 border-destructive/30">
                <div className="flex items-start gap-2.5 mb-2">
                  <TriangleAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-semibold text-foreground">
                      Closing your account cannot be undone
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

      {/* ── step-up sheet ── */}
      <AnimatePresence>
        {flow && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 pb-3"
            onClick={() => !flow.busy && setFlow(null)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-card border border-border p-4 shadow-lg"
            >
              <div className="flex items-start justify-between mb-2.5">
                <div>
                  <h3 className="text-sm font-semibold text-foreground capitalize">
                    {flow.stage === "value"
                      ? `Change your ${FIELD_LABEL[flow.field]}`
                      : "Enter the code"}
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {flow.stage === "value"
                      ? flow.field === "email"
                        ? "We'll send a code to your current email to confirm it's you."
                        : "Your PAN is matched against your statements and holdings."
                      : `Sent to ${flow.hint ?? "your email"}${
                          flow.expiresIn ? ` — expires in ${flow.expiresIn} minutes` : ""
                        }.`}
                  </p>
                </div>
                <button
                  onClick={() => setFlow(null)}
                  disabled={flow.busy}
                  aria-label="Cancel"
                  className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {flow.stage === "value" ? (
                <Field
                  autoFocus
                  value={flow.value}
                  onChange={(v) => setFlow({ ...flow, value: v, error: "" })}
                  placeholder={flow.field === "email" ? "you@example.com" : "ABCDE1234F"}
                  maxLength={flow.field === "pan" ? 10 : undefined}
                  uppercase={flow.field === "pan"}
                />
              ) : (
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={flow.code}
                  onChange={(e) =>
                    setFlow({ ...flow, code: e.target.value.replace(/\D/g, "").slice(0, 6), error: "" })
                  }
                  placeholder="000000"
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-2.5 text-center text-[18px] font-mono tracking-[0.5em] text-foreground outline-none focus:border-primary transition-colors placeholder:tracking-[0.5em] placeholder:text-muted-foreground/40"
                />
              )}

              {flow.error && <p className="text-[11px] text-destructive mt-1.5">{flow.error}</p>}

              <div className="flex items-center gap-2 mt-3">
                <PrimaryButton
                  onClick={flow.stage === "value" ? submitValue : submitCode}
                  busy={flow.busy}
                  disabled={
                    flow.stage === "value" ? !flow.value.trim() : flow.code.length !== 6
                  }
                >
                  {flow.stage === "value" ? "Continue" : "Confirm change"}
                </PrimaryButton>
                {flow.stage === "code" && (
                  <TextButton
                    onClick={() => setFlow({ ...flow, stage: "value", code: "", error: "" })}
                    disabled={flow.busy}
                  >
                    Use a different one
                  </TextButton>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
};

export default AccountCenter;
