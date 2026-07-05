import { test } from "node:test";
import assert from "node:assert/strict";
import { createWsHub } from "./ws.js";
import { createRoom, applyCommand, claimSide } from "../shared/game-state.js";

// Every Rig must be commissioned with one Long Range and one Melee weapon.
const W = { lr: "Mini Gun", melee: "Sword" };

function fakeSocket() {
  const handlers = {};
  return {
    readyState: 1, // WebSocket.OPEN
    sent: [],
    send(msg) { this.sent.push(JSON.parse(msg)); },
    on(event, cb) { handlers[event] = cb; },
    triggerClose() { handlers.close?.(); },
  };
}

test("broadcast sends the current version to every socket in the room", () => {
  const hub = createWsHub();
  const room = createRoom("IRON42");
  const a = fakeSocket();
  const b = fakeSocket();
  hub.attach(a, "IRON42", "a");
  hub.attach(b, "IRON42", "b");

  applyCommand(room, { verb: "add", attrs: { name: "Warden", class: "medium", owner: "a", ...W } });
  hub.broadcast(room);

  assert.equal(a.sent.length, 1);
  assert.equal(b.sent.length, 1);
  assert.equal(a.sent[0].version, room.version);
  assert.equal(b.sent[0].version, room.version);
});

test("broadcast scopes bounties per socket's side", () => {
  const hub = createWsHub();
  const room = createRoom("IRON42");
  const a = fakeSocket();
  const b = fakeSocket();
  hub.attach(a, "IRON42", "a");
  hub.attach(b, "IRON42", "b");

  // Reaching the started state (which assigns bounties) requires an owner and a
  // locked field before either side can ready up (§10 field setup).
  claimSide(room, { name: "Owner", side: "a" });
  applyCommand(room, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(room, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  applyCommand(room, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(room, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  hub.broadcast(room);

  assert.deepEqual(Object.keys(a.sent[0].state.game.bounties), ["a"]);
  assert.deepEqual(Object.keys(b.sent[0].state.game.bounties), ["b"]);
  assert.equal(a.sent[0].state.game.bounties.b, undefined);
  assert.equal(b.sent[0].state.game.bounties.a, undefined);
});

test("a closed socket is removed and receives no further broadcasts", () => {
  const hub = createWsHub();
  const room = createRoom("IRON42");
  const a = fakeSocket();
  hub.attach(a, "IRON42", "a");
  a.triggerClose();

  applyCommand(room, { verb: "add", attrs: { name: "Warden", class: "medium", owner: "a", ...W } });
  hub.broadcast(room);

  assert.equal(a.sent.length, 0);
});

test("a socket that is not OPEN is skipped", () => {
  const hub = createWsHub();
  const room = createRoom("IRON42");
  const a = fakeSocket();
  a.readyState = 0; // CONNECTING
  hub.attach(a, "IRON42", "a");

  hub.broadcast(room);

  assert.equal(a.sent.length, 0);
});

test("broadcasting to a room with no connected sockets is a no-op", () => {
  const hub = createWsHub();
  const room = createRoom("IRON42");
  assert.doesNotThrow(() => hub.broadcast(room));
});
