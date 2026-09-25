import test from "node:test";
import assert from "node:assert/strict";
import { CHASSIS, LOCS, chassisById, WEAPON_UPGRADES } from "../game-state.js";
import { META } from "../bot/meta.js";
import { newProfile, buyUnlock, creditRun } from "./meta.js";
import {
  newRun, offersFor, missionAttrs, pickNode, debrief, rewardCards, applyReward, buy, repair, recover,
  respec, continueRun, abandon, runSummary, deployable, prototypeSlots, mergeMods,
} from "./run.js";
import { PRICES, NOTORIETY, factionById } from "./catalog.js";

const ROSTER = ["light-claw-autocannon", "medium-lance-mortar", "light-harpoon-anchor"];
const richProfile = (ids = []) => {
  let p = { ...newProfile(), renown: 999, notorietyMax: 5 };
  for (const id of ids) p = buyUnlock(p, id).profile;
  return p;
};
const FULL = ["nature:tuned", "nature:prototype", "perkkits", "relics:1", "relics:2", "relics:3",
  "equipment:overclock-core", "equipment:blast-furnace-core", "equipment:targeting-computer", "equipment:reactive-plating"];
const start = (opts = {}, seed = 42, profile = newProfile()) => {
  const r = newRun(profile, { chassis: ROSTER, notoriety: 0, ...opts }, seed);
  assert.ok(r.run, JSON.stringify(r));
  return r.run;
};

// A finished mission room: side a from the run's deployable roster (hurt per
// `hurt[uid]`, destroyed per `dead`), side b from the node's enemy.
function fakeRoom(run, { winner = "a", reason = "annihilation", hurt = {}, dead = [], kills = 0, crates = 0, extracted = [] } = {}) {
  const attrs = missionAttrs(run, run.contract);
  const loc = (sp, max) => ({ sp, max });
  const aRigs = attrs.squads.a.map((u, i) => {
    const max = chassisById(u.chassis).sp;
    const rig = { id: `A${i}`, owner: "a", name: u.name, campaignUid: u.uid, destroyed: dead.includes(u.uid) };
    for (const l of LOCS) rig[l] = loc(Math.max(0, u.sp[l] - (hurt[u.uid]?.[l] || 0)), max[l]);
    return rig;
  });
  const bRigs = attrs.squads.b.map((u, i) => ({ id: `B${i}`, owner: "b", name: u.name, destroyed: i < kills }));
  const out = aRigs.filter((r) => extracted.includes(r.campaignUid));
  return {
    game: { outcome: { winner, reason } },
    rigs: [...aRigs.filter((r) => !extracted.includes(r.campaignUid)), ...bRigs],
    campaign: { crates: { a: crates, b: 0 }, extracted: { a: out } },
  };
}
const firstContract = (run) => run.offers.find((n) => n.kind !== "depot");
const fight = (run, opts) => debrief(pickNode(run, firstContract(run).id).run, fakeRoom(pickNode(run, firstContract(run).id).run, opts));

test("newRun: bare roster, full SP, starting salvage, offers for step 1", () => {
  const run = start();
  assert.equal(run.status, "map");
  assert.equal(run.step, 0);
  assert.equal(run.salvage, 20);
  assert.equal(run.roster.length, 3);
  for (const rig of run.roster) {
    assert.equal(rig.longRangeUpgrade, null);
    assert.equal(rig.equipment, null);
    assert.deepEqual(rig.sp, chassisById(rig.chassis).sp);
    assert.equal(rig.name, chassisById(rig.chassis).name);
  }
  assert.equal(run.offers.length, 2);
  assert.ok(run.offers.every((n) => n.kind === "contract" && ["beacons", "skirmish"].includes(n.type)));
});

