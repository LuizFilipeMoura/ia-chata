import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import ReactionPicker from "./ReactionPicker";
test("offers Raise Shield only when allowed", () => {
  const { rerender } = render(<ReactionPicker value="brace" allowShield={false} onChange={vi.fn()} />);
  expect(screen.queryByText(/Raise Shield/i)).toBeNull();
  rerender(<ReactionPicker value="brace" allowShield={true} onChange={vi.fn()} />);
  expect(screen.getByText(/Raise Shield/i)).toBeInTheDocument();
});
