import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { CalendarDays, CalendarPlus, Clock, Download, Video } from "lucide-react";
import RescheduleModal from "./RescheduleModal";
import { cancelTeamCall, createTeamCall } from "@/lib/api";
import {
  TEAM_CALL_MINUTES,
  bookingJoinUrl,
  clearBooking,
  downloadIcs,
  googleCalendarUrl,
  loadBooking,
  saveBooking,
  slotToDate,
  teamCallEvent,
  type TeamCallBooking,
} from "@/lib/teamCall";

/**
 * "Talk to the Prozpr team" slot on the portfolio page. Keeps the advisor-meeting
 * card format, but instead of a pre-booked advisor call it invites the user to
 * book a short 15-minute Zoom call for any questions or feedback. Booking creates
 * a real Zoom meeting via the backend; the card then flips to the join link plus
 * add-to-calendar actions.
 */
const AdvisorMeetingsSlot = () => {
  const [bookOpen, setBookOpen] = useState(false);
  const [booking, setBooking] = useState<TeamCallBooking | null>(() => loadBooking());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = (sel: { date: Date; time: string; agenda: string }) => {
    const start = slotToDate(sel.date, sel.time);
    const previous = booking;
    setPending(true);
    setError(null);
    createTeamCall(start.toISOString(), sel.agenda)
      .then((m) => {
        // Rebooking: drop the old Zoom meeting quietly once the new one exists.
        if (previous?.meetingId && previous.meetingId !== m.meeting_id) {
          cancelTeamCall(previous.meetingId).catch(() => {});
        }
        const next: TeamCallBooking = {
          startIso: start.toISOString(),
          agenda: sel.agenda,
          joinUrl: m.join_url,
          meetingId: m.meeting_id,
        };
        saveBooking(next);
        setBooking(next);
      })
      .catch((e: unknown) => {
        setError(
          e instanceof Error && e.message
            ? e.message
            : "Could not book the call right now. Please try again."
        );
      })
      .finally(() => setPending(false));
  };

  const handleCancel = () => {
    if (booking?.meetingId) {
      cancelTeamCall(booking.meetingId).catch(() => {});
    }
    clearBooking();
    setBooking(null);
    setError(null);
  };

  const start = booking ? new Date(booking.startIso) : null;
  const event = booking ? teamCallEvent(booking) : null;

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

        {pending ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            <p className="text-sm text-muted-foreground">Booking your Zoom call…</p>
          </div>
        ) : booking && start && event ? (
          <>
            <p className="mt-1 text-sm font-semibold text-foreground">
              Your call with the Prozpr team is booked
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {start.toLocaleDateString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {start.toLocaleTimeString("en-IN", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
                {" · "}
                {TEAM_CALL_MINUTES} min
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <a
                href={bookingJoinUrl(booking)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold bg-foreground text-background"
              >
                <Video className="h-3.5 w-3.5" />
                Join Zoom
              </a>
              <a
                href={googleCalendarUrl(event)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold bg-muted text-foreground"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Google Calendar
              </a>
              <button
                type="button"
                onClick={() => downloadIcs(event)}
                className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold bg-muted text-foreground"
                title="Download .ics for Apple / Outlook"
              >
                <Download className="h-3.5 w-3.5" />
                .ics
              </button>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
              <button type="button" onClick={() => setBookOpen(true)} className="hover:text-foreground">
                Change time
              </button>
              <button type="button" onClick={handleCancel} className="hover:text-foreground">
                Cancel booking
              </button>
            </div>
          </>
        ) : (
          <>
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
                {TEAM_CALL_MINUTES} min
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
          </>
        )}

        {error && !pending && (
          <p className="mt-2 text-[11px] text-destructive">{error}</p>
        )}
      </div>

      <AnimatePresence>
        {bookOpen && (
          <RescheduleModal
            onClose={() => setBookOpen(false)}
            onConfirm={handleConfirm}
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
