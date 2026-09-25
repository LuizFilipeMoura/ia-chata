// Campaign meta progression: the persistent HQ profile (Renown, unlocks,
// faction banners, Notoriety ladder). Pure: every function returns a new
// profile and never mutates its input.
import { FACTIONS, MAX_NOTORIETY, PRICES, RELICS, RENOWN, STARTING, UNLOCKS, unlockById } from "./catalog.js";

export function newProfile() {
  return {
    renown: 0,
    totalRenown: 0,
    unlocks: [],          // bought unlock ids
    factionPerks: [],     // faction ids whose Warlord was beaten (banners)
    notorietyMax: 0,      // highest Notoriety level you may pick
    runs: 0,
    history: [],          // recent run summaries (newest last)
  };
}

const clone = (x) => structuredClone(x);

export function buyUnlock(profile, id) {
  const u = unlockById(id);
  if (!u) return { error: "unknown" };
  if (profile.unlocks.includes(id)) return { error: "owned" };
  if (u.requires && !profile.unlocks.includes(u.requires)) return { error: "requires", requires: u.requires };
  if (profile.renown < u.cost) return { error: "renown", cost: u.cost };
  const p = clone(profile);
  p.renown -= u.cost;
  p.unlocks.push(id);
  return { profile: p };
}

// Everything a profile may find or field this run.
export function unlockedPools(profile) {
  const has = (id) => profile.unlocks.includes(id);
  const bought = (kind) => UNLOCKS.filter((u) => u.kind === kind && has(u.id)).map((u) => u.target);
  const packs = bought("relics");
  return {
    chassis: [...STARTING.chassis, ...bought("chassis")],
    equipment: [...STARTING.equipment, ...bought("equipment")],
    natures: ["field", ...(has("nature:tuned") ? ["tuned"] : []), ...(has("nature:prototype") ? ["prototype"] : [])],
    relics: RELICS.filter((r) => r.pack === 0 || packs.includes(r.pack)).map((r) => r.id),
    perkKits: has("perkkits"),
    workshop: {
      startSalvage: PRICES.workshopSalvage * ["workshop:salvage1", "workshop:salvage2", "workshop:salvage3"].filter(has).length,
      cards: has("workshop:cards4") ? 4 : 3,
      freeRecovery: has("workshop:freerecovery"),
      fieldStart: has("workshop:fieldstart"),
    },
    banners: FACTIONS.filter((f) => profile.factionPerks.includes(f.id)).map((f) => f.id),
    notorietyMax: profile.notorietyMax,
  };
}

// Renown for a run summary (partial success counts). The boss is not counted
// as a "contract won"; beating it pays 6 + Notoriety instead.
export function renownFor(s) {
  return RENOWN.contractWon * (s.contractsWon || 0)
    + (s.reachedBoss ? RENOWN.reachedBoss : 0)
    + (s.bossWon ? RENOWN.bossWonBase + (s.notoriety || 0) : 0);
}

// Bank a finished run: Renown, and on a boss win the faction banner + the next
// Notoriety level. Returns { profile, earned, unlocked: ["banner:<id>", "notoriety:<n>"] }.
export function creditRun(profile, summary) {
  const p = clone(profile);
  const earned = renownFor(summary);
  const unlocked = [];
  p.renown += earned;
  p.totalRenown = (p.totalRenown || 0) + earned;
  p.runs = (p.runs || 0) + 1;
  if (summary.bossWon) {
    if (summary.bossFaction && !p.factionPerks.includes(summary.bossFaction)) {
      p.factionPerks.push(summary.bossFaction);
      unlocked.push(`banner:${summary.bossFaction}`);
    }
    const next = Math.min(MAX_NOTORIETY, (summary.notoriety || 0) + 1);
    if (next > p.notorietyMax) {
      p.notorietyMax = next;
      unlocked.push(`notoriety:${next}`);
    }
  }
  p.history = [...(p.history || []), { ...summary, renown: earned }].slice(-20);
  return { profile: p, earned, unlocked };
}
