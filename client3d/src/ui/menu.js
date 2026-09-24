// Title screen and the squad builder (commission 3 rigs, pick one upgrade per
// weapon + equipment, one Prototype max per rig), then spin up a room against
// the bot at the chosen difficulty.
import { el, clear, fill, toast } from "./dom.js";
import { api } from "../api.js";
import { CHASSIS, WEAPON_UPGRADES, EQUIPMENT, CHASSIS_PRIMARY_EQUIPMENT } from "/shared/game-state.js";
import { EQUIPMENT_UPGRADES } from "/shared/rules.js";

const NATURE = { field: "FIELD", tuned: "TUNED", prototype: "PROTO" };
const TIER_TEXT = {
  easy: "Sloppy pilot, bare rigs. Learn the ropes.",
  normal: "A fair fight, roughly even against a decent build.",
  hard: "GA-evolved champion: the meta's best builds and tactics.",
};

export function titleScreen(root, { onPlay, onTutorial, onLab, onWatch, onSims }) {
  fill(root, el("div", { class: "title" },
    el("div", { class: "logo" }, el("span", {}, "OIL"), el("i", {}, "&"), el("span", {}, "IRON"), el("small", {}, "TACTICS · 3D")),
    el("p", { class: "tag" }, "Oil-soaked war rigs, brass-bound Ironclads, and a table of rubble to fight over."),
    el("div", { class: "menu" },
      el("button", { class: "btn big primary", onClick: onTutorial }, "🎓  Tutorial: learn by playing"),
      el("button", { class: "btn big", onClick: onPlay }, "⚔️  Skirmish vs Bot"),
      el("button", { class: "btn big", onClick: onWatch }, "🍿  Watch Bots Fight"),
      el("button", { class: "btn big", onClick: onSims }, "🛰  Sim Center: simulate & replay"),
      el("button", { class: "btn big", onClick: onLab }, "🧬  Balance Lab (genetic meta)"),
    ),
    el("p", { class: "muted small" }, "WASD / arrows pan · Q/E or right-drag rotate · wheel zoom · Tab cycles rigs · 1–6 hotkeys · Enter ends activation"),
  ));
}

function unitDefaults(ch) {
  return {
    chassis: ch.id,
    longRangeUpgrade: WEAPON_UPGRADES[ch.longRange][0].id,
    meleeUpgrade: WEAPON_UPGRADES[ch.melee][0].id,
    equipment: CHASSIS_PRIMARY_EQUIPMENT[ch.id] || Object.keys(EQUIPMENT)[0],
    equipmentUpgrade: null,
  };
}

function protoCount(u) {
  const ch = CHASSIS.find((c) => c.id === u.chassis);
  const n = (list, id) => list?.find((x) => x.id === id)?.nature === "prototype";
  return n(WEAPON_UPGRADES[ch.longRange], u.longRangeUpgrade) + n(WEAPON_UPGRADES[ch.melee], u.meleeUpgrade) + n(EQUIPMENT_UPGRADES[u.equipment], u.equipmentUpgrade);
}

export async function squadBuilder(root, { onStart, onBack }) {
  let content = {};
  try { (await api.chassis()).chassis.forEach((c) => { content[c.id] = c; }); } catch {}
  const squad = [];
  let tier = "normal";
  let table = "skirmish";
  const render = () => {
    const mediums = squad.filter((u) => CHASSIS.find((c) => c.id === u.chassis).class === "medium").length;
    fill(root, el("div", { class: "builder" },
      el("div", { class: "b-head" }, el("button", { class: "btn ghost", onClick: onBack }, "← Back"), el("h1", {}, "Commission your squadron"), el("span", { class: "muted" }, `${squad.length}/3 rigs · the bot mirrors your weight classes`)),
      el("div", { class: "tiers" }, ["easy", "normal", "hard"].map((t) => el("button", { class: `tier ${t === tier ? "on" : ""} t-${t}`, onClick: () => { tier = t; render(); } }, el("b", {}, t.toUpperCase()), el("span", {}, TIER_TEXT[t])))),
      el("div", { class: "tables" }, el("span", { class: "muted" }, "Table:"), Object.entries(TABLES).map(([k, t]) => el("button", { class: `btn ${table === k ? "primary" : "ghost"}`, title: t.hint, onClick: () => { table = k; render(); } }, t.label))),
      el("div", { class: "b-grid" }, CHASSIS.map((ch) => {
        const picked = squad.find((u) => u.chassis === ch.id);
        const full = squad.length >= 3 || (ch.class === "medium" && mediums >= 2);
        const c = content[ch.id] || {};
        return el("div", { class: `ch-card ${picked ? "picked" : ""}` },
          el("div", { class: "ch-top" }, el("span", { class: `swatch big sw-${ch.name}` }), el("div", {}, el("b", {}, ch.name), el("div", { class: "muted" }, `${ch.class} · speed ${ch.speed}" · ${ch.label}`))),
          c.focus ? el("p", { class: "small" }, c.focus) : c.description ? el("p", { class: "small" }, c.description) : null,
          el("div", { class: "sp" }, `Hull ${ch.sp.hull} · Arms ${ch.sp.arms} · Legs ${ch.sp.legs} · Engine ${ch.sp.engine}`),
          picked ? upgradeEditor(ch, picked, render) : null,
          el("button", { class: `btn ${picked ? "ghost" : "primary"}`, disabled: !picked && full, onClick: () => {
            if (picked) squad.splice(squad.indexOf(picked), 1); else squad.push(unitDefaults(ch));
            render();
          } }, picked ? "Remove" : "Commission"));
      })),
      el("div", { class: "b-foot" },
        el("button", { class: "btn", onClick: () => { squad.length = 0; const pool = [...CHASSIS].sort(() => Math.random() - 0.5); const m = pool.find((c) => c.class === "medium"); squad.push(unitDefaults(m)); pool.filter((c) => c.class === "light").slice(0, 2).forEach((c) => squad.push(unitDefaults(c))); render(); } }, "🎲 Random squad"),
        el("button", { class: "btn big primary", disabled: squad.length < 1, onClick: () => onStart({ squad, tier, table }) }, `Deploy vs ${tier.toUpperCase()} bot ▸`)),
    ));
  };
  render();
}

