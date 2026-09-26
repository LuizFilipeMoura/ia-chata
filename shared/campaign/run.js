// Campaign run logic (docs/design/campaign.md): new run, map offers, enemy
// squads, mission attrs, debrief, reward cards, depot, repair / recovery,
// respec, strikes and the end-of-run summary.
//
// Purity contract: every exported function deep-clones the run it's given and
// returns a NEW run; inputs are never mutated. Randomness is seeded from
// run.seed + a label (step, node index, reroll count, ...), so the same seed
// always yields the same offers, squads, cards and depot stock.
//
// Mutators return `{ run }` on success or `{ error, ...detail }` on failure
// (debrief → { run, debrief }, abandon → { run, summary }).
import {
  CHASSIS, CHASSIS_PRIMARY_EQUIPMENT, EQUIPMENT, EQUIPMENT_UPGRADES, LOCS, WEAPONS, WEAPON_UPGRADES,
  chassisById, equipmentUpgradeNature, upgradeNature,
} from "../game-state.js";
import { META } from "../bot/meta.js";
import {
  BOSS_STEP, CARD_WEIGHTS, COMMANDER_SP, CONTRACT_POOL, CONTRACT_TYPES, FACTIONS, MAX_STRIKES, NOTORIETY,
  OPENING_POOL, PERK_KITS, PRICES, RARITY, RELICS, ROUNDS, TABLE, factionById, relicById,
} from "./catalog.js";
import { unlockedPools } from "./meta.js";

