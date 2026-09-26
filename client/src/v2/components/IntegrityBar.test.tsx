import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { Rig } from "../../state/types";
import { IntegrityBar } from "./IntegrityBar";

const rig = (integrity: number, integrityMax = 20): Rig => ({
  id: 1, name: "Red", owner: "b", weightClass: "medium",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false }, engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false, integrity, integrityMax,
});

test("shows the pool and its danger tier", () => {
  const { rerender } = render(<IntegrityBar rig={rig(20)} />);
  expect(screen.getByText("20/20")).toBeInTheDocument();
  expect(screen.queryByText("BLOODIED")).toBeNull();
  rerender(<IntegrityBar rig={rig(10)} />);
  expect(screen.getByText("BLOODIED")).toBeInTheDocument();
  rerender(<IntegrityBar rig={rig(4)} />);
  expect(screen.getByText("CRITICAL")).toBeInTheDocument();
});

test("flags LETHAL when the attack's best case empties the pool, LIKELY KILL when the average does", () => {
  const { rerender } = render(<IntegrityBar rig={rig(6)} ghost={{ ed: 2, max: 5 }} />);
  expect(screen.queryByText(/LETHAL|LIKELY KILL/)).toBeNull();
  rerender(<IntegrityBar rig={rig(6)} ghost={{ ed: 2, max: 8 }} />);
  expect(screen.getByText("☠ LETHAL")).toBeInTheDocument();
  rerender(<IntegrityBar rig={rig(6)} ghost={{ ed: 7, max: 8 }} />);
  expect(screen.getByText("☠ LIKELY KILL")).toBeInTheDocument();
});

test("renders nothing for a rig without Integrity", () => {
  const r = rig(5); delete r.integrity;
  const { container } = render(<IntegrityBar rig={r} />);
  expect(container.firstChild).toBeNull();
});
