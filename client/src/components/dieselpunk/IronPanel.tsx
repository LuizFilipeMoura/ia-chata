import {
  forwardRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type Ref,
} from "react";

/**
 * IronPanel — heavy dieselpunk skeuomorphic plate.
 *
 * A dark brushed-gunmetal panel with a tarnished-brass chamfered frame, corner
 * + edge bolts, grime vignette, and a recessed inner well that hosts `children`.
 *
 * Polymorphic: render it as a static plate (`div`, default) or as an
 * interactive control (`as="button"`). All extra props (onClick, aria-*, type,
 * disabled, …) forward to the underlying element, so it drops in anywhere a
 * `<div>` or `<button>` would.
 *
 *   <IronPanel>readout…</IronPanel>
 *   <IronPanel as="button" onClick={fire}>FIRE</IronPanel>
 *   <IronPanel width={220} chamfer={12} boltSize={9} cornerInset={13}>…</IronPanel>
 */

const octagon = (c: number) =>
  `polygon(${c}px 0,calc(100% - ${c}px) 0,100% ${c}px,` +
  `100% calc(100% - ${c}px),calc(100% - ${c}px) 100%,${c}px 100%,` +
  `0 calc(100% - ${c}px),0 ${c}px)`;

export interface IronPanelProps {
  /** Element to render as — e.g. "div" (default) or "button". */
  as?: ElementType;
  /** Panel width. number → px, or any CSS length. Default 360. */
  width?: number | string;
  /** Panel height. number → px, or any CSS length. Default 250. */
  height?: number | string;
  /** Outer chamfer / cut-corner size (px). Default 16. */
  chamfer?: number;
  /** Brass frame thickness (px). Default 4. */
  frame?: number;
  /** Bolt diameter (px). Default 11. */
  boltSize?: number;
  /** Corner-bolt inset from each edge (px). Default 17. */
  cornerInset?: number;
  /** Edge-bolt inset from the border (px). Default 10. */
  edgeInset?: number;
  /** Render the four corner bolts. Default true. */
  cornerBolts?: boolean;
  /** Render the four mid-edge bolts. Default false. */
  edgeBolts?: boolean;
  /** Inner recessed well insets, "<vertical>px <horizontal>px". Default "34px 30px". */
  wellInset?: string;
  /** Content placed inside the recessed well. */
  children?: ReactNode;
  /** Style on the outer frame element. */
  style?: CSSProperties;
  /** Style on the recessed content well. */
  wellStyle?: CSSProperties;
  className?: string;
  /** Any other prop (onClick, aria-*, type, disabled, …) forwards to the element. */
  [key: string]: unknown;
}

const px = (v: number | string) => (typeof v === "number" ? `${v}px` : v);

function boltStyle(size: number, pos: CSSProperties): CSSProperties {
  return {
    position: "absolute",
    width: size,
    height: size,
    borderRadius: "50%",
    pointerEvents: "none",
    background:
      "radial-gradient(circle at 36% 30%,#9c7736,#5a4220 55%,#201708 90%)",
    boxShadow:
      "0 1px 2px rgba(0,0,0,.9),inset 0 1px 1px rgba(210,180,120,.35)," +
      "inset 0 -1px 1px rgba(0,0,0,.55)",
    ...pos,
  };
}

function Bolt({ size, pos }: { size: number; pos: CSSProperties }) {
  return (
    <span style={boltStyle(size, pos)}>
      <span
        style={{
          position: "absolute",
          inset: size * 0.32,
          borderRadius: "50%",
          background: "radial-gradient(circle at 40% 35%,#2e2210,#100b05)",
          boxShadow: "inset 0 1px 1px rgba(0,0,0,.75)",
        }}
      />
    </span>
  );
}

export const IronPanel = forwardRef(function IronPanel(
  {
    as,
    width = 360,
    height = 250,
    chamfer = 16,
    frame = 4,
    boltSize = 11,
    cornerInset = 17,
    edgeInset = 10,
    cornerBolts = true,
    edgeBolts = false,
    wellInset = "34px 30px",
    children,
    style,
    wellStyle,
    className,
    ...rest
  }: IronPanelProps,
  ref: Ref<HTMLElement>,
) {
  const Comp = (as ?? "div") as ElementType;
  const innerChamfer = Math.max(0, chamfer - 3);

  const frameStyle: CSSProperties = {
    position: "relative",
    width: px(width),
    height: px(height),
    padding: frame,
    boxSizing: "border-box",
    clipPath: octagon(chamfer),
    background:
      "linear-gradient(135deg,#7a5c26,#3c2c12 22%,#1c1509 48%,#2e2210 72%,#5a441e 100%)",
    boxShadow: "0 10px 26px rgba(0,0,0,.72),0 1px 0 rgba(180,150,90,.12)",
    // reset for `as="button"`
    border: "none",
    color: "inherit",
    font: "inherit",
    textAlign: "inherit",
    cursor: as === "button" ? "pointer" : undefined,
    ...style,
  };

  return (
    <Comp ref={ref} className={className} style={frameStyle} {...rest}>
      <span
        style={{
          position: "relative",
          display: "block",
          width: "100%",
          height: "100%",
          clipPath: octagon(innerChamfer),
          background:
            "repeating-linear-gradient(90deg,rgba(255,255,255,.02) 0 1px,rgba(0,0,0,.05) 1px 3px)," +
            "radial-gradient(140% 120% at 50% 40%,#2b2b26 0%,#161613 55%,#0a0a08 100%)",
          boxShadow:
            "inset 0 0 0 2px rgba(0,0,0,.65),inset 0 0 0 3px rgba(90,70,36,.22)," +
            "inset 2px 2px 5px rgba(0,0,0,.8),inset -2px -2px 5px rgba(0,0,0,.7)",
        }}
      >
        {/* grime vignette */}
        <span
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(120% 100% at 50% 45%,transparent 55%,rgba(0,0,0,.55) 100%)",
          }}
        />

        {/* recessed well — content sits here */}
        <span
          style={{
            position: "absolute",
            inset: wellInset,
            clipPath: octagon(10),
            background: "radial-gradient(130% 130% at 40% 30%,#242420,#0d0d0b 75%)",
            boxShadow:
              "inset 3px 3px 6px rgba(0,0,0,.9)," +
              "inset -1px -1px 2px rgba(90,72,38,.16),0 1px 0 rgba(120,96,52,.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...wellStyle,
          }}
        >
          {children}
        </span>

        {/* corner bolts */}
        {cornerBolts && (
          <>
            <Bolt size={boltSize} pos={{ top: cornerInset, left: cornerInset }} />
            <Bolt size={boltSize} pos={{ top: cornerInset, right: cornerInset }} />
            <Bolt size={boltSize} pos={{ bottom: cornerInset, left: cornerInset }} />
            <Bolt size={boltSize} pos={{ bottom: cornerInset, right: cornerInset }} />
          </>
        )}

        {/* mid-edge bolts */}
        {edgeBolts && (
          <>
            <Bolt size={boltSize} pos={{ top: edgeInset, left: "50%", transform: "translateX(-50%)" }} />
            <Bolt size={boltSize} pos={{ bottom: edgeInset, left: "50%", transform: "translateX(-50%)" }} />
            <Bolt size={boltSize} pos={{ top: "50%", left: edgeInset, transform: "translateY(-50%)" }} />
            <Bolt size={boltSize} pos={{ top: "50%", right: edgeInset, transform: "translateY(-50%)" }} />
          </>
        )}
      </span>
    </Comp>
  );
});

export default IronPanel;
