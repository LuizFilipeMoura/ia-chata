import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { DrawerProvider } from "./DrawerContext";
import { RollProvider } from "./RollContext";
import { RoomProvider } from "./RoomStateContext";
import { BattleActionsProvider, useBattleActions } from "./BattleActionsContext";
import type { Rig } from "./types";

vi.mock("../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

// openPrepare only reads rig.name; a minimal stand-in keeps the test focused.
const rig = { name: "Vulcan" } as Rig;

function OpenPrepare() {
  const { openPrepare } = useBattleActions();
  return (
    <button type="button" onClick={() => openPrepare(rig)}>
      prep
    </button>
  );
}

function renderPrepare() {
  return render(
    <RoomProvider>
      <DrawerProvider>
        <RollProvider>
          <BattleActionsProvider>
            <OpenPrepare />
          </BattleActionsProvider>
        </RollProvider>
      </DrawerProvider>
    </RoomProvider>,
  );
}

test("prepare drawer highlights the reaction the player picks", async () => {
  const user = userEvent.setup();
  renderPrepare();
  await user.click(screen.getByText("prep"));

  const brace = screen.getByRole("button", { name: /Brace for Incoming Fire/ });
  const evasive = screen.getByRole("button", { name: /Evasive Manoeuvre/ });
  expect(brace.className).toContain("sel");
  expect(evasive.className).not.toContain("sel");

  await user.click(evasive);
  expect(evasive.className).toContain("sel");
  expect(brace.className).not.toContain("sel");
});
