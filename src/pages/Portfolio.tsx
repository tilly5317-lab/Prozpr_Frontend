import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import PortfolioDashboard from "@/components/dashboard/PortfolioDashboard";

const STORAGE_KEY = "portfolio_first_visit_shown";

const Portfolio = () => {
  const navigate = useNavigate();
  const [showPopup, setShowPopup] = useState(true);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setShowPopup(false);
  };

  const handleTakeALook = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setShowPopup(false);
    navigate("/execute");
  };

  return (
    <div className="relative min-h-screen bg-background">
      <PortfolioDashboard />

      <AnimatePresence>
        {showPopup && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={dismiss}
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-0 z-50 flex items-center justify-center px-5"
            >
              <div className="relative w-full max-w-[340px] rounded-2xl bg-card border border-border/60 p-5 shadow-lg">
                <div className="flex flex-col items-center text-center pt-1">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-lg">✦</span>
                  </div>
                  <p className="text-[14px] font-semibold text-foreground leading-snug">
                    Tilly has an investment recommendation for you
                  </p>
                  <button
                    onClick={handleTakeALook}
                    className="mt-4 w-full rounded-xl bg-foreground py-3 text-[14px] font-semibold text-background transition-all active:scale-[0.97]"
                  >
                    Take a look
                  </button>
                  <button
                    onClick={dismiss}
                    className="mt-1 w-full py-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Maybe later →
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Portfolio;
