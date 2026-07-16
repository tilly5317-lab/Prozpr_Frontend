import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { CalendarDays, Clock, Video } from "lucide-react";
import RescheduleModal from "./RescheduleModal";

/**
 * "Talk to the Prozpr team" slot on the portfolio page. Keeps the advisor-meeting
 * card format, but instead of a pre-booked advisor call it invites the user to
 * book a short 15-minute Zoom call for any questions or feedback.
 */
const AdvisorMeetingsSlot = () => {
  const [bookOpen, setBookOpen] = useState(false);

  return (
    <>
      <div
        className="w-full rounded-[14px] p-[14px] bg-card"
        style={{ border: "1px solid hsl(var(--border))" }}
      >
        <p
          className="text-[11px] uppercase text-muted-foreground"
          style={{ fontWeight: 500, letterSpacing: "1.5px" }}
        >
          Questions or Feedback
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          Talk to the Prozpr team
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Book a quick call — questions, feedback, anything on your mind.
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Video className="h-3 w-3" />
            Zoom
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            15 min
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBookOpen(true)}
            className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold bg-foreground text-background"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Book a time
          </button>
        </div>
      </div>

      <AnimatePresence>
        {bookOpen && (
          <RescheduleModal
            onClose={() => setBookOpen(false)}
            title="Book a time with Prozpr"
            meta="15-minute Zoom call"
            agendaLabel="What's on your mind?"
            agendaHint="The Prozpr team will see this before the call."
            confirmLabel="Book time"
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default AdvisorMeetingsSlot;
