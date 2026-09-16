import { motion } from "framer-motion";
import { ArrowLeft, KeyRound, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { maskEmail } from "@/lib/utils";

/**
 * /account/pin — reset the sign-in PIN.
 *
 * There is no "change PIN" anywhere in the app, deliberately. A change form
 * only ever asked for the PIN the user already knows, which does nothing about
 * the case that matters: someone else holding the session. Every new PIN now
 * costs a code sent to the account's email, whether the old one was forgotten
 * or stolen — one path, one guarantee.
 *
 * That flow starts signed out, so this page explains what is about to happen
 * and hands the number over rather than dropping someone onto a sign-in screen
 * with no explanation.
 */
const ResetPin = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const email = user?.email ?? "";

  const start = () => {
    if (!user) return;
    const resetPhone = { country_code: user.country_code, mobile: user.mobile };
    signOut();
    navigate("/", { state: { resetPhone } });
  };

  return (
    <div className="mobile-container bg-background min-h-screen pb-10">
      <div className="px-5 pt-10 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate("/account")}
          aria-label="Back"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">Reset sign-in PIN</h1>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="px-5"
      >
        <div className="wealth-card !p-4">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">
                Here&apos;s what happens next
              </p>
              <ol className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-muted-foreground list-decimal pl-4">
                <li>You&apos;ll be signed out of this device.</li>
                <li>
                  We&apos;ll email a 6-digit code to{" "}
                  <span className="text-foreground">
                    {email ? maskEmail(email) : "the address on your account"}
                  </span>
                  .
                </li>
                <li>Enter it on the sign-in screen and pick a new PIN.</li>
              </ol>
            </div>
          </div>

          {!email ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <p className="text-[12px] text-foreground font-medium">
                Add an email address first
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground mt-0.5">
                The reset code has nowhere to go without one.
              </p>
              <button
                onClick={() => navigate("/account/email")}
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent"
              >
                <Mail className="h-3 w-3" /> Add an email
              </button>
            </div>
          ) : (
            <button
              onClick={start}
              className="w-full rounded-xl bg-foreground py-3 text-[12px] font-semibold text-background transition-opacity hover:opacity-90"
            >
              Sign out and send the code
            </button>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground mt-3 px-1">
          Your current PIN keeps working until you finish the reset, so you can
          back out of this at any point.
        </p>
      </motion.div>
    </div>
  );
};

export default ResetPin;
