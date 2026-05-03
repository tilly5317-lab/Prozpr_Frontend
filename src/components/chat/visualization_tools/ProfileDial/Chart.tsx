import type { ProfileDialPayload } from "./types";

const BANDS = [
  { label: "Conservative", from: 0, to: 20, fill: "hsl(160 30% 93%)" },
  { label: "Moderate-Conservative", from: 20, to: 40, fill: "hsl(160 50% 75%)" },
  { label: "Balanced", from: 40, to: 60, fill: "hsl(215 40% 75%)" },
  { label: "Moderate-Aggressive", from: 60, to: 80, fill: "hsl(38 70% 70%)" },
  { label: "Aggressive", from: 80, to: 100, fill: "hsl(0 70% 75%)" },
];

export function ProfileDial({ payload }: { payload: ProfileDialPayload }) {
  const score = Math.max(0, Math.min(100, payload.score));
  // Half-circle SVG dial: 200x110 viewbox, dial arc from -180° (left) to 0° (right).
  // Needle angle in degrees: -180 at score=0, 0 at score=100.
  const angle = -180 + (score / 100) * 180;
  const cx = 100;
  const cy = 100;
  const needleLen = 70;
  const rad = (angle * Math.PI) / 180;
  const tipX = cx + needleLen * Math.cos(rad);
  const tipY = cy + needleLen * Math.sin(rad);

  // Band arc paths
  const arcs = BANDS.map((band) => {
    const startAngle = -180 + (band.from / 100) * 180;
    const endAngle = -180 + (band.to / 100) * 180;
    const r = 86;
    const innerR = 60;
    const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180);
    const y1 = cy + r * Math.sin((startAngle * Math.PI) / 180);
    const x2 = cx + r * Math.cos((endAngle * Math.PI) / 180);
    const y2 = cy + r * Math.sin((endAngle * Math.PI) / 180);
    const ix1 = cx + innerR * Math.cos((endAngle * Math.PI) / 180);
    const iy1 = cy + innerR * Math.sin((endAngle * Math.PI) / 180);
    const ix2 = cx + innerR * Math.cos((startAngle * Math.PI) / 180);
    const iy2 = cy + innerR * Math.sin((startAngle * Math.PI) / 180);
    const d = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 0 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 0 0 ${ix2} ${iy2}`,
      "Z",
    ].join(" ");
    return { d, fill: band.fill, label: band.label };
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-wealth">
      <h3 className="font-display italic text-foreground text-xl leading-tight mb-1">
        {payload.title}
      </h3>
      {payload.subtitle ? (
        <p className="text-xs text-muted-foreground mb-4">{payload.subtitle}</p>
      ) : null}

      <div className="flex flex-col items-center">
        <svg viewBox="0 0 200 120" className="w-full max-w-[260px]" role="img" aria-label="Risk profile dial">
          {arcs.map((a) => (
            <path key={a.label} d={a.d} fill={a.fill} />
          ))}
          <line
            x1={cx}
            y1={cy}
            x2={tipX}
            y2={tipY}
            stroke="hsl(222 47% 14%)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r={4} fill="hsl(222 47% 14%)" />
        </svg>
        <p className="mt-2 text-sm font-semibold text-foreground">{payload.headline}</p>
      </div>
    </div>
  );
}
