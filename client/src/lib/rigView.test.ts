import { barClass, rigStatus, orderedRigs } from "./rigView";
import type { Rig } from "../state/types";

const comp = (sp: number, max: number, destroyed = false) => ({ sp, max, destroyed });
const rig = (over: Partial<Rig>): Rig => ({
  id: 1, name: "R", weightClass: "medium", owner: "a",
  hull: comp(6, 6), arms: comp(5, 5), legs: comp(5, 5),
  engine: { ...comp(5, 5), heat: 0 }, equipment: null,
  activated: false, destroyed: false, ...over,
});

test("barClass maps SP ratios to fill classes", () => {
  expect(barClass(comp(0, 6))).toBe("rig-fill-crit");
  expect(barClass(comp(6, 6))).toBe("rig-fill-ok");
  expect(barClass(comp(2, 6))).toBe("rig-fill-low");
  expect(barClass({ ...comp(0, 6), destroyed: true })).toBe("rig-fill-dead");
});

test("rigStatus flags catastrophic when any component is at 0", () => {
  expect(rigStatus(rig({ arms: comp(0, 5) })).cls).toBe("crit");
});

test("orderedRigs lists my side first", () => {
  const mine = rig({ id: 1, owner: "a" });
  const foe = rig({ id: 2, owner: "b" });
  expect(orderedRigs([foe, mine], "a").map((r) => r.id)).toEqual([1, 2]);
});

import { GLOSSARY } from "/shared/glossary.js";
const GLOSS_IDS = new Set(GLOSSARY.map((e: { id: string }) => e.id));

test("rigStatus tags each branch with a resolving gloss id", () => {
  expect(rigStatus(rig({ destroyed: true })).gloss).toBe("destroyed");
  expect(rigStatus(rig({ arms: comp(0, 5) })).gloss).toBe("catastrophic-damage");
  expect(rigStatus(rig({ hull: comp(2, 6) })).gloss).toBe("heavy-damage");
  expect(rigStatus(rig({ hull: comp(5, 6) })).gloss).toBe("damaged");
  expect(rigStatus(rig({})).gloss).toBe("nominal");
  for (const s of [
    rigStatus(rig({ destroyed: true })),
    rigStatus(rig({ arms: comp(0, 5) })),
    rigStatus(rig({ hull: comp(2, 6) })),
    rigStatus(rig({ hull: comp(5, 6) })),
    rigStatus(rig({})),
  ]) {
    expect(GLOSS_IDS.has(s.gloss)).toBe(true);
  }
});