test("newRun validation", () => {
  const p = newProfile();
  assert.equal(newRun(p, { chassis: ROSTER.slice(0, 2) }, 1).error, "roster-size");
  assert.equal(newRun(p, { chassis: [ROSTER[0], ROSTER[0], ROSTER[1]] }, 1).error, "roster-duplicate");
  assert.equal(newRun(p, { chassis: ["light-sword-arc", ROSTER[1], ROSTER[2]] }, 1).error, "locked-chassis");
  assert.equal(newRun(p, { chassis: ["medium-shield-siege", "medium-lance-mortar", "light-claw-autocannon"] }, 1).run.roster.length, 3);
  const all = richProfile(CHASSIS.filter((c) => c.class === "medium").map((c) => `chassis:${c.id}`).filter((id) => !["chassis:medium-lance-mortar", "chassis:medium-shield-siege"].includes(id)));
  assert.equal(newRun(all, { chassis: ["medium-shield-siege", "medium-lance-mortar", "medium-crossbow-talon"] }, 1).error, "too-many-mediums");
  assert.equal(newRun(p, { chassis: ROSTER, notoriety: 1 }, 1).error, "notoriety");
  assert.equal(newRun(p, { chassis: ROSTER, banner: "krim" }, 1).error, "banner");
});

test("workshop perks apply at run start", () => {
  const p = richProfile(["workshop:salvage1", "workshop:salvage2", "workshop:freerecovery", "workshop:fieldstart"]);
  const run = start({}, 7, p);
  assert.equal(run.salvage, 40);
  assert.equal(run.freeRecovery, true);
  for (const rig of run.roster) {
    const c = chassisById(rig.chassis);
    assert.equal(WEAPON_UPGRADES[c.longRange].find((u) => u.id === rig.longRangeUpgrade).nature, "field");
    assert.equal(WEAPON_UPGRADES[c.melee].find((u) => u.id === rig.meleeUpgrade).nature, "field");
  }
});

test("determinism: same seed → same offers; different seed differs somewhere", () => {
  assert.deepEqual(start({}, 99).offers, start({}, 99).offers);
  const sig = (s) => JSON.stringify(start({}, s).offers.map((n) => [n.type, n.faction, n.enemy.map((u) => u.chassis)]));
  const sigs = new Set([1, 2, 3, 4, 5, 6].map(sig));
  assert.ok(sigs.size > 1);
});

test("offers per step: step 4 always has a depot, step 6 is the boss", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const run = start({}, seed);
    for (let step = 1; step <= 6; step++) {
      const offers = offersFor({ ...run, step: step - 1 });
      if (step === 1) assert.equal(offers.length, 2);
      else if (step === 6) {
        assert.equal(offers.length, 1);
        assert.equal(offers[0].kind, "boss");
        assert.equal(offers[0].faction, run.bossFaction);
        assert.equal(offers[0].maxRounds, 7);
        assert.equal(offers[0].payout, 40);
      } else {
        assert.equal(offers.length, 3);
        const depots = offers.filter((n) => n.kind === "depot").length;
        assert.ok(depots <= 1);
        if (step === 4) assert.equal(depots, 1);
        assert.equal(new Set(offers.filter((n) => n.kind !== "depot").map((n) => n.type)).size, 3 - depots);
      }
      for (const n of offers.filter((n) => n.kind === "contract")) {
        assert.equal(n.payout, 12 + 4 * step);
        assert.equal(n.maxRounds, 6);
      }
    }
  }
});

test("enemy squads: no mirrors, distinct chassis, weight classes mirror the roster", () => {
  for (const seed of [11, 12, 13, 14, 15]) {
    const run = start({}, seed);
    const mine = run.roster.map((r) => r.chassis);
    for (let step = 1; step <= 6; step++) {
      for (const n of offersFor({ ...run, step: step - 1 }).filter((n) => n.kind !== "depot")) {
        const ids = [...n.enemy.map((u) => u.chassis), ...(n.reinforcements || []).map((x) => x.unit.chassis)];
        assert.equal(new Set(ids).size, ids.length, "distinct");
        assert.ok(ids.every((id) => !mine.includes(id)), "no mirror");
        assert.equal(n.enemy.length, 3);
        const cls = (id) => chassisById(id).class;
        assert.deepEqual(n.enemy.map((u) => cls(u.chassis)).sort(), mine.map(cls).sort());
      }
    }
  }
});

