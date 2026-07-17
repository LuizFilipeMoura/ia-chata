// scripts/balance/piloting.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { pilotFor, PILOTING_HOOKS, PILOTING_BIASES } from "./piloting.mjs";

test("pilotFor returns a no-op hook for an unregistered upgrade", () => {
  const hook = pilotFor("no-such-upgrade");
  assert.equal(typeof hook, "function");
  assert.equal(hook({}, {}, {}, { intensity: "ceiling" }), null);
});

test("every registered hook exposes both intensities as functions", () => {
  for (const [id, h] of Object.entries(PILOTING_HOOKS)) {
    assert.equal(typeof h.ceiling, "function", `${id}.ceiling`);
    assert.equal(typeof h.conservative, "function", `${id}.conservative`);
  }
});

test("PILOTING_BIASES documents exactly the registered hooks", () => {
  for (const id of Object.keys(PILOTING_HOOKS)) {
    assert.ok(PILOTING_BIASES.includes(id), `PILOTING_BIASES missing a line for ${id}`);
  }
});
