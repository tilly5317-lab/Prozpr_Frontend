/** Widths for the Prozpr / Today / You figures.
 *
 *  The header lives in `SubcategoryPins` and the figures in both
 *  `SubcategoryPins` and `MultiAssetBar`, so these three columns are drawn by
 *  two components that must agree to the pixel — otherwise the columns visibly
 *  step between the multi-asset line and the rows beneath it. Only the widths
 *  are named here: they are the part that has to match, and leaving type and
 *  colour inline keeps each call site readable.
 *
 *  The You column is wider because it carries the trailing "%" the reference
 *  columns do not.
 */
export const COL_REF = "w-[40px] shrink-0 text-right";
export const COL_YOU = "w-[46px] shrink-0";
