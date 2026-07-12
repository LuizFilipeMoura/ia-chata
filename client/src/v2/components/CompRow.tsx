import { useEffect, useRef } from "react";
import "../styles/rig-terminal.css";
import { spColor } from "../lib/viewModels";
import type { Component } from "../../state/types";

interface Props {
  rigName: string;
  loc: string;
  comp: Component;
  onCommand: (verb: string, attrs: Record<string, unknown>) => void;
}

export function CompRow({ rigName, loc, comp, onCommand }: Props) {
  const label = loc.charAt(0).toUpperCase() + loc.slice(1);
  const text = comp.destroyed ? "DESTROYED" : comp.sp === 0 ? "CATASTROPHIC" : `${comp.sp}/${comp.max}`;

  const prev = useRef<number | null>(null);
  const prior = prev.current;
  useEffect(() => { prev.current = comp.sp; });
  const damaged = prior != null && comp.sp < prior;
  const healed = prior != null && comp.sp > prior;
  const delta = prior != null ? Math.abs(comp.sp - prior) : 0;

  const cls = "v2-comp" + (damaged ? " is-hit" : healed ? " is-heal" : "");

  return (
    <div className={cls}>
      <span className="v2-comp-label">{label}</span>
      <button type="button" className="v2-comp-step v2-comp-step--dmg" aria-label={`Damage ${loc}`}
        onClick={() => onCommand("damage", { name: rigName, loc, amount: "1" })}>−</button>
      <div className="v2-comp-bar v2-well">
        <div className="v2-comp-bar-fill"
          style={{ width: `${Math.round((comp.sp / comp.max) * 100)}%`, background: spColor(comp.sp, comp.max) }} />
        <div className="v2-comp-bar-text">{text}</div>
      </div>
      <button type="button" className="v2-comp-step v2-comp-step--rep" aria-label={`Repair ${loc}`}
        onClick={() => onCommand("repair", { name: rigName, loc, amount: "1" })}>＋</button>
      {(damaged || healed) && (
        <span className={"v2-comp-delta " + (damaged ? "is-hit" : "is-heal")} aria-hidden="true">
          {damaged ? "−" : "+"}{delta}
        </span>
      )}
    </div>
  );
}
