import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "./store.js";
import { applyCommand } from "../shared/game-state.js";

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ooi-")), "rooms.json");
}

test("getOrCreateRoom creates, persists, and reloads", () => {
  const file = tmpFile();
  const store = createStore(file);
  assert.equal(store.getRoom("IRON42"), null);

  const room = store.getOrCreateRoom("IRON42");
  applyCommand(room, { verb: "add", attrs: { name: "Warden", class: "heavy" } });
  store.persist();

  const reloaded = createStore(file);
  const again = reloaded.getRoom("IRON42");
  assert.ok(again);
  assert.equal(again.rigs.length, 1);
  assert.equal(again.rigs[0].name, "Warden");
});

test("missing file loads to an empty store without throwing", () => {
  const store = createStore(path.join(os.tmpdir(), "does-not-exist-ooi", "rooms.json"));
  assert.equal(store.getRoom("anything"), null);
});
