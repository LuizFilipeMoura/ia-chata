import { useState } from "react";
import ChoiceField from "../overlays/ChoiceField";
import { LOC_CHOICES } from "./constants";
import "../styles/overlay.css";

// Location picker for the two repair-family actions (battle.js:430-461).
export default function RepairBody({
  isPatch, auto, onChange,
}: {
  isPatch: boolean;
  auto: boolean;
  onChange: (v: string) => void;
}) {
  const [loc, setLoc] = useState("hull");
  return (
    <>
      <p className="v2-dwr-hint">
        {isPatch
          ? "Restores a guaranteed 2 SP to the chosen location — no dice."
          : auto
            ? "Rolls a D12: 10+ restores 2 SP, 7–9 restores 1 SP."
            : "You'll roll a D12 next: 10+ restores 2 SP, 7–9 restores 1 SP."}
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
