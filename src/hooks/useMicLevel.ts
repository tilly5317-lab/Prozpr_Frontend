import { useEffect, useRef, type MutableRefObject } from "react";

/**
 * Live microphone loudness, 0-1.
 *
 * `SpeechRecognition` reports words, never volume, so anything that reacts to
 * how loudly someone is speaking needs its own audio tap. This opens a second
 * `getUserMedia` stream purely to measure amplitude — browsers hand the same
 * mic to both, and the permission prompt has already been answered by the time
 * recognition is running.
 *
 * The value is returned as a ref, not state: it changes every animation frame,
 * and re-rendering React 60 times a second to move a shape would be absurd.
 * Consumers read `ref.current` inside their own rAF loop.
 */
export function useMicLevel(active: boolean): MutableRefObject<number> {
  const level = useRef(0);

  useEffect(() => {
    if (!active) {
      level.current = 0;
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;

    const AudioCtx =
      typeof window !== "undefined"
        ? window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;

    if (!AudioCtx || !navigator.mediaDevices?.getUserMedia) return;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(s).connect(analyser);

        const samples = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (let i = 0; i < samples.length; i++) {
            const v = (samples[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / samples.length);
          // Conversational speech sits around 0.05-0.2 RMS, so it needs lifting
          // to fill 0-1; the clamp keeps a shout from pinning the shape open.
          const scaled = Math.min(1, rms * 6);
          // Asymmetric smoothing: rise fast so the shape answers a syllable,
          // fall slowly so it settles instead of flickering between words.
          const k = scaled > level.current ? 0.45 : 0.12;
          level.current += (scaled - level.current) * k;
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      })
      .catch(() => {
        // Denied or unavailable — the shape just idles, which is honest.
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => undefined);
      level.current = 0;
    };
  }, [active]);

  return level;
}
