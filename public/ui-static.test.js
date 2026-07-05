import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const tracker = fs.readFileSync(new URL("./js/tracker.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./css/rig-sheet.css", import.meta.url), "utf8");

test("the rig wizard exposes an owner selector labeled You/Enemy", () => {
  const wizard = fs.readFileSync(new URL("./js/rig-wizard.js", import.meta.url), "utf8");
  assert.match(wizard, /textContent = "You"/);
  assert.match(wizard, /textContent = "Enemy"/);
  assert.match(wizard, /owner:\s*state\.owner/);
});

test("the rig wizard only offers supported rig classes", () => {
  const wizard = fs.readFileSync(new URL("./js/rig-wizard.js", import.meta.url), "utf8");
  assert.match(wizard, /\["light", "medium"\]/);
  assert.doesNotMatch(wizard, /"heavy"/);
  assert.doesNotMatch(wizard, /"colossal"/);
});

test("command posts include the viewer side for owner defaults", () => {
  const api = fs.readFileSync(new URL("./js/api.js", import.meta.url), "utf8");
  assert.match(api, /side:\s*S\.session\?\.side/);
});

test("polling and chat send the viewer side for private state", () => {
  const api = fs.readFileSync(new URL("./js/api.js", import.meta.url), "utf8");
  const chat = fs.readFileSync(new URL("./js/chat.js", import.meta.url), "utf8");
  assert.match(api, /URLSearchParams/);
  assert.match(api, /side.*S\.session\?\.side/s);
  assert.match(chat, /side:\s*S\.session\?\.side/);
});

test("tracker renders ownership groups relative to the current side", () => {
  assert.match(tracker, /Your Squadron/);
  assert.match(tracker, /Enemy/);
  assert.match(tracker, /rig-group-head/);
  assert.match(css, /\.rig-group-head/);
});

test("rig panel exposes ready controls and private bounty display", () => {
  assert.match(html, /id="readyBattle"/);
  assert.match(html, /id="battleSetup"/);
  assert.match(tracker, /sendCommand\("ready"/);
  assert.match(tracker, /Ironclad Bounty/);
  assert.match(css, /\.battle-setup/);
});

test("manual add form is gated by the shared rig limits", () => {
  assert.match(tracker, /canAddRigForSide/);
  assert.match(tracker, /updateAddRigAvailability/);
  assert.match(tracker, /rigAddBtn\.disabled\s*=\s*!canAdd/);
});
