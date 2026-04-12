import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronRight, Mic, MicOff, Send, X, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";

interface ETFOption {
  ticker: string;
  name: string;
  descriptor: string;
  fee: string;
  perf1Y: string;
  minCost: string;
  subtext: string;
  recommended?: boolean;
  rationale?: string;
  perf3Y?: string;
  perf5Y?: string;
  dividendYield?: string;
  aum?: string;
  minInvestment?: string;
}

const options: ETFOption[] = [
  {
    ticker: "CSPX",
    name: "iShares Core S&P 500 UCITS ETF",
    descriptor: "Broad US market exposure · low-cost core holding",
    fee: "0.07%",
    perf1Y: "+24.2%",
    minCost: "₹8,500",
    recommended: true,
    rationale:
      "Best fit for your current underweight US equity position. Lowest fee of all options, strong 5-year consistency, and aligns with your Aggressive risk profile.",
    subtext: "",
    perf3Y: "+38.1%",
    perf5Y: "+92.4%",
    dividendYield: "1.3%",
    aum: "$72.4B",
    minInvestment: "₹8,500",
  },
  {
    ticker: "IUSA",
    name: "iShares S&P 500 UCITS ETF",
    descriptor: "70% tech exposure · 12% financials · 8% healthcare",
    fee: "0.07%",
    perf1Y: "+23.8%",
    minCost: "₹9,200",
    subtext: "Near-identical to CSPX but slightly higher spread.",
    perf3Y: "+37.2%",
    perf5Y: "+90.1%",
    dividendYield: "1.4%",
    aum: "$18.6B",
    minInvestment: "₹9,200",
  },
  {
    ticker: "VUSA",
    name: "Vanguard S&P 500 UCITS ETF",
    descriptor: "68% tech · 13% financials · lower dividend yield",
    fee: "0.07%",
    perf1Y: "+23.5%",
    minCost: "₹7,800",
    subtext: "Vanguard structure preferred by long-term passive investors.",
    perf3Y: "+36.8%",
    perf5Y: "+89.7%",
    dividendYield: "1.2%",
    aum: "$38.2B",
    minInvestment: "₹7,800",
  },
  {
    ticker: "EQQQ",
    name: "Invesco NASDAQ-100 UCITS ETF",
    descriptor: "90% tech & growth · concentrated in top 10 holdings",
    fee: "0.30%",
    perf1Y: "+29.1%",
    minCost: "₹34,000",
    subtext:
      "Higher growth potential but concentrated risk — suitable as a satellite position only given your current 75% equity allocation.",
    perf3Y: "+42.5%",
    perf5Y: "+108.3%",
    dividendYield: "0.5%",
    aum: "$8.1B",
    minInvestment: "₹34,000",
  },
];

const TillyAvatar = () => (
  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary">
    <Sparkles className="h-2.5 w-2.5 text-primary-foreground" />
  </div>
);

interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

