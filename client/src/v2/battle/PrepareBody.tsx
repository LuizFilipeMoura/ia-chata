import { useState } from "react";
import ReactionPicker from "../overlays/ReactionPicker";
import type { PrepType } from "../../state/types";
import "../styles/overlay.css";

// Reaction picker for the Prepare action. Owns the selection in local state so
// the ReactionPicker re-renders on each pick; onChange mirrors it to the drawer's
// ref-backed state for the Confirm handler (matches RepairBody's pattern).
export default function PrepareBody({
  rigName, allowShield, onChange, onConfirm,
}: {
  rigName: string;
  allowShield: boolean;
  onChange: (v: PrepType) => void;
  onConfirm: () => void;
}) {
  const [prep, setPrep] = useState<PrepType>("brace");
  return (
    <>
      <p className="v2-dwr-hint">
        Place a facedown reaction on {rigName}. It stays secret until an enemy fires on this Rig.
      </p>
      <ReactionPicker
        value={prep}
        allowShield={allowShield}
        onConfirm={onConfirm}
        confirmIcon="🛡️"
        onChange={(v) => {
          setPrep(v);
          onChange(v);
        }}
      />
    </>
  );
}