test("mission specifics: commander, reinforcements, crates, extract goal", () => {
  const run = start({}, 5);
  const types = {};
  for (let s = 0; s < 40 && Object.keys(types).length < 6; s++) {
    for (let step = 2; step <= 5; step++) {
      for (const n of offersFor({ ...start({}, s), step: step - 1 })) types[n.type] ||= n;
    }
  }
  assert.equal(types.assassinate.enemy.filter((u) => u.commander).length, 1);
  assert.equal(types.assassinate.enemy[0].spMult, 1.25);
  assert.deepEqual(types.laststand.reinforcements.map((x) => x.round), [3, 5]);
  assert.equal(types.salvage.crates, 3);
  assert.equal(types.breakthrough.extractGoal, 2);
  const boss = offersFor({ ...run, step: 5 })[0];
  const warlord = boss.enemy.find((u) => u.commander);
  assert.equal(warlord.spMult, 1.5);
  assert.match(warlord.name, /Warlord/);
  const build = META.builds[warlord.chassis];
  if (build) assert.equal(warlord.longRangeUpgrade, build.longRangeUpgrade);
});

test("enemy upgrade policy follows notoriety + step", () => {
  const run0 = start({ notoriety: 0 }, 3);
  const e1 = offersFor({ ...run0, step: 0 })[0].enemy[0];
  assert.equal(e1.longRangeUpgrade, null);
  assert.equal(e1.equipment, null);
  const e3 = offersFor({ ...run0, step: 2 }).find((n) => n.kind === "contract" && n.type !== "assassinate").enemy[0];
  assert.equal(WEAPON_UPGRADES[chassisById(e3.chassis).longRange].find((u) => u.id === e3.longRangeUpgrade).nature, "field");
  const p = richProfile();
  const run2 = start({ notoriety: 2 }, 3, p);
  const t = offersFor({ ...run2, step: 3 }).find((n) => n.kind === "contract" && n.type !== "assassinate").enemy[0];
  assert.equal(WEAPON_UPGRADES[chassisById(t.chassis).melee].find((u) => u.id === t.meleeUpgrade).nature, "tuned");
  assert.ok(t.equipment);
});

test("missionAttrs: squads, names, mods, bot", () => {
  const p = richProfile(["relics:1"]);
  const base = { ...start({ notoriety: 4 }, 8, p), relics: ["hardened-bulkheads", "reinforced-chassis", "heat-sinks"], banner: "arcus" };
  const node = base.offers[0];
  const a = missionAttrs(base, node);
  assert.equal(a.type, node.type);
  assert.equal(a.width, 42);
  assert.equal(a.height, 28);
  assert.equal(a.maxRounds, 6);
  assert.equal(a.enemyBot, "hard");
  assert.equal(a.seed, node.seed);
  assert.deepEqual(a.squads.a.map((u) => u.uid), ["r1", "r2", "r3"]);
  assert.deepEqual(a.squads.a.map((u) => u.name), ROSTER.map((id) => chassisById(id).name));
  assert.deepEqual(a.squads.a[0].sp, chassisById(ROSTER[0]).sp);
  assert.deepEqual(a.mods.a, { sp: { hull: 2, legs: 1, arms: 1 }, cool: 1, speed: 1 });
  assert.deepEqual(a.mods.b, mergeMods(factionById(node.faction).mods, NOTORIETY[4].mods));
  // Wrecked rigs don't deploy.
  const w = { ...base, roster: base.roster.map((r, i) => (i === 1 ? { ...r, wrecked: true } : r)) };
  assert.deepEqual(missionAttrs(w, node).squads.a.map((u) => u.uid), ["r1", "r3"]);
  // Low notoriety: faction perk only on the boss; boss gets +1 answer.
  const low = start({}, 8);
  assert.deepEqual(missionAttrs(low, low.offers[0]).mods.b, {});
  const boss = offersFor({ ...low, step: 5 })[0];
  assert.deepEqual(missionAttrs(low, boss).mods.b, mergeMods(factionById(boss.faction).mods, { answer: 1 }));
});

