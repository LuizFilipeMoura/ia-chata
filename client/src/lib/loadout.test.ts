import { describe, it, expect } from "vitest";
import { buildLoadout, randomAddAttrs } from "./loadout";
import type { Rig } from "../state/types";

const baseRig = (over: Partial<Rig>): Rig => ({
  id: 1, name: "Stalker", weightClass: "medium", owner: "a",
  hull: { sp: 7, max: 7, destroyed: false },
  arms: { sp: 6, max: 6, destroyed: false },
  legs: { sp: 6, max: 6, destroyed: false },
  engine: { sp: 5, max: 5, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false, ...over,
});

describe("buildLoadout", () => {
  it("returns null when the rig has no weapons", () => {
    expect(buildLoadout(baseRig({}))).toBeNull();
  });

  it("resolves weapon names, upgrade name+tag, and equipment passive/active", () => {
    const rig = baseRig({
      weapons: { longRange: "Mini Gun", melee: "Sword" },
      weaponUpgrades: { longRange: "extended-belt", melee: "opportunist" },
      equipment: "ablative-plating",
    });
    const lo = buildLoadout(rig)!;
    expect(lo).not.toBeNull();
    expect(lo.flat).toBe(false);
    expect(lo.lr!.name).toBe("Mini Gun");
    expect(lo.lr!.upName).toBe("Extended Belt");
    expect(lo.lr!.upTag).toBe("+2 ROF; dice showing 1 add heat");
    expect(lo.melee!.name).toBe("Sword");
    expect(lo.equipment).toEqual({
      family: "Armor",
      label: "Ablative Plating",
      passive: "+1 max SP to Hull",
      activeLabel: "Harden",
      activeHeat: 1,
      activeText: expect.any(String),
    });
  });

  it("degrades gracefully when an upgrade id is unknown", () => {
    const rig = baseRig({
      weapons: { longRange: "Mini Gun", melee: "Sword" },
      weaponUpgrades: { longRange: "nope", melee: "nope" },
      equipment: null,
    });
    const lo = buildLoadout(rig)!;
    expect(lo.lr!.upName).toBe("");
    expect(lo.equipment).toBeNull();
  });

  it("returns a single flat-pick weapon for cold kinds (Tank / Walker)", () => {
    const rig = baseRig({ kind: "tank", weapons: { unit: "Tank Cannon" }, equipment: null });
    const lo = buildLoadout(rig)!;
    expect(lo.flat).toBe(true);
    expect(lo.unit!.name).toBe("Tank Cannon");
    expect(lo.lr).toBeUndefined();
    expect(lo.equipment).toBeNull();
  });
});

it("randomAddAttrs produces a valid chassis add", () => {
  const a = randomAddAttrs();
  expect(typeof a.chassis).toBe("string");
  expect(["light", "medium"]).toContain(a.class);
  expect(typeof a.longRange).toBe("string");
  expect(typeof a.melee).toBe("string");
  expect(typeof a.equipment).toBe("string");
});
