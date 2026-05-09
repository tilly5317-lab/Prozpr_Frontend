import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";

const TIME_SLOTS = ["10:00 AM", "12:30 PM", "2:00 PM", "4:00 PM", "6:30 PM"];

interface RescheduleModalProps {
  onClose: () => void;
}

const RescheduleModal = ({ onClose }: RescheduleModalProps) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canConfirm = selectedDate && selectedTime;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/45"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Reschedule advisor meeting"
        className="fixed inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center z-[60] px-0 sm:px-4"
      >
        <div
          className="mx-auto w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-card shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: "min(92dvh, 720px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{ borderBottom: "1px solid hsl(var(--hairline))" }}
          >
            <h2 className="text-base font-semibold text-foreground flex-1">
              Reschedule meeting
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pt-2 pb-3">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              className="mx-auto"
            />

            <div className="px-3 pt-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                Pick a time
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TIME_SLOTS.map((t) => {
                  const active = selectedTime === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTime(t)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        active
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{ borderTop: "1px solid hsl(var(--hairline))" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground"
              style={{ border: "1px solid hsl(var(--border))" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={!canConfirm}
              className={`flex-1 rounded-full py-2 text-[12px] font-bold transition-opacity ${
                canConfirm
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
              }`}
            >
              Confirm
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default RescheduleModal;
