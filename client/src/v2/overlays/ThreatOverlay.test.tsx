import { useEffect } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { V2Providers } from "../state/V2Providers";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { ThreatOverlay } from "./ThreatOverlay";

function Seed({ state, side }: { state: ServerState; side: string }) {
  const d = useRoomDispatch();
  useEffect(() => {
    d({ type: "setSession", session: { room: "IR", side, name: "K" } });
    d({ type: "applyServerState", state });
  }, [d, state, side]);
  return null;
}

const RIGS = [
  { id: 1, name: "Ironjaw", owner: "a" },
  { id: 2, name: "Rivethead", owner: "b" },
] as any;

function stateWithThreat(): ServerState {
  return {
    version: 1, ownerSide: "b", field: null, rigs: RIGS,
    game: {
      round: 1, phase: "activation", started: true, sides: [],
      turn: { side: "a", activeRigId: 1, actionsUsed: 0, actionsMax: 3 } as any,
      pendingThreat: { attackerId: 1, targetId: 2, defender: "b", mode: "fire", weapon: "Autocannon" },
    },
  };
}

test("shows the overlay to the targeted defender", async () => {
  render(<V2Providers><Seed state={stateWithThreat()} side="b" /><ThreatOverlay /></V2Providers>);
  expect(await screen.findByText(/INCOMING FIRE/i)).toBeInTheDocument();
  expect(screen.getByText(/Ironjaw/i)).toBeInTheDocument();
  expect(screen.getByText(/Rivethead/i)).toBeInTheDocument();
});

test("Dismiss is offered immediately and closes the overlay", async () => {
  render(<V2Providers><Seed state={stateWithThreat()} side="b" /><ThreatOverlay /></V2Providers>);
  // The overlay portals to document.body, so assert on the document, not on the
  // render container (which never holds it).
  fireEvent.click(await screen.findByRole("button", { name: /dismiss/i }));
  expect(document.querySelector(".v2-threat")).toBeNull();
});

test("the close button closes the overlay too", async () => {
  render(<V2Providers><Seed state={stateWithThreat()} side="b" /><ThreatOverlay /></V2Providers>);
  await screen.findByText(/INCOMING FIRE/i);
  fireEvent.click(screen.getByRole("button", { name: /close/i }));
  expect(document.querySelector(".v2-threat")).toBeNull();
});

test("hidden for the attacker", () => {
  const { container } = render(
    <V2Providers><Seed state={stateWithThreat()} side="a" /><ThreatOverlay /></V2Providers>,
  );
  expect(container.querySelector(".v2-threat")).toBeNull();
});

test("hidden when there is no pendingThreat", () => {
  const s = stateWithThreat();
  s.game!.pendingThreat = null;
  const { container } = render(
    <V2Providers><Seed state={s} side="b" /><ThreatOverlay /></V2Providers>,
  );
  expect(container.querySelector(".v2-threat")).toBeNull();
});
