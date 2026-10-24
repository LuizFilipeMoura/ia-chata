import { test } from "node:test";
import assert from "node:assert/strict";
import { gaugeMax, needleAngle, heatTrend, SWEEP } from "./gauge.js";

test("the scale always has headroom past capacity", () => {
  for (const cap of [4, 5, 6, 7]) assert.ok(gaugeMax(cap) > cap);
});

test("the scale stretches when heat runs past it", () => {
  const cap = 5, big = gaugeMax(cap) + 3;
  assert.ok(gaugeMax(cap, big) >= big);
});

test("needle runs from the left stop to the right stop, symmetric about straight up", () => {
  const max = gaugeMax(6);
  assert.equal(needleAngle(0, max), -SWEEP / 2);
  assert.equal(needleAngle(max, max), SWEEP / 2);
  assert.equal(needleAngle(max / 2, max), 0);
});

test("more heat never moves the needle back", () => {
  const max = gaugeMax(6);
  let prev = -Infinity;
  for (let h = 0; h <= max; h += 0.5) { const a = needleAngle(h, max); assert.ok(a >= prev); prev = a; }
});

test("the needle is pinned at the stops, never past them", () => {
  const max = gaugeMax(5);
  assert.equal(needleAngle(-3, max), needleAngle(0, max));
  assert.equal(needleAngle(max + 10, max), needleAngle(max, max));
});

test("capacity sits inside the sweep, before the right stop", () => {
  const cap = 6, max = gaugeMax(cap);
  assert.ok(needleAngle(cap, max) < needleAngle(max, max));
  assert.ok(needleAngle(cap, max) > needleAngle(0, max));
});

test("heat trend: a drop is venting, a climb is rising, first sight is steady", () => {
  assert.equal(heatTrend(5, 3), "vent");
  assert.equal(heatTrend(2, 4), "rise");
  assert.equal(heatTrend(3, 3), "steady");
  assert.equal(heatTrend(null, 3), "steady");
  assert.equal(heatTrend(undefined, 0), "steady");
});
