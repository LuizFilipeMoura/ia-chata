import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const tracker = fs.readFileSync(new URL("./js/tracker.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./css/rig-sheet.css", import.meta.url), "utf8");

test("manual add form exposes an owner selector", () => {
  assert.match(html, /id="rigOwner"/);
  assert.match(tracker, /getElementById\("rigOwner"\)/);
  assert.match(tracker, /owner:\s*rigOwnerSelect\.value/);
  assert.match(tracker, /syncOwnerOptions/);
});

test("manual add form only exposes supported rig classes", () => {
  const classSelect = html.match(/<select id="rigClass"[\s\S]*?<\/select>/)?.[0] || "";
  assert.match(classSelect, /<option value="light">Light<\/option>/);
  assert.match(classSelect, /<option value="medium"[^>]*>Medium<\/option>/);
  assert.doesNotMatch(classSelect, /value="heavy"/);
  assert.doesNotMatch(classSelect, /value="colossal"/);
  assert.doesNotMatch(html, /add a heavy rig/i);
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
