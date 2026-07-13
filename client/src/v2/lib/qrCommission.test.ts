import { expect, test } from "vitest";
import { CHASSIS } from "/shared/game-state.js";
import { parseChassisQr, chassisQrPayload, resolveScan } from "./qrCommission";

const anyChassis = CHASSIS[0].id;

test("parseChassisQr accepts a valid tagged id, case-insensitively", () => {
  expect(parseChassisQr(`rig:v1:${anyChassis}`)).toBe(anyChassis);
  expect(parseChassisQr(`  rig:v1:${anyChassis.toUpperCase()}  `)).toBe(anyChassis);
});

test("parseChassisQr rejects bad prefix, bad version, unknown id, junk", () => {
  expect(parseChassisQr(`rig:v2:${anyChassis}`)).toBeNull();
  expect(parseChassisQr(`https://x/${anyChassis}`)).toBeNull();
  expect(parseChassisQr("rig:v1:not-a-real-chassis")).toBeNull();
  expect(parseChassisQr("")).toBeNull();
});

test("chassisQrPayload round-trips through parseChassisQr", () => {
  expect(parseChassisQr(chassisQrPayload(anyChassis))).toBe(anyChassis);
});

test("resolveScan builds Standard add-attrs for a free chassis", () => {
  const state = { rigs: [], game: { started: false, sides: [{ id: "a" }, { id: "b" }] } };
  const r = resolveScan(state, chassisQrPayload(anyChassis), "a");
  expect(r.ok).toBe(true);
  expect(r.attrs).toMatchObject({
    kind: "rig", chassis: anyChassis, owner: "a",
    lr: expect.any(String), melee: expect.any(String),
    equipment: expect.any(String),
    longRangeUpgrade: expect.any(String), meleeUpgrade: expect.any(String),
  });
});

test("resolveScan rejects an already-fielded chassis and unknown codes", () => {
  const state = { rigs: [{ chassis: anyChassis }], game: { started: false, sides: [{ id: "a" }, { id: "b" }] } };
  expect(resolveScan(state, chassisQrPayload(anyChassis), "a").ok).toBe(false);
  expect(resolveScan(state, "rig:v1:nope", "a").ok).toBe(false);
});
