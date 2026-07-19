import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Circle, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import RescheduleModal from "@/components/dashboard/RescheduleModal";
import { PROZPR_ZOOM_URL } from "@/lib/teamCall";

type ActionItem = {
  text: string;
  done?: boolean;
};

type Meeting = {
  id: string;
  date: string;
  advisor: string;
  tag: string;
  summary: string;
  actions: ActionItem[];
};

const meetings: Meeting[] = [
  {
    id: "oct-2024",
    date: "Oct 12, 2024",
    advisor: "Sanjay R · Sr. Advisor · 38 min",
    tag: "Quarterly review",
    summary:
      "Reviewed Q3 performance, decided to stay the course on equity. Discussed funding Aarav's college early via gift deed.",
    actions: [
      { text: "Set up 125K/mo SIP for education fund", done: true },
      { text: "Draft gift deed with CA by Nov 15" },
      { text: "Rebalance equity -> debt before Dec 31" },
    ],
  },
  {
    id: "jul-2024",
    date: "Jul 03, 2024",
    advisor: "Sanjay R · Sr. Advisor · 45 min",
    tag: "IPS refresh",
    summary:
      "Annual IPS refresh. Raised equity allocation from 45% -> 48% given 10+ yr horizon. Added SGB to replace paper gold.",
    actions: [
      { text: "Switch gold ETF to SGB Series VI", done: true },
      { text: "Update nominee details across folios", done: true },
    ],
  },
  {
    id: "apr-2024",
    date: "Apr 08, 2024",
    advisor: "Sanjay R · Sr. Advisor · 30 min",
    tag: "Tax",
    summary:
      "Tax planning session. Used full 80C via ELSS + EPF. Reviewed HUF structure for parents.",
    actions: [{ text: "File ITR by Jul 31", done: true }],
  },
];

const AdvisorMeetings = () => {
  const navigate = useNavigate();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  return (
    <div className="mobile-container bg-background min-h-screen pb-20">
      <div className="px-5 pt-10 pb-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate("/portfolio")} className="text-foreground">
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">Advisor Meetings</h1>
        </div>
      </div>

      <div className="px-5">
        <div
          className="rounded-2xl px-4 py-3.5 mb-3 bg-card"
          style={{ border: "1px solid hsl(var(--border))" }}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#D8B44D] flex items-center justify-center text-white font-semibold text-lg shrink-0">
              S
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">Sanjay R · Sr. Advisor</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Mon 14 Oct · 4:00 PM · Jaipur slot</p>
            </div>
            <div className="flex items-center gap-1.5">
              <a
                href={PROZPR_ZOOM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold bg-foreground text-background"
              >
                <Video className="h-3 w-3" />
                Join Zoom
              </a>
              <button
                type="button"
                onClick={() => setRescheduleOpen(true)}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold bg-muted text-foreground"
              >
                Reschedule
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 pb-24">
          {meetings.map((meeting) => (
            <div
              key={meeting.id}
              className="rounded-2xl px-4 py-4 bg-card"
              style={{ border: "1px solid hsl(var(--border))" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[20px] leading-none font-semibold text-foreground">{meeting.date}</p>
                  <p className="text-xs text-muted-foreground mt-1">{meeting.advisor}</p>
                </div>
                <span className="rounded-full px-2 py-1 text-[11px] font-medium bg-[hsl(38_64%_47%)]/20 text-[hsl(38_64%_47%)]">
                  {meeting.tag}
                </span>
              </div>

              <p className="text-[14px] leading-[1.5] text-foreground mt-3">{meeting.summary}</p>

              <div className="mt-3 pt-2" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                <p
                  className="text-[11px] uppercase text-muted-foreground mb-2"
                  style={{ fontWeight: 600, letterSpacing: "1.8px" }}
                >
                  Action items
                </p>
                <div className="space-y-2">
                  {meeting.actions.map((action) => (
                    <div key={action.text} className="flex items-start gap-2.5">
                      {action.done ? (
                        <Check className="h-4 w-4 text-[#D8B44D] mt-0.5 shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      )}
                      <p
                        className={`text-[14px] leading-[1.35] ${
                          action.done ? "text-muted-foreground line-through" : "text-foreground"
                        }`}
                      >
                        {action.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <button className="mt-3 text-[13px] font-medium text-foreground/90 hover:text-foreground">
                Full transcript →
              </button>
            </div>
          ))}
        </div>
      </div>

      <BottomNav />

      <AnimatePresence>
        {rescheduleOpen && (
          <RescheduleModal onClose={() => setRescheduleOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdvisorMeetings;