// ---------------------------------------------------------------------------
// Seeded RNG

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a over "seed|label|..." → a 32-bit seed.
export function seedFor(seed, ...parts) {
  let h = 0x811c9dc5;
  for (const ch of [seed, ...parts].join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
const rngFor = (seed, ...parts) => mulberry32(seedFor(seed, ...parts));
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Roster helpers

const clone = (x) => structuredClone(x);
export const SLOTS = ["longRange", "melee"];
const SLOT_KEY = { longRange: "longRangeUpgrade", melee: "meleeUpgrade", equipment: "equipmentUpgrade" };
const chassisOf = (rig) => chassisById(rig.chassis);
const weaponOf = (rig, slot) => chassisOf(rig)[slot];
const natureUpgrade = (weapon, nature) => (WEAPON_UPGRADES[weapon] || []).find((u) => u.nature === nature)?.id || null;
const natureEquipUpgrade = (eq, nature) => (EQUIPMENT_UPGRADES[eq] || []).find((u) => u.nature === nature)?.id || null;

export const deployable = (run) => run.roster.filter((r) => !r.wrecked);
const rigByUid = (run, uid) => run.roster.find((r) => r.uid === uid) || null;
const relicEcon = (run, key) => run.relics.map((id) => relicById(id)?.econ?.[key]).filter(Boolean);

function slotNature(rig, slot) {
  if (slot === "equipment") return rig.equipment ? equipmentUpgradeNature(rig.equipment, rig.equipmentUpgrade) : null;
  return upgradeNature(weaponOf(rig, slot), rig[SLOT_KEY[slot]]);
}
export const prototypeSlots = (rig) => [...SLOTS, "equipment"].filter((s) => slotNature(rig, s) === "prototype");

// Every perk a weapon slot already carries: base weapon, installed upgrade, kit.
function weaponPerks(rig, slot) {
  const weapon = weaponOf(rig, slot);
  const base = WEAPONS[slot]?.[weapon]?.perks || [];
  const up = (WEAPON_UPGRADES[weapon] || []).find((u) => u.id === rig[SLOT_KEY[slot]]);
  return [...base, ...(up?.effect?.perks || []), ...(rig.perkKits?.[slot] ? [rig.perkKits[slot]] : [])];
}

// Write an upgrade into a slot, enforcing one Prototype per rig. A second
// Prototype needs `replace` naming the slot whose Prototype to drop.
function setUpgrade(rig, slot, upgradeId, nature, replace) {
  if (nature === "prototype") {
    const others = prototypeSlots(rig).filter((s) => s !== slot);
    if (others.length) {
      if (!replace || !others.includes(replace)) return { error: "prototype-cap", uid: rig.uid, conflicts: others };
      rig[SLOT_KEY[replace]] = null;
    }
  }
  rig[SLOT_KEY[slot]] = upgradeId;
  return null;
}

// ---------------------------------------------------------------------------
// Side modifiers

export function mergeMods(...list) {
  const out = {};
  for (const m of list) {
    if (!m) continue;
    for (const [k, v] of Object.entries(m)) {
      if (v && typeof v === "object") {
        out[k] = { ...(out[k] || {}) };
        for (const [kk, vv] of Object.entries(v)) out[k][kk] = (out[k][kk] || 0) + vv;
      } else out[k] = (out[k] || 0) + v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// New run

export function newRun(profile, { chassis = [], notoriety = 0, banner = null } = {}, seed = Date.now() >>> 0) {
  const pools = unlockedPools(profile);
  if (!Array.isArray(chassis) || chassis.length !== 3) return { error: "roster-size" };
  if (new Set(chassis).size !== 3) return { error: "roster-duplicate" };
  const defs = chassis.map((id) => chassisById(id));
  if (defs.some((c) => !c)) return { error: "unknown-chassis" };
  if (defs.some((c) => !pools.chassis.includes(c.id))) return { error: "locked-chassis" };
  if (defs.filter((c) => c.class === "medium").length > 2) return { error: "too-many-mediums" };
  if (!Number.isInteger(notoriety) || notoriety < 0 || notoriety > profile.notorietyMax) return { error: "notoriety" };
  if (banner != null && !pools.banners.includes(banner)) return { error: "banner" };

  const rng = rngFor(seed, "run");
  const level = NOTORIETY[notoriety];
  const withMods = RELICS.filter((r) => r.mods);
  const enemyRelics = shuffle(withMods, rng).slice(0, level.relics).map((r) => r.id);
  const bossFaction = pick(FACTIONS, rng).id;

  const roster = defs.map((c, i) => ({
    uid: `r${i + 1}`,
    name: c.name,
    chassis: c.id,
    longRangeUpgrade: pools.workshop.fieldStart ? natureUpgrade(c.longRange, "field") : null,
    meleeUpgrade: pools.workshop.fieldStart ? natureUpgrade(c.melee, "field") : null,
    equipment: null,
    equipmentUpgrade: null,
    perkKits: { longRange: null, melee: null },
    sp: { ...c.sp },
    wrecked: false,
  }));

  const run = {
    id: `run-${seed}`,
    seed,
    notoriety,
    banner,
    bossFaction,
    enemyRelics,
    pools,                 // unlock snapshot at run start (cards, depot, natures)
    step: 0,               // completed steps; offers are for step + 1
    salvage: PRICES.startSalvage + pools.workshop.startSalvage,
    strikes: 0,
    freeRecovery: pools.workshop.freeRecovery,
    roster,
    relics: [],
    offers: [],
    history: [],
    status: "map",
    contract: null,
    reward: null,
    depot: null,
    won: false,
    stats: { contractsWon: 0, contractsLost: 0, depotsVisited: 0, kills: 0, salvageEarned: 0, reachedBoss: false, bossWon: false },
  };
  run.offers = offersFor(run);
  return { run };
}

// ---------------------------------------------------------------------------
// Enemy squads

// One enemy unit under a Notoriety policy at `step`. `meta` forces the GA
// build (commanders / warlords); chassis without a build fall back to Tuned.
function enemyUnit(chassisId, level, step, { meta = false } = {}) {
  const c = chassisById(chassisId);
  const build = META.builds[chassisId];
  const unit = { name: c.name, chassis: c.id, perkKits: { longRange: null, melee: null } };
  if ((meta || (level.metaFrom != null && step >= level.metaFrom)) && build) {
    return { ...unit, longRangeUpgrade: build.longRangeUpgrade, meleeUpgrade: build.meleeUpgrade,
      equipment: build.equipment ?? null, equipmentUpgrade: build.equipmentUpgrade ?? null };
  }
  const nature = meta || (level.tunedFrom != null && step >= level.tunedFrom) ? "tuned"
    : level.fieldFrom != null && step >= level.fieldFrom ? "field" : null;
  const equipment = level.equipment || meta ? CHASSIS_PRIMARY_EQUIPMENT[c.id] ?? null : null;
  return {
    ...unit,
    longRangeUpgrade: nature ? natureUpgrade(c.longRange, nature) : null,
    meleeUpgrade: nature ? natureUpgrade(c.melee, nature) : null,
    equipment,
    equipmentUpgrade: equipment && nature === "tuned" ? natureEquipUpgrade(equipment, "field") : null,
  };
}

// Pick an unused chassis, preferring `cls` (weight-class mirroring) and, for
// commanders, one with a META build.
function pickEnemyChassis(used, cls, rng, preferBuild = false) {
  let pool = CHASSIS.filter((c) => !used.has(c.id));
  if (cls && pool.some((c) => c.class === cls)) pool = pool.filter((c) => c.class === cls);
  if (preferBuild && pool.some((c) => META.builds[c.id])) pool = pool.filter((c) => META.builds[c.id]);
  const c = pick(pool, rng);
  used.add(c.id);
  return c.id;
}

function contractNode(run, type, step, index, faction) {
  const rng = rngFor(run.seed, "node", step, index);
  const level = NOTORIETY[run.notoriety];
  const boss = type === "boss";
  const used = new Set(run.roster.map((r) => r.chassis)); // never a mirror
  const classes = deployable(run).map((r) => chassisOf(r).class);
  if (!classes.length) classes.push(null);
  const hasCommander = boss || type === "assassinate";
  const enemy = classes.map((cls, i) => {
    const commander = hasCommander && i === 0;
    const u = enemyUnit(pickEnemyChassis(used, cls, rng, commander), level, step, { meta: commander });
    if (!commander) return u;
    const f = factionById(faction);
    return { ...u, name: `${f.short} ${boss ? "Warlord" : "Commander"}`, commander: true, spMult: COMMANDER_SP[boss ? "boss" : "assassinate"] };
  });
  const node = {
    id: `s${step}n${index}`,
    kind: boss ? "boss" : "contract",
    type,
    name: CONTRACT_TYPES[type].name,
    faction,
    step,
    seed: seedFor(run.seed, "mission", step, index),
    payout: boss ? PRICES.bossPayout : PRICES.payoutBase + PRICES.payoutPerStep * step,
    maxRounds: ROUNDS[boss ? "boss" : type] ?? ROUNDS.contract,
    threat: Math.min(5, Math.ceil(step / 2) + (["assassinate", "laststand", "boss"].includes(type) ? 1 : 0) + (run.notoriety >= 3 ? 1 : 0)),
    enemy,
  };
  if (type === "laststand") {
    node.reinforcements = [3, 5].map((round) => ({ round, unit: enemyUnit(pickEnemyChassis(used, null, rng), level, step) }));
  }
  if (type === "salvage") node.crates = 3;
  if (type === "breakthrough") node.extractGoal = Math.min(2, Math.max(1, deployable(run).length));
  return node;
}

// Map nodes for the NEXT step (run.step + 1). Deterministic from the run seed;
// only the enemy squads depend on the roster (count + weight classes), so
// re-running after a recovery keeps the same types/factions.
export function offersFor(run) {
  const step = run.step + 1;
  const rng = rngFor(run.seed, "offers", step);
  if (step >= BOSS_STEP) return [contractNode(run, "boss", BOSS_STEP, 0, run.bossFaction)];
  const n = step === 1 ? 2 : 3;
  const kinds = Array(n).fill("contract");
  if (step === 4) kinds[Math.floor(rng() * n)] = "depot";
  else if (step > 1) {
    for (let i = 0; i < n; i++) if (rng() < 0.25) { kinds[i] = "depot"; break; }
  }
  const types = shuffle(step === 1 ? OPENING_POOL : CONTRACT_POOL, rng);
  const factions = FACTIONS.map((f) => f.id);
  let t = 0;
  return kinds.map((kind, i) => {
    const faction = pick(factions, rng);
    if (kind === "depot") return { id: `s${step}n${i}`, kind: "depot", type: "depot", name: "Depot", faction: null, step };
    return contractNode(run, types[t++], step, i, faction);
  });
}

// ---------------------------------------------------------------------------
// Mission verb attrs

export function missionAttrs(run, node) {
  const level = NOTORIETY[run.notoriety];
  const boss = node.kind === "boss";
  const faction = factionById(node.faction);
  const squadA = deployable(run).map((r) => ({
    uid: r.uid,
    name: r.name,
    chassis: r.chassis,
    longRangeUpgrade: r.longRangeUpgrade,
    meleeUpgrade: r.meleeUpgrade,
    equipment: r.equipment,
    equipmentUpgrade: r.equipmentUpgrade,
    perkKits: { ...r.perkKits },
    sp: { ...r.sp },
  }));
  const attrs = {
    type: node.type,
    faction: node.faction || null,
    seed: node.seed,
    width: TABLE.width,
    height: TABLE.height,
    maxRounds: node.maxRounds,
    enemyBot: level.enemyBot,
    squads: { a: squadA, b: clone(node.enemy) },
    mods: {
      a: mergeMods(...run.relics.map((id) => relicById(id)?.mods), factionById(run.banner)?.mods),
      b: mergeMods(
        boss || level.factionAlways ? faction?.mods : null,
        level.mods,
        ...run.enemyRelics.map((id) => relicById(id)?.mods),
        boss ? { answer: 1 } : null,
      ),
    },
  };
  if (node.reinforcements) attrs.reinforcements = clone(node.reinforcements);
  if (node.crates) attrs.crates = node.crates;
  if (node.extractGoal) attrs.extractGoal = Math.min(node.extractGoal, squadA.length);
  return attrs;
}

// ---------------------------------------------------------------------------
// Reward cards

const upgradeCategory = (kind, nature) => `${kind}:${nature}`;

// Every card that fits the roster + unlock pools, grouped by weight category.
function cardCandidates(run) {
  const { pools } = run;
  const cats = {};
  const add = (cat, card) => (cats[cat] ||= []).push(card);

  for (const rig of run.roster) {
    for (const slot of SLOTS) {
      const weapon = weaponOf(rig, slot);
      for (const u of WEAPON_UPGRADES[weapon] || []) {
        if (!pools.natures.includes(u.nature) || u.id === rig[SLOT_KEY[slot]]) continue;
        add(upgradeCategory("upgrade", u.nature), {
          kind: "upgrade", weapon, upgrade: u.id, nature: u.nature, rarity: RARITY[u.nature],
          label: u.name, text: `${weapon}: ${u.tag}`, fits: [{ uid: rig.uid, slot }],
        });
      }
    }
  }
  for (const eq of pools.equipment) {
    const fits = run.roster.filter((r) => r.equipment !== eq).map((r) => ({ uid: r.uid, slot: "equipment" }));
    if (fits.length) add("equipment", { kind: "equipment", equipment: eq, rarity: RARITY.equipment, label: EQUIPMENT[eq].label, text: EQUIPMENT[eq].passive, fits });
  }
  for (const eq of [...new Set(run.roster.map((r) => r.equipment).filter(Boolean))]) {
    for (const u of EQUIPMENT_UPGRADES[eq] || []) {
      if (!pools.natures.includes(u.nature)) continue;
      const fits = run.roster.filter((r) => r.equipment === eq && r.equipmentUpgrade !== u.id).map((r) => ({ uid: r.uid, slot: "equipment" }));
      if (fits.length) add(upgradeCategory("equipUpgrade", u.nature), {
        kind: "equipUpgrade", equipment: eq, upgrade: u.id, nature: u.nature, rarity: RARITY[u.nature],
        label: u.name, text: `${EQUIPMENT[eq].label}: ${u.tag}`, fits,
      });
    }
  }
  if (pools.perkKits) {
    for (const k of PERK_KITS) {
      const fits = run.roster.flatMap((r) => SLOTS.filter((s) => !weaponPerks(r, s).includes(k.perk)).map((slot) => ({ uid: r.uid, slot })));
      if (fits.length) add("perkKit", { kind: "perkKit", perk: k.perk, rarity: RARITY.perkKit, label: `${k.perk} kit`, text: k.text, fits });
    }
  }
  for (const id of pools.relics) {
    if (run.relics.includes(id)) continue;
    const r = relicById(id);
    add("relic", { kind: "relic", relic: id, rarity: RARITY.relic, label: r.name, text: r.text, fits: [] });
  }
  add("salvage", { kind: "salvage", amount: PRICES.salvageCache, rarity: RARITY.salvage, label: "Salvage cache", text: `+${PRICES.salvageCache} salvage`, fits: [] });
  return cats;
}

// Weighted draw of `n` distinct cards: category by CARD_WEIGHTS, then uniform.
function drawCards(cats, n, rng, allow = () => true) {
  const live = Object.fromEntries(Object.entries(cats).filter(([k, v]) => v.length && allow(k)).map(([k, v]) => [k, [...v]]));
  const out = [];
  while (out.length < n) {
    const keys = Object.keys(live).filter((k) => live[k].length);
    if (!keys.length) break;
    const total = keys.reduce((s, k) => s + CARD_WEIGHTS[k], 0);
    let roll = rng() * total;
    let cat = keys[keys.length - 1];
    for (const k of keys) { roll -= CARD_WEIGHTS[k]; if (roll < 0) { cat = k; break; } }
    const list = live[cat];
    out.push(list.splice(Math.floor(rng() * list.length), 1)[0]);
  }
  return out;
}

const RARE_CATS = (k) => /tuned|prototype/.test(k) || k === "perkKit" || k === "relic";

// Reward hand for a won contract (workshop: 3 or 4 cards). `boss`: rare+ only
// with a guaranteed relic when one is available.
export function rewardCards(run, rng = rngFor(run.seed, "reward", run.step), { boss = false } = {}) {
  const cats = cardCandidates(run);
  const n = run.pools.workshop.cards;
  if (!boss) return drawCards(cats, n, rng);
  const relic = drawCards({ relic: cats.relic || [] }, 1, rng);
  return [...relic, ...drawCards({ ...cats, relic: [] }, n - relic.length, rng, RARE_CATS)];
}

const cardPrice = (card) => ({
  upgrade: () => PRICES.upgrade[card.nature],
  equipment: () => PRICES.equipment,
  equipUpgrade: () => PRICES.equipUpgrade[card.nature],
  perkKit: () => PRICES.perkKit,
  relic: () => PRICES.relic,
}[card.kind]?.() ?? 0);

function depotStock(run) {
  const rng = rngFor(run.seed, "depot", run.step + 1);
  const cats = cardCandidates(run);
  delete cats.salvage;
  const upgrades = drawCards(cats, 1, rng, (k) => k.startsWith("upgrade:") || k.startsWith("equipUpgrade:"));
  const rest = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, v.filter((c) => !upgrades.includes(c))]));
  return [...upgrades, ...drawCards(rest, 4 - upgrades.length, rng)].map((c) => ({ ...c, price: cardPrice(c), sold: false }));
}

// Install a card onto the (cloned) run. Returns null or { error }.
function installCard(run, card, target = {}) {
  if (card.kind === "salvage") { run.salvage += card.amount; return null; }
  if (card.kind === "relic") {
    if (run.relics.includes(card.relic)) return { error: "owned" };
    run.relics.push(card.relic);
    return null;
  }
  const fit = card.fits.length === 1 && target.uid == null
    ? card.fits[0]
    : card.fits.find((f) => f.uid === target.uid && (target.slot == null || f.slot === target.slot));
  if (!fit) return { error: "target" };
  const rig = rigByUid(run, fit.uid);
  switch (card.kind) {
    case "upgrade":
    case "equipUpgrade":
      return setUpgrade(rig, fit.slot, card.upgrade, card.nature, target.replace);
    case "equipment":
      rig.equipment = card.equipment;
      rig.equipmentUpgrade = null;
      return null;
    case "perkKit":
      rig.perkKits = { ...rig.perkKits, [fit.slot]: card.perk };
      return null;
    default:
      return { error: "card" };
  }
}

// ---------------------------------------------------------------------------
// Map → node

export function pickNode(run, nodeId) {
  if (run.status !== "map") return { error: "status" };
  const node = run.offers.find((n) => n.id === nodeId);
  if (!node) return { error: "node" };
  const r = clone(run);
  if (node.kind === "depot") {
    r.status = "depot";
    r.stats.depotsVisited++;
    r.depot = { nodeId, stock: depotStock(r) };
    return { run: r };
  }
  if (!deployable(r).length) return { error: "no-deployable" };
  if (node.kind === "boss") r.stats.reachedBoss = true;
  r.status = "battle";
  r.contract = clone(node);
  return { run: r };
}

// ---------------------------------------------------------------------------
// Debrief

const cheapestRecovery = (run, where) => (run.freeRecovery ? 0 : recoveryPrice(run, where));
const canContinue = (run) => deployable(run).length > 0 || run.roster.some((r) => r.wrecked) && run.salvage >= cheapestRecovery(run, "field");

// Read a FINISHED mission room back into the run. Side-a rigs are found in
// room.rigs and room.campaign.extracted.a (full rig objects that left the
// field), matched by rig.campaignUid, then name, then order.
export function debrief(run, room) {
  if (run.status !== "battle" || !run.contract) return { error: "status" };
  const outcome = room?.game?.outcome;
  if (!outcome) return { error: "unfinished" };
  const r = clone(run);
  const node = r.contract;
  const boss = node.kind === "boss";
  const won = outcome.winner === "a";

  const extracted = room.campaign?.extracted?.a || [];
  const extractedIds = new Set(extracted.map((x) => x.id));
  const sideA = [...(room.rigs || []).filter((x) => x.owner === "a"), ...extracted];
  const deployed = deployable(r);
  const unmatched = [...sideA];
  const take = (fn) => { const i = unmatched.findIndex(fn); return i < 0 ? null : unmatched.splice(i, 1)[0]; };
  const matched = deployed.map((rig) => take((x) => x.campaignUid === rig.uid));
  deployed.forEach((rig, i) => { matched[i] ||= take((x) => x.campaignUid == null && x.name === rig.name); });
  deployed.forEach((rig, i) => { matched[i] ||= take((x) => x.campaignUid == null); });

  const rigs = deployed.map((rig, i) => {
    const live = matched[i];
    const max = chassisOf(rig).sp;
    const wasExtracted = !!live && extractedIds.has(live.id);
    if (live?.destroyed && !wasExtracted) {
      rig.wrecked = true;
      rig.sp = Object.fromEntries(LOCS.map((l) => [l, 0]));
    } else if (live) {
      for (const l of LOCS) {
        const sp = live[l]?.sp;
        if (Number.isFinite(sp)) rig.sp[l] = Math.max(0, Math.min(sp, max[l]));
      }
    }
    return { uid: rig.uid, name: rig.name, wrecked: rig.wrecked, extracted: wasExtracted, sp: { ...rig.sp }, crews: 0 };
  });

  // Field crews: +1 SP per damaged location on every living rig.
  for (const rig of r.roster) {
    if (rig.wrecked) continue;
    const max = chassisOf(rig).sp;
    let healed = 0;
    for (const l of LOCS) if (rig.sp[l] < max[l]) { rig.sp[l]++; healed++; }
    const row = rigs.find((x) => x.uid === rig.uid);
    if (row) { row.crews = healed; row.sp = { ...rig.sp }; }
  }

  const kills = (room.rigs || []).filter((x) => x.owner === "b" && x.destroyed).length;
  const crates = room.campaign?.crates?.a || 0;
  const perKill = PRICES.kill + relicEcon(r, "salvagePerKill").reduce((s, n) => s + n, 0);
  const lines = [];
  if (won) {
    lines.push({ label: boss ? "Warlord bounty" : "Contract payout", amount: node.payout });
    if (kills) lines.push({ label: `Kills ×${kills}`, amount: kills * perKill });
    if (crates) lines.push({ label: `Crates ×${crates}`, amount: crates * PRICES.crate });
  }
  const gained = lines.reduce((s, l) => s + l.amount, 0);
  r.salvage += gained;
  r.stats.kills += kills;
  r.stats.salvageEarned += gained;
  if (won && !boss) r.stats.contractsWon++;
  if (!won) { r.stats.contractsLost++; r.strikes++; }
  r.history.push({ step: node.step, nodeId: node.id, kind: node.kind, type: node.type, faction: node.faction, won, kills, salvage: gained });
  r.contract = null;

  if (boss) {
    r.status = "over";
    r.won = won;
    r.stats.bossWon = won;
  } else if (r.strikes >= MAX_STRIKES || !canContinue(r)) {
    r.status = "over";
  } else {
    r.step++;
    r.offers = offersFor(r);
    if (won) {
      r.status = "reward";
      r.reward = { cards: rewardCards(r), rerolled: false };
    } else r.status = "debrief";
  }

  return {
    run: r,
    debrief: { won, reason: outcome.reason ?? null, type: node.type, boss, kills, crates, lines, salvage: gained, strikes: r.strikes, rigs, over: r.status === "over" },
  };
}

// ---------------------------------------------------------------------------
// Rewards, depot, repairs

export function applyReward(run, choice = {}) {
  if (run.status !== "reward" || !run.reward) return { error: "status" };
  const r = clone(run);
  if (choice.skip) { r.status = "map"; r.reward = null; return { run: r }; }
  if (choice.reroll) {
    if (r.reward.rerolled) return { error: "rerolled" };
    const cost = relicEcon(r, "freeReroll").length ? 0 : PRICES.reroll;
    if (r.salvage < cost) return { error: "salvage", cost };
    r.salvage -= cost;
    r.reward = { cards: rewardCards(r, rngFor(r.seed, "reroll", r.step)), rerolled: true };
    return { run: r };
  }
  const card = r.reward.cards[choice.index];
  if (!card) return { error: "card" };
  const err = installCard(r, card, choice.target);
  if (err) return err;
  r.status = "map";
  r.reward = null;
  return { run: r };
}

export function buy(run, { index, target } = {}) {
  if (run.status !== "depot" || !run.depot) return { error: "status" };
  const r = clone(run);
  const item = r.depot.stock[index];
  if (!item) return { error: "card" };
  if (item.sold) return { error: "sold" };
  if (r.salvage < item.price) return { error: "salvage", cost: item.price };
  const err = installCard(r, item, target);
  if (err) return err;
  r.salvage -= item.price;
  item.sold = true;
  return { run: r };
}

// Where a repair/recovery happens decides the price: the Depot, or in the
// field (map / debrief / reward).
function serviceWhere(run) {
  if (run.status === "depot") return "depot";
  if (["map", "debrief", "reward"].includes(run.status)) return "field";
  return null;
}

export function repairPrice(run, where = serviceWhere(run)) {
  const discount = relicEcon(run, "repairDiscount").reduce((s, n) => s + n, 0);
  return Math.max(1, PRICES.repair[where] - discount);
}

// Repair 1 SP on `loc`, or with loc "all" as many SP as salvage allows
// (round-robin over damaged locations).
export function repair(run, { uid, loc = "all" } = {}) {
  const where = serviceWhere(run);
  if (!where) return { error: "status" };
  const r = clone(run);
  const rig = rigByUid(r, uid);
  if (!rig) return { error: "rig" };
  if (rig.wrecked) return { error: "wrecked" };
  const max = chassisOf(rig).sp;
  const per = repairPrice(r, where);
  const locs = loc === "all" ? LOCS : [loc];
  if (!locs.every((l) => LOCS.includes(l))) return { error: "loc" };
  if (!locs.some((l) => rig.sp[l] < max[l])) return { error: "undamaged" };
  if (r.salvage < per) return { error: "salvage", cost: per };
  let healed = 0;
  do {
    let any = false;
    for (const l of locs) {
      if (rig.sp[l] >= max[l] || r.salvage < per) continue;
      rig.sp[l]++; r.salvage -= per; healed++; any = true;
      if (loc !== "all") break;
    }
    if (!any || loc !== "all") break;
  } while (true);
  return { run: r, healed, spent: healed * per };
}

export function recoveryPrice(run, where = serviceWhere(run)) {
  const base = PRICES.recover[where];
  return relicEcon(run, "recoveryHalf").length ? Math.ceil(base / 2) : base;
}

// Buy a wreck back: every location at half its max SP (rounded up).
export function recover(run, uid) {
  const where = serviceWhere(run);
  if (!where) return { error: "status" };
  const r = clone(run);
  const rig = rigByUid(r, uid);
  if (!rig) return { error: "rig" };
  if (!rig.wrecked) return { error: "not-wrecked" };
  const free = r.freeRecovery;
  const cost = free ? 0 : recoveryPrice(r, where);
  if (r.salvage < cost) return { error: "salvage", cost };
  r.salvage -= cost;
  if (free) r.freeRecovery = false;
  const max = chassisOf(rig).sp;
  rig.sp = Object.fromEntries(LOCS.map((l) => [l, Math.ceil(max[l] / 2)]));
  rig.wrecked = false;
  // Pending offers (next step) re-size their enemy squads to the new roster.
  if (r.status !== "depot") r.offers = offersFor(r);
  return { run: r, cost };
}

// Depot only: swap an installed upgrade for another of the same item.
export function respec(run, { uid, slot, upgrade, replace } = {}) {
  if (run.status !== "depot") return { error: "status" };
  const r = clone(run);
  const rig = rigByUid(r, uid);
  if (!rig) return { error: "rig" };
  if (!SLOT_KEY[slot]) return { error: "slot" };
  if (!rig[SLOT_KEY[slot]]) return { error: "empty-slot" };
  const list = slot === "equipment" ? EQUIPMENT_UPGRADES[rig.equipment] || [] : WEAPON_UPGRADES[weaponOf(rig, slot)] || [];
  const u = list.find((x) => x.id === upgrade);
  if (!u) return { error: "upgrade" };
  if (u.id === rig[SLOT_KEY[slot]]) return { error: "same" };
  if (!r.pools.natures.includes(u.nature)) return { error: "locked-nature" };
  if (r.salvage < PRICES.respec) return { error: "salvage", cost: PRICES.respec };
  const err = setUpgrade(rig, slot, u.id, u.nature, replace);
  if (err) return err;
  r.salvage -= PRICES.respec;
  return { run: r };
}

// Leave debrief / reward / depot for the map. Leaving a Depot completes its
// step. No deployable rig (and no way to recover one) ends the run.
export function continueRun(run) {
  if (!["debrief", "reward", "depot"].includes(run.status)) return { error: "status" };
  const r = clone(run);
  if (r.status === "depot") {
    r.history.push({ step: r.step + 1, nodeId: r.depot?.nodeId ?? null, kind: "depot", type: "depot", faction: null, won: null, kills: 0, salvage: 0 });
    r.depot = null;
    r.step++;
    r.offers = offersFor(r);
  }
  r.reward = null;
  r.status = canContinue(r) ? "map" : "over";
  return { run: r };
}

export function runSummary(run) {
  return {
    runId: run.id,
    won: !!run.won,
    contractsWon: run.stats.contractsWon,
    contractsLost: run.stats.contractsLost,
    depotsVisited: run.stats.depotsVisited,
    kills: run.stats.kills,
    salvageEarned: run.stats.salvageEarned,
    reachedBoss: run.stats.reachedBoss,
    bossWon: run.stats.bossWon,
    bossFaction: run.bossFaction,
    notoriety: run.notoriety,
    steps: run.step,
    abandoned: !!run.abandoned,
  };
}

export function abandon(run) {
  const r = clone(run);
  r.status = "over";
  r.abandoned = true;
  return { run: r, summary: runSummary(r) };
}
