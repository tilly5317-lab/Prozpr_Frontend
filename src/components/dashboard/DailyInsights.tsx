import { useState, useRef } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { Sparkles, X, ExternalLink } from "lucide-react";

interface NewsItem {
  id: number;
  headline: string;
  source: string;
  summary: string;
  fullSnippet: string;
  category: "Markets" | "Personal Finance" | "Crypto" | "Global Economy";
  imageUrl: string;
  timestamp: string;
  readMoreUrl: string;
}

const newsItems: NewsItem[] = [
  {
    id: 1,
    headline: "Sensex surges 600 pts as FIIs turn net buyers after three-month pause",
    source: "Economic Times",
    summary: "FII inflows resume after a prolonged sell-off, boosting banking and auto stocks on BSE.",
    fullSnippet: "Foreign institutional investors turned net buyers of Indian equities after nearly three months of sustained selling, injecting over ₹4,200 crore in a single session. The Sensex rallied 600 points led by HDFC Bank, ICICI Bank, and Maruti Suzuki. Analysts expect the trend to continue as the rupee stabilises and global risk appetite improves following the Fed's dovish commentary.",
    category: "Markets",
    imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=120&h=80&fit=crop",
    timestamp: "2 hours ago",
    readMoreUrl: "https://economictimes.indiatimes.com",
  },
  {
    id: 2,
    headline: "RBI signals rate cut in April policy amid softening inflation",
    source: "Mint",
    summary: "RBI Governor hints at a 25 bps cut as CPI inflation drops to 4.2%, within the comfort zone.",
    fullSnippet: "The Reserve Bank of India signalled a potential 25 basis point rate cut at its April monetary policy meeting as consumer price inflation eased to 4.2% in February — well within the RBI's 2-6% target band. Governor Malhotra noted that the growth-inflation balance is tilting favourably, and the MPC could prioritise supporting economic growth. Bond yields fell 8 bps on the announcement, and rate-sensitive sectors like real estate and NBFCs rallied sharply.",
    category: "Global Economy",
    imageUrl: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=120&h=80&fit=crop",
    timestamp: "4 hours ago",
    readMoreUrl: "https://livemint.com",
  },
  {
    id: 3,
    headline: "Gold hits ₹72,000 per 10g — should you increase allocation?",
    source: "Moneycontrol",
    summary: "Gold prices surge to all-time highs amid global uncertainty. Analysts recommend 5-10% portfolio allocation.",
    fullSnippet: "Gold prices in India crossed the ₹72,000 per 10 gram mark for the first time, driven by geopolitical tensions and central bank buying globally. Domestic demand has also picked up ahead of the wedding season. Financial advisors suggest maintaining a 5-10% allocation to gold as a hedge against equity volatility. Sovereign Gold Bonds and Gold ETFs remain the preferred routes for systematic gold investing, offering better liquidity and no making charges.",
    category: "Personal Finance",
    imageUrl: "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=120&h=80&fit=crop",
    timestamp: "5 hours ago",
    readMoreUrl: "https://moneycontrol.com",
  },
  {
    id: 4,
    headline: "Bitcoin crosses ₹85L as Indian crypto exchanges see record volumes",
    source: "Business Standard",
    summary: "Crypto rally accelerates as regulatory clarity nears. WazirX and CoinDCX report 3x daily volume.",
    fullSnippet: "Bitcoin surged past the ₹85 lakh mark in India as global institutional adoption accelerated and Indian crypto exchanges reported record trading volumes. WazirX and CoinDCX both noted a 3x increase in daily trading volumes over the past week. Market participants are optimistic about incoming regulatory clarity, with the finance ministry expected to release a comprehensive crypto framework by Q2 2026. Ethereum and Solana also posted double-digit weekly gains.",
    category: "Crypto",
    imageUrl: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=120&h=80&fit=crop",
    timestamp: "6 hours ago",
    readMoreUrl: "https://business-standard.com",
  },
  {
    id: 5,
    headline: "Nifty 50 crosses 24,000 — IT and banking stocks lead the rally",
    source: "NDTV Profit",
    summary: "Benchmark index hits fresh all-time high. TCS, Infosys and HDFC Bank among top contributors.",
    fullSnippet: "The Nifty 50 index breached the 24,000 level for the first time, with IT and banking heavyweights leading the charge. TCS gained 3.2% on strong deal pipeline commentary, while HDFC Bank rose 2.8% on improving asset quality metrics. Market breadth remained positive with the advance-decline ratio at 3:1 on the NSE. Analysts note that the rally is broad-based, with mid-caps and small-caps also participating, suggesting sustainable momentum ahead of the earnings season.",
    category: "Markets",
    imageUrl: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=120&h=80&fit=crop",
    timestamp: "8 hours ago",
    readMoreUrl: "https://ndtvprofit.com",
  },
];

