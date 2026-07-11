import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { CompRow } from "./CompRow";

test("damage and repair dispatch the right commands", async () => {
  const user = userEvent.setup();
  const onCommand = vi.fn();
  render(<CompRow rigName="STALKER" loc="hull" comp={{ sp: 4, max: 6, destroyed: false }} onCommand={onCommand} />);
  await user.click(screen.getByRole("button", { name: /Damage hull/i }));
  expect(onCommand).toHaveBeenCalledWith("damage", { name: "STALKER", loc: "hull", amount: "1" });
  await user.click(screen.getByRole("button", { name: /Repair hull/i }));
  expect(onCommand).toHaveBeenCalledWith("repair", { name: "STALKER", loc: "hull", amount: "1" });
});

test("shows CATASTROPHIC at 0 SP", () => {
  render(<CompRow rigName="X" loc="legs" comp={{ sp: 0, max: 5, destroyed: false }} onCommand={vi.fn()} />);
  expect(screen.getByText("CATASTROPHIC")).toBeInTheDocument();
});
