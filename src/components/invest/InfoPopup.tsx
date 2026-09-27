import type { ReactNode } from "react";
import { Info } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** What a saved preference promises — said in each pop-up where it applies,
 *  from this one place so the copies cannot drift apart. */
export const DIRECTIONAL_TARGET =
  "This is a directional target — we'll get as close to it as we can, and the exact split can move slightly when we fit real funds. You can clear your preference any time.";

/** Every paragraph in a pop-up reads alike — one size, one colour, no
 *  dividers — the lead included. */
const PARAGRAPH = "text-[13px] leading-relaxed text-muted-foreground";

/** A paragraph after the lead. */
export function PopupText({ children }: { children: ReactNode }) {
  return <p className={PARAGRAPH}>{children}</p>;
}

/**
 * A small ⓘ that opens a pop-up: explanation the customer can ask for, kept
 * off the page itself. `lead` is the first paragraph; `children` follow it.
 */
export default function InfoPopup({
  label,
  title,
  lead,
  children,
}: {
  /** The ⓘ's name for screen readers — it has no visible text. */
  label: string;
  title: string;
  lead: string;
  children?: ReactNode;
}) {
  return (
    <Dialog>
      {/* 20px to look at, 44px to tap: the ::after pad widens the target
          without pushing the surrounding line apart. */}
      <DialogTrigger
        aria-label={label}
        className="relative ml-1 inline-flex h-5 w-5 items-center justify-center align-[-4px] text-muted-foreground after:absolute after:-inset-3 after:content-[''] hover:text-foreground"
      >
        <Info className="h-4 w-4" />
      </DialogTrigger>
      {/* gap-0: the spacing is set below, so every paragraph sits the same
          distance from the next, the lead included. */}
      <DialogContent className="max-w-[calc(100%-2.5rem)] gap-0 rounded-2xl sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="pr-6 text-[16px] leading-snug">{title}</DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          <DialogDescription className={PARAGRAPH}>{lead}</DialogDescription>
          {children}
        </div>
        <DialogFooter className="mt-5">
          <DialogClose className="h-11 w-full rounded-xl bg-[#D4A868] text-[13.5px] font-semibold text-[#191307] hover:brightness-[1.04]">
            OK
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
