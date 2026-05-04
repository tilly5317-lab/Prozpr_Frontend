import { CalendarDays, ChevronRight, Clock, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";

const AdvisorMeetingsSlot = () => {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate("/advisor-meetings")}
      className="w-full rounded-[14px] p-[14px] text-left bg-card"
      style={{ border: "1px solid hsl(var(--border))" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[10px] uppercase text-muted-foreground"
            style={{ fontWeight: 500, letterSpacing: "1.5px" }}
          >
            Advisor Meetings
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground truncate">
            Mon 14 Oct · 4:00 PM
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
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Jaipur
            </span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
      </div>
    </button>
  );
};

export default AdvisorMeetingsSlot;
