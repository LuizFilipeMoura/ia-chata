import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { RigRow } from "./RigRow";
import type { Rig } from "../../state/types";

const rig: Rig = {
  id: 1, name: "STALKER", owner: "a", weightClass: "light",
  hull: { sp: 4, max: 6, destroyed: false },
  arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 3, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  weapons: { longRange: "Autocannon", melee: "Claw" },
  equipment: "ablative-plating", activated: false, destroyed: false,
};

test("renders name and four component bars and opens on click", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();
  render(<RigRow rig={rig} hostile={false} onOpen={onOpen} />);
  expect(screen.getByText("STALKER")).toBeInTheDocument();
  ["H", "A", "L", "E"].forEach((t) => expect(screen.getByText(t)).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /STALKER/i }));
  expect(onOpen).toHaveBeenCalledWith(1);
});
