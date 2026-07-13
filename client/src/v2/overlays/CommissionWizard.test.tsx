import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { useEffect } from "react";
import { AppProviders } from "../../AppProviders";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { CommissionWizard } from "./CommissionWizard";

const sendCommand = vi.fn();
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendCommand }));

function Seed() {
  const dispatch = useRoomDispatch();
  useEffect(() => {
    dispatch({ type: "setSession", session: { room: "IRON", side: "a", name: "K" } });
    dispatch({ type: "applyServerState", state: {
      version: 1, ownerSide: "a", field: null, rigs: [],
      game: { round: 1, phase: "setup", started: false, sides: [{ id: "a", name: "K", vp: 0, ready: false }] },
    } as ServerState });
  }, [dispatch]);
  return null;
}
function open() {
  render(<AppProviders><Seed /><CommissionWizard onClose={vi.fn()} /></AppProviders>);
}

test("rig flow has an Equipment step; tank flow does not", async () => {
  const user = userEvent.setup();
  open();
  expect(await screen.findByText("Equipment")).toBeInTheDocument();
  await user.click(screen.getByText("Tank"));
  expect(screen.queryByText("Equipment")).toBeNull();
});

test("commissioning a rig dispatches add with the rig field set", async () => {
  const user = userEvent.setup();
  sendCommand.mockClear();
  open();
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // Kind → Chassis
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // Chassis → Weapons
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // Weapons → Equipment
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // Equipment → Confirm
  await user.click(await screen.findByRole("button", { name: /Commission/i }));
  expect(sendCommand).toHaveBeenCalledWith("add", expect.objectContaining({
    kind: "rig", chassis: expect.any(String), owner: "a",
    lr: expect.any(String), melee: expect.any(String), equipment: expect.any(String),
    longRangeUpgrade: expect.any(String), meleeUpgrade: expect.any(String),
  }));
});

test("rig flow shows a Weapons step between Chassis and Equipment", async () => {
  const user = userEvent.setup();
  open();
  expect(await screen.findByText("Weapons")).toBeInTheDocument();
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Chassis
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Weapons
  expect(screen.getAllByRole("button", { name: /Prototype/i }).length).toBeGreaterThanOrEqual(2);
});

test("choosing a Prototype on one weapon locks the other weapon's Prototype", async () => {
  const user = userEvent.setup();
  open();
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Chassis
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Weapons
  const protos = screen.getAllByRole("button", { name: /Prototype/i });
  expect(protos[1]).not.toBeDisabled();
  await user.click(protos[0]);
  expect(screen.getAllByRole("button", { name: /Prototype/i })[1]).toBeDisabled();
});

test("a weapon Prototype also locks the equipment Prototype", async () => {
  const user = userEvent.setup();
  open();
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Chassis
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Weapons
  const protos = screen.getAllByRole("button", { name: /Prototype/i });
  await user.click(protos[0]); // spend the rig's Prototype on a weapon
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Equipment
  const equipProtos = screen.getAllByRole("button", { name: /Prototype/i });
  expect(equipProtos[equipProtos.length - 1]).toBeDisabled();
});

test("an equipment Prototype locks both weapon Prototypes", async () => {
  const user = userEvent.setup();
  open();
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Chassis
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Weapons
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Equipment
  // On the Equipment step the selected card shows one ladder; pick its Prototype.
  const equipProto = screen.getByRole("button", { name: /Prototype/i });
  await user.click(equipProto);
  // Go back to the Weapons step; both weapon Prototype segments must now be locked.
  await user.click(await screen.findByRole("button", { name: /◂ Back/i }));
  const weaponProtos = screen.getAllByRole("button", { name: /Prototype/i });
  expect(weaponProtos.length).toBeGreaterThanOrEqual(2);
  for (const b of weaponProtos) expect(b).toBeDisabled();
});

test("tank Loadout step lists pre-built templates and commissions gun + modules", async () => {
  const user = userEvent.setup();
  sendCommand.mockClear();
  open();
  await user.click(await screen.findByText("Tank"));
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Loadout
  // The two tank templates are shown as cards; default is the first (Marksman Tank).
  expect(screen.getByText("Marksman Tank")).toBeInTheDocument();
  expect(screen.getByText("Depot Tank")).toBeInTheDocument();
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Confirm
  await user.click(await screen.findByRole("button", { name: /Commission/i }));
  expect(sendCommand).toHaveBeenCalledWith("add", expect.objectContaining({
    kind: "tank", owner: "a", name: "Marksman Tank",
    unit: "Tank Cannon", modules: ["damage", "recon"],
  }));
});

test("a sidearm-only walker template commissions modules with no unit", async () => {
  const user = userEvent.setup();
  sendCommand.mockClear();
  open();
  await user.click(await screen.findByText("Walker"));
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Loadout
  await user.click(await screen.findByText("Field Welder")); // sidearm-only, repair+recon
  await user.click(await screen.findByRole("button", { name: /^Next$/i })); // → Confirm
  await user.click(await screen.findByRole("button", { name: /Commission/i }));
  const call = sendCommand.mock.calls.find((c) => c[0] === "add");
  expect(call?.[1]).toMatchObject({ kind: "walker", owner: "a", name: "Field Welder", modules: ["repair", "recon"] });
  expect(call?.[1].unit).toBeUndefined();
});
