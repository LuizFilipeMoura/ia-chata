import { useState } from "react";
import ChoiceField from "../overlays/ChoiceField";
import { kindOf, partNamesOf } from "/shared/unit-kinds.js";
import type { Rig } from "../../state/types";
import "../styles/overlay.css";

const LOC_ICONS: Record<string, string> = {
  hull: "🛡️", arms: "🦾", legs: "🦿", engine: "🔩",
  tracks: "⚙️", turret: "🎯", mount: "🔭",
};

// Target (+ optional location) picker for the three support-module actions —
// Field Weld / Vent / Paint (spec: Support Units). `targets` arrives already
// filtered by the caller (friendly, self included, for Field Weld/Vent; enemy
// for Paint). Field Weld's location list follows the *target's* own kind (a
// Tank welds tracks/turret, a Walker welds legs/mount) — the same idea as
// Aimed Attack's location field in AttackWizard.
export default function SupportBody({
  targets, needsLoc, onChange,
}: {
  targets: Rig[];
  needsLoc: boolean;
  onChange: (v: { target: string; loc?: string }) => void;
}) {
  const locsFor = (name: string) => {
    const r = targets.find((x) => x.name === name);
    return r ? partNamesOf(kindOf(r)) : [];
  };

  const [target, setTarget] = useState(targets[0]?.name ?? "");
  const [loc, setLoc] = useState(() => locsFor(target)[0] ?? "hull");

  const pickTarget = (v: string) => {
    setTarget(v);
    const locs = locsFor(v);
    const nextLoc = locs.includes(loc) ? loc : locs[0] ?? "hull";
    setLoc(nextLoc);
    onChange({ target: v, loc: needsLoc ? nextLoc : undefined });
  };
  const pickLoc = (v: string) => {
    setLoc(v);
    onChange({ target, loc: v });
  };

  return (
    <>
      <ChoiceField
        label="Target"
        icon="🎯"
        options={targets.map((r) => ({ value: r.name, label: r.name, icon: "🤖" }))}
        value={target}
        onChange={pickTarget}
      />
      {needsLoc && (
        <ChoiceField
          label="Location"
          icon="◎"
          options={locsFor(target).map((l) => ({ value: l, label: l, icon: LOC_ICONS[l] }))}
          value={loc}
          onChange={pickLoc}
        />
      )}
    </>
  );
}