test("pickNode: contract → battle, bad ids rejected", () => {
  const run = start();
  assert.equal(pickNode(run, "nope").error, "node");
  const r = pickNode(run, run.offers[0].id).run;
  assert.equal(r.status, "battle");
  assert.equal(r.contract.id, run.offers[0].id);
  assert.equal(run.status, "map", "input untouched");
  assert.equal(pickNode(r, run.offers[0].id).error, "status");
});

test("debrief win: payout, kills, crates, SP carried, field crews, reward", () => {
  const run = start();
  const inBattle = pickNode(run, run.offers[0].id).run;
  const room = fakeRoom(inBattle, { hurt: { r1: { hull: 5, arms: 1 } }, dead: ["r3"], kills: 2, crates: 1 });
  const { run: after, debrief: d } = debrief(inBattle, room);
  const payout = run.offers[0].payout;
  assert.equal(d.won, true);
  assert.equal(d.salvage, payout + 2 * 3 + 6);
  assert.equal(after.salvage, 20 + payout + 12);
  const r1 = after.roster[0];
  const max = chassisById(ROSTER[0]).sp;
  assert.equal(r1.sp.hull, max.hull - 5 + 1);
  assert.equal(r1.sp.arms, max.arms);
  assert.equal(after.roster[2].wrecked, true);
  assert.deepEqual(after.roster[2].sp, { hull: 0, arms: 0, legs: 0, engine: 0 });
  assert.equal(after.step, 1);
  assert.equal(after.status, "reward");
  assert.equal(after.reward.cards.length, 3);
  assert.equal(after.stats.contractsWon, 1);
  assert.equal(after.strikes, 0);
  // Next offers already sized to the 2 deployable rigs.
  assert.ok(after.offers.filter((n) => n.kind !== "depot").every((n) => n.enemy.length === 2));
});

test("debrief: matches by campaignUid, clamps to chassis max, extracted rigs survive", () => {
  const run = start();
  const b = pickNode(run, run.offers[0].id).run;
  const room = fakeRoom(b, { extracted: ["r2"] });
  room.rigs.find((x) => x.campaignUid === "r1").hull.sp = 99; // faction/relic bonus SP
  room.rigs.reverse();
  const { run: after, debrief: d } = debrief(b, room);
  assert.equal(after.roster[0].sp.hull, chassisById(ROSTER[0]).sp.hull);
  assert.equal(after.roster[1].wrecked, false);
  assert.equal(d.rigs.find((x) => x.uid === "r2").extracted, true);
});

test("debrief loss: strike, no payout, 2 strikes end the run", () => {
  let run = start();
  let r = fight(run, { winner: "b", kills: 2 });
  assert.equal(r.run.status, "debrief");
  assert.equal(r.run.strikes, 1);
  assert.equal(r.run.salvage, 20);
  assert.equal(r.debrief.salvage, 0);
  run = continueRun(r.run).run;
  assert.equal(run.status, "map");
  r = fight(run, { winner: "b" });
  assert.equal(r.run.status, "over");
  assert.equal(r.run.won, false);
  assert.equal(r.debrief.over, true);
});

test("debrief: total wipe with no salvage for recovery ends the run", () => {
  const run = start();
  const r = fight(run, { winner: "b", dead: ["r1", "r2", "r3"] });
  assert.equal(r.run.status, "over");
  // With enough salvage to recover, the run goes on.
  const rich = { ...run, salvage: 50 };
  const r2 = fight(rich, { winner: "b", dead: ["r1", "r2", "r3"] });
  assert.equal(r2.run.status, "debrief");
  assert.equal(pickNode(continueRun(r2.run).run, continueRun(r2.run).run.offers.find((n) => n.kind !== "depot").id).error, "no-deployable");
});

