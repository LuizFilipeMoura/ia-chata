import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { UpgradeLadder } from "./UpgradeLadder";
import type { UpgradeTier } from "../lib/commissionData";

const TIERS: UpgradeTier[] = [
  { id: "dep", nature: "field", name: "Depleted Core", tag: "+2 STR" },
  { id: "ap", nature: "tuned", name: "AP Shells", tag: "Gains Armour Piercing" },
  { id: "pen", nature: "prototype", name: "Penetrator", tag: "Every 3rd volley ignores armour; belt cycles slow after" },
];

test("selecting a segment reports its upgrade id", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<UpgradeLadder title="Autocannon" tiers={TIERS} selected="dep" onSelect={onSelect} lockPrototype={false} />);
  await user.click(screen.getByRole("button", { name: /Machined/i }));
  expect(onSelect).toHaveBeenCalledWith("ap");
});

test("selected prototype shows payoff, catch and the gate badge", () => {
  render(<UpgradeLadder title="Autocannon" tiers={TIERS} selected="pen" onSelect={vi.fn()} lockPrototype={false} />);
  expect(screen.getByText(/Every 3rd volley ignores armour/)).toBeInTheDocument();
  expect(screen.getByText(/belt cycles slow after/)).toBeInTheDocument();
  expect(screen.getByText(/1 per rig/i)).toBeInTheDocument();
});

test("a safe tier reports no catch", () => {
  render(<UpgradeLadder title="Autocannon" tiers={TIERS} selected="dep" onSelect={vi.fn()} lockPrototype={false} />);
  expect(screen.getByText(/None — dependable/i)).toBeInTheDocument();
});

test("locking the prototype disables its segment", () => {
  render(<UpgradeLadder title="Autocannon" tiers={TIERS} selected="dep" onSelect={vi.fn()} lockPrototype />);
  expect(screen.getByRole("button", { name: /Prototype/i })).toBeDisabled();
});
