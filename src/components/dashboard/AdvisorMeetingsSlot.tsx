import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { CalendarDays, Clock, Video } from "lucide-react";
import RescheduleModal from "./RescheduleModal";

const AdvisorMeetingsSlot = () => {
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

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
          Advisor Meetings
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          Mon 14 Oct · 4:00 PM
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          with Sanjay R · Sr. Advisor
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            Quarterly review
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            38 min
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <a
            href="https://zoom.us/j/000000"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold bg-foreground text-background"
          >
            <Video className="h-3.5 w-3.5" />
            Join Zoom
          </a>
          <button
            type="button"
            onClick={() => setRescheduleOpen(true)}
            className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[12px] font-semibold bg-muted text-foreground"
          >
            Reschedule
          </button>
        </div>
      </div>

      <AnimatePresence>
        {rescheduleOpen && (
          <RescheduleModal onClose={() => setRescheduleOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
};

export default AdvisorMeetingsSlot;
