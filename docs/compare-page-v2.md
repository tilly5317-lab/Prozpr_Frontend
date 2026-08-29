# Compare page — v2 changes

The fund comparison screen (`/discovery/compare`) as of v2. Recorded so the set
can be reversed as a unit: **"reverse the compare v2 changes"** means undoing
everything listed here and nothing else.

Separate from `mf-page-v2.md`, which covers the fund *detail* page. The two
share components but version independently.

## What v2 changed, from v1

1. **Prozpr branding.** One brand ink for structural accents, and colour
   restricted to where it signals good or bad.

   ~~Serif display type on the page and section headings.~~ **Reverted on
   request (2026-08-25)**, matching the same reversal on the detail page — both
   screens are back to sans throughout, and `font-display` appears on neither.

   *Adapted, not copied:* the spec's hex palette (`#FAF8F4` paper, `#0F4C81`
   ink) is hardcoded light-mode. This app ships a dark theme, so the brand ink
   is expressed through the existing `--wealth-blue` token, the same blue the
   spec asks for.

2. **Glossary tooltips.** Every valuation ratio and financial term carries an
   (i) explaining the term and what a higher or lower value does to the
   investor. Hover on desktop, tap on mobile. Reuses `src/lib/fundGlossary.ts`
   and `src/components/fund/InfoTip.tsx`, both built for the detail page.

3. **Compliance footer.** Educational, not advice. Reuses
   `src/components/fund/FundDisclaimer.tsx`.

4. **Tooltip flicker fix.** Inherited with `InfoTip` — the dismiss layer renders
   only for a click/tap-pinned tip, a hover tip is `pointer-events: none`, and
   both close on scroll and resize.

## Files v2 added

- `docs/compare-page-v2.md` — this file

No new components: v2 on this screen is entirely wiring of parts that already
existed for the detail page.

## Files v2 modified

- `src/pages/MfCompare.tsx` — serif headings, glossary on criteria and section
  titles, compliance footer
- `src/components/discover/FundMetricCompare.tsx` — glossary on every metric
  row, serif section title

## To reverse

Drop the `InfoTip`/`Term` usages and `font-display` classes from the two
modified files, and remove `<FundDisclaimer/>` from the page. Do NOT delete
`fundGlossary.ts`, `InfoTip.tsx` or `FundDisclaimer.tsx` — the detail page still
uses them. No data or calculation changed in v2; it is presentation and copy
only.
