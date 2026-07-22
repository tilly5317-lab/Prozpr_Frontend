import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { slotToDate } from "@/lib/teamCall";

const TIME_SLOTS = ["10:00 AM", "12:30 PM", "2:00 PM", "4:00 PM", "6:30 PM"];

interface RescheduleModalProps {
  onClose: () => void;
  /** Called with the picked slot when the user confirms (before closing). */
  onConfirm?: (sel: { date: Date; time: string; agenda: string }) => void;
  /** Header title. Defaults to the reschedule-meeting wording. */
  title?: string;
  /** Optional line under the title, e.g. "15-minute Zoom call". */
  meta?: string;
  /** Label for the free-text box. */
  agendaLabel?: string;
  /** Helper line under the free-text box. */
  agendaHint?: string;
  /** Confirm button text. */
  confirmLabel?: string;
}

const AGENDA_MAX = 400;

const RescheduleModal = ({
  onClose,
  onConfirm,
  title = "Reschedule meeting",
  meta,
  agendaLabel = "What to discuss",
  agendaHint = "Your advisor will see this before the call.",
  confirmLabel = "Confirm",
}: RescheduleModalProps) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [agenda, setAgenda] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A slot is bookable only in the future — the calendar blocks past days, and
  // this blocks already-passed times on today's date.
  const slotInPast = (t: string) =>
    selectedDate != null && slotToDate(selectedDate, t).getTime() <= Date.now();

  const canConfirm =
    selectedDate && selectedTime && !slotInPast(selectedTime);

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
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 flex items-center justify-center z-[60] px-4"
      >
        <div
          className="w-full max-w-md rounded-2xl bg-card shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: "min(92dvh, 720px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{ borderBottom: "1px solid hsl(var(--hairline))" }}
          >
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              {meta && <p className="mt-0.5 text-[11px] text-muted-foreground">{meta}</p>}
            </div>
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
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            </div>

            <div className="px-3 pt-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                Pick a time
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TIME_SLOTS.map((t) => {
                  const active = selectedTime === t;
                  const past = slotInPast(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={past}
                      onClick={() => setSelectedTime(t)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        past
                          ? "bg-muted text-muted-foreground/40 cursor-not-allowed line-through"
                          : active
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

            <div className="px-3 pt-4">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="reschedule-agenda"
                  className="text-[11px] uppercase tracking-wide text-muted-foreground"
                >
                  {agendaLabel}
                  <span className="ml-1 normal-case tracking-normal text-muted-foreground/70">
                    (optional)
                  </span>
                </label>
                <span className="text-[11px] text-muted-foreground/70 tabular-nums">
                  {agenda.length}/{AGENDA_MAX}
                </span>
              </div>
              <textarea
                id="reschedule-agenda"
                value={agenda}
                onChange={(e) => setAgenda(e.target.value.slice(0, AGENDA_MAX))}
                rows={3}
                placeholder="e.g. Review SIP increase, talk through tax-loss harvesting, questions on rebalance plan…"
                className="w-full resize-none rounded-lg bg-muted/50 px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/30"
                style={{ border: "1px solid hsl(var(--border))" }}
              />
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                {agendaHint}
              </p>
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
              onClick={() => {
                if (selectedDate && selectedTime) {
                  onConfirm?.({ date: selectedDate, time: selectedTime, agenda });
                }
                onClose();
              }}
              disabled={!canConfirm}
              className={`flex-1 rounded-full py-2 text-[12px] font-bold transition-opacity ${
                canConfirm
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default RescheduleModal;
