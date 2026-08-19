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
/** Enough points that the segment ridges stay smooth rather than faceted. */
const POINTS = 48;
/** Long and short semi-axes — a grub is an oval, never a circle. */
// Roughly 2:1 — below about that the tilt hides the elongation and the thing
// reads as a circle. Sized so the fattest, loudest, most-wobbled frame still
// clears the viewBox once tapered, arched and tilted.
const RX = SIZE * 0.24;
const RY = SIZE * 0.12;
/** How much narrower the tail end is than the head. */
const TAPER = 0.26;
/** Ridges along the body. */
const SEGMENTS = 7;
/** Parabolic arch, so it curls like a comma instead of lying flat. */
const BEND = 0.34;
/** A slight tilt reads as alive; perfectly level reads as a diagram. */
const TILT = (-16 * Math.PI) / 180;

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

/**
 * The grub's outline.
 *
 * Built as a tapered, segmented ellipse rather than a displaced circle: an
 * oval body, one end fatter than the other, ridged along its length, then
 * arched and tilted. Voice only modulates a shape that is already a larva when
 * completely still — otherwise silence would leave a plain circle on screen.
 */
function outline(t: number, level: number, wobbleScale: number): string {
  const c = SIZE / 2;
  // Louder speech both inflates the body and roughens its edge.
  const grow = 1 + level * 0.26;
  const rx = RX * grow;
  const ry = RY * grow;
  const wobble = RY * (0.05 + level * 0.15) * wobbleScale;
  const pts: [number, number][] = [];

  for (let i = 0; i < POINTS; i++) {
    const a = (i / POINTS) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);

    // Ellipse radius at this angle.
    let r = (rx * ry) / Math.sqrt((ry * cos) ** 2 + (rx * sin) ** 2);
    // Head end broad, tail end drawn in.
    r *= 1 - TAPER * cos;
    // Body segments, crawling slowly along it.
    r *= 1 + 0.045 * Math.sin(a * SEGMENTS + t * 0.9) * wobbleScale;
    // Voice wobble on top of the anatomy.
    const harmonic =
      Math.sin(a * 3 + t * (1.1 + level * 1.6)) * 0.6 +
      Math.sin(a * 2 - t * (0.7 + level * 0.9)) * 0.4;
    r += wobble * harmonic;

    // Arch the body: points further along the length ride higher.
    const x = cos * r;
    const y = sin * r + BEND * RY * ((x / RX) ** 2 - 0.5);
    pts.push([
      c + x * Math.cos(TILT) - y * Math.sin(TILT),
      c + x * Math.sin(TILT) + y * Math.cos(TILT),
    ]);
  }
  return toPath(pts);
}

const VoiceBlob = ({
  level,
  pulse,
  listening,
  speaking,
}: {
  /** Live 0-1 mic loudness, read every frame. */
  level: MutableRefObject<number>;
  /** Bumped to 1 on each spoken word of the question; decays here. */
  pulse: MutableRefObject<number>;
  listening: boolean;
  /** True while the question is being read aloud. */
  speaking: boolean;
}) => {
  const pathRef = useRef<SVGPathElement>(null);
  const haloRef = useRef<SVGEllipseElement>(null);
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

      // Three states, one shape. While you talk it follows the mic. While the
      // question is read aloud it moves to that instead — speechSynthesis gives
      // no output signal to analyse, so the motion is driven by the word
      // boundaries it does report, which keeps the throb on the actual cadence
      // of the sentence rather than looping generically. Otherwise: a slow
      // breath, so the creature reads as alive rather than frozen.
      let lvl = 0;
      if (listening) {
        lvl = level.current;
      } else if (speaking) {
        pulse.current *= 0.88;
        const sway = 0.16 + 0.1 * (Math.sin(t * 2.3) * 0.5 + 0.5);
        // Capped below a shout so the AI never appears louder than the user.
        lvl = Math.min(0.8, sway + pulse.current * 0.45);
      }
      t += dt * (0.8 + lvl * 2.2);

      if (pathRef.current) {
        pathRef.current.setAttribute("d", outline(t, lvl, reduced ? 0.25 : 1));
      }
      if (groupRef.current) {
        const s = 1 + lvl * 0.1;
        groupRef.current.setAttribute("transform", `translate(${SIZE / 2} ${SIZE / 2}) scale(${s.toFixed(3)}) translate(${-SIZE / 2} ${-SIZE / 2})`);
      }
      if (haloRef.current) {
        // Elliptical, so the glow hugs the body instead of ringing it.
        haloRef.current.setAttribute("rx", (RX * (1.3 + lvl * 0.5)).toFixed(2));
        haloRef.current.setAttribute("ry", (RY * (1.35 + lvl * 0.5)).toFixed(2));
        haloRef.current.setAttribute("opacity", (0.1 + lvl * 0.3).toFixed(3));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [level, pulse, listening, speaking]);

  const active = listening || speaking;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-[132px] w-[132px]"
      role="img"
      aria-label={listening ? "Listening" : speaking ? "Reading the question aloud" : "Idle"}
    >
      <defs>
        <radialGradient id="voice-blob-fill" cx="38%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#F0D6A8" />
          <stop offset="55%" stopColor="#D4A868" />
          <stop offset="100%" stopColor="#A87F42" />
        </radialGradient>
      </defs>
      {/* Halo widens with volume, so loudness reads even at a glance. */}
      <ellipse
        ref={haloRef}
        cx={SIZE / 2}
        cy={SIZE / 2}
        rx={RX * 1.3}
        ry={RY * 1.35}
        transform={`rotate(${(TILT * 180) / Math.PI} ${SIZE / 2} ${SIZE / 2})`}
        fill="#D4A868"
        opacity={0.1}
      />
      <g ref={groupRef}>
        <path
          ref={pathRef}
          d={outline(0, 0, 1)}
          fill="url(#voice-blob-fill)"
          style={{ transition: active ? undefined : "opacity 200ms" }}
          opacity={active ? 1 : 0.55}
        />
      </g>
    </svg>
  );
};

export default VoiceBlob;
