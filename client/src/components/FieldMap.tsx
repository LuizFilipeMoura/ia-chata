import { emptyCorners, deploymentCorners } from "/shared/field.js";
import type { FieldState, Objective } from "../state/types";
import "../styles/field-map.css";

interface Props {
  field: FieldState;
  objectives: Objective[];
  mySide: string;
  ownerSide: string | null;
}

const PAD = 18;
const CANVAS_W = 520;

export function FieldMap({ field, objectives, mySide, ownerSide }: Props) {
  const scale = (CANVAS_W - PAD * 2) / field.width;
  const canvasH = field.height * scale + PAD * 2;
  const sx = (xIn: number) => PAD + xIn * scale;
  const sy = (yIn: number) => PAD + yIn * scale;

  const [e0, e1] = emptyCorners(field);
  const [ownerC, enemyC] = deploymentCorners(field);
  const viewerIsOwner = mySide === ownerSide;
  const mineC = viewerIsOwner ? ownerC : enemyC;
  const foeC = viewerIsOwner ? enemyC : ownerC;

  const tri = (c: { x: number; y: number }) =>
    `${sx(e0.x)},${sy(e0.y)} ${sx(c.x)},${sy(c.y)} ${sx(e1.x)},${sy(e1.y)}`;

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
        width={field.width * scale} height={field.height * scale}
        rx={8}
      />
      <polygon className="fm-half-mine" points={tri(mineC)} />
      <polygon className="fm-half-foe" points={tri(foeC)} />
      <line className="fm-diag" x1={sx(e0.x)} y1={sy(e0.y)} x2={sx(e1.x)} y2={sy(e1.y)} />

      {field.terrain.map((t, i) => {
        const s = t.size === "md" ? 30 : 20;
        return (
          <rect
            key={i} data-testid="terrain" className="fm-terrain"
            x={sx(t.x) - s / 2} y={sy(t.y) - s / 2} width={s} height={s} rx={4}
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

      <text className="fm-zone-label" x={sx(mineC.x)} y={sy(mineC.y)} textAnchor="middle">
        You deploy
      </text>
      <text className="fm-zone-label" x={sx(foeC.x)} y={sy(foeC.y)} textAnchor="middle">
        Enemy deploys
      </text>
    </svg>
  );
}
