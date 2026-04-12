import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import PortfolioDashboard from "@/components/dashboard/PortfolioDashboard";

const PortfolioPopup = () => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(true);

  return (
    <div className="relative min-h-screen bg-background">
      <PortfolioDashboard />

      <AnimatePresence>
        {showModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-0 z-50 flex items-center justify-center px-6"
              onClick={() => setShowModal(false)}
            >
              <div
                className="relative w-full max-w-[340px] rounded-2xl bg-card p-6"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Close */}
                <button
                  onClick={() => setShowModal(false)}
                  className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* Content */}
                <div className="flex flex-col items-center text-center pt-2">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-lg">✦</span>
                  </div>

                  <h2 className="text-[17px] font-semibold text-foreground leading-tight">
                    Get a personalised recommendation
                  </h2>

                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    Tell us a little more about you so Tilly can give you smarter, tailored advice.
                  </p>

                  <button
                    onClick={() => navigate("/voice-onboarding")}
                    className="mt-5 w-full rounded-xl bg-foreground py-3 text-[14px] font-semibold text-background transition-all active:scale-[0.97]"
                  >
                    Chat with Tilly →
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

export default PortfolioPopup;
