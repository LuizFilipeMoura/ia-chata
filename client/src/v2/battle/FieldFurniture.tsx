import type { FieldState, Objective } from "../../state/types";
import type { FieldProjection } from "./fieldProjection";

const GRID_IN = 12; // blueprint foot lines every 12 inches

interface Props {
  field: FieldState;
  objectives: Objective[];
  proj: FieldProjection;
  /** Battle map passes this: draw every terrain piece as its bounding-box rect. */
  rectOnly?: boolean;
}

// Static battlefield furniture shared by the battle map: the foot-grid, terrain
// (cover), and objective markers. Extracted so the in-battle BattleMap reads the
// same board the pre-battle FieldMap draws (grid + terrain + objectives), rather
// than a bare dark rectangle. Deploy zones / setup labels live in FieldMap only.
export function FieldFurniture({ field, objectives, proj, rectOnly = false }: Props) {
  const { scale, sx, sy } = proj;

  const vLines: number[] = [];
  for (let x = GRID_IN; x < field.width; x += GRID_IN) vLines.push(x);
  const hLines: number[] = [];
  for (let y = GRID_IN; y < field.height; y += GRID_IN) hLines.push(y);

  return (
    <>
      {vLines.map((x) => (
        <line key={`v${x}`} className="v2-fm-grid" x1={sx(x)} y1={sy(0)} x2={sx(x)} y2={sy(field.height)} />
      ))}
      {hLines.map((y) => (
        <line key={`h${y}`} className="v2-fm-grid" x1={sx(0)} y1={sy(y)} x2={sx(field.width)} y2={sy(y)} />
      ))}

      {field.terrain.map((t, i) => {
        const cx = sx(t.x), cy = sy(t.y);
        const cls = `v2-fm-terrain v2-fm-terrain--${t.kind ?? "block"}`;
        const spin = t.rot ? `rotate(${t.rot} ${cx} ${cy})` : undefined;
        if (rectOnly && t.shape !== "rect") {
          let bw: number, bh: number;
          if (t.shape === "poly" && t.points) {
            const xs = t.points.map(([dx]) => dx);
            const ys = t.points.map(([, dy]) => dy);
            bw = (Math.max(...xs) - Math.min(...xs)) * scale;
            bh = (Math.max(...ys) - Math.min(...ys)) * scale;
          } else {
            // ellipse: bounding box is the full 2·rx × 2·ry
            bw = (t.rx ?? 2) * 2 * scale;
            bh = (t.ry ?? 2) * 2 * scale;
          }
          return (
            <rect
              key={i} data-testid="terrain" className={cls}
              x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh}
              rx={Math.min(3, bw * 0.15)} transform={spin}
            />
          );
        }
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
            data-testid="objective" className="v2-fm-obj"
            cx={sx(o.x)} cy={sy(o.y)} r={o.vp === 2 ? 13 : 9}
            strokeWidth={o.vp === 2 ? 1.5 : 0.75}
          />
          <text className="v2-fm-obj-label" x={sx(o.x)} y={sy(o.y) + 4} textAnchor="middle">
            {o.vp}
          </text>
        </g>
      ))}
    </>
  );
}
