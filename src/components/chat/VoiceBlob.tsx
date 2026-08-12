import { useEffect, useRef, type MutableRefObject } from "react";

/**
 * The listening creature.
 *
 * A soft closed curve that breathes while idle and swells, quickens and grows
 * more irregular the louder you speak — so the shape itself tells you the mic is
 * hearing something, which a static icon never can.
 *
 * The outline is generated, not hand-authored: points are placed round a circle,
 * displaced by two out-of-phase harmonics, then joined with a Catmull-Rom curve
 * converted to cubic béziers. Everything is driven inside one rAF loop writing
 * straight to the path's `d` attribute — React never re-renders for a frame.
 */

const SIZE = 200;
const POINTS = 9;
const BASE_R = SIZE * 0.26;

/** Closed smooth path through points, Catmull-Rom expressed as cubic béziers. */
function toPath(pts: [number, number][]): string {
  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return `${d} Z`;
}

function outline(t: number, level: number, wobbleScale: number): string {
  const c = SIZE / 2;
  // Louder speech both inflates the body and roughens its edge.
  const radius = BASE_R * (1 + level * 0.34);
  const wobble = BASE_R * (0.06 + level * 0.16) * wobbleScale;
  const pts: [number, number][] = [];
  for (let i = 0; i < POINTS; i++) {
    const a = (i / POINTS) * Math.PI * 2;
    const harmonic =
      Math.sin(a * 3 + t * (1.1 + level * 1.6)) * 0.6 +
      Math.sin(a * 2 - t * (0.7 + level * 0.9)) * 0.4;
    const r = radius + wobble * harmonic;
    pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
  }
  return toPath(pts);
}

const VoiceBlob = ({
  level,
  listening,
}: {
  /** Live 0-1 mic loudness, read every frame. */
  level: MutableRefObject<number>;
  listening: boolean;
}) => {
  const pathRef = useRef<SVGPathElement>(null);
  const haloRef = useRef<SVGCircleElement>(null);
  const groupRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let t = 0;
    let last = 0;

    const frame = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      // Idle keeps a slow breath so the creature reads as alive, not frozen.
      const lvl = listening ? level.current : 0;
      t += dt * (0.8 + lvl * 2.2);

      if (pathRef.current) {
        pathRef.current.setAttribute("d", outline(t, lvl, reduced ? 0.25 : 1));
      }
      if (groupRef.current) {
        const s = 1 + lvl * 0.1;
        groupRef.current.setAttribute("transform", `translate(${SIZE / 2} ${SIZE / 2}) scale(${s.toFixed(3)}) translate(${-SIZE / 2} ${-SIZE / 2})`);
      }
      if (haloRef.current) {
        haloRef.current.setAttribute("r", String((BASE_R * (1.25 + lvl * 0.55)).toFixed(2)));
        haloRef.current.setAttribute("opacity", String((0.10 + lvl * 0.30).toFixed(3)));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [level, listening]);

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-[132px] w-[132px]"
      role="img"
      aria-label={listening ? "Listening" : "Not listening"}
    >
      <defs>
        <radialGradient id="voice-blob-fill" cx="38%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#F0D6A8" />
          <stop offset="55%" stopColor="#D4A868" />
          <stop offset="100%" stopColor="#A87F42" />
        </radialGradient>
      </defs>
      {/* Halo widens with volume, so loudness reads even at a glance. */}
      <circle ref={haloRef} cx={SIZE / 2} cy={SIZE / 2} r={BASE_R * 1.25} fill="#D4A868" opacity={0.1} />
      <g ref={groupRef}>
        <path
          ref={pathRef}
          d={outline(0, 0, 1)}
          fill="url(#voice-blob-fill)"
          style={{ transition: listening ? undefined : "opacity 200ms" }}
          opacity={listening ? 1 : 0.55}
        />
      </g>
    </svg>
  );
};

export default VoiceBlob;