function upgradeEditor(ch, u, render) {
  const pick = (slot, list, label) => el("div", { class: "up-row" }, el("span", { class: "up-l" }, label),
    list.map((x) => {
      const trial = { ...u, [slot]: x.id };
      const blocked = x.nature === "prototype" && protoCount(trial) > 1;
      return el("button", { class: `up ${u[slot] === x.id ? "on" : ""} n-${x.nature}`, disabled: blocked, title: `${x.name}: ${x.tag}${x.catch ? ` (Catch: ${x.catch})` : ""}${blocked ? " · only one Prototype per rig" : ""}`, onClick: () => { u[slot] = x.id; render(); } },
        el("i", {}, NATURE[x.nature]), x.name);
    }));
  const eqList = EQUIPMENT_UPGRADES[u.equipment] || [];
  return el("div", { class: "upgrades" },
    pick("longRangeUpgrade", WEAPON_UPGRADES[ch.longRange], `🔫 ${ch.longRange}`),
    pick("meleeUpgrade", WEAPON_UPGRADES[ch.melee], `🗡 ${ch.melee}`),
    el("div", { class: "up-row" }, el("span", { class: "up-l" }, "⚙ Equipment"),
      el("select", { onChange: (e) => { u.equipment = e.target.value; u.equipmentUpgrade = null; render(); } },
        Object.entries(EQUIPMENT).map(([id, e]) => el("option", { value: id, selected: id === u.equipment }, `${e.label}: ${e.passive}`)))),
    eqList.length ? pick("equipmentUpgrade", eqList, "⚙ Mod") : null,
  );
}

// Create a fresh room vs the bot and commission everything. Returns the room code.
// Table sizes. Skirmish is smaller so squads meet in round 1–2 instead of
// spending it walking; Standard is the rulebook's 54×36 (what the GA meta is
// evolved on).
export const TABLES = {
  skirmish: { label: "Skirmish 42×28", width: 42, height: 28, hint: "Fast: contact in the first round or two" },
  standard: { label: "Standard 54×36", width: 54, height: 36, hint: "The rulebook table, more manoeuvring" },
};

export async function createBotRoom({ squad, tier, table = "skirmish" }) {
  const room = `3D-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  await api.join(room, "a");
  await api.command(room, "a", "setbot", { side: "b", preset: tier });
  const t = TABLES[table] || TABLES.skirmish;
  if (t.width !== 54 || t.height !== 36) await api.command(room, "a", "field", { action: "set", width: t.width, height: t.height });
  for (const u of squad) {
    const ch = CHASSIS.find((c) => c.id === u.chassis);
    await api.command(room, "a", "add", { kind: "rig", owner: "a", name: ch.name, chassis: ch.id, longRangeUpgrade: u.longRangeUpgrade, meleeUpgrade: u.meleeUpgrade, equipment: u.equipment, equipmentUpgrade: u.equipmentUpgrade || undefined });
  }
  try { await api.command(room, "a", "field", { action: "lock" }); } catch {}
  try { await api.command(room, "a", "ready", {}); } catch (e) { toast(e.message, "bad", 5000); throw e; }
  return room;
}
