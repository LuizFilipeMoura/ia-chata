import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import ReactionPicker from "./ReactionPicker";
test("offers Raise Shield only when allowed", () => {
  const { rerender } = render(<ReactionPicker value="brace" allowShield={false} onChange={vi.fn()} />);
  expect(screen.queryByText(/Raise Shield/i)).toBeNull();
  rerender(<ReactionPicker value="brace" allowShield={true} onChange={vi.fn()} />);
  expect(screen.getByText(/Raise Shield/i)).toBeInTheDocument();
});

test("hides the Answer counters by default (Prepare action)", () => {
  render(<ReactionPicker value="brace" onChange={vi.fn()} />);
  expect(screen.queryByText("Riposte")).toBeNull();
  expect(screen.queryByText("Sidestep the Shooter")).toBeNull();
  expect(screen.queryByText("Exploit Opening")).toBeNull();
  expect(screen.getByText("Brace for Incoming Fire")).toBeInTheDocument();
});

test("shows the three counters in answerMode", () => {
  render(<ReactionPicker value="brace" onChange={vi.fn()} answerMode />);
  expect(screen.getByText("Riposte")).toBeInTheDocument();
  expect(screen.getByText("Sidestep the Shooter")).toBeInTheDocument();
  expect(screen.getByText("Exploit Opening")).toBeInTheDocument();
});

test("renders the confirm expansion under the selected reaction only", () => {
  const onConfirm = vi.fn();
  const { rerender } = render(
    <ReactionPicker value="brace" onChange={vi.fn()} onConfirm={onConfirm} confirmLabel="Set reaction" />,
  );
  // Exactly one confirm button, sitting inside the selected choice's item.
  const btn = screen.getByRole("button", { name: /Set reaction/i });
  expect(btn).toBeInTheDocument();
  btn.click();
  expect(onConfirm).toHaveBeenCalledOnce();
  // Selecting a different reaction moves the expansion — still exactly one.
  rerender(
    <ReactionPicker value="evasive" onChange={vi.fn()} onConfirm={onConfirm} confirmLabel="Set reaction" />,
  );
  expect(screen.getAllByRole("button", { name: /Set reaction/i })).toHaveLength(1);
});

test("omits the confirm expansion when no onConfirm is given", () => {
  render(<ReactionPicker value="brace" onChange={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /Set reaction/i })).toBeNull();
});