test("boss: win ends the run won, loss ends it lost", () => {
  const run = { ...start(), step: 5 };
  run.offers = offersFor(run);
  const b = pickNode(run, run.offers[0].id).run;
  assert.equal(b.stats.reachedBoss, true);
  const won = debrief(b, fakeRoom(b)).run;
  assert.equal(won.status, "over");
  assert.equal(won.won, true);
  assert.equal(won.salvage, run.salvage + 40);
  const s = runSummary(won);
  assert.equal(s.bossWon, true);
  assert.equal(s.reachedBoss, true);
  const lost = debrief(b, fakeRoom(b, { winner: "b" })).run;
  assert.equal(lost.status, "over");
  assert.equal(lost.won, false);
  // Credit feeds meta: faction banner + notoriety.
  const c = creditRun({ ...newProfile() }, s);
  assert.deepEqual(c.profile.factionPerks, [won.bossFaction]);
  assert.equal(c.profile.notorietyMax, 1);
});

test("reward cards only fit roster + unlocks", () => {
  const run = start();
  for (let s = 0; s < 30; s++) {
    for (const c of rewardCards(run, undefined, {}).concat(rewardCards({ ...run, seed: s }))) {
      assert.ok(["upgrade", "equipment", "relic", "salvage"].includes(c.kind), c.kind);
      if (c.kind === "upgrade") {
        assert.equal(c.nature, "field");
        const rig = run.roster.find((r) => r.uid === c.fits[0].uid);
        assert.ok(WEAPON_UPGRADES[chassisById(rig.chassis)[c.fits[0].slot]].some((u) => u.id === c.upgrade));
      }
      if (c.kind === "equipment") assert.ok(run.pools.equipment.includes(c.equipment));
      if (c.kind === "relic") assert.ok(run.pools.relics.includes(c.relic));
    }
  }
  // Full unlocks: perk kits never duplicate a perk already on that weapon.
  const full = start({}, 3, richProfile(FULL));
  const claw = full.roster[0]; // Claw (melee) + Autocannon
  claw.perkKits.longRange = "Shock";
  let seen = 0;
  for (let s = 0; s < 60; s++) {
    for (const c of rewardCards({ ...full, seed: s })) {
      if (c.kind !== "perkKit") continue;
      seen++;
      if (c.perk === "Shock") assert.ok(!c.fits.some((f) => f.uid === claw.uid && f.slot === "longRange"));
    }
  }
  assert.ok(seen > 0);
  assert.equal(rewardCards({ ...full, pools: { ...full.pools, workshop: { ...full.pools.workshop, cards: 4 } } }).length, 4);
  const boss = rewardCards(full, undefined, { boss: true });
  assert.equal(boss[0].kind, "relic");
  assert.ok(boss.every((c) => c.rarity !== "common"));
});

test("applyReward: install, skip, reroll once", () => {
  const run = start();
  const r = fight(run, { kills: 0 }).run;
  assert.equal(r.status, "reward");
  assert.equal(applyReward(r, { skip: true }).run.status, "map");
  const rr = applyReward(r, { reroll: true }).run;
  assert.equal(rr.salvage, r.salvage - 5);
  assert.equal(rr.reward.rerolled, true);
  assert.equal(applyReward(rr, { reroll: true }).error, "rerolled");
  const lucky = applyReward({ ...r, relics: ["lucky-charm"] }, { reroll: true }).run;
  assert.equal(lucky.salvage, r.salvage);
  // Force a known upgrade card.
  const card = { kind: "upgrade", weapon: "Autocannon", upgrade: "depleted-core", nature: "field", fits: [{ uid: "r1", slot: "longRange" }] };
  const done = applyReward({ ...r, reward: { cards: [card], rerolled: false } }, { index: 0 }).run;
  assert.equal(done.roster[0].longRangeUpgrade, "depleted-core");
  assert.equal(done.status, "map");
});

