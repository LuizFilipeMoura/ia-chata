import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { HeatGauge } from "./HeatGauge";
import { V2GlossaryTipProvider } from "../state/V2GlossaryTipContext";
import type { Rig } from "../../state/types";

const base = (over: Partial<Rig> = {}): Rig => ({
  id: 1, name: "X", owner: "a", weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false },
  arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 3 },
  equipment: "ablative-plating", activated: false, destroyed: false, ...over,
});

function wrap(node: React.ReactNode) {
  return render(<V2GlossaryTipProvider>{node}</V2GlossaryTipProvider>);
}

test("renders the heat reading for a heat-bearing rig", () => {
  wrap(<HeatGauge rig={base()} />);
  expect(screen.getByText("ENGINE HEAT")).toBeInTheDocument();
});

test("renders nothing for a cold kind", () => {
  const tank = base({ kind: "tank" });
  const { container } = wrap(<HeatGauge rig={tank} />);
  expect(container).toBeEmptyDOMElement();
});

test("splits a boosted capacity into base + thermal-margin badge", () => {
  const rig = base({
    weightClass: "medium",
    equipment: "blast-furnace-core",
  });
  const { container } = wrap(<HeatGauge rig={rig} />);
  expect(container.textContent).toContain("+1");
});
