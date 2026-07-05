import { roomReducer, initialRoomState } from "./roomReducer";
import type { ServerState } from "./types";

test("applyServerState adopts rigs, game, version", () => {
  const state: ServerState = { version: 4, rigs: [], game: { round: 1 } as never };
  const next = roomReducer(initialRoomState, { type: "applyServerState", state });
  expect(next.stateVersion).toBe(4);
  expect(next.game).toBe(state.game);
  expect(next.rigs).toBe(state.rigs);
});

test("setSession stores the session", () => {
  const s = { room: "IRON42", side: "a", name: "Lu" };
  const next = roomReducer(initialRoomState, { type: "setSession", session: s });
  expect(next.session).toEqual(s);
});
