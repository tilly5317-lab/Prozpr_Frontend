import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, X, Pencil, Trash2, Plus, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";

interface ChatMessage {
  role: "bonnie" | "ai";
  content: string;
}

const transcript: ChatMessage[] = [
  { role: "ai", content: "Good afternoon, Bonnie. Let's review your portfolio positioning for this quarter." },
  { role: "bonnie", content: "Thanks, Tilly. I've been reading about the US market strength lately." },
  { role: "ai", content: "Indeed — US equities have outperformed most global indices this year, led by strong earnings in technology and healthcare." },
  { role: "bonnie", content: "My current allocation is 100% India-based, right?" },
  { role: "ai", content: "Correct. You're currently at 100% Indian allocation — 72% Indian equities and 28% Indian fixed income. No international exposure at present." },
  { role: "bonnie", content: "I think it's time to diversify. I'd like to have 3% exposure to US assets going forward." },
  { role: "ai", content: "Understood. I'll note that as a mandate update. Let me prepare a summary and recommendation for you." },
];

const summaryBullets = [
  "Current portfolio: 100% allocated to Indian equities and fixed income",
  "Discussed global diversification strategy and US market performance",
  "Client requested 3% reallocation into US assets",
  "Risk profile remains unchanged — moderate",
  "Adviser to propose rebalancing recommendation",
];

const MeetingNotes = () => {
  const navigate = useNavigate();
  const [showSummary, setShowSummary] = useState(true);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [showRebalance, setShowRebalance] = useState(false);
  const [mandateApproved, setMandateApproved] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editableBullets, setEditableBullets] = useState<string[]>([...summaryBullets]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleApproveMandate = () => {
    setMandateApproved(true);
    setTimeout(() => setShowRebalance(true), 600);
  };

  return (
    <div className="mobile-container bg-background pb-20 min-h-screen flex flex-col">
      {/* Header */}
      <div className="px-5 pt-10 pb-2 flex items-center gap-3">
        <button onClick={() => navigate("/meeting-notes")} className="text-foreground">
          <ArrowLeft className="h-4.5 w-4.5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Meeting Notes</h1>
          <p className="text-[11px] text-muted-foreground">9 March 2026 · Quarterly Review</p>
        </div>
      </div>

      {/* Chat transcript — loaded instantly */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5">
        {transcript.map((msg, i) => (
          <div key={i}>
            {msg.role === "bonnie" ? (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">{msg.content}</div>
              </div>
            ) : (
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2 text-sm text-foreground leading-relaxed">{msg.content}</div>
            )}
          </div>
        ))}
      </div>

      {/* Meeting Summary — collapsible panel */}
      <AnimatePresence>
        {showSummary && !mandateApproved && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-50 flex items-end justify-center ${summaryCollapsed ? "pointer-events-none" : "bg-foreground/20 backdrop-blur-sm"}`}
            onClick={() => setSummaryCollapsed(true)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={summaryCollapsed ? { y: "calc(100% - 48px)" } : { y: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="w-full max-w-md rounded-t-2xl bg-card shadow-wealth-lg pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag pill handle */}
              <button
                onClick={() => setSummaryCollapsed(!summaryCollapsed)}
                className="flex justify-center w-full pt-2.5 pb-1 cursor-pointer"
              >
                <div className="h-1 w-9 rounded-full bg-muted-foreground/30" />
              </button>

              {/* Header row — always visible */}
              <div className="flex items-center justify-between px-5 pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">Meeting Summary</h3>
                  <motion.div
                    animate={{ rotate: summaryCollapsed ? 0 : 180 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </motion.div>
                </div>
                <button
                  onClick={() => setIsEditingSummary(!isEditingSummary)}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    isEditingSummary
                      ? "bg-accent/15 text-accent"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isEditingSummary ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                  {isEditingSummary ? "Done" : "Edit"}
                </button>
              </div>

              {/* Collapsible content */}
              <AnimatePresence>
                {!summaryCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", damping: 30, stiffness: 300 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5">
                      <div className="space-y-2 mb-4">
                        {editableBullets.map((bullet, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                            {isEditingSummary ? (
                              <div className="flex-1 flex items-start gap-1.5">
                                <input
                                  value={bullet}
                                  onChange={(e) => {
                                    const updated = [...editableBullets];
                                    updated[i] = e.target.value;
                                    setEditableBullets(updated);
                                  }}
                                  className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
                                />
                                <button
                                  onClick={() => setEditableBullets(editableBullets.filter((_, idx) => idx !== i))}
                                  className="mt-1 shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <p className="text-sm text-foreground leading-relaxed">{bullet}</p>
                            )}
                          </div>
                        ))}

                        {isEditingSummary && (
                          <button
                            onClick={() => setEditableBullets([...editableBullets, ""])}
                            className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 transition-colors ml-3.5 mt-1"
                          >
                            <Plus className="h-3 w-3" /> Add point
                          </button>
                        )}
                      </div>

                      <button onClick={handleApproveMandate} className="w-full flex items-center justify-center gap-2 rounded-xl wealth-gradient py-3 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98]">
                        <Check className="h-4 w-4" /> Approve & Update Client Mandate
                      </button>
                      <button onClick={() => { setShowSummary(false); navigate("/profile"); }} className="w-full mt-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                        Review Later
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rebalancing Modal */}
      <AnimatePresence>
        {showRebalance && !orderPlaced && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 backdrop-blur-sm">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="w-full max-w-md rounded-t-2xl bg-card p-5 shadow-wealth-lg"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/20"><span className="text-sm">📊</span></div>
                <h3 className="text-base font-semibold text-foreground">AI Rebalancing Suggestion</h3>
              </div>
              <div className="rounded-xl bg-secondary/50 border border-border/60 p-3.5 mb-4">
                <p className="text-sm text-foreground leading-relaxed">
                  Based on your updated mandate, I recommend reallocating <strong>3% of your portfolio into US equities</strong>. This provides meaningful diversification while maintaining your current risk profile.
                </p>
                <p className="text-sm text-foreground leading-relaxed mt-1.5">Would you like to generate options?</p>
              </div>
              <button onClick={() => { setShowRebalance(false); navigate("/rebalancing"); }} className="w-full flex items-center justify-center gap-2 rounded-xl wealth-gradient py-3 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98]">
                Generate Options
              </button>
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setShowRebalance(false); navigate("/profile"); }} className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-medium text-secondary-foreground hover:bg-muted transition-colors">
                  Remind Me Later
                </button>
                <button onClick={() => { setShowRebalance(false); navigate("/profile"); }} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  No Thanks
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Order Placed */}
      <AnimatePresence>
        {orderPlaced && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mx-6 max-w-sm w-full rounded-2xl bg-card p-5 shadow-wealth-lg text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/20 mx-auto mb-3">
                <Check className="h-6 w-6 text-accent" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1.5">Order Placed</h3>
              <p className="text-sm text-muted-foreground mb-4">Your rebalancing order for 3% US equity exposure has been submitted. You'll receive confirmation shortly.</p>
              <button onClick={() => navigate("/profile")} className="w-full rounded-xl bg-secondary py-2.5 text-sm font-semibold text-secondary-foreground hover:bg-muted transition-colors">
                Back to Profile
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
};

export default MeetingNotes;