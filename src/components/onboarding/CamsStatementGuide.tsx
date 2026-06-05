import { ExternalLink, FileText, CalendarRange, Mail, KeyRound, Layers } from "lucide-react";

const CAMS_CAS_URL =
  "https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement";

interface SettingRow {
  icon: typeof FileText;
  label: string;
  value: string;
}

const RECOMMENDED_SETTINGS: SettingRow[] = [
  { icon: FileText, label: "Statement type", value: "Detailed (not Summary)" },
  { icon: CalendarRange, label: "Period", value: "Since inception — earliest possible date" },
  { icon: Layers, label: "Folios", value: "Include all (with zero-balance folios)" },
  { icon: Mail, label: "Email", value: "Your CAMS-registered email" },
  { icon: KeyRound, label: "Password", value: "A password you choose — enter the same one below" },
];

/**
 * Step 1 of the guided CAMS flow: a branded panel that links out to the CAMS
 * Consolidated Account Statement page and lists the settings that produce a PDF
 * our backend can fully parse. The statement is emailed (not downloaded), so the
 * user returns here to upload it in Step 2.
 */
const CamsStatementGuide = ({ compact = false }: { compact?: boolean }) => {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
          1
        </span>
        <p className="text-sm font-medium text-foreground">Generate your statement on CAMS</p>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        We&apos;ll open CAMS in a new tab. Your statement is emailed to you as a password-protected
        PDF — come back here to upload it in Step 2.
      </p>

      <a
        href={CAMS_CAS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3.5 py-2.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary/10"
      >
        Open CAMS statement page
        <ExternalLink className="h-3.5 w-3.5" />
      </a>

      <div className="mt-3 space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground">Recommended settings</p>
        <ul className="space-y-1.5">
          {RECOMMENDED_SETTINGS.map(({ icon: Icon, label, value }) => (
            <li key={label} className="flex items-start gap-2">
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[11px] leading-snug text-foreground">
                <span className="font-medium">{label}:</span>{" "}
                <span className="text-muted-foreground">{value}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {!compact && (
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/80">
          Tip: the CAS covers CAMS, KFintech, Franklin & SB Funds Services in one PDF, so a single
          statement captures your whole mutual fund portfolio.
        </p>
      )}
    </div>
  );
};

export default CamsStatementGuide;
export { CAMS_CAS_URL };
