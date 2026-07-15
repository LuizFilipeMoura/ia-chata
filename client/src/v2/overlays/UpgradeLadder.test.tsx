import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { UpgradeLadder } from "./UpgradeLadder";
import type { UpgradeTier } from "../lib/commissionData";

// Deliberately synthetic — NOT a copy of any catalog row. UpgradeLadder renders
// whatever it is handed, so every value here is arbitrary to these tests. This
// fixture used to mirror the real Autocannon ladder verbatim, which made it a
// second, un-asserted copy of the catalog that nothing could keep honest: it
// still read "+2 Penetration" after Depleted Core became +1, and no test failed.
// Keep these names unmistakably fake so the next reader cannot mistake them for
// balance truth. The prototype `tag` keeps the "payoff; catch" shape because
// splitUpgradeTag's parse of it is what the third test below exercises.
const TIERS: UpgradeTier[] = [
  { id: "t-field", nature: "field", name: "Test Field Tier", tag: "+9 Widgets" },
  { id: "t-tuned", nature: "tuned", name: "Test Tuned Tier", tag: "Gains Testworthy" },
  { id: "t-proto", nature: "prototype", name: "Test Prototype Tier", tag: "Doubles every widget; jams the widget bay after" },
];

test("selecting a segment reports its upgrade id", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<UpgradeLadder title="Test Weapon" tiers={TIERS} selected="t-field" onSelect={onSelect} lockPrototype={false} />);
  await user.click(screen.getByRole("button", { name: /Machined/i }));
  expect(onSelect).toHaveBeenCalledWith("t-tuned");
});

test("selected prototype shows payoff, catch and the gate badge", () => {
  render(<UpgradeLadder title="Test Weapon" tiers={TIERS} selected="t-proto" onSelect={vi.fn()} lockPrototype={false} />);
  expect(screen.getByText(/Doubles every widget/)).toBeInTheDocument();
  expect(screen.getByText(/jams the widget bay after/)).toBeInTheDocument();
  expect(screen.getByText(/1 per rig/i)).toBeInTheDocument();
});

test("a safe tier reports no catch", () => {
  render(<UpgradeLadder title="Test Weapon" tiers={TIERS} selected="t-field" onSelect={vi.fn()} lockPrototype={false} />);
  expect(screen.getByText(/None — dependable/i)).toBeInTheDocument();
});

test("locking the prototype disables its segment", () => {
  render(<UpgradeLadder title="Test Weapon" tiers={TIERS} selected="t-field" onSelect={vi.fn()} lockPrototype />);
  expect(screen.getByRole("button", { name: /Prototype/i })).toBeDisabled();
});
