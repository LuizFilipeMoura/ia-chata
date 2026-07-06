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

test("clearSession drops the session and resets room state", () => {
  const joined = roomReducer(
    roomReducer(initialRoomState, {
      type: "setSession",
      session: { room: "IRON42", side: "a", name: "Lu" },
    }),
    { type: "applyServerState", state: { version: 7, rigs: [{ name: "X" } as never], game: null } },
  );
  const next = roomReducer(joined, { type: "clearSession" });
  expect(next.session).toBeNull();
  // Room state must reset so a later re-join isn't ignored by the version guard.
  expect(next).toEqual(initialRoomState);
});
