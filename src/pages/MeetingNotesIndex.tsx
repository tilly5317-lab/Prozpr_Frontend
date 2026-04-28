import { useEffect, useMemo, useState } from "react";
import { Search, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { listMeetingNotes, type MeetingNoteInfo } from "@/lib/api";

const MeetingNotesIndex = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<MeetingNoteInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const rows = await listMeetingNotes();
        setNotes(rows);
      } catch {
        setNotes([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toDisplayDate = (iso: string | null) => {
    if (!iso) return "No date";
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return "No date";
    return dt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  };

  const filtered = useMemo(
    () => notes.filter((n) => n.title.toLowerCase().includes(search.toLowerCase())),
    [notes, search],
  );

  return (
    <div className="mobile-container bg-background min-h-screen flex flex-col pb-16">
      <div className="px-5 pt-10 pb-3">
        <h1 className="text-lg font-semibold text-foreground">Meeting Notes</h1>
      </div>

      {/* Search */}
      <div className="px-5 pb-3">
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground/50 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
          />
        </div>
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto px-5 space-y-2">
        {loading ? (
          <p className="text-center text-sm text-muted-foreground/60 mt-12">
            Loading notes...
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground/60 mt-12">
            No notes found.
          </p>
        ) : (
          filtered.map((note) => (
            <button
              key={note.id}
              onClick={() => navigate(`/meeting-notes/detail?id=${note.id}`)}
              className="w-full text-left wealth-card flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {note.title}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {toDisplayDate(note.meeting_date)}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
            </button>
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default MeetingNotesIndex;
