import { useRef, useState, type ReactNode } from "react";
import { Bug, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ISSUE_SOURCES, reportIssue, type IssueSource } from "@/lib/api";

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * "Report an Issue" dialog. Wrap any element to use it as the trigger:
 *
 *   <ReportIssueDialog><button>Report</button></ReportIssueDialog>
 */
const ReportIssueDialog = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<IssueSource | "">("");
  const [sourceDetail, setSourceDetail] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setSource("");
    setSourceDetail("");
    setDescription("");
    clearScreenshot();
  };

  const clearScreenshot = () => {
    setScreenshot(null);
    setPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Screenshot must be a PNG, JPEG, WEBP, or GIF image.");
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      toast.error("Screenshot is too large (max 5 MB).");
      return;
    }
    setPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return URL.createObjectURL(file);
    });
    setScreenshot(file);
  };

  const handleSubmit = async () => {
    if (!source) {
      toast.error("Please select where you saw the issue.");
      return;
    }
    if (source === "Other" && !sourceDetail.trim()) {
      toast.error("Please tell us where you saw the issue.");
      return;
    }
    if (!description.trim()) {
      toast.error("Please describe the issue.");
      return;
    }
    setSubmitting(true);
    try {
      await reportIssue(
        source,
        description.trim(),
        screenshot,
        source === "Other" ? sourceDetail.trim() : undefined,
      );
      toast.success("Issue reported. Our team will look into it — thank you!");
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit the report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Bug className="h-4 w-4 text-destructive" />
            Report an Issue
          </DialogTitle>
          <DialogDescription className="text-xs">
            Tell us what went wrong and we'll look into it right away.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Where did you see the issue?</Label>
            <Select value={source} onValueChange={(v) => setSource(v as IssueSource)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Select a source" />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_SOURCES.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {source === "Other" && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Where did you see it? <span className="text-destructive">*</span>
              </Label>
              <Input
                value={sourceDetail}
                onChange={(e) => setSourceDetail(e.target.value)}
                placeholder="e.g. Profile page, fund comparison, login…"
                maxLength={100}
                className="h-9 text-xs"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">What happened?</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue — what you did, what you expected, and what you saw instead."
              maxLength={5000}
              rows={4}
              className="text-xs resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Screenshot (optional)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {preview ? (
              <div className="relative inline-block">
                <img
                  src={preview}
                  alt="Screenshot preview"
                  className="max-h-28 rounded-lg border border-border object-contain"
                />
                <button
                  type="button"
                  onClick={clearScreenshot}
                  aria-label="Remove screenshot"
                  className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-xs text-muted-foreground transition-colors hover:bg-secondary"
              >
                <ImagePlus className="h-4 w-4" />
                Attach a screenshot
              </button>
            )}
          </div>

          <Button onClick={handleSubmit} disabled={submitting} className="w-full text-xs" size="sm">
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit Report"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportIssueDialog;
