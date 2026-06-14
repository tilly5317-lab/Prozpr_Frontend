import { useState, type ReactNode } from "react";
import { Bug, Loader2 } from "lucide-react";
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
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setSource("");
    setSourceDetail("");
    setDescription("");
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
        null,
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
