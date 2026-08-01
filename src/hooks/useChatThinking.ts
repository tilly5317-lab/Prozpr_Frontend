import { useEffect, useState } from "react";
import { getChatThinking } from "@/lib/api";

const POLL_MS = 900;

/**
 * Poll the chat "thinking aloud" endpoint while a reply is pending. The
 * backend keeps the turn's full line history, so nothing is missed between
 * polls — we simply mirror it (reading context → classifier's real reasoning
 * → the module actually running). Once lines have appeared they are kept
 * until `active` drops (the reply arrived), then reset for the next turn.
 */
export function useChatThinking(
  active: boolean,
  sessionId: string | null,
): string[] {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!active || !sessionId) {
      setLines([]);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const p = await getChatThinking(sessionId);
        if (!cancelled && p.active) {
          const msgs = p.messages?.length ? p.messages : p.message ? [p.message] : [];
          // Never shrink: the store clears the instant the turn finishes, but
          // the bubble should keep its lines until the reply actually renders.
          if (msgs.length) setLines((prev) => (msgs.length >= prev.length ? msgs : prev));
        }
      } catch {
        /* transient — keep what we have */
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [active, sessionId]);

  return lines;
}