test("prototype cap: second Prototype needs replace", () => {
  const run = start({}, 3, richProfile(FULL));
  run.status = "reward";
  run.roster[0].longRangeUpgrade = "penetrator-rounds"; // Autocannon prototype
  const card = { kind: "upgrade", weapon: "Claw", upgrade: "breach-grip", nature: "prototype", fits: [{ uid: "r1", slot: "melee" }] };
  const withCard = { ...run, reward: { cards: [card], rerolled: false } };
  const err = applyReward(withCard, { index: 0, target: { uid: "r1" } });
  assert.equal(err.error, "prototype-cap");
  assert.deepEqual(err.conflicts, ["longRange"]);
  const ok = applyReward(withCard, { index: 0, target: { uid: "r1", replace: "longRange" } }).run;
  assert.equal(ok.roster[0].meleeUpgrade, "breach-grip");
  assert.equal(ok.roster[0].longRangeUpgrade, null);
  assert.deepEqual(prototypeSlots(ok.roster[0]), ["melee"]);
  // Equipment prototype counts too.
  const eq = structuredClone(run);
  eq.roster[0].longRangeUpgrade = null;
  eq.roster[0].equipment = "field-repair-suite";
  eq.roster[0].equipmentUpgrade = "nanite-swarm";
  const e2 = applyReward({ ...eq, reward: { cards: [card], rerolled: false } }, { index: 0 });
  assert.deepEqual(e2.conflicts, ["equipment"]);
});

test("repair pricing: field 2, depot 1, Union Mechanics discount, loc and all", () => {
  const run = start();
  run.salvage = 100;
  run.roster[0].sp.hull -= 3;
  run.roster[0].sp.legs -= 2;
  const one = repair(run, { uid: "r1", loc: "hull" });
  assert.equal(one.run.salvage, 98);
  assert.equal(one.run.roster[0].sp.hull, run.roster[0].sp.hull + 1);
  const all = repair(run, { uid: "r1", loc: "all" });
  assert.equal(all.healed, 5);
  assert.equal(all.run.salvage, 90);
  assert.equal(repair({ ...run, relics: ["union-mechanics"] }, { uid: "r1", loc: "all" }).run.salvage, 95);
  assert.equal(repair({ ...run, status: "depot" }, { uid: "r1", loc: "all" }).run.salvage, 95);
  assert.equal(repair({ ...run, status: "depot", relics: ["union-mechanics"] }, { uid: "r1" }).run.salvage, 95, "min 1");
  // Partial when short on salvage.
  const poor = repair({ ...run, salvage: 5 }, { uid: "r1", loc: "all" });
  assert.equal(poor.healed, 2);
  assert.equal(poor.run.salvage, 1);
  assert.equal(repair({ ...run, salvage: 1 }, { uid: "r1" }).error, "salvage");
  assert.equal(repair({ ...run, status: "battle" }, { uid: "r1" }).error, "status");
  assert.equal(repair(run, { uid: "r2" }).error, "undamaged");
});

test("recover pricing: field 24, depot 16, winch halves, free once, returns at half SP", () => {
  const run = start();
  run.salvage = 100;
  run.roster[1].wrecked = true;
  run.roster[1].sp = { hull: 0, arms: 0, legs: 0, engine: 0 };
  const f = recover(run, "r2").run;
  assert.equal(f.salvage, 76);
  const max = chassisById(ROSTER[1]).sp;
  assert.deepEqual(f.roster[1].sp, Object.fromEntries(LOCS.map((l) => [l, Math.ceil(max[l] / 2)])));
  assert.equal(f.roster[1].wrecked, false);
  assert.equal(recover({ ...run, status: "depot" }, "r2").run.salvage, 84);
  assert.equal(recover({ ...run, relics: ["recovery-winch"] }, "r2").run.salvage, 88);
  assert.equal(recover({ ...run, status: "depot", relics: ["recovery-winch"] }, "r2").run.salvage, 92);
  const free = recover({ ...run, freeRecovery: true }, "r2").run;
  assert.equal(free.salvage, 100);
  assert.equal(free.freeRecovery, false);
  assert.equal(recover(run, "r1").error, "not-wrecked");
  assert.equal(recover({ ...run, salvage: 10 }, "r2").error, "salvage");
  // Recovery resizes the pending offers' enemy squads.
  assert.ok(run.offers.every((n) => n.enemy.length === 3));
  const wreckedOffers = offersFor(run);
  assert.ok(wreckedOffers.every((n) => n.enemy.length === 2));
  assert.ok(f.offers.every((n) => n.enemy.length === 3));
});

