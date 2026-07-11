import { useState } from "react";
import { Shell } from "./components/Shell";
import { Squadron } from "./screens/Squadron";

export function V2Terminal() {
  const [openRigId, setOpenRigId] = useState<number | null>(null);
  return (
    <Shell channel="yard">
      <Squadron onOpenRig={setOpenRigId} />
      {/* RigTerminal overlay wired in a later task (uses openRigId / setOpenRigId) */}
      {openRigId !== null && null}
    </Shell>
  );
}
