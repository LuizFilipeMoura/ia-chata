import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import Drawer from "./Drawer";

test("the close button calls onClose", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<Drawer config={{ title: "Move" }} visible onClose={onClose} />);
  await user.click(screen.getByRole("button", { name: /close/i }));
  expect(onClose).toHaveBeenCalled();
});

test("a non-dismissable drawer offers no close button", () => {
  render(<Drawer config={{ title: "Blast", dismissable: false }} visible onClose={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
});
