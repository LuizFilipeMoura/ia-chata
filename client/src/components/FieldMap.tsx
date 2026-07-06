import { emptyCorners, deploymentCorners, deployRadius } from "/shared/field.js";
import type { FieldState, Objective } from "../state/types";
import "../styles/field-map.css";

interface Props {
  field: FieldState;
  objectives: Objective[];
  mySide: string;
  ownerSide: string | null;
}

const PAD = 26;
const CANVAS_W = 520;
const GRID_IN = 12; // blueprint foot lines every 12 inches

export function FieldMap({ field, objectives, mySide, ownerSide }: Props) {
  const scale = (CANVAS_W - PAD * 2) / field.width;
  const fw = field.width * scale;
  const fh = field.height * scale;
  const canvasH = fh + PAD * 2;
  const sx = (xIn: number) => PAD + xIn * scale;
  const sy = (yIn: number) => PAD + yIn * scale;

  const [e0, e1] = emptyCorners(field);
  const [ownerC, enemyC] = deploymentCorners(field);
  const viewerIsOwner = mySide === ownerSide;
  const mineC = viewerIsOwner ? ownerC : enemyC;
  const foeC = viewerIsOwner ? enemyC : ownerC;

  // Interior blueprint grid: a line every foot, edges excluded (the rect frames those).
  const vLines: number[] = [];
  for (let x = GRID_IN; x < field.width; x += GRID_IN) vLines.push(x);
  const hLines: number[] = [];
  for (let y = GRID_IN; y < field.height; y += GRID_IN) hLines.push(y);

  // Registration ticks: an L in each corner, drawn just inside the frame.
  const T = 9; // tick arm length in px
  const corners = [
    { x: PAD, y: PAD, dx: 1, dy: 1 },
    { x: PAD + fw, y: PAD, dx: -1, dy: 1 },
    { x: PAD, y: PAD + fh, dx: 1, dy: -1 },
    { x: PAD + fw, y: PAD + fh, dx: -1, dy: -1 },
  ];

  const tri = (c: { x: number; y: number }) =>
    `${sx(e0.x)},${sy(e0.y)} ${sx(c.x)},${sy(c.y)} ${sx(e1.x)},${sy(e1.y)}`;

  // Pull a corner point toward the field centre so a corner-anchored label sits
  // inside its deployment triangle instead of clipping the SVG edge.
  const towardCenter = (c: { x: number; y: number }, t = 0.26) => ({
    x: c.x + (field.width / 2 - c.x) * t,
    y: c.y + (field.height / 2 - c.y) * t,
  });
  const mineLabel = towardCenter(mineC);
  const foeLabel = towardCenter(foeC);

  // Legal deployment zone: a quarter-circle of `dRad` inches around each
  // deployment corner (§10). Built as a filled sector sweeping 90° from one
  // table edge to the other, into the field.
  const dRad = deployRadius(field);
  const deploySector = (c: { x: number; y: number }) => {
    const dx = c.x <= field.width / 2 ? 1 : -1;
    const dy = c.y <= field.height / 2 ? 1 : -1;
    const a1 = dx > 0 ? 0 : Math.PI;
    const a2 = dy > 0 ? Math.PI / 2 : -Math.PI / 2;
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const pts = [`${sx(c.x)},${sy(c.y)}`];
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const a = a1 + d * (i / N);
      pts.push(`${sx(c.x + Math.cos(a) * dRad)},${sy(c.y + Math.sin(a) * dRad)}`);
    }
    return pts.join(" ");
  };

  return (
    <svg
      className="field-map"
      viewBox={`0 0 ${CANVAS_W} ${canvasH}`}
      role="img"
      aria-label={`Battlefield ${field.width} by ${field.height} inches`}
    >
      <rect
        className="fm-field"
        x={PAD} y={PAD}
        width={fw} height={fh}
        rx={8}
      />

      {vLines.map((x) => (
        <line key={`v${x}`} className="fm-grid" x1={sx(x)} y1={sy(0)} x2={sx(x)} y2={sy(field.height)} />
      ))}
      {hLines.map((y) => (
        <line key={`h${y}`} className="fm-grid" x1={sx(0)} y1={sy(y)} x2={sx(field.width)} y2={sy(y)} />
      ))}

      <polygon className="fm-half-mine" points={tri(mineC)} />
      <polygon className="fm-half-foe" points={tri(foeC)} />
      <line className="fm-diag" x1={sx(e0.x)} y1={sy(e0.y)} x2={sx(e1.x)} y2={sy(e1.y)} />

      <polygon className="fm-deploy fm-deploy--mine" points={deploySector(mineC)} />
      <polygon className="fm-deploy fm-deploy--foe" points={deploySector(foeC)} />

      {corners.map((c, i) => (
        <path
          key={`c${i}`} className="fm-tick" fill="none"
          d={`M ${c.x + c.dx * T} ${c.y} L ${c.x} ${c.y} L ${c.x} ${c.y + c.dy * T}`}
        />
      ))}

      <text className="fm-dim" x={PAD + fw / 2} y={PAD - 10} textAnchor="middle">
        {field.width}&#8243;
      </text>
      <text
        className="fm-dim" x={PAD - 11} y={PAD + fh / 2} textAnchor="middle"
        transform={`rotate(-90 ${PAD - 11} ${PAD + fh / 2})`}
      >
        {field.height}&#8243;
      </text>

      {field.terrain.map((t, i) => {
        const cx = sx(t.x), cy = sy(t.y);
        const cls = `fm-terrain fm-terrain--${t.kind ?? "block"}`;
        const spin = t.rot ? `rotate(${t.rot} ${cx} ${cy})` : undefined;
        if (t.shape === "poly" && t.points) {
          const pts = t.points.map(([dx, dy]) => `${cx + dx * scale},${cy + dy * scale}`).join(" ");
          return <polygon key={i} data-testid="terrain" className={cls} points={pts} />;
        }
        if (t.shape === "ellipse") {
          return (
            <ellipse
              key={i} data-testid="terrain" className={cls}
              cx={cx} cy={cy} rx={(t.rx ?? 2) * scale} ry={(t.ry ?? 2) * scale} transform={spin}
            />
          );
        }
        // Rect (buildings, barricades, crates) + legacy { size } fallback.
        const w = (t.w ?? (t.size === "md" ? 4 : 2.6)) * scale;
        const h = (t.h ?? (t.size === "md" ? 4 : 2.6)) * scale;
        return (
          <rect
            key={i} data-testid="terrain" className={cls}
            x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={Math.min(3, w * 0.15)} transform={spin}
          />
        );
      })}

      {objectives.map((o, i) => (
        <g key={i}>
          <circle
            data-testid="objective" className="fm-obj"
            cx={sx(o.x)} cy={sy(o.y)} r={o.vp === 2 ? 13 : 9}
            strokeWidth={o.vp === 2 ? 1.5 : 0.75}
          />
          <text className="fm-obj-label" x={sx(o.x)} y={sy(o.y) + 4} textAnchor="middle">
            {o.vp}
          </text>
        </g>
      ))}

      <text className="fm-zone-label" x={sx(mineLabel.x)} y={sy(mineLabel.y)} textAnchor="middle">
        You deploy
      </text>
      <text className="fm-zone-label" x={sx(foeLabel.x)} y={sy(foeLabel.y)} textAnchor="middle">
        Enemy deploys
      </text>
    </svg>
  );
}
