import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MoveBody from "./MoveBody";
import type { Rig } from "../../state/types";

const baseRig = (over: Partial<Rig> = {}): Rig => ({
  id: 1, name: "Vela", weightClass: "light", owner: "a", speed: 8,
  hull: { sp: 6, max: 6 }, arms: { sp: 5, max: 5 }, legs: { sp: 5, max: 5 },
  engine: { sp: 4, max: 4, heat: 0 },
  ...(over as object),
}) as Rig;

const noop = () => {};

describe("MoveBody sprint heat", () => {
  it("shows +1 for a Servo Actuators rig", () => {
    render(<MoveBody rig={baseRig({ equipment: "servo-actuators" })} actionKey="sprint" enemies={[]} onEngageChange={noop} onCancel={noop} onConfirm={noop} />);
    expect(document.body.textContent).toContain("+1 heat");
  });
  it("shows +0 for a Reinforced Servos rig", () => {
    render(<MoveBody rig={baseRig({ equipment: "servo-actuators", equipmentUpgrade: "reinforced-servos" })} actionKey="sprint" enemies={[]} onEngageChange={noop} onCancel={noop} onConfirm={noop} />);
    expect(document.body.textContent).toContain("+0 heat");
  });
  it("Sprint hint notes the free 90° pivot", () => {
    render(<MoveBody rig={baseRig({ equipment: "servo-actuators" })} actionKey="sprint" enemies={[]} onEngageChange={noop} onCancel={noop} onConfirm={noop} />);
    expect(document.body.textContent).toContain("pivot up to 90° free");
  });
});
