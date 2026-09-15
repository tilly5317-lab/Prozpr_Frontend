import type { ClassMix } from "@/lib/api";
import PctInput from "@/components/invest/PctInput";
import {
  CLASS_LABEL,
  MULTI_ASSET_ID,
  multiAssetDraw,
  multiAssetOverdraw,
  type RowValues,
} from "@/lib/investment-preferences";

/**
 * The multi-asset fund. One number the customer types, drawing on all three
 * class budgets at once (65/25/10) — so its breakdown and its overdraw error
 * both live on THIS row, never on a class group (spec §6).
 */
export default function MultiAssetRow({
  value,
  label,
  recommended,
  mix,
  onChange,
}: {
  value: number | null;
  label: string;
  recommended: number;
  mix: ClassMix;
  onChange: (v: number | null) => void;
}) {
  const values: RowValues = { [MULTI_ASSET_ID]: value };
  const over = value == null ? null : multiAssetOverdraw(mix, values);

  return (
    <div className="border-t border-border py-3.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 text-[13.5px] font-medium text-foreground">{label}</div>
        <div className="ml-auto flex items-center gap-2.5">
          <PctInput label={label} value={value} onChange={onChange} />
          <span className="text-[13px] text-muted-foreground">%</span>
        </div>
      </div>

      <div className="mt-1 flex justify-end">
        <span className="text-[10px] tabular-nums text-[#D4A868]">
          {`Prozpr ${recommended.toFixed(1)}%`}
        </span>
      </div>

      {value != null ? (
        <div
          data-testid="ma-breakdown"
          className="mt-1.5 text-[11.5px] tabular-nums text-muted-foreground"
        >
          {`counts as ${multiAssetDraw(values, "equity").toFixed(1)}% ${CLASS_LABEL.equity}` +
            ` · ${multiAssetDraw(values, "debt").toFixed(1)}% ${CLASS_LABEL.debt}` +
            ` · ${multiAssetDraw(values, "others").toFixed(1)}% ${CLASS_LABEL.others}`}
        </div>
      ) : null}

      {over ? (
        <div data-testid="ma-overdraw" className="mt-1.5 text-[11.5px] text-destructive">
          {`${value.toFixed(1)}% multi-asset needs ${multiAssetDraw(values, over).toFixed(1)}%` +
            ` ${CLASS_LABEL[over]} but your bar only has ${mix[over].toFixed(1)}%` +
            ` — raise ${CLASS_LABEL[over]} above, or lower this.`}
        </div>
      ) : null}
    </div>
  );
}
