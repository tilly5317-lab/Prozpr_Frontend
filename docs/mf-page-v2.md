# Mutual fund page — v2 changes

The fund detail screen (`/discovery/mf/:schemeCode`) as of v2. Recorded so the
set can be reversed as a unit: **"reverse the v2 changes"** means undoing
everything on this page and nothing else.

## What v2 changed, from v1

1. **Prozpr branding.** One confident brand ink for structural accents, and
   colour restricted to where it signals good or bad. Everything else neutral.

   ~~Serif display type on section and page headings.~~ **Reverted on request
   (2026-08-25)** — headings are back to the v1 sans treatment at 13.5px, and
   `font-display` no longer appears anywhere on this page. The brand ink and the
   colour discipline stayed.

   *Adapted, not copied:* the spec gave hex values for a warm-paper palette
   (`#FAF8F4` page, `#0F4C81` ink). Those are hardcoded light-mode values and
   this app ships a full dark theme, so they are expressed through the existing
   tokens instead — `font-display` (Instrument Serif) and `--wealth-blue`, which
   is the same blue the spec asked for. A literal port would have broken dark
   mode.

2. **Glossary tooltips.** Every valuation ratio and financial term carries an
   (i) explaining what the term is *and* what a higher or lower value does to
   the investor. Hover on desktop, tap on mobile. Copy lives in
   `src/lib/fundGlossary.ts`.

3. **One icon per metric.** The data-date "i" is folded into the same tooltip
   via the `note` prop, so a metric never carries two icons.

4. **Compliance footer.** Educational, not advice. Names the SEBI position
   explicitly.

5. **Tooltip flicker fix.** The click-outside dismiss layer used to render for
   every open tip, including hover ones. It sat under the cursor, so it fired
   `mouseleave` on the icon → tip closed → layer removed → `mouseenter` fired →
   tip opened, forever. Now: the layer renders only for a tip opened by
   click/tap; a hover tip is `pointer-events: none` and cannot take the hover
   off its own icon. Tips also close on scroll and resize.

## Files v2 added

- `src/lib/fundGlossary.ts` — the term copy
- `src/components/fund/InfoTip.tsx` — tooltip + `Term` wrapper
- `src/components/fund/FundDisclaimer.tsx` — compliance footer
- `docs/mf-page-v2.md` — this file

## Files v2 modified

- `src/components/fund/FundAnalysis.tsx` — serif headings, glossary on ratios
- `src/components/fund/FundAnalysisUi.tsx` — serif section titles, brand badge
- `src/components/fund/FundOverview.tsx` — glossary on snapshot rows
- `src/pages/MfFundDetail.tsx` — footer

## Section order (unchanged by v2)

header · returns · 1 Snapshot · 2 Your investment · 3 Analysis · 4 Valuation &
risk · 5 What the fund holds · 6 Who runs it

## To reverse

Delete the four added files, drop the `InfoTip`/`Term` usages and `font-display`
classes from the four modified files, and remove the footer from the page. No
data or calculation changed in v2 — it is presentation and copy only.