test("depot: stock of 4 with an upgrade, buy, respec, continue advances the step", () => {
  let run = start({}, 21, richProfile(["nature:tuned"]));
  run = { ...run, step: 3 };
  run.offers = offersFor(run);
  const depot = run.offers.find((n) => n.kind === "depot");
  const d = pickNode(run, depot.id).run;
  assert.equal(d.status, "depot");
  assert.equal(d.stats.depotsVisited, 1);
  assert.equal(d.depot.stock.length, 4);
  assert.ok(d.depot.stock.some((c) => c.kind === "upgrade" || c.kind === "equipUpgrade"));
  assert.ok(d.depot.stock.every((c) => c.price > 0 && c.kind !== "salvage"));
  const i = d.depot.stock.findIndex((c) => c.kind === "upgrade");
  const item = d.depot.stock[i];
  d.salvage = 100;
  const bought = buy(d, { index: i, target: item.fits[0] }).run;
  assert.equal(bought.salvage, 100 - PRICES.upgrade[item.nature]);
  assert.equal(bought.depot.stock[i].sold, true);
  assert.equal(buy(bought, { index: i, target: item.fits[0] }).error, "sold");
  const rig = bought.roster.find((r) => r.uid === item.fits[0].uid);
  const slot = item.fits[0].slot;
  const weapon = chassisById(rig.chassis)[slot];
  const other = WEAPON_UPGRADES[weapon].find((u) => u.id !== item.upgrade && u.nature !== "prototype");
  const rs = respec(bought, { uid: rig.uid, slot, upgrade: other.id }).run;
  assert.equal(rs.roster.find((r) => r.uid === rig.uid)[slot === "longRange" ? "longRangeUpgrade" : "meleeUpgrade"], other.id);
  assert.equal(rs.salvage, bought.salvage - 6);
  const proto = WEAPON_UPGRADES[weapon].find((u) => u.nature === "prototype");
  assert.equal(respec(bought, { uid: rig.uid, slot, upgrade: proto.id }).error, "locked-nature");
  assert.equal(respec(run, { uid: rig.uid, slot, upgrade: other.id }).error, "status");
  const next = continueRun(rs).run;
  assert.equal(next.status, "map");
  assert.equal(next.step, 4);
  assert.equal(next.depot, null);
  assert.equal(next.history.at(-1).kind, "depot");
});

test("full run to the boss, summary + abandon", () => {
  let run = start({}, 1234);
  let guard = 0;
  while (run.status !== "over" && guard++ < 20) {
    if (run.status === "map") {
      const node = run.offers.find((n) => n.kind !== "depot") || run.offers[0];
      run = pickNode(run, node.id).run;
    } else if (run.status === "battle") {
      run = debrief(run, fakeRoom(run, { kills: 1 })).run;
    } else if (run.status === "reward") {
      run = applyReward(run, { skip: true }).run;
    } else run = continueRun(run).run;
  }
  assert.equal(run.status, "over");
  assert.equal(run.won, true);
  const s = runSummary(run);
  assert.equal(s.contractsWon, 5);
  assert.equal(s.reachedBoss, true);
  assert.equal(s.bossWon, true);
  assert.equal(creditRun(newProfile(), s).earned, 10 + 3 + 6);
  const ab = abandon(start());
  assert.equal(ab.run.status, "over");
  assert.equal(ab.summary.abandoned, true);
  assert.equal(ab.summary.won, false);
  assert.equal(deployable(ab.run).length, 3);
});
