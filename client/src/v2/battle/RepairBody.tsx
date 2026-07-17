import { useState } from "react";
import ChoiceField from "../overlays/ChoiceField";
import { LOC_CHOICES } from "./constants";
import "../styles/overlay.css";

// Location picker for the two repair-family actions (battle.js:430-461). Roll
// figures include any Field Repair Suite bonus (bonusSp). Emergency Patch is a
// flat guaranteed 4 SP — the engine does NOT add the suite bonus to the patch,
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
  const table = `1–2 restores ${1 + bonusSp} SP, 3–4 restores ${2 + bonusSp} SP, 5–6 restores ${3 + bonusSp} SP`;
  return (
    <>
      <p className="v2-dwr-hint">
        {isPatch
          ? `Restores a guaranteed 4 SP to the chosen location — no dice.`
          : auto
            ? `Rolls a D6: ${table}.`
            : `You'll roll a D6 next: ${table}.`}
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
