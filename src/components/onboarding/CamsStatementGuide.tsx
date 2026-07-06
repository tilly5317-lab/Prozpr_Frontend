import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import camsGuideHighlighted from "@/assets/cams-guide-highlighted.png";

const CAMS_CAS_URL =
  "https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement";

const IMG_ALT =
  "CAMS Consolidated Account Statement form with the recommended options highlighted — Detailed statement type, earliest possible period, all folios (including zero-balance), your CAMS-registered email, and a password you choose.";

/**
 * Step 1 of the guided CAMS flow: a branded panel that links out to the CAMS
 * Consolidated Account Statement page and shows an annotated screenshot of the
 * form with the exact options to select highlighted — an at-a-glance guide in
 * place of a written step list. Tapping the screenshot opens an in-page lightbox
 * (portalled to <body> so it clears the upload modal's transformed ancestor),
 * dismissed only by the ✕ or a click on the backdrop outside the image.
 */
const CamsStatementGuide = ({ compact = false }: { compact?: boolean }) => {
  const [zoomOpen, setZoomOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
          1
        </span>
        <p className="text-sm font-medium text-foreground">Generate your statement on CAMS</p>
      </div>

      <a
        href={CAMS_CAS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3.5 py-2.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary/10"
      >
        Open CAMS statement page
        <ExternalLink className="h-3.5 w-3.5" />
      </a>

      {/* Annotated screenshot of the CAMS form with the fields to select
          highlighted — replaces the written step list. Tap opens a lightbox so
          the highlighted labels stay readable on small screens. */}
      <figure className="mt-3">
        <figcaption className="mb-1.5 text-[11px] font-medium text-muted-foreground">
          Fill the form like this — tap to enlarge:
        </figcaption>
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          aria-label="Enlarge the annotated CAMS statement form"
          className="block w-full overflow-hidden rounded-lg border border-border"
        >
          <img
            src={camsGuideHighlighted}
            alt={IMG_ALT}
            className="w-full transition-transform duration-300 hover:scale-[1.02]"
            loading="lazy"
          />
        </button>
      </figure>

      {!compact && (
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/80">
          Tip: the CAS covers CAMS, KFintech, Franklin &amp; SB Funds Services in one PDF, so a
          single statement captures your whole mutual fund portfolio.
        </p>
      )}

      {/* Lightbox — portalled to <body> so `position: fixed` covers the whole
          viewport even when this guide sits inside the transformed upload modal.
          Closes only via the ✕ or a backdrop click outside the image. */}
      {createPortal(
        <AnimatePresence>
          {zoomOpen && (
            <motion.div
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
              style={{ backgroundColor: "rgba(0,0,0,0.78)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setZoomOpen(false)}
            >
              <motion.div
                className="relative"
                style={{ maxWidth: "96vw", maxHeight: "90vh" }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ type: "spring", damping: 26, stiffness: 320 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setZoomOpen(false)}
                  aria-label="Close"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                >
                  <X className="h-4 w-4" />
                </button>
                <img
                  src={camsGuideHighlighted}
                  alt={IMG_ALT}
                  className="max-h-[90vh] max-w-[96vw] rounded-lg object-contain shadow-2xl"
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
};

export default CamsStatementGuide;
