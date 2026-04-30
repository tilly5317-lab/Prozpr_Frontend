import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { approveMeetingMandate, getMeetingNote, listMeetingNotes, type MeetingNoteDetailInfo } from "@/lib/api";

interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

const MeetingNotes = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [note, setNote] = useState<MeetingNoteDetailInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        let noteId = searchParams.get("id");
        if (!noteId) {
          const list = await listMeetingNotes();
          noteId = list[0]?.id ?? null;
        }
        if (!noteId) {
          setNote(null);
          setError("No meeting notes available yet.");
          setLoading(false);
          return;
        }
        const detail = await getMeetingNote(noteId);
        setNote(detail);
      } catch {
        setError("Failed to load meeting note.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [searchParams]);

  const transcript = useMemo<ChatMessage[]>(() => {
    if (!note) return [];
    return note.items
      .filter((item) => item.item_type === "transcript")
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => ({
        role: (item.role || "").toLowerCase() === "assistant" || (item.role || "").toLowerCase() === "ai" ? "ai" : "user",
        content: item.content,
      }));
  }, [note]);

  const summaryBullets = useMemo<string[]>(() => {
    if (!note) return [];
    return note.items
      .filter((item) => item.item_type === "summary")
      .sort((a, b) => a.sort_order - b.sort_order)
      .flatMap((item) => item.content.split("\n").map((row) => row.replace(/^[-*]\s*/, "").trim()).filter(Boolean));
  }, [note]);

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "No date";
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return "No date";
    return dt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  };

  const handleApproveMandate = async () => {
    if (!note) return;
    setApproving(true);
    try {
      await approveMeetingMandate(note.id);
      setNote((prev) => (prev ? { ...prev, is_mandate_approved: true } : prev));
      navigate("/rebalancing");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="mobile-container bg-background pb-20 min-h-screen flex flex-col">
      <div className="px-5 pt-10 pb-2 flex items-center gap-3">
        <button onClick={() => navigate("/meeting-notes")} className="text-foreground">
          <ArrowLeft className="h-4.5 w-4.5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Meeting Notes</h1>
          <p className="text-[11px] text-muted-foreground">{formatDate(note?.meeting_date)}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5">
        {loading ? <p className="text-sm text-muted-foreground/70">Loading transcript...</p> : null}
        {!loading && error ? <p className="text-sm text-muted-foreground/70">{error}</p> : null}
        {!loading && !error && transcript.length === 0 ? (
          <p className="text-sm text-muted-foreground/70">No transcript found for this meeting.</p>
        ) : null}
        {!loading && !error
          ? transcript.map((msg, i) => (
              <div key={`${msg.role}-${i}`}>
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2 text-sm text-foreground leading-relaxed">
                    {msg.content}
                  </div>
                )}
              </div>
            ))
          : null}
      </div>

      {!loading && !error && note ? (
        <div className="border-t border-border/40 bg-card px-5 py-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Meeting Summary</h3>
          {summaryBullets.length === 0 ? (
            <p className="text-sm text-muted-foreground/70">No summary items yet.</p>
          ) : (
            <ul className="space-y-1">
              {summaryBullets.map((row, i) => (
                <li key={`${row}-${i}`} className="text-sm text-foreground/90">- {row}</li>
              ))}
            </ul>
          )}
          <button
            onClick={() => void handleApproveMandate()}
            disabled={approving || note.is_mandate_approved}
            className="w-full flex items-center justify-center gap-2 rounded-xl wealth-gradient py-3 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            {note.is_mandate_approved ? "Mandate already approved" : approving ? "Approving..." : "Approve & Update Client Mandate"}
          </button>
        </div>
      ) : null}

      <BottomNav />
    </div>
  );
};

export default MeetingNotes;