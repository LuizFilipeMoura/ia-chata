import { test } from "node:test";
import assert from "node:assert/strict";
import { PROPAGANDA, PROPAGANDA_IDS, pickPoster, drawPoster } from "./propaganda.js";
import { FACTIONS } from "../../shared/campaign/catalog.js";

test("every campaign faction has propaganda with slogans", () => {
  for (const f of FACTIONS) {
    assert.ok(PROPAGANDA[f.id], `missing propaganda for ${f.id}`);
    assert.ok(PROPAGANDA[f.id].slogans.length > 0);
  }
});

test("pickPoster is deterministic per seed and returns a real slogan", () => {
  const a = pickPoster(42), b = pickPoster(42);
  assert.deepEqual(a, b);
  assert.ok(PROPAGANDA_IDS.includes(a.id));
  assert.ok(PROPAGANDA[a.id].slogans.includes(a.slogan));
});

test("drawPoster paints every style without throwing", () => {
  const noop = () => {};
  const ctx = new Proxy({ measureText: (t) => ({ width: t.length * 10 }) }, {
    get: (o, k) => (k in o ? o[k] : noop), set: () => true,
  });
  for (const id of PROPAGANDA_IDS) drawPoster(ctx, id, 256, 384, { graffiti: "LIES", seed: 3 });
});

test("drawSlam paints every faction without throwing", async () => {
  const { drawSlam } = await import("./propaganda.js");
  const noop = () => {};
  const ctx = new Proxy({ measureText: (t) => ({ width: t.length * 10 }) }, {
    get: (o, k) => (k in o ? o[k] : noop), set: () => true,
  });
  for (const id of PROPAGANDA_IDS) drawSlam(ctx, id, 420, 280, { headline: "+4 VP", sub: "Beacon held", graffiti: "LIES", seed: 5 });
});
