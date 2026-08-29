import { useMemo } from "react";

import { fundManagers, houseView } from "@/lib/fundCategory";

/**
 * Who runs it — the managers, how the fund invests, and the house behind it.
 *
 * ⚠️ ENTIRELY GENERATED. No Prozpr endpoint carries fund managers, their
 * credentials, tenure, the strategy text or an AMC profile, so all of it is
 * derived from a hash of the scheme code. The manager's start date is worked
 * back from the tenure figure shown elsewhere on the page, so the two agree.
 */
export function FundManagers({
  seed,
  amcName,
  managerTenureYears,
}: {
  seed: string;
  amcName: string;
  managerTenureYears: number;
}) {
  const managers = useMemo(
    () => fundManagers(seed, managerTenureYears),
    [seed, managerTenureYears],
  );
  const view = useMemo(() => houseView(seed, amcName), [seed, amcName]);

  return (
    <div>
      {managers.map((m) => (
        <div
          key={m.name}
          className="flex items-start gap-3 border-t border-border/50 py-3 first:border-t-0 first:pt-0"
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
              m.lead
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {m.initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
              <span className="truncate">{m.name}</span>
              {m.lead && (
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-primary bg-primary/12">
                  Lead
                </span>
              )}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
              {m.credentials}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">
              Managing this fund since {m.since}
            </p>
          </div>
        </div>
      ))}

      <p className="mt-4 text-[11.5px] font-semibold text-foreground">Investment strategy</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{view.strategy}</p>

      <p className="mt-4 text-[11.5px] font-semibold text-foreground">Investment philosophy</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{view.philosophy}</p>

      <p className="mt-4 text-[11.5px] font-semibold text-foreground">About the AMC</p>
      <div className="mt-1.5 rounded-xl border border-border/60 bg-muted/20 p-3">
        <p className="text-[12.5px] font-semibold text-foreground">{amcName}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{view.amcBlurb}</p>
      </div>
    </div>
  );
}

export default FundManagers;
