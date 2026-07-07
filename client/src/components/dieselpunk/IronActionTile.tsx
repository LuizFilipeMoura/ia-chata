import type { CSSProperties } from "react";
import { IronPanel } from "./IronPanel";
import fireAsset from "../../assets/fire_button_asset.png";
import leverAsset from "../../assets/move_lever_asset.png";

/**
 * IronActionTile — an IronPanel rendered as a battle-action button.
 *
 * `asset="fire"` shows the red fire push-button (warm frame); any other tile
 * shows the lever asset on the default gunmetal frame. Content (image + label +
 * heat) sits in the recessed well; the tile forwards clicks + aria for popovers.
 */
const ASSETS = { fire: fireAsset, lever: leverAsset } as const;

const WARM =
  "linear-gradient(135deg,#7a4326,#3c2012 22%,#1c0f09 48%,#2e1710 72%,#5a3020 100%)";

const labelStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: ".02em",
  color: "#f0e2cf",
  textShadow: "0 1px 2px rgba(0,0,0,.8)",
  lineHeight: 1.05,
};

const heatStyle: CSSProperties = {
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  color: "#ff9a86",
  textShadow: "0 1px 1px rgba(0,0,0,.7)",
};

export interface IronActionTileProps {
  asset: "fire" | "lever";
  label: string;
  /** Pre-formatted heat/cost line; omit to hide. */
  heat?: string;
  /** Lit ember indicator lamp, top-right (used on the Attack tile). */
  lamp?: boolean;
  disabled?: boolean;
  open?: boolean;
  onClick?: () => void;
  hasPopup?: boolean;
  title?: string;
}

export function IronActionTile({
  asset,
  label,
  heat,
  lamp,
  disabled,
  open,
  onClick,
  hasPopup,
  title,
}: IronActionTileProps) {
  const warm = asset === "fire";
  return (
    <IronPanel
      as="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-haspopup={hasPopup || undefined}
      aria-expanded={open || undefined}
      aria-label={label}
      title={title}
      width="100%"
      height={122}
      chamfer={14}
      boltSize={8}
      cornerInset={12}
      edgeBolts={false}
      wellInset="15px 12px"
      style={{
        ...(warm ? { background: WARM } : null),
        opacity: disabled ? 0.5 : 1,
        outline: open ? "1px solid #b98a4e" : undefined,
        outlineOffset: open ? "-1px" : undefined,
      }}
      wellStyle={{ flexDirection: "column", gap: 4, padding: "2px 0" }}
    >
      {lamp && <span className="ac-lamp" aria-hidden="true" />}
      <img
        src={ASSETS[asset]}
        alt=""
        aria-hidden="true"
        height={asset === "lever" ? 48 : 40}
        style={{
          width: "auto",
          display: "block",
          filter: "drop-shadow(0 3px 5px rgba(0,0,0,.6))",
        }}
      />
      <span style={labelStyle}>{label}</span>
      {heat && (
        <span style={{ ...heatStyle, color: heat === "free" ? "rgba(220,210,190,.5)" : heatStyle.color }}>
          {heat}
        </span>
      )}
    </IronPanel>
  );
}

export default IronActionTile;
