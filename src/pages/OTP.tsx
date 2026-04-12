import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import NewOnboardingFlow from "@/components/onboarding/NewOnboardingFlow";
import PortfolioDashboard from "@/components/dashboard/PortfolioDashboard";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type Screen = "onboarding" | "dashboard";

const MOCK_ACCOUNTS = [
  { id: "hdfc", bank: "HDFC Bank", type: "Savings Account", ending: "4821" },
  { id: "sbi", bank: "SBI", type: "Savings Account", ending: "7703" },
  { id: "icici", bank: "ICICI Bank", type: "Current Account", ending: "2290" },
];

const OTP = () => {
  const navigate = useNavigate();
  const hasCompletedOnboarding = sessionStorage.getItem("onboardingComplete") === "true";
  const [screen, setScreen] = useState<Screen>(hasCompletedOnboarding ? "dashboard" : "onboarding");
  const [showPopup, setShowPopup] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(MOCK_ACCOUNTS.map((a) => [a.id, true]))
  );

  const handleOnboardingComplete = () => {
    sessionStorage.setItem("onboardingComplete", "true");
    setScreen("dashboard");
  };

  const toggleAccount = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleConsent = () => {
    setShowPopup(false);
    navigate("/link-accounts");
  };

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatePresence mode="wait">
        {screen === "onboarding" && (
          <motion.div key="onboarding" exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <NewOnboardingFlow onComplete={handleOnboardingComplete} />
          </motion.div>
        )}
        {screen === "dashboard" && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
            <PortfolioDashboard />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Account Aggregator Modal */}
      <AnimatePresence>
      {showPopup && (
          <>
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPopup(false)}
            >
            <motion.div
              className="relative bg-card shadow-xl"
              style={{
                width: "88%",
                maxWidth: 340,
                borderRadius: 16,
                padding: 24,
              }}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
            >
              {/* Close button */}
              <button
                onClick={() => setShowPopup(false)}
                className="absolute right-4 top-4 rounded-sm text-muted-foreground transition-opacity hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Heading */}
              <h2 className="font-medium text-foreground" style={{ fontSize: 17 }}>
                We found your accounts
              </h2>
              <p className="text-muted-foreground" style={{ fontSize: 12, marginTop: 4 }}>
                Linked via Account Aggregator
              </p>

              {/* Account cards */}
              <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
                {MOCK_ACCOUNTS.map((account) => (
                  <label
                    key={account.id}
                    className="flex cursor-pointer items-center justify-between rounded-lg border bg-background transition-colors hover:bg-accent/40"
                    style={{ padding: "12px 14px" }}
                    htmlFor={account.id}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground" style={{ fontSize: 13 }}>
                        {account.bank}
                      </span>
                      <span className="text-muted-foreground" style={{ fontSize: 11 }}>
                        {account.type} ending in {account.ending}
                      </span>
                    </div>
                    <Checkbox
                      id={account.id}
                      checked={selected[account.id]}
                      onCheckedChange={() => toggleAccount(account.id)}
                    />
                  </label>
                ))}
              </div>

              {/* CTA */}
              <Button className="w-full" size="lg" onClick={handleConsent} style={{ marginTop: 16 }}>
                Give Consent &amp; Connect
              </Button>

              {/* Trust badge */}
              <p
                className="text-center text-muted-foreground"
                style={{ fontSize: 11, marginTop: 12 }}
              >
                🔒 Powered by RBI Account Aggregator framework
              </p>
            </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OTP;
