/**
 * Prozpr-team Zoom call — shared link config + add-to-calendar helpers.
 *
 * The team call uses one standing Zoom room, configurable per deploy via
 * VITE_PROZPR_ZOOM_URL (falls back to the sandbox placeholder link).
 */

export const PROZPR_ZOOM_URL =
  import.meta.env.VITE_PROZPR_ZOOM_URL || "https://zoom.us/j/000000";

export const TEAM_CALL_MINUTES = 15;

export interface TeamCallBooking {
  /** Absolute start of the booked slot, ISO string. */
  startIso: string;
  agenda: string;
  /** Real per-meeting Zoom join URL from the backend (falls back to PROZPR_ZOOM_URL). */
  joinUrl?: string;
  /** Zoom meeting id — needed to cancel/reschedule server-side. */
  meetingId?: number;
}

const STORAGE_KEY = "prozpr_team_call_booking";

export function loadBooking(): TeamCallBooking | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TeamCallBooking;
    if (!parsed?.startIso || Number.isNaN(new Date(parsed.startIso).getTime())) return null;
    // Expire once the slot (plus the call itself) has passed.
    const end = new Date(parsed.startIso).getTime() + TEAM_CALL_MINUTES * 60_000;
    if (Date.now() > end) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveBooking(booking: TeamCallBooking): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(booking));
  } catch {
    /* storage unavailable — booking just won't persist across reloads */
  }
}

export function clearBooking(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Combine a picked calendar date with a "10:00 AM"-style slot label. */
export function slotToDate(date: Date, time: string): Date {
  const d = new Date(date);
  const m = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (m) {
    let hours = parseInt(m[1], 10) % 12;
    if (/pm/i.test(m[3])) hours += 12;
    d.setHours(hours, parseInt(m[2], 10), 0, 0);
  }
  return d;
}

export interface CalendarEvent {
  title: string;
  start: Date;
  end: Date;
  description: string;
  location: string;
}

export function bookingJoinUrl(booking: TeamCallBooking): string {
  return booking.joinUrl || PROZPR_ZOOM_URL;
}

export function teamCallEvent(booking: TeamCallBooking): CalendarEvent {
  const start = new Date(booking.startIso);
  const joinUrl = bookingJoinUrl(booking);
  return {
    title: "Prozpr team call",
    start,
    end: new Date(start.getTime() + TEAM_CALL_MINUTES * 60_000),
    description: [
      `Join Zoom: ${joinUrl}`,
      booking.agenda ? `\nAgenda: ${booking.agenda}` : "",
    ].join(""),
    location: joinUrl,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC timestamp in the compact format Google/iCal expect: YYYYMMDDTHHMMSSZ */
function icalUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export function googleCalendarUrl(ev: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${icalUtc(ev.start)}/${icalUtc(ev.end)}`,
    details: ev.description,
    location: ev.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Build a one-event .ics file and trigger a download (Apple/Outlook/etc). */
export function downloadIcs(ev: CalendarEvent): void {
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Prozpr//Team Call//EN",
    "BEGIN:VEVENT",
    `UID:${ev.start.getTime()}@prozpr.app`,
    `DTSTAMP:${icalUtc(new Date())}`,
    `DTSTART:${icalUtc(ev.start)}`,
    `DTEND:${icalUtc(ev.end)}`,
    `SUMMARY:${esc(ev.title)}`,
    `DESCRIPTION:${esc(ev.description)}`,
    `LOCATION:${esc(ev.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "prozpr-team-call.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
