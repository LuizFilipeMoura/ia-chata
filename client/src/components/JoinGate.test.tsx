import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JoinGate } from "./JoinGate";

test("enables Enter only after room + side chosen and calls onJoin uppercased", async () => {
  const onJoin = vi.fn();
  render(<JoinGate onJoin={onJoin} />);
  const enter = screen.getByRole("button", { name: /enter room/i });
  expect(enter).toBeDisabled();
  await userEvent.type(screen.getByPlaceholderText(/room code/i), "iron42");
  await userEvent.type(screen.getByPlaceholderText(/your name/i), "Lu");
  await userEvent.click(screen.getByRole("button", { name: /You \(Side A\)/i }));
  expect(enter).toBeEnabled();
  await userEvent.click(enter);
  expect(onJoin).toHaveBeenCalledWith("IRON42", "Lu", "a");
});
