import { useRef, useCallback, useState } from "react";
import { motion, AnimatePresence, useDragControls, PanInfo } from "framer-motion";
import { Mic, Send } from "lucide-react";
import AIChatPanel from "@/components/chat/AIChatPanel";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
}

type SheetMode = "minimized" | "partial" | "full";

const AIChatSheet = ({ isOpen, onClose, onOpen }: Props) => {
  const dragControls = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<SheetMode>("partial");

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (info.offset.y > 80) {
        // Drag down
        if (mode === "full") setMode("partial");
        else if (mode === "partial") setMode("minimized");
        return;
      }
      if (info.offset.y < -60) {
        // Drag up
        if (mode === "minimized") setMode("partial");
        else if (mode === "partial") setMode("full");
        return;
      }
    },
    [mode],
  );

  const handleTap = () => {
    if (mode === "minimized") setMode("partial");
    else if (mode === "partial") setMode("full");
    else setMode("partial");
  };

  const heightMap: Record<SheetMode, string> = {
    minimized: "48px",
    partial: "28vh",
    full: "100vh",
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop only for full mode */}
          {mode === "full" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMode("partial")}
              className="fixed inset-0 z-50 bg-foreground/10"
            />
          )}

          <motion.div
            ref={sheetRef}
            initial={{ y: "100%" }}
            animate={{ y: 0, height: heightMap[mode], borderRadius: mode === "full" ? "0px" : "20px 20px 0 0" }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            drag="y"
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            className="fixed inset-x-0 bottom-[56px] z-40 flex flex-col bg-card overflow-hidden border-t border-border/30"
            style={{ touchAction: "none" }}
          >
            {/* Drag handle */}
            <div
              className="flex justify-center pt-1.5 pb-0.5 cursor-grab active:cursor-grabbing shrink-0"
              onPointerDown={(e) => dragControls.start(e)}
              onClick={handleTap}
            >
              <div className="h-1 w-10 rounded-full bg-border" />
            </div>

            {mode === "minimized" ? (
              /* Minimized bar */
              <div className="flex items-center justify-between px-5 pb-1" onClick={() => setMode("partial")}>
                <span className="text-xs font-medium text-muted-foreground tracking-wide">Ask Tilly, your AI Advisor</span>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full wealth-gradient flex items-center justify-center">
                    <Mic className="h-3 w-3 text-primary-foreground" />
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Spacer for partial/full header */}

                {/* Chat content */}
                <div className="flex-1 overflow-hidden">
                  <AIChatPanel isOpen={true} onClose={() => setMode("minimized")} embedded />
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AIChatSheet;