const categoryColors: Record<string, string> = {
  Markets: "bg-accent/15 text-accent",
  "Personal Finance": "bg-wealth-green/15 text-wealth-green",
  Crypto: "bg-wealth-amber/15 text-wealth-amber",
  "Global Economy": "bg-primary/10 text-primary",
};

const DailyInsights = () => {
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);

  return (
    <>
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/70">Daily Insights</p>
          <span className="text-[9px] text-muted-foreground/40 ml-auto">Curated for you</span>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
          {newsItems.map((item, i) => (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setSelectedArticle(item)}
              className="shrink-0 w-[220px] rounded-xl bg-card border border-border/40 shadow-sm overflow-hidden text-left hover:shadow-md transition-shadow"
            >
              <div className="flex gap-2.5 p-2.5">
                <img
                  src={item.imageUrl}
                  alt={item.headline}
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  loading="lazy"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-foreground leading-tight line-clamp-2 mb-1">
                    {item.headline}
                  </p>
                  <p className="text-[8px] text-muted-foreground mb-1.5">{item.source}</p>
                  <span className={`inline-block rounded-full px-1.5 py-0.5 text-[7px] font-semibold ${categoryColors[item.category]}`}>
                    {item.category}
                  </span>
                </div>
              </div>
              <div className="px-2.5 pb-2">
                <p className="text-[9px] text-muted-foreground leading-snug line-clamp-2">{item.summary}</p>
              </div>
              <div className="flex items-center gap-1 px-2.5 pb-2">
                <Sparkles className="h-2 w-2 text-accent/60" />
                <span className="text-[7px] text-accent/60 font-medium">AI curated</span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Expanded 50% bottom sheet */}
      <AnimatePresence>
        {selectedArticle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 backdrop-blur-sm"
            onClick={() => setSelectedArticle(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_: unknown, info: PanInfo) => {
                if (info.offset.y > 80) setSelectedArticle(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-2xl bg-card shadow-xl overflow-hidden"
              style={{ height: "50vh", touchAction: "none" }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-2.5 pb-1">
                <div className="h-1 w-9 rounded-full bg-border" />
              </div>

              {/* Header image */}
              <div className="relative h-32 w-full overflow-hidden">
                <img
                  src={selectedArticle.imageUrl}
                  alt={selectedArticle.headline}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent" />
                <button
                  onClick={() => setSelectedArticle(null)}
                  className="absolute top-3 right-3 h-7 w-7 rounded-full bg-card/80 backdrop-blur flex items-center justify-center"
                >
                  <X className="h-3.5 w-3.5 text-foreground" />
                </button>
                <div className="absolute bottom-3 left-4 right-4">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold mb-1.5 ${categoryColors[selectedArticle.category]}`}>
                    {selectedArticle.category}
                  </span>
                  <h2 className="text-sm font-semibold text-foreground leading-tight">{selectedArticle.headline}</h2>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: "calc(50vh - 180px)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{selectedArticle.source}</span>
                  <span className="text-[10px] text-muted-foreground/40">•</span>
                  <span className="text-[10px] text-muted-foreground">{selectedArticle.timestamp}</span>
                  <div className="flex items-center gap-1 ml-auto">
                    <Sparkles className="h-2.5 w-2.5 text-accent" />
                    <span className="text-[9px] text-accent font-medium">AI curated</span>
                  </div>
                </div>

                <p className="text-xs text-foreground/80 leading-relaxed">
                  {selectedArticle.fullSnippet}
                </p>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setSelectedArticle(null)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground py-2.5 text-[11px] font-semibold"
                  >
                    <Sparkles className="h-3 w-3" />
                    Ask Tilly about this
                  </button>
                  <a
                    href={selectedArticle.readMoreUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 rounded-xl border border-border px-4 py-2.5 text-[11px] font-medium text-muted-foreground"
                  >
                    Read more →
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default DailyInsights;
