import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Join } from "./Join";

test("submits room, name, and chosen side", async () => {
  const user = userEvent.setup();
  const onJoin = vi.fn();
  render(<Join onJoin={onJoin} error="" />);

  await user.clear(screen.getByLabelText(/Battle Room Code/i));
  await user.type(screen.getByLabelText(/Battle Room Code/i), "iron-42");
  await user.clear(screen.getByLabelText(/Commander Designation/i));
  await user.type(screen.getByLabelText(/Commander Designation/i), "Kostov");
  await user.click(screen.getByRole("button", { name: /Enter The Yard/i }));

  expect(onJoin).toHaveBeenCalledWith("IRON-42", "Kostov", "a");
});

test("shows the error line when provided", () => {
  render(<Join onJoin={vi.fn()} error="Room is full." />);
  expect(screen.getByText("Room is full.")).toBeInTheDocument();
});
