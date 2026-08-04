import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteCasDocument,
  getCasDocumentDownloadUrl,
  listCasDocuments,
  type CasDocumentItem,
} from "@/lib/api";

/** "2016-01-01" → "Jan 2016"; falls back to the raw string. */
const fmtMonth = (value: string | null): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const fmtSize = (bytes: number | null): string | null => {
  if (bytes == null || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * "My CAS Statements" — every statement the user has imported, kept for
 * reference. Each row downloads via a short-lived presigned link; the PDF
 * still opens with the password the statement was generated with.
 * Renders nothing while empty so the profile stays clean for new users.
 */
const CasStatementsCard = () => {
  const [docs, setDocs] = useState<CasDocumentItem[]>([]);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listCasDocuments()
      .then((res) => setDocs(res.documents))
      .catch(() => {
        /* section is a nicety — hide on failure rather than error out */
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDownload = async (doc: CasDocumentItem) => {
    setWorkingId(doc.id);
    try {
      const { url } = await getCasDocumentDownloadUrl(doc.id);
      // Content-Disposition: attachment — the browser downloads in place.
      window.location.href = url;
      toast.success("Download started", {
        description: "The PDF opens with your statement password.",
      });
    } catch {
      toast.error("Could not fetch the statement. Please try again.");
    } finally {
      setWorkingId(null);
    }
  };

  const handleDelete = async (doc: CasDocumentItem) => {
    if (!window.confirm("Remove this statement from your profile? This cannot be undone.")) {
      return;
    }
    setWorkingId(doc.id);
    try {
      await deleteCasDocument(doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      toast.success("Statement removed");
    } catch {
      toast.error("Could not remove the statement. Please try again.");
    } finally {
      setWorkingId(null);
    }
  };

  if (docs.length === 0) return null;

  return (
    <div className="px-5 mb-2">
      <div className="wealth-card !p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold text-foreground">My CAS Statements</h3>
          <span className="text-[10px] text-muted-foreground">
            {docs.length} saved
          </span>
        </div>
        <div className="space-y-1.5">
          {docs.map((doc) => {
            const period =
              fmtMonth(doc.statement_from) && fmtMonth(doc.statement_to)
                ? `${fmtMonth(doc.statement_from)} – ${fmtMonth(doc.statement_to)}`
                : null;
            const size = fmtSize(doc.file_size_bytes);
            const busy = workingId === doc.id;
            return (
              <div
                key={doc.id}
                className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-2.5 py-2"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">
                    {period ?? doc.source_filename ?? "CAS statement"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Uploaded {fmtDate(doc.uploaded_at)}
                    {size ? ` · ${size}` : ""}
                    {doc.schemes ? ` · ${doc.schemes} funds` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void handleDownload(doc)}
                    disabled={busy}
                    aria-label="Download statement"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(doc)}
                    disabled={busy}
                    aria-label="Remove statement"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/70">
          Statements are stored encrypted; each PDF opens with the password it was
          generated with.
        </p>
      </div>
    </div>
  );
};

export default CasStatementsCard;
