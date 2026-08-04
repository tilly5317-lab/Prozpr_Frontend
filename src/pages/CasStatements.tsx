import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Download, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
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
 * /cas-statements — every CAS statement the user has imported, kept for
 * reference. Reached from the profile's "My CAS Statements" row. Each row
 * downloads via a short-lived presigned link; the PDF still opens with the
 * password the statement was generated with.
 */
const CasStatements = () => {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<CasDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);

  useEffect(() => {
    listCasDocuments()
      .then((res) => setDocs(res.documents))
      .catch(() => {
        toast.error("Could not load your statements. Please try again.");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (doc: CasDocumentItem) => {
    setWorkingId(doc.id);
    try {
      const { url } = await getCasDocumentDownloadUrl(doc.id);
      // Content-Disposition: attachment — the browser downloads in place.
      window.location.href = url;
      toast.success("Download started", {
        description: "The PDF opens with your statement password.",
      });
    } catch (e: unknown) {
      // Surface the backend's own reason (e.g. storage not configured) —
      // a generic message here makes real failures undiagnosable.
      toast.error("Could not fetch the statement", {
        description:
          e instanceof Error && e.message ? e.message : "Please try again.",
      });
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
    } catch (e: unknown) {
      toast.error("Could not remove the statement", {
        description:
          e instanceof Error && e.message ? e.message : "Please try again.",
      });
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="mobile-container bg-background pb-20 min-h-screen">
      <div className="px-5 pt-10 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/profile")}
          aria-label="Back to profile"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-foreground">My CAS Statements</h1>
          <p className="text-[11px] text-muted-foreground">
            Statements you&apos;ve imported, kept for your records
          </p>
        </div>
      </div>

      <div className="px-5">
        {loading ? (
          <p className="text-sm text-muted-foreground/70">Loading statements...</p>
        ) : docs.length === 0 ? (
          <div className="wealth-card !p-5 text-center">
            <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
              <FileText className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No statements yet</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Statements you import are saved here automatically.
            </p>
            <button
              onClick={() => navigate("/cams-upload?from=profile")}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl wealth-gradient px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-all active:scale-[0.98]"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              Import a statement
            </button>
          </div>
        ) : (
          docs.map((doc, idx) => {
            const period =
              fmtMonth(doc.statement_from) && fmtMonth(doc.statement_to)
                ? `${fmtMonth(doc.statement_from)} – ${fmtMonth(doc.statement_to)}`
                : null;
            const size = fmtSize(doc.file_size_bytes);
            const busy = workingId === doc.id;
            return (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(idx, 5) * 0.05 }}
                className="wealth-card !p-3.5 mt-3 first:mt-0"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {period ?? doc.source_filename ?? "CAS statement"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Uploaded {fmtDate(doc.uploaded_at)}
                      {size ? ` · ${size}` : ""}
                      {doc.schemes ? ` · ${doc.schemes} funds` : ""}
                      {doc.transactions ? ` · ${doc.transactions} transactions` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleDownload(doc)}
                      disabled={busy}
                      aria-label="Download statement"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(doc)}
                      disabled={busy}
                      aria-label="Remove statement"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}

        {!loading && docs.length > 0 && (
          <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground/70">
            Statements are stored encrypted; each PDF opens with the password it
            was generated with.
          </p>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default CasStatements;