const Rebalancing = () => {
  const navigate = useNavigate();
  const [selectedETF, setSelectedETF] = useState<ETFOption | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "ai",
      content:
        "I've selected these 4 ETFs based on your mandate. CSPX is my top pick — want me to walk you through why, or compare any two options side by side?",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [micActive, setMicActive] = useState(false);
  const [showTillyPill, setShowTillyPill] = useState(true);

  // Auto-dismiss pill after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowTillyPill(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  const sendChat = (text: string) => {
    if (!text.trim()) return;
    setChatMessages((prev) => [...prev, { role: "user", content: text.trim() }]);
    setChatInput("");
    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content:
            "CSPX has the lowest tracking error at 0.02% and the tightest bid-ask spread. For a core holding, it's the most cost-efficient option in this set.",
        },
      ]);
    }, 1200);
  };

  return (
    <div className="mobile-container bg-background min-h-screen flex flex-col pb-16">
      {/* Header */}
      <div className="px-5 pt-10 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Rebalancing</h1>
          <p className="text-[11px] text-muted-foreground">
            4 options selected based on your allocation, risk profile, and fee efficiency
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 px-5 pb-20 pt-4" style={{ overflow: "visible auto" }}>
        <div className="space-y-2" style={{ overflow: "visible" }}>
        {options.map((opt, i) => (
          <motion.button
            key={opt.ticker}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.3 }}
            onClick={() => setSelectedETF(opt)}
            className="w-full text-left wealth-card p-3"
            style={{ overflow: "visible", position: "relative" as const, ...(opt.recommended ? { border: "2px solid #B8860B", boxShadow: "0 0 16px 4px rgba(184,134,11,0.35)" } : {}) }}
          >
            {opt.recommended && (
              <span
                style={{
                  position: "absolute",
                  top: "-1px",
                  right: "16px",
                  transform: "translateY(-50%)",
                  zIndex: 50,
                  background: "#B8860B",
                  color: "#ffffff",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "4px 12px",
                  borderRadius: "99px",
                  whiteSpace: "nowrap",
                  boxShadow: "0 2px 8px rgba(184,134,11,0.4)",
                }}
              >
                ✦ Recommended
              </span>
            )}

            <p className="text-[13px] font-bold text-foreground leading-tight">
              {opt.ticker}{" "}
              <span className="font-semibold text-foreground/80">· {opt.name}</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{opt.descriptor}</p>

            {/* Stat chips */}
            <div className="flex gap-1.5 mt-1.5">
              {[
                { label: "Fee", value: opt.fee },
                { label: "1Y", value: opt.perf1Y },
                { label: "Min", value: opt.minCost },
              ].map((s) => (
                <span
                  key={s.label}
                  className="rounded-lg bg-secondary/60 border border-border/40 px-2 py-1 text-[10px] text-muted-foreground"
                >
                  <span className="font-medium text-foreground">{s.value}</span>{" "}
                  {s.label}
                </span>
              ))}
            </div>

            {opt.recommended && opt.rationale && (
              <p className="text-[10px] text-muted-foreground leading-relaxed mt-1.5 border-t border-border/30 pt-1.5">
                {opt.rationale}
              </p>
            )}

            {!opt.recommended && opt.subtext && (
              <p className="text-[10px] text-muted-foreground/70 mt-1">{opt.subtext}</p>
            )}

            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30" />
          </motion.button>
        ))}
        </div>
      </div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selectedETF && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 backdrop-blur-sm"
            onClick={() => setSelectedETF(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="w-full max-w-md rounded-t-[28px] bg-card p-5 pb-8 shadow-wealth-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-3">
                <div className="h-1 w-9 rounded-full bg-border" />
              </div>

              <h2 className="text-base font-bold text-foreground">
                {selectedETF.ticker}{" "}
                <span className="font-semibold text-foreground/80">· {selectedETF.name}</span>
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-4">
                {selectedETF.descriptor}
              </p>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: "Fee (TER)", value: selectedETF.fee },
                  { label: "1Y Perf", value: selectedETF.perf1Y },
                  { label: "3Y Perf", value: selectedETF.perf3Y ?? "—" },
                  { label: "5Y Perf", value: selectedETF.perf5Y ?? "—" },
                  { label: "Div Yield", value: selectedETF.dividendYield ?? "—" },
                  { label: "AUM", value: selectedETF.aum ?? "—" },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl bg-secondary/50 border border-border/40 px-2.5 py-2 text-center"
                  >
                    <p className="text-[9px] text-muted-foreground">{s.label}</p>
                    <p className="text-xs font-bold text-foreground mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>

              <p className="text-sm text-foreground/80 leading-relaxed mb-5">
                {selectedETF.rationale || selectedETF.subtext}
              </p>

              <button
                onClick={() => setSelectedETF(null)}
                className="w-full rounded-xl wealth-gradient py-3 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98]"
              >
                Select This Option
              </button>
              <button
                onClick={() => setSelectedETF(null)}
                className="w-full mt-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-16 left-0 right-0 z-40 flex flex-col"
            style={{ height: "45vh" }}
          >
            <div className="max-w-md mx-auto w-full flex flex-col h-full rounded-t-[28px] bg-card shadow-wealth-lg border-t border-border/30">
              {/* Chat header */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <TillyAvatar />
                  <span className="text-sm font-semibold text-foreground">Ask Tilly</span>
                </div>
                <button onClick={() => setChatOpen(false)} className="text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {chatMessages.map((msg, i) => (
                  <div key={i}>
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div
                          className="max-w-[80%] rounded-2xl rounded-tr-sm px-3 py-2 text-[12px] leading-relaxed text-primary-foreground"
                          style={{ backgroundColor: "hsl(var(--user-bubble) / 0.85)" }}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 items-start max-w-[88%]">
                        <TillyAvatar />
                        <div
                          className="rounded-2xl rounded-tl-sm px-3 py-2 text-[12px] leading-relaxed text-foreground/90"
                          style={{
                            backgroundColor: "hsl(var(--tilly-bubble))",
                            borderLeft: "2px solid hsl(var(--wealth-navy) / 0.3)",
                          }}
                        >
                          {msg.content}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChat(chatInput);
                }}
                className="flex items-center gap-2 px-4 py-2 border-t border-border/30"
              >
                <button
                  type="button"
                  onClick={() => setMicActive(!micActive)}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all ${
                    micActive
                      ? "wealth-gradient text-primary-foreground ring-2 ring-primary/40 animate-pulse"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {micActive ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </button>
                <div className="flex flex-1 items-center rounded-full border border-border/60 bg-background px-3 py-1.5">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about these options..."
                    className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full wealth-gradient text-primary-foreground disabled:opacity-20"
                >
                  <Send className="h-3 w-3" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB + Tilly pill */}
      {!chatOpen && (
        <div className="fixed bottom-20 right-5 z-40 flex flex-col items-center">
          {/* Speak to Tilly pill */}
          <AnimatePresence>
            {showTillyPill && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: [0, -4, 0] }}
                exit={{ opacity: 0, y: 4 }}
                transition={{
                  opacity: { duration: 0.4, ease: "easeOut" },
                  y: { duration: 2.5, ease: "easeInOut", repeat: Infinity },
                }}
                className="mb-1 flex flex-col items-center"
              >
                <span
                  style={{
                    background: "rgba(184, 134, 11, 0.70)",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "6px 14px",
                    borderRadius: "99px",
                    whiteSpace: "nowrap",
                  }}
                >
                  💬 Speak to Tilly
                </span>
                {/* Caret */}
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "6px solid transparent",
                    borderRight: "6px solid transparent",
                    borderTop: "6px solid #B8860B",
                    marginTop: "-1px",
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            onClick={() => setChatOpen(true)}
            className="flex h-14 w-14 items-center justify-center rounded-full wealth-gradient text-primary-foreground"
            style={{
              boxShadow: "0 4px 24px -4px hsl(var(--wealth-navy) / 0.5)",
            }}
          >
            <Mic className="h-5 w-5" />
          </motion.button>
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default Rebalancing;