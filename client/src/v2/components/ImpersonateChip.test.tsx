import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { ImpersonateChip } from "./ImpersonateChip";
import { ImpersonationProvider } from "../state/ImpersonationContext";
import { RoomProvider, useRoomDispatch } from "../../state/RoomStateContext";
import { useEffect } from "react";
import type { ServerState } from "../../state/types";

function Seed({ state }: { state: ServerState }) {
  const dispatch = useRoomDispatch();
  useEffect(() => { dispatch({ type: "applyServerState", state }); }, [dispatch, state]);
  return null;
}

function wrap(state: ServerState) {
  return render(
    <RoomProvider>
      <ImpersonationProvider>
        <Seed state={state} />
        <ImpersonateChip />
      </ImpersonationProvider>
    </RoomProvider>,
  );
}

test("hidden when the room is not seeded", () => {
  wrap({ version: 1, rigs: [], game: null, field: null, seeded: false });
  expect(screen.queryByLabelText(/Impersonate side/i)).not.toBeInTheDocument();
});

test("shows A/B toggles when seeded", async () => {
  const user = userEvent.setup();
  wrap({ version: 1, rigs: [], game: null, field: null, seeded: true });
  const chip = screen.getByLabelText(/Impersonate side/i);
  expect(chip).toBeInTheDocument();
  const b = screen.getByRole("button", { name: /^B$/ });
  await user.click(b);
  expect(b).toHaveAttribute("aria-pressed", "true");
});
