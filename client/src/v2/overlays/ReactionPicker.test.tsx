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
