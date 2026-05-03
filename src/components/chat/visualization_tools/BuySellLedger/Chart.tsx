import type { BuySellLedgerPayload } from "./types";
import { formatInrCompact } from "@/lib/utils";

export function BuySellLedger({ payload }: { payload: BuySellLedgerPayload }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-wealth">
      <h3 className="font-display italic text-foreground text-xl leading-tight mb-1">
        {payload.title}
      </h3>
      {payload.subtitle ? (
        <p className="text-xs text-muted-foreground mb-4">{payload.subtitle}</p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px] px-3 py-2">
                Fund
              </th>
              <th className="text-right font-semibold text-muted-foreground uppercase tracking-wide text-[10px] px-3 py-2 w-20">
                Buy
              </th>
              <th className="text-right font-semibold text-muted-foreground uppercase tracking-wide text-[10px] px-3 py-2 w-20">
                Sell
              </th>
            </tr>
          </thead>
          <tbody>
            {payload.rows.map((row) => (
              <tr key={`${row.name}-${row.sub_category}`} className="border-t border-border/60">
                <td className="px-3 py-2">
                  <div className="text-foreground font-medium truncate">{row.name}</div>
                  <div className="text-[10px] text-muted-foreground">{row.sub_category}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-[hsl(160_50%_28%)]">
                  {row.buy_inr > 0 ? formatInrCompact(row.buy_inr) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-destructive">
                  {row.sell_inr > 0 ? formatInrCompact(row.sell_inr) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
