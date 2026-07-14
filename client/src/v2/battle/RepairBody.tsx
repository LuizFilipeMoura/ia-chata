import { useState } from "react";
import ChoiceField from "../overlays/ChoiceField";
import { LOC_CHOICES } from "./constants";
import "../styles/overlay.css";

// Location picker for the two repair-family actions (battle.js:430-461). Roll
// figures include any Field Repair Suite bonus (bonusSp). Emergency Patch is a
// flat guaranteed 2 SP — the engine does NOT add the suite bonus to the patch,
// only to the dice Repair.
export default function RepairBody({
  isPatch, auto, bonusSp, onChange,
}: {
  isPatch: boolean;
  auto: boolean;
  bonusSp: number;
  onChange: (v: string) => void;
}) {
  const [loc, setLoc] = useState("hull");
  const hi = 2 + bonusSp;
  const lo = 1 + bonusSp;
  return (
    <>
      <p className="v2-dwr-hint">
        {isPatch
          ? `Restores a guaranteed 2 SP to the chosen location — no dice.`
          : auto
            ? `Rolls a D12: 10+ restores ${hi} SP, 7–9 restores ${lo} SP.`
            : `You'll roll a D12 next: 10+ restores ${hi} SP, 7–9 restores ${lo} SP.`}
      </p>
      <ChoiceField
        label="Location"
        options={LOC_CHOICES}
        value={loc}
        onChange={(v) => {
          setLoc(v);
          onChange(v);
        }}
      />
    </>
  );
}
