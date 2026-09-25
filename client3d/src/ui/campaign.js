// Campaign screens (docs/design/campaign.md, "Client (client3d) work"): HQ,
// commission, contract map, briefing, debrief, reward cards, depot, run end.
// The server is authoritative: every screen renders the last /api/campaign view
// ({ profile, pools, run, last }) and every button is one POST that returns the
// next view. The battle itself is mounted by main.js (onDeploy → playCampaign).
import { el, fill, toast, modal } from "./dom.js";
import { icon } from "./icons.js";
import { api } from "../api.js";
import { sfx } from "../audio.js";
import { CHASSIS, WEAPON_UPGRADES, EQUIPMENT, EQUIPMENT_UPGRADES, LOCS } from "/shared/game-state.js";
import {
  FACTIONS, RELICS, UNLOCKS, NOTORIETY, MAX_NOTORIETY, CONTRACT_TYPES, PRICES, PERK_KITS, BOSS_STEP, MAX_STRIKES,
  factionById, relicById, unlockById, repairPrice, recoveryPrice,
} from "/shared/campaign/index.js";

// ---------------------------------------------------------------------------
// Lookups and small pieces

const chassisOf = (id) => CHASSIS.find((c) => c.id === id);
const LOC_NAME = { hull: "Hull", arms: "Arms", legs: "Legs", engine: "Engine" };
const NATURE_TAG = { field: "FIELD", tuned: "TUNED", prototype: "PROTO" };
const SLOT_KEY = { longRange: "longRangeUpgrade", melee: "meleeUpgrade", equipment: "equipmentUpgrade" };
const FACTION_COLOR = { krim: "#d9463a", nox: "#9a68d8", arcus: "#3aa6e0", triton: "#2fb3a0", freegear: "#8fbf4a" };
const SALVAGE = "⚙";
const RENOWN = "✦";

const upgradeOf = (weapon, id) => (WEAPON_UPGRADES[weapon] || []).find((u) => u.id === id) || null;
const equipUpgradeOf = (eq, id) => (EQUIPMENT_UPGRADES[eq] || []).find((u) => u.id === id) || null;
const rigOf = (run, uid) => run.roster.find((r) => r.uid === uid);
const spTotal = (sp) => LOCS.reduce((s, l) => s + (sp?.[l] || 0), 0);

function slotName(rig, slot) {
  const ch = chassisOf(rig.chassis);
  if (slot === "longRange") return ch.longRange;
  if (slot === "melee") return ch.melee;
  return rig.equipment ? EQUIPMENT[rig.equipment]?.label : "Equipment slot";
}
const slotGlyph = (slot) => (slot === "longRange" ? "🔫" : slot === "melee" ? "🗡" : "⚙");

// What sits in `slot` right now, per card kind (so the target picker can say
// what gets replaced).
function currentIn(rig, slot, kind) {
  const ch = chassisOf(rig.chassis);
  if (kind === "equipment") return rig.equipment ? `replaces ${EQUIPMENT[rig.equipment]?.label}` : "empty slot";
  if (kind === "perkKit") return rig.perkKits?.[slot] ? `replaces ${rig.perkKits[slot]} kit` : "no kit yet";
  if (slot === "equipment") {
    const u = equipUpgradeOf(rig.equipment, rig.equipmentUpgrade);
    return u ? `replaces ${u.name} (${NATURE_TAG[u.nature]})` : "no upgrade yet";
  }
  const u = upgradeOf(ch[slot], rig[SLOT_KEY[slot]]);
  return u ? `replaces ${u.name} (${NATURE_TAG[u.nature]})` : "no upgrade yet";
}

// Contract icons: reuse the shared set where one fits, draw the rest here.
const EXTRA_ICONS = {
  crate: `<path d="M10 20 L32 10 L54 20 V46 L32 56 L10 46 Z"/><path d="M10 20 L32 30 L54 20 M32 30 V56"/><path d="M21 15 L43 25" opacity=".6"/>`,
  crown: `<path d="M8 48 L12 18 L24 32 L32 12 L40 32 L52 18 L56 48 Z"/><path d="M8 55 H56"/><circle cx="32" cy="38" r="3" fill="currentColor"/>`,
  depot: `<path d="M6 28 L32 10 L58 28"/><path d="M12 26 V54 H52 V26"/><path d="M22 54 V36 H42 V54"/><path d="M22 44 H42" opacity=".6"/>`,
};
const ICON_ALIAS = { beacon: "beacon", "crossed-swords": "melee", crosshair: "aimed", arrow: "sprint", shield: "tough" };
function cicon(name, cls = "") {
  if (EXTRA_ICONS[name]) {
    const d = el("span", { class: `si cp-si ${cls}` });
    d.innerHTML = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${EXTRA_ICONS[name]}</svg>`;
    return d;
  }
  return icon(ICON_ALIAS[name] || name, `cp-si ${cls}`);
}
const typeIcon = (type, cls = "") => cicon(type === "depot" ? "depot" : CONTRACT_TYPES[type]?.icon || "beacon", cls);

function crest(factionId, size = "") {
  const f = factionById(factionId);
  if (!f) return null;
  return el("span", { class: `cp-crest ${size}`, style: { "--fc": FACTION_COLOR[f.id] || "#c9a14a" }, title: `${f.name}\n${f.perk}: ${f.text}` }, f.short[0]);
}

const pips = (n, max, cls = "") => el("span", { class: `cp-pips ${cls}` }, Array.from({ length: max }, (_, i) => el("i", { class: i < n ? "on" : "" })));
const stamp = (text, cls = "") => el("span", { class: `cp-stamp ${cls}` }, text);
const natureBadge = (nature) => el("i", { class: `cp-nat n-${nature}` }, NATURE_TAG[nature] || nature);

function upChip(nature, name, title) {
  return el("span", { class: `cp-up n-${nature || "none"}`, title }, nature ? natureBadge(nature) : null, name);
}

// Animated number: counts `node`'s text from `from` to `to`.
function countUp(node, from, to, ms = 700, fmt = (v) => String(v)) {
  const t0 = performance.now();
  node.textContent = fmt(from);
  if (from === to) return;
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    node.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function spColor(frac) {
  return frac > 0.6 ? "var(--good)" : frac > 0.3 ? "#f5b041" : "var(--bad)";
}

// SP bars per location. `from` (optional) animates each bar from that SP to
// the current value; `onRepair(loc)` adds a +1 button per damaged location.
function spBars(rig, { from = null, onRepair = null, price = 0, salvage = Infinity } = {}) {
  const max = chassisOf(rig.chassis).sp;
  return el("div", { class: "cp-sp" }, LOCS.map((l) => {
    const now = rig.sp[l], start = from ? from[l] : now;
    const fill_ = el("i", { style: { width: `${(start / max[l]) * 100}%`, background: spColor(start / max[l]) } });
    const num = el("span", { class: "cp-sp-n" }, `${start}/${max[l]}`);
    if (from && start !== now) setTimeout(() => {
      fill_.style.width = `${(now / max[l]) * 100}%`;
      fill_.style.background = spColor(now / max[l]);
      countUp(num, start, now, 900, (v) => `${v}/${max[l]}`);
      fill_.parentElement?.classList.add("healed");
    }, 900);
    const canFix = onRepair && !rig.wrecked && now < max[l];
    return el("div", { class: "cp-sp-row" },
      el("span", { class: "cp-sp-l", title: LOC_NAME[l] }, icon(l), LOC_NAME[l]),
      el("span", { class: "cp-bar" }, fill_),
      num,
      onRepair ? el("button", { class: "cp-plus", disabled: !canFix || salvage < price, title: canFix ? `Repair 1 SP on ${LOC_NAME[l]}: ${price} ${SALVAGE}` : "Undamaged", onClick: () => onRepair(l) }, "+") : null);
  }));
}

// Installed kit of one roster rig as chips.
function loadout(rig) {
  const ch = chassisOf(rig.chassis);
  const chips = [];
  for (const slot of ["longRange", "melee"]) {
    const u = upgradeOf(ch[slot], rig[SLOT_KEY[slot]]);
    chips.push(upChip(u?.nature, `${slotGlyph(slot)} ${u ? u.name : ch[slot]}`, u ? `${u.name}: ${u.tag}\n${ch[slot]}` : `${ch[slot]}: no upgrade yet`));
    if (rig.perkKits?.[slot]) chips.push(el("span", { class: "cp-up n-kit", title: `${rig.perkKits[slot]} kit on the ${ch[slot]}` }, el("i", { class: "cp-nat n-kit" }, "KIT"), rig.perkKits[slot]));
  }
  if (rig.equipment) {
    const eq = EQUIPMENT[rig.equipment];
    const u = equipUpgradeOf(rig.equipment, rig.equipmentUpgrade);
    chips.push(upChip(null, `⚙ ${eq.label}`, `${eq.label}: ${eq.passive}\nActive: ${eq.active?.label}`));
    if (u) chips.push(upChip(u.nature, u.name, `${u.name}: ${u.tag}`));
  } else chips.push(el("span", { class: "cp-up empty" }, "⚙ no equipment"));
  return el("div", { class: "cp-loadout" }, chips);
}

function rigCard(run, rig, { from = null, repair = null, extra = null, compact = false, badge = null } = {}) {
  const ch = chassisOf(rig.chassis);
  return el("div", { class: `cp-rig ${rig.wrecked ? "wrecked" : ""} ${compact ? "compact" : ""}` },
    el("div", { class: "cp-rig-h" },
      el("span", { class: `swatch big sw-${ch.name}` }),
      el("div", {}, el("b", {}, rig.name), el("div", { class: "muted cp-small" }, `${ch.label} · ${ch.class}`)),
      badge),
    spBars(rig, { from, ...(repair || {}) }),
    compact ? null : loadout(rig),
    rig.wrecked ? stamp("Wrecked", "wreck") : null,
    extra);
}

// Run header: salvage (counts up on change), strikes, step, Notoriety, banner, relics.
let shownSalvage = null;
function runBar(run, { onHq } = {}) {
  const salv = el("b", {}, String(run.salvage));
  if (shownSalvage != null && shownSalvage !== run.salvage) countUp(salv, shownSalvage, run.salvage, 600);
  shownSalvage = run.salvage;
  const banner = factionById(run.banner);
  return el("div", { class: "cp-bar-top" },
    onHq ? el("button", { class: "btn ghost", onClick: onHq, title: "Back to HQ (the run is saved)" }, "‹ HQ") : null,
    el("div", { class: "cp-stat salvage", title: "Salvage: pays for repairs, recovery and the Depot" }, el("span", {}, SALVAGE), salv, el("small", {}, "salvage")),
    el("div", { class: "cp-stat", title: `Strikes: ${MAX_STRIKES} lost contracts end the run` }, pips(run.strikes, MAX_STRIKES, "strikes"), el("small", {}, "strikes")),
    el("div", { class: "cp-stat", title: "Contract chain progress" }, el("b", {}, `${Math.min(run.step + 1, BOSS_STEP)}/${BOSS_STEP}`), el("small", {}, "step")),
    el("div", { class: "cp-stat", title: `Notoriety ${run.notoriety}: ${NOTORIETY[run.notoriety]?.text}` }, el("b", {}, `N${run.notoriety}`), el("small", {}, "notoriety")),
    banner ? el("div", { class: "cp-stat", title: `Banner: ${banner.name}\n${banner.perk}: ${banner.text}` }, crest(banner.id, "sm"), el("small", {}, banner.perk)) : null,
    el("div", { class: "cp-relics" }, run.relics.length
      ? run.relics.map((id) => { const r = relicById(id); return el("span", { class: "cp-relic", title: `${r.name}\n${r.text}` }, "◈ ", r.name); })
      : el("span", { class: "muted cp-small" }, "No relics yet")));
}

function rosterStrip(run) {
  return el("section", { class: "cp-roster" }, el("h3", {}, "Your outfit"), el("div", { class: "cp-rigs" }, run.roster.map((r) => rigCard(run, r))));
}

const ERR = {
  salvage: (d) => `Not enough salvage (need ${d.cost} ${SALVAGE}).`,
  renown: (d) => `Not enough Renown (need ${d.cost} ${RENOWN}).`,
  requires: (d) => `Requires "${unlockById(d.requires)?.label || d.requires}" first.`,
  owned: () => "Already owned.",
  "run-live": () => "A run is already in progress.",
  "too-many-mediums": () => "At most 2 medium rigs.",
  "no-deployable": () => "No rig can deploy: recover a wreck first.",
  rerolled: () => "You already rerolled this hand.",
  sold: () => "Sold out.",
  undamaged: () => "Nothing to repair there.",
  wrecked: () => "Recover the wreck first.",
  "locked-nature": () => "That upgrade nature isn't unlocked yet.",
  mission: (d) => `Couldn't build the battle: ${d.reason || "unknown"}.`,
  unfinished: () => "The battle isn't over yet.",
};
function errText(e) {
  const d = e?.data || {};
  return ERR[d.error]?.(d) || e?.message || "Something went wrong.";
}

// A modal list of choices. Resolves to the picked option's value, or null.
function choose(title, lead, options) {
  return new Promise((resolve) => {
    const m = modal({
      title, cls: "cp-modal", dismissable: false,
      body: el("div", { class: "cp-choose" },
        lead ? el("p", { class: "muted" }, lead) : null,
        options.map((o) => el("button", { class: "cp-opt", disabled: o.disabled, onClick: () => { m.close(); resolve(o.value); } },
          o.icon || null, el("div", {}, el("b", {}, o.label), o.sub ? el("span", {}, o.sub) : null)))),
      actions: [{ label: "Cancel", ghost: true, onClick: () => resolve(null) }],
    });
  });
}

// ---------------------------------------------------------------------------
// Cards (reward hand + depot shelves)

const KIND_TAG = { equipment: "EQUIPMENT", perkKit: "PERK KIT", relic: "RELIC", salvage: "SALVAGE" };
function cardFace(run, card) {
  const kindBadge = card.nature ? natureBadge(card.nature) : el("i", { class: `cp-nat n-${card.kind}` }, KIND_TAG[card.kind] || card.kind);
  const where = card.kind === "upgrade" ? `${slotGlyph(card.fits[0]?.slot)} ${card.weapon}`
    : card.kind === "equipUpgrade" ? `⚙ ${EQUIPMENT[card.equipment]?.label} upgrade`
    : card.kind === "equipment" ? "⚙ Equipment" : card.kind === "perkKit" ? "Weapon perk" : card.kind === "relic" ? "Squad-wide, whole run" : "Instant";
  const art = { upgrade: "fire", equipUpgrade: "harden", equipment: "harden", perkKit: "pen", relic: "star", salvage: "repair" }[card.kind] || "star";
  const fits = card.fits.map((f) => rigOf(run, f.uid)?.name).filter(Boolean);
  return el("div", { class: "cp-face-in" },
    el("div", { class: "cp-card-top" }, kindBadge, el("span", { class: `cp-rarity r-${card.rarity}` }, card.rarity)),
    el("div", { class: "cp-card-art" }, icon(art)),
    el("b", { class: "cp-card-name" }, card.label),
    el("div", { class: "cp-card-where" }, where),
    el("p", { class: "cp-card-text" }, card.kind === "upgrade" ? card.text.replace(`${card.weapon}: `, "") : card.kind === "equipUpgrade" ? card.text.replace(`${EQUIPMENT[card.equipment]?.label}: `, "") : card.text),
    fits.length ? el("div", { class: "cp-card-fits" }, "Fits: ", [...new Set(fits)].join(", ")) : null);
}

// Resolve a card's target: one fit → automatic; several → ask. Returns
// { uid, slot } / {} (no target needed) / null (cancelled).
async function pickTarget(run, card, verb) {
  if (!card.fits.length) return {};
  if (card.fits.length === 1) return { uid: card.fits[0].uid, slot: card.fits[0].slot };
  const pick = await choose(`${verb}: ${card.label}`, "Which rig and slot gets it?", card.fits.map((f) => {
    const rig = rigOf(run, f.uid);
    const ch = chassisOf(rig.chassis);
    return { label: `${rig.name} · ${slotGlyph(f.slot)} ${slotName(rig, f.slot)}`, sub: `${ch.label} · ${currentIn(rig, f.slot, card.kind)}`, icon: el("span", { class: `swatch big sw-${ch.name}` }), value: f };
  }));
  return pick ? { uid: pick.uid, slot: pick.slot } : null;
}

// POST with a target; on the one-Prototype cap ask which Prototype to drop and retry.
async function withProtoCap(run, send, target) {
  try { return await send(target); } catch (e) {
    if (e?.data?.error !== "prototype-cap") throw e;
    const rig = rigOf(run, e.data.uid);
    const ch = chassisOf(rig.chassis);
    const replace = await choose("One Prototype per rig", `${rig.name} already runs a Prototype. Installing this one drops the other. Which slot loses its Prototype?`,
      e.data.conflicts.map((slot) => {
        const u = slot === "equipment" ? equipUpgradeOf(rig.equipment, rig.equipmentUpgrade) : upgradeOf(ch[slot], rig[SLOT_KEY[slot]]);
        return { label: `${slotGlyph(slot)} ${slotName(rig, slot)}: drop ${u?.name || "its Prototype"}`, sub: u?.tag, value: slot };
      }));
    if (!replace) return null;
    return send({ ...target, replace });
  }
}

// ---------------------------------------------------------------------------
// The campaign app

export async function campaignScreen(root, { onHome, onDeploy, view = null, fresh = null }) {
  let S = view;
  let notoriety = null;          // HQ pick
  let seenDebrief = null;        // run key whose debrief was shown
  let animateDebrief = fresh === "debrief";
  shownSalvage = null;

  const show = (node) => {
    fill(root, el("div", { class: "cp-wrap" }, node));
    root.scrollTop = 0;
  };
  const loading = (text) => show(el("div", { class: "cp cp-loading" }, el("div", { class: "cp-gear" }, "⚙"), el("p", {}, text)));

  async function act(call, { ok = null, quiet = false } = {}) {
    try {
      const v = await call();
      if (v) { S = v; ok?.(v); }
      return v;
    } catch (e) {
      if (!quiet) { sfx.bad(); toast(errText(e), "bad", 4000); }
      return null;
    }
  }

  const runKey = (run) => `${run.id}:${run.history.length}`;

  function route() {
    const run = S.run;
    if (!run) return hq();
    if (run.status === "over") return animateDebrief && run.lastDebrief ? debrief() : runOver();
    if (run.status === "map") return map();
    if (run.status === "battle") return briefing();
    if (run.status === "debrief") return debrief();
    if (run.status === "reward") return seenDebrief === runKey(run) ? reward() : debrief();
    if (run.status === "depot") return depot();
    return hq();
  }

  // ---- HQ ------------------------------------------------------------------
  let renownShown = null;
  function hq({ bought = null } = {}) {
    const { profile, pools, run, last } = S;
    const live = run && run.status !== "over";
    if (notoriety == null || notoriety > profile.notorietyMax) notoriety = profile.notorietyMax;
    const renown = el("b", {}, String(profile.renown));
    if (renownShown != null && renownShown !== profile.renown) countUp(renown, renownShown, profile.renown, 900);
    renownShown = profile.renown;

    const has = (id) => profile.unlocks.includes(id);
    const groups = [
      ["chassis", "Chassis", "New war rigs to commission."],
      ["nature", "Upgrade natures", "Deeper upgrades enter the loot pool."],
      ["equipment", "Equipment", "More gear enters the loot pool."],
      ["perkkits", "Perk kits", "Graft combat perks onto weapons."],
      ["relics", "Relic packs", "Squad-wide passives for the run."],
      ["workshop", "Workshop", "Small permanent perks."],
    ];
    const detail = (u) => {
      if (u.kind === "chassis") { const c = chassisOf(u.target); return `${c.class} · speed ${c.speed}" · ${spTotal(c.sp)} SP`; }
      if (u.kind === "nature") return u.target === "tuned" ? "Conditional upgrades that out-pay Field when set up." : "Systemic upgrades: big ceiling, real bookkeeping.";
      if (u.kind === "equipment") return EQUIPMENT[u.target]?.passive;
      if (u.kind === "perkkits") return PERK_KITS.map((k) => k.perk).join(" · ");
      if (u.kind === "relics") return RELICS.filter((r) => r.pack === u.target).map((r) => r.name).join(" · ");
      return null;
    };
    const title = (u) => (u.kind === "relics" ? `Relic pack ${u.target}` : u.kind === "chassis" ? chassisOf(u.target).label : u.label);
    const unlockCard = (u) => {
      const owned = has(u.id);
      const blocked = u.requires && !has(u.requires);
      const poor = profile.renown < u.cost;
      return el("div", { class: `cp-unlock ${owned ? "owned" : blocked ? "blocked" : poor ? "poor" : "open"} ${bought === u.id ? "just" : ""}` },
        u.kind === "chassis" ? el("span", { class: `swatch big sw-${chassisOf(u.target).name}` }) : null,
        el("div", { class: "cp-unlock-t" }, el("b", {}, title(u)), detail(u) ? el("span", { class: "muted cp-small" }, detail(u)) : null,
          blocked ? el("span", { class: "cp-small cp-req" }, `Needs: ${unlockById(u.requires)?.label}`) : null),
        owned ? stamp("Owned", "owned")
          : el("button", { class: "btn cp-buy", disabled: blocked || poor, title: `${u.cost} Renown`, onClick: async () => {
            const before = S.profile.renown;
            const v = await act(() => api.campaign.unlock(u.id));
            if (v) { renownShown = before; sfx.clank?.(); sfx.score(true); toast(`Unlocked: ${title(u)}`, "good"); hq({ bought: u.id }); }
          } }, `${u.cost} ${RENOWN}`));
    };

    const notorietyPicker = notorietyRow(profile, () => hq());

    show(el("div", { class: "cp cp-hq" },
      el("header", { class: "cp-head" },
        el("button", { class: "btn ghost", onClick: onHome }, "‹ Title"),
        el("div", {}, el("h1", {}, "Mercenary HQ"), el("p", { class: "muted cp-type" }, "Five contracts, one Warlord. Damage carries, salvage pays, Renown stays.")),
        el("div", { class: "cp-renown", title: `Renown: spend it on unlocks. Earned all-time: ${profile.totalRenown || 0}` }, el("span", {}, RENOWN), renown, el("small", {}, "Renown"))),
      el("section", { class: "cp-hero" },
        live ? el("div", { class: "cp-live" },
          el("div", {}, el("h3", {}, "Run in progress"), el("p", { class: "muted" }, `Step ${Math.min(run.step + 1, BOSS_STEP)}/${BOSS_STEP} · ${run.salvage} ${SALVAGE} · ${run.strikes}/${MAX_STRIKES} strikes · ${run.roster.filter((r) => !r.wrecked).length}/3 rigs standing`)),
          el("div", { class: "cp-live-b" },
            el("button", { class: "btn big primary", onClick: () => route() }, run.status === "battle" ? "▶  Rejoin battle" : "▶  Continue run"),
            el("button", { class: "btn ghost", onClick: () => modal({ title: "Abandon the run?", body: el("p", {}, "The run ends now as a loss. You keep the Renown it has earned so far."), actions: [{ label: "Keep going", ghost: true }, { label: "Abandon", primary: true, onClick: () => act(() => api.campaign.abandon(), { ok: () => runOver() }) }] }) }, "Abandon run")))
          : el("div", { class: "cp-live" },
            el("div", {}, el("h3", {}, "New contract chain"), el("p", { class: "muted" }, "Commission three bare rigs, pick a Notoriety, and take the first job.")),
            el("button", { class: "btn big primary", onClick: () => commission() }, "⚔  New run ▸")),
        live ? null : notorietyPicker),
      last ? lastRunCard(last) : null,
      el("section", { class: "cp-sec" }, el("h2", {}, "Faction banners"),
        el("p", { class: "muted cp-small" }, "Beat a faction's Warlord to fly its banner: one faction perk for your squad at run start."),
        el("div", { class: "cp-banners" }, FACTIONS.map((f) => {
          const got = profile.factionPerks.includes(f.id);
          return el("div", { class: `cp-banner ${got ? "got" : ""}`, title: `${f.name}\n${f.perk}: ${f.text}` }, crest(f.id, "lg"),
            el("div", {}, el("b", {}, f.name), el("span", { class: "cp-small" }, `${f.perk}: ${f.text}`), el("span", { class: "muted cp-small" }, got ? "Banner earned" : `Beat the ${f.short} Warlord`)));
        }))),
      el("section", { class: "cp-sec" }, el("h2", {}, "Unlocks"),
        el("p", { class: "muted cp-small" }, `Your loot pool: ${pools.chassis.length} chassis, ${pools.equipment.length} equipment, ${pools.natures.map((n) => NATURE_TAG[n]).join("/")} upgrades, ${pools.relics.length} relics.`),
        el("div", { class: "cp-tree" }, groups.map(([kind, name, blurb]) => {
          const list = UNLOCKS.filter((u) => u.kind === kind);
          const own = list.filter((u) => has(u.id)).length;
          return el("div", { class: "cp-group" }, el("div", { class: "cp-group-h" }, el("h3", {}, name), el("span", { class: "muted cp-small" }, `${own}/${list.length}`)),
            el("p", { class: "muted cp-small" }, blurb), list.map(unlockCard));
        }))),
      profile.history?.length ? el("section", { class: "cp-sec" }, el("h2", {}, "Service record"),
        el("div", { class: "cp-history" }, [...profile.history].reverse().slice(0, 8).map((h) => el("div", { class: `cp-hist ${h.won ? "won" : "lost"}` },
          el("b", {}, h.won ? "Won" : h.abandoned ? "Abandoned" : "Lost"),
          el("span", {}, `N${h.notoriety} · ${h.contractsWon} contracts · ${h.kills} kills · ${h.salvageEarned} ${SALVAGE}`),
          el("span", { class: "cp-gold" }, `+${h.renown} ${RENOWN}`))))) : null));
  }

  function notorietyRow(profile, rerender) {
    return el("div", { class: "cp-noto" },
      el("div", { class: "cp-noto-h" }, el("h3", {}, "Notoriety"), el("span", { class: "muted cp-small" }, "Win a run at level N to unlock N+1.")),
      el("div", { class: "cp-noto-row" }, NOTORIETY.map((n) => {
        const locked = n.level > profile.notorietyMax;
        return el("button", { class: `cp-noto-b ${notoriety === n.level ? "on" : ""} ${locked ? "locked" : ""}`, disabled: locked, title: `Notoriety ${n.level}\n${n.text}${locked ? "\n⚠ Win a run at the level below first" : ""}`, onClick: () => { notoriety = n.level; sfx.servo(); rerender(); } },
          el("b", {}, locked ? "🔒" : String(n.level)), pips(Math.min(n.level, MAX_NOTORIETY), MAX_NOTORIETY, "skulls"));
      })),
      el("p", { class: "cp-noto-t" }, NOTORIETY[notoriety]?.text));
  }

  function lastRunCard(last) {
    return el("section", { class: `cp-sec cp-last ${last.won ? "won" : "lost"}` },
      el("h2", {}, "Last run"),
      el("div", { class: "cp-last-row" },
        stamp(last.won ? "Chain complete" : last.abandoned ? "Abandoned" : "Chain broken", last.won ? "win" : "loss"),
        el("span", {}, `${last.contractsWon} contracts won · ${last.kills} kills · ${last.salvageEarned} ${SALVAGE} earned`),
        el("span", { class: "cp-gold" }, `+${last.earned ?? 0} ${RENOWN}`)),
      (last.unlocked || []).length ? el("div", { class: "cp-unlocked" }, last.unlocked.map(unlockStamp)) : null);
  }

  function unlockStamp(id) {
    const [kind, v] = id.split(":");
    if (kind === "banner") { const f = factionById(v); return el("div", { class: "cp-unl" }, crest(v), el("b", {}, `Banner: ${f?.name}`), el("span", { class: "cp-small" }, `${f?.perk}: ${f?.text}`)); }
    if (kind === "notoriety") return el("div", { class: "cp-unl" }, el("span", { class: "cp-crest", style: { "--fc": "#c8412f" } }, v), el("b", {}, `Notoriety ${v} unlocked`), el("span", { class: "cp-small" }, NOTORIETY[Number(v)]?.text));
    return el("div", { class: "cp-unl" }, el("b", {}, id));
  }

  // ---- Commission ------------------------------------------------------------
  async function commission() {
    const { profile, pools } = S;
    let content = {};
    try { (await api.chassis()).chassis.forEach((c) => { content[c.id] = c; }); } catch {}
    const picked = [];
    let banner = null;
    const render = () => {
      const mediums = picked.filter((id) => chassisOf(id).class === "medium").length;
      show(el("div", { class: "cp cp-commission" },
        el("header", { class: "cp-head" },
          el("button", { class: "btn ghost", onClick: () => hq() }, "‹ HQ"),
          el("div", {}, el("h1", {}, "Commission your outfit"), el("p", { class: "muted cp-type" }, "Three bare rigs, no upgrades, no equipment. Everything else is found on the job.")),
          el("div", { class: "cp-count" }, el("b", {}, `${picked.length}/3`), el("small", {}, "max 2 medium"))),
        el("div", { class: "cp-chassis" }, pools.chassis.map((id) => {
          const c = chassisOf(id);
          const on = picked.includes(id);
          const full = !on && (picked.length >= 3 || (c.class === "medium" && mediums >= 2));
          const txt = content[id]?.focus || content[id]?.description;
          return el("button", { class: `cp-ch ${on ? "on" : ""}`, disabled: full, onClick: () => {
            if (on) picked.splice(picked.indexOf(id), 1); else picked.push(id);
            sfx.servo(); render();
          } },
            el("div", { class: "cp-ch-h" }, el("span", { class: `swatch big sw-${c.name}` }),
              el("div", {}, el("b", {}, c.name), el("div", { class: "muted cp-small" }, `${c.label}`)),
              el("span", { class: `cp-class c-${c.class}` }, c.class)),
            el("div", { class: "cp-ch-stats" },
              el("span", { title: "Speed" }, icon("move"), `${c.speed}"`),
              LOCS.map((l) => el("span", { title: LOC_NAME[l] }, icon(l), c.sp[l]))),
            el("div", { class: "cp-ch-w" }, `🔫 ${c.longRange} · 🗡 ${c.melee}`),
            txt ? el("p", { class: "cp-small" }, txt) : null,
            on ? stamp("Signed", "owned") : null);
        })),
        el("section", { class: "cp-sec" }, el("h2", {}, "Banner"),
          pools.banners.length ? el("div", { class: "cp-banners pick" },
            el("button", { class: `cp-banner ${banner == null ? "on got" : ""}`, onClick: () => { banner = null; render(); } }, el("div", {}, el("b", {}, "No banner"), el("span", { class: "muted cp-small" }, "Fly your own colours."))),
            pools.banners.map((id) => { const f = factionById(id); return el("button", { class: `cp-banner got ${banner === id ? "on" : ""}`, onClick: () => { banner = id; sfx.servo(); render(); } }, crest(id, "lg"), el("div", {}, el("b", {}, f.name), el("span", { class: "cp-small" }, `${f.perk}: ${f.text}`))); }))
            : el("p", { class: "muted cp-small" }, "No banners yet: beat a faction's Warlord to fly its colours (one faction perk for your squad).")),
        el("section", { class: "cp-sec" }, notorietyRow(profile, render)),
        el("div", { class: "cp-foot" },
          el("button", { class: "btn ghost", onClick: () => { picked.length = 0; const pool = [...pools.chassis].sort(() => Math.random() - 0.5); for (const id of pool) { if (picked.length >= 3) break; if (chassisOf(id).class === "medium" && picked.filter((x) => chassisOf(x).class === "medium").length >= 2) continue; picked.push(id); } render(); } }, "🎲 Random"),
          el("button", { class: "btn big primary", disabled: picked.length !== 3, onClick: async () => {
            loading("Signing the contracts…");
            const v = await act(() => api.campaign.start({ chassis: picked, notoriety, banner }));
            if (v) { sfx.fanfare?.(true); map(); } else render();
          } }, "Start run ▸"))));
    };
    render();
  }

  // ---- Map ----------------------------------------------------------------
  function nodeCard(run, node, { onPick = null, preview = false } = {}) {
    const f = factionById(node.faction);
    const level = NOTORIETY[run.notoriety];
    if (node.kind === "depot") {
      return el("div", { class: "cp-node depot" },
        el("div", { class: "cp-node-h" }, typeIcon("depot"), el("div", {}, el("b", {}, "Depot"), el("span", { class: "muted cp-small" }, "No fight. Shop, cheap repairs, recovery, respec."))),
        el("ul", { class: "cp-node-list" },
          el("li", {}, `Repairs ${PRICES.repair.depot} ${SALVAGE}/SP (field: ${PRICES.repair.field})`),
          el("li", {}, `Recover a wreck: ${PRICES.recover.depot} ${SALVAGE} (field: ${PRICES.recover.field})`),
          el("li", {}, `Respec an upgrade: ${PRICES.respec} ${SALVAGE}`)),
        onPick ? el("button", { class: "btn primary", onClick: onPick }, "Visit depot ▸") : null);
    }
    const t = CONTRACT_TYPES[node.type];
    const perkLive = node.kind === "boss" || level.factionAlways;
    return el("div", { class: `cp-node ${node.kind} ${preview ? "preview" : ""}`, style: { "--fc": FACTION_COLOR[node.faction] } },
      el("div", { class: "cp-node-h" }, typeIcon(node.type), el("div", {}, el("b", {}, t.name), el("span", { class: "muted cp-small" }, t.blurb))),
      el("div", { class: "cp-node-f" }, crest(node.faction), el("div", {}, el("b", {}, f.name),
        el("span", { class: `cp-small ${perkLive ? "cp-perk-on" : "muted"}` }, `${f.perk}: ${f.text}${perkLive ? "" : " (Warlord only at this Notoriety)"}`))),
      el("div", { class: "cp-node-stats" },
        el("span", { title: "Payout on a win" }, el("b", { class: "cp-gold" }, `${node.payout} ${SALVAGE}`)),
        el("span", { title: `Threat ${node.threat}/5` }, "Threat ", pips(node.threat, 5, "threat")),
        el("span", { title: "Round limit" }, `${node.maxRounds} rounds`)),
      el("div", { class: "cp-node-enemy" }, node.enemy.map((u) => {
        const c = chassisOf(u.chassis);
        return el("span", { class: `cp-foe ${u.commander ? "cmd" : ""}`, title: `${u.name}: ${c.label} (${c.class})${u.commander ? `\nCommander: ×${u.spMult} SP, best build` : ""}` },
          u.commander ? cicon("crown", "crown") : null, el("span", { class: `swatch sw-${c.name}` }), c.label);
      })),
      node.reinforcements ? el("div", { class: "cp-node-x" }, `⚠ Reinforcements on rounds ${node.reinforcements.map((r) => r.round).join(" & ")}`) : null,
      node.crates ? el("div", { class: "cp-node-x" }, `📦 ${node.crates} salvage crates (+${PRICES.crate} ${SALVAGE} each)`) : null,
      node.extractGoal ? el("div", { class: "cp-node-x" }, `➜ Extract ${node.extractGoal} rig${node.extractGoal > 1 ? "s" : ""} through the enemy edge`) : null,
      onPick ? el("button", { class: "btn primary", onClick: onPick }, node.kind === "boss" ? "Face the Warlord ▸" : "Take contract ▸") : null);
  }

  function map() {
    const run = S.run;
    const now = run.step + 1;
    const hist = (step) => run.history.find((h) => h.step === step);
    const boss = factionById(run.bossFaction);
    const track = el("div", { class: "cp-track" }, Array.from({ length: BOSS_STEP }, (_, i) => {
      const step = i + 1;
      const h = hist(step);
      const state = h ? "done" : step === now ? "now" : "ahead";
      const isBoss = step === BOSS_STEP;
      const tip = h ? `Step ${step}: ${h.kind === "depot" ? "Depot" : `${CONTRACT_TYPES[h.type]?.name} vs ${factionById(h.faction)?.short}`}${h.won == null ? "" : h.won ? "\n✓ Won" : "\n⚠ Lost"}${h.salvage ? ` · +${h.salvage} ${SALVAGE}` : ""}`
        : isBoss ? `Step ${step}: the ${boss?.name} Warlord` : `Step ${step}`;
      return el("div", { class: `cp-step ${state} ${isBoss ? "boss" : ""}`, title: tip },
        el("div", { class: "cp-medal", style: isBoss ? { "--fc": FACTION_COLOR[run.bossFaction] } : null },
          h ? typeIcon(h.type) : isBoss ? cicon("crown") : el("span", {}, step === now ? "!" : "?"),
          h && h.won != null ? el("span", { class: `cp-mark ${h.won ? "w" : "l"}` }, h.won ? "✓" : "✗") : null),
        el("span", { class: "cp-step-l" }, isBoss ? "Boss" : `Step ${step}`));
    }));
    const offers = run.offers.map((n) => nodeCard(run, n, { onPick: () => pickNode(n) }));
    const bossPreview = now < BOSS_STEP ? el("div", { class: "cp-node boss preview", style: { "--fc": FACTION_COLOR[run.bossFaction] } },
      el("div", { class: "cp-node-h" }, cicon("crown"), el("div", {}, el("b", {}, "The Warlord awaits"), el("span", { class: "muted cp-small" }, `Step ${BOSS_STEP}: the boss contract.`))),
      el("div", { class: "cp-node-f" }, crest(run.bossFaction), el("div", {}, el("b", {}, boss?.name), el("span", { class: "cp-small" }, `${boss?.perk}: ${boss?.text}`))),
      el("p", { class: "muted cp-small" }, `Hard-tier build, +50% SP, faction perk, +1 Answer token each round. Pays ${PRICES.bossPayout} ${SALVAGE}. Beat it to earn the ${boss?.short} banner.`)) : null;

    show(el("div", { class: "cp cp-map" },
      runBar(run, { onHq: () => hq() }),
      el("h1", { class: "cp-map-h" }, now >= BOSS_STEP ? "The Warlord" : `Step ${now}: choose your next job`),
      track,
      el("div", { class: "cp-offers" }, offers, bossPreview),
      rosterStrip(run)));
  }

  async function pickNode(node) {
    if (node.kind !== "depot" && !S.run.roster.some((r) => !r.wrecked)) { toast(ERR["no-deployable"](), "bad"); return; }
    loading(node.kind === "depot" ? "Rolling into the depot…" : "Negotiating the contract…");
    const v = await act(() => api.campaign.node(node.id));
    if (!v) return map();
    sfx.servo();
    route();
  }

  // ---- Briefing -------------------------------------------------------------
  function objective(node, run) {
    const R = node.maxRounds;
    const cmd = node.enemy.find((u) => u.commander);
    const cmdName = cmd ? `${cmd.name} (${chassisOf(cmd.chassis).label})` : "the Commander";
    switch (node.type) {
      case "beacons": return `Hold the beacons. The side with more VP after round ${R} wins; kills score too.`;
      case "skirmish": return `Wipe out the enemy squad, or out-kill them by the end of round ${R}.`;
      case "assassinate": return `Wreck the marked Commander, ${cmdName}, before round ${R} ends. It fields ×${cmd?.spMult ?? 1.25} SP and its best build. Nothing else counts.`;
      case "breakthrough": return `Punch through: Extract ${Math.min(node.extractGoal, run.roster.filter((r) => !r.wrecked).length)} rig(s) from the 4" exit band on the enemy's edge before round ${R} ends.`;
      case "laststand": return `Keep at least one rig standing to the end of round ${R}. Enemy reinforcements drop in at the start of rounds ${(node.reinforcements || []).map((r) => r.round).join(" and ")}.`;
      case "salvage": return `${node.crates} crates on the field. End an activation within 2" of one to claim it (+2 VP, +${PRICES.crate} salvage). More VP after round ${R} wins.`;
      case "boss": return `Wreck the Warlord, ${cmdName}, before round ${R} ends. It fields ×${cmd?.spMult ?? 1.5} SP, the faction perk, and an extra Answer token every round.`;
      default: return CONTRACT_TYPES[node.type]?.blurb || "";
    }
  }

  async function briefing() {
    const run = S.run;
    const node = run.contract;
    const f = factionById(node.faction);
    const level = NOTORIETY[run.notoriety];
    const perkLive = node.kind === "boss" || level.factionAlways;
    const t = CONTRACT_TYPES[node.type];
    let deploy = () => { sfx.servo(); onDeploy(run.room); };
    const deployBtn = el("button", { class: "btn big primary cp-deploy", onClick: () => deploy() }, "Deploy ▸");
    show(el("div", { class: `cp cp-brief ${node.kind}` },
      runBar(run, { onHq: () => hq() }),
      el("div", { class: "cp-dossier" },
        el("div", { class: "cp-dossier-h" }, typeIcon(node.type, "lg"),
          el("div", {}, el("span", { class: "cp-small muted" }, `Step ${node.step} · contract dossier`), el("h1", {}, t.name)),
          el("div", { class: "cp-pay" }, el("small", {}, "Payout"), el("b", {}, `${node.payout} ${SALVAGE}`), el("small", {}, `+${PRICES.kill} per kill`))),
        el("div", { class: "cp-orders" }, el("h3", {}, "Orders"), el("p", { class: "cp-type" }, objective(node, run)),
          el("div", { class: "cp-small muted" }, `Round limit ${node.maxRounds} · Threat `, pips(node.threat, 5, "threat"), ` · Enemy pilot: ${level.enemyBot}`)),
        el("div", { class: "cp-brief-cols" },
          el("div", { class: "cp-enemy" },
            el("h3", {}, "Opposition"),
            el("div", { class: "cp-node-f" }, crest(node.faction, "lg"), el("div", {}, el("b", {}, f.name),
              el("span", { class: `cp-small ${perkLive ? "cp-perk-on" : "muted"}` }, `${f.perk}: ${f.text}`),
              el("span", { class: "cp-small muted" }, perkLive ? "Their perk is active in this fight." : "Their perk stays home at this Notoriety (Warlord only)."))),
            el("div", { class: "cp-foes" }, node.enemy.map((u) => {
              const c = chassisOf(u.chassis);
              const mult = u.spMult || 1;
              const kit = [upgradeOf(c.longRange, u.longRangeUpgrade), upgradeOf(c.melee, u.meleeUpgrade)].filter(Boolean);
              return el("div", { class: `cp-foe-row ${u.commander ? "cmd" : ""}` },
                u.commander ? cicon("crown", "crown") : el("span", { class: `swatch big sw-${c.name}` }),
                el("div", {}, el("b", {}, u.name), el("div", { class: "cp-small muted" }, `${c.label} · ${c.class} · ${Math.round(spTotal(c.sp) * mult)} SP${mult > 1 ? ` (×${mult})` : ""}`),
                  el("div", { class: "cp-loadout" }, kit.map((k) => upChip(k.nature, k.name, `${k.name}: ${k.tag}`)),
                    u.equipment ? upChip(null, `⚙ ${EQUIPMENT[u.equipment]?.label}`) : null)));
            })),
            node.reinforcements ? el("div", { class: "cp-node-x" }, "⚠ Reinforcements: ", node.reinforcements.map((r) => `round ${r.round}: ${chassisOf(r.unit.chassis).label}`).join(" · ")) : null),
          el("div", { class: "cp-ours" }, el("h3", {}, "Deploying"),
            el("div", { class: "cp-rigs" }, run.roster.filter((r) => !r.wrecked).map((r) => rigCard(run, r, { compact: true }))),
            run.roster.some((r) => r.wrecked) ? el("p", { class: "cp-small muted" }, `Left behind (wrecked): ${run.roster.filter((r) => r.wrecked).map((r) => r.name).join(", ")}`) : null)),
        el("div", { class: "cp-foot in" }, deployBtn))));
    // A battle that already ended (reload during the finish) goes straight to the debrief.
    try {
      const st = await api.state(run.room, "a");
      if (st.state?.game?.phase === "finished" || st.state?.game?.outcome) {
        deployBtn.textContent = "Battle over: Debrief ▸";
        deploy = () => resolveBattle();
      } else if ((st.state?.game?.round || 1) > 1 || st.state?.game?.turn?.activeRigId) deployBtn.textContent = `Rejoin battle · round ${st.state.game.round} ▸`;
    } catch {}
  }

  async function resolveBattle() {
    loading("Counting the wreckage…");
    const v = await act(() => api.campaign.resolve());
    if (!v) return route();
    animateDebrief = true;
    route();
  }

  // ---- Debrief --------------------------------------------------------------
  const REASON = {
    commander: (w, boss) => (w ? (boss ? "The Warlord is scrap." : "The marked Commander is scrap.") : "They took down our lead."),
    extraction: (w) => (w ? "Your rigs broke through and extracted." : "They slipped through our lines."),
    survived: (w) => (w ? "You held out to the last round." : "They held out to the last round."),
    timeout: (w, boss) => (w ? "They ran out the clock." : boss ? "The Warlord outlasted the round limit." : "The clock ran out before the job was done."),
    stranded: (w) => (w ? "Their squad was stranded." : "No rig left standing to make the extraction."),
    points: (w) => (w ? "More VP at the round limit." : "They held more VP at the round limit."),
    annihilation: (w) => (w ? "The enemy squad is annihilated." : "Your squad was wiped out."),
    draw: () => "Dead even. A draw pays nothing.",
  };

  // Battle SP before field crews: crews healed +1 on `crews` damaged locations.
  function beforeCrews(row, rig) {
    const max = chassisOf(rig.chassis).sp;
    const sp = { ...row.sp };
    if (!row.crews || row.wrecked) return sp;
    let left = row.crews;
    for (const l of LOCS) if (left && sp[l] < max[l]) { sp[l]--; left--; }
    for (const l of LOCS) if (left && sp[l] === max[l]) { sp[l]--; left--; }
    return sp;
  }

  function debrief() {
    const run = S.run;
    const d = run.lastDebrief;
    if (!d) { seenDebrief = runKey(run); return route(); }
    const animate = animateDebrief;
    animateDebrief = false;
    seenDebrief = runKey(run);
    const over = run.status === "over";
    const where = over ? null : "field";
    const price = where ? repairPrice(run, where) : 0;
    const recPrice = where ? (run.freeRecovery ? 0 : recoveryPrice(run, where)) : 0;
    const won = d.won;

    const lines = el("div", { class: "cp-tally" });
    const total = el("b", {}, "0");
    const allLines = d.lines.length ? d.lines : [{ label: won ? "No payout" : "No payout: contract failed", amount: 0 }];
    if (animate) {
      allLines.forEach((l, i) => setTimeout(() => {
        const amt = el("b", {}, "+0");
        lines.append(el("div", { class: "cp-line" }, el("span", {}, l.label), amt));
        countUp(amt, 0, l.amount, 400, (v) => `+${v} ${SALVAGE}`);
        if (l.amount) sfx.score(true); else sfx.bad();
        countUp(total, allLines.slice(0, i).reduce((s, x) => s + x.amount, 0), allLines.slice(0, i + 1).reduce((s, x) => s + x.amount, 0), 400, (v) => `${v} ${SALVAGE}`);
      }, 700 + i * 550));
    } else {
      allLines.forEach((l) => lines.append(el("div", { class: "cp-line" }, el("span", {}, l.label), el("b", {}, `+${l.amount} ${SALVAGE}`))));
      total.textContent = `${d.salvage} ${SALVAGE}`;
    }
    if (animate) setTimeout(() => (won ? sfx.fanfare(true) : sfx.explosion?.(false)), 150);

    const cards = run.roster.map((rig) => {
      const row = d.rigs.find((x) => x.uid === rig.uid);
      const repairs = !over && !rig.wrecked ? {
        onRepair: (loc) => act(() => api.campaign.repair(rig.uid, loc), { ok: () => { sfx.weld?.(); debrief(); } }),
        price, salvage: run.salvage,
      } : null;
      const missing = LOCS.reduce((s, l) => s + chassisOf(rig.chassis).sp[l] - rig.sp[l], 0);
      const badge = row?.extracted ? el("span", { class: "cp-tag good" }, "Extracted")
        : row && !row.wrecked && row.crews ? el("span", { class: "cp-tag good", title: "Field crews: +1 SP per damaged location, free" }, `+${row.crews} crews`)
        : !row ? el("span", { class: "cp-tag" }, "Stayed home") : null;
      const extra = rig.wrecked ? (over ? null : el("button", { class: "btn primary cp-recover", disabled: run.salvage < recPrice, onClick: () => act(() => api.campaign.recover(rig.uid), { ok: () => { sfx.clank?.(); toast(`${rig.name} is back on its feet (half SP).`, "good"); debrief(); } }) },
        `Recover · ${recPrice ? `${recPrice} ${SALVAGE}` : "FREE"}`))
        : repairs && missing ? el("button", { class: "btn cp-repair-all", disabled: run.salvage < price, onClick: () => act(() => api.campaign.repair(rig.uid, "all"), { ok: (v) => { sfx.weld?.(); toast(`Repaired ${v.healed ?? ""} SP on ${rig.name}.`, "good"); debrief(); } }) },
          `Repair all · ${Math.min(missing, Math.floor(run.salvage / price)) * price} ${SALVAGE}`) : null;
      const from = animate && row && !row.wrecked ? beforeCrews(row, rig) : null;
      return rigCard(run, rig, { from, repair: repairs, extra, badge });
    });

    const next = async () => {
      if (run.status === "over") return runOver();
      if (run.status === "reward") return reward();
      loading("Back to the map…");
      await act(() => api.campaign.continue());
      route();
    };

    show(el("div", { class: `cp cp-debrief ${won ? "won" : "lost"}` },
      runBar(run, { onHq: () => hq() }),
      el("div", { class: "cp-db-head" },
        stamp(d.boss ? (won ? "Warlord down" : "Defeat") : won ? "Victory" : "Defeat", `big ${won ? "win" : "loss"} ${animate ? "anim" : ""}`),
        el("div", {}, el("h1", {}, `${CONTRACT_TYPES[d.type]?.name || "Contract"} ${won ? "complete" : "failed"}`),
          el("p", { class: "cp-type" }, (REASON[d.reason] || (() => ""))(won, d.boss)),
          el("div", { class: "cp-strikes" }, "Strikes ", pips(d.strikes, MAX_STRIKES, "strikes"), !won ? el("span", { class: "cp-bad" }, d.over ? " Run over." : " Strike! One more loss ends the run.") : null))),
      el("div", { class: "cp-db-cols" },
        el("section", { class: "cp-sec cp-salvage" }, el("h3", {}, "Salvage"), lines, el("div", { class: "cp-line total" }, el("span", {}, "Total"), total),
          d.kills ? el("p", { class: "cp-small muted" }, `${d.kills} enemy rig${d.kills > 1 ? "s" : ""} wrecked.`) : null),
        el("section", { class: "cp-sec cp-bay" }, el("h3", {}, over ? "Your outfit" : "Repair bay"),
          over ? null : el("p", { class: "cp-small muted" }, `Field crews patched +1 SP per damaged location for free. Repairs here: ${price} ${SALVAGE}/SP (the Depot does 1). Recover a wreck: ${recPrice ? `${recPrice} ${SALVAGE}` : "free (workshop)"}.`),
          el("div", { class: "cp-rigs" }, cards))),
      el("div", { class: "cp-foot" }, el("button", { class: "btn big primary", onClick: next },
        over ? "Run summary ▸" : run.status === "reward" ? "Claim your reward ▸" : "Continue ▸"))));
  }

  // ---- Reward ---------------------------------------------------------------
  function reward() {
    const run = S.run;
    if (!run.reward) return route();
    const free = run.relics.some((id) => relicById(id)?.econ?.freeReroll);
    const cost = free ? 0 : PRICES.reroll;
    const cards = run.reward.cards.map((card, i) => el("button", { class: `cp-card r-${card.rarity}`, style: { "--d": `${i * 180}ms` }, onClick: () => takeCard(card, i) },
      el("div", { class: "cp-card-in" },
        el("div", { class: "cp-face front" }, cardFace(run, card)),
        el("div", { class: "cp-face back" }, el("span", {}, "⚙")))));
    setTimeout(() => run.reward.cards.forEach((_, i) => setTimeout(() => sfx.dice?.(1), i * 180)), 100);

    async function takeCard(card, index) {
      const target = await pickTarget(run, card, "Install");
      if (!target) return;
      const v = await act(() => withProtoCap(run, (t) => api.campaign.reward({ index, target: t }), target));
      if (!v) return;
      sfx.score(true);
      toast(`${card.label} ${card.kind === "salvage" ? "banked" : "installed"}.`, "good");
      route();
    }

    show(el("div", { class: "cp cp-reward" },
      runBar(run, { onHq: () => hq() }),
      el("h1", { class: "cp-map-h" }, "Spoils of war"),
      el("p", { class: "muted cp-type cp-center" }, "Pick one. Upgrades replace what's in the slot; a rig carries at most one Prototype."),
      el("div", { class: "cp-hand" }, cards),
      el("div", { class: "cp-reward-b" },
        el("button", { class: "btn", disabled: run.reward.rerolled || run.salvage < cost, title: run.reward.rerolled ? "Once per reward" : free ? "Lucky Charm: rerolls are free" : `${cost} salvage`, onClick: () => act(() => api.campaign.reward({ reroll: true }), { ok: () => { sfx.dice?.(3); reward(); } }) },
          `🎲 Reroll · ${cost ? `${cost} ${SALVAGE}` : "free"}`),
        el("button", { class: "btn ghost", onClick: () => act(() => api.campaign.reward({ skip: true }), { ok: () => route() }) }, "Skip")),
      rosterStrip(run)));
  }

  // ---- Depot ----------------------------------------------------------------
  function depot() {
    const run = S.run;
    const price = repairPrice(run, "depot");
    const recPrice = run.freeRecovery ? 0 : recoveryPrice(run, "depot");
    const shelf = run.depot.stock.map((item, index) => el("div", { class: `cp-card static r-${item.rarity} ${item.sold ? "sold" : ""}` },
      el("div", { class: "cp-face front" }, cardFace(run, item),
        el("div", { class: "cp-price" }, item.sold ? stamp("Sold", "loss") : el("button", { class: "btn primary", disabled: run.salvage < item.price, onClick: async () => {
          const target = await pickTarget(run, item, "Buy");
          if (!target) return;
          const v = await act(() => withProtoCap(run, (t) => api.campaign.buy(index, t), target));
          if (v) { sfx.score(true); toast(`Bought ${item.label}.`, "good"); depot(); }
        } }, `Buy · ${item.price} ${SALVAGE}`)))));

    const bay = run.roster.map((rig) => {
      const missing = LOCS.reduce((s, l) => s + chassisOf(rig.chassis).sp[l] - rig.sp[l], 0);
      const extra = rig.wrecked
        ? el("button", { class: "btn primary cp-recover", disabled: run.salvage < recPrice, onClick: () => act(() => api.campaign.recover(rig.uid), { ok: () => { sfx.clank?.(); depot(); } }) }, `Recover · ${recPrice ? `${recPrice} ${SALVAGE}` : "FREE"}`)
        : missing ? el("button", { class: "btn cp-repair-all", disabled: run.salvage < price, onClick: () => act(() => api.campaign.repair(rig.uid, "all"), { ok: () => { sfx.weld?.(); depot(); } }) }, `Repair all · ${Math.min(missing, Math.floor(run.salvage / price)) * price} ${SALVAGE}`) : el("span", { class: "cp-tag good" }, "Full SP");
      return rigCard(run, rig, { repair: rig.wrecked ? null : { onRepair: (loc) => act(() => api.campaign.repair(rig.uid, loc), { ok: () => { sfx.weld?.(); depot(); } }), price, salvage: run.salvage }, extra, compact: true });
    });

    const respecRows = run.roster.flatMap((rig) => ["longRange", "melee", "equipment"].map((slot) => {
      const cur = rig[SLOT_KEY[slot]];
      if (!cur) return null;
      const ch = chassisOf(rig.chassis);
      const list = slot === "equipment" ? EQUIPMENT_UPGRADES[rig.equipment] || [] : WEAPON_UPGRADES[ch[slot]] || [];
      const now = list.find((u) => u.id === cur);
      const alts = list.filter((u) => u.id !== cur && run.pools.natures.includes(u.nature));
      return el("div", { class: "cp-respec-row" },
        el("span", { class: `swatch sw-${ch.name}` }),
        el("div", { class: "cp-respec-t" }, el("b", {}, `${rig.name} · ${slotGlyph(slot)} ${slotName(rig, slot)}`), el("span", { class: "cp-small" }, "Now: ", upChip(now?.nature, now?.name || cur, now?.tag))),
        el("div", { class: "cp-respec-alts" }, alts.length ? alts.map((u) => el("button", { class: "btn cp-alt", disabled: run.salvage < PRICES.respec, title: `${u.name}: ${u.tag}${u.catch ? `\n⚠ ${u.catch}` : ""}`, onClick: async () => {
          const v = await act(() => withProtoCap(run, (t) => api.campaign.respec({ uid: rig.uid, slot, upgrade: u.id, ...t }), {}));
          if (v) { sfx.servo(); toast(`${rig.name}: ${u.name} fitted.`, "good"); depot(); }
        } }, natureBadge(u.nature), u.name, el("small", {}, ` ${PRICES.respec} ${SALVAGE}`))) : el("span", { class: "muted cp-small" }, "No other unlocked upgrade for this item.")));
    })).filter(Boolean);

    show(el("div", { class: "cp cp-depot" },
      runBar(run, { onHq: () => hq() }),
      el("header", { class: "cp-depot-h" }, typeIcon("depot", "lg"), el("div", {}, el("h1", {}, "The Depot"), el("p", { class: "muted cp-type" }, "Oil, rivets, and no questions asked. Leaving completes this step."))),
      el("section", { class: "cp-sec" }, el("h2", {}, "Shelves"), shelf.length ? el("div", { class: "cp-shelf" }, shelf) : el("p", { class: "muted" }, "Picked clean. Nothing on the shelves this time.")),
      el("div", { class: "cp-db-cols" },
        el("section", { class: "cp-sec" }, el("h2", {}, "Repair bay"), el("p", { class: "cp-small muted" }, `Depot rates: ${price} ${SALVAGE}/SP · recover a wreck ${recPrice ? `${recPrice} ${SALVAGE}` : "free"}.`), el("div", { class: "cp-rigs" }, bay)),
        el("section", { class: "cp-sec" }, el("h2", {}, "Respec"), el("p", { class: "cp-small muted" }, `Swap an installed upgrade for another of the same item: ${PRICES.respec} ${SALVAGE}.`),
          respecRows.length ? el("div", { class: "cp-respec" }, respecRows) : el("p", { class: "muted" }, "Nothing installed yet."))),
      el("div", { class: "cp-foot" }, el("button", { class: "btn big primary", onClick: async () => { loading("Hitting the road…"); await act(() => api.campaign.continue()); route(); } }, "Leave depot ▸"))));
  }

  // ---- Run over -------------------------------------------------------------
  function runOver() {
    const { profile, last, run } = S;
    if (!last) return hq();
    const won = last.won;
    const earned = last.earned ?? 0;
    const renown = el("b", {}, String(profile.renown - earned));
    const rows = [
      ["Contracts won", last.contractsWon],
      ["Contracts lost", last.contractsLost],
      ["Depots visited", last.depotsVisited],
      ["Enemy rigs wrecked", last.kills],
      ["Salvage earned", last.salvageEarned, SALVAGE],
    ];
    const statEls = rows.map(([label, v, unit]) => { const b = el("b", {}, "0"); return { node: el("div", { class: "cp-line" }, el("span", {}, label), b), b, v, unit }; });
    statEls.forEach((s, i) => setTimeout(() => { countUp(s.b, 0, s.v, 500, (x) => `${x}${s.unit ? ` ${s.unit}` : ""}`); if (s.v) sfx.click(); }, 500 + i * 300));
    const renownAt = 500 + rows.length * 300 + 300;
    setTimeout(() => { countUp(renown, profile.renown - earned, profile.renown, 1200); if (earned) sfx.score(true); }, renownAt);
    const unl = el("div", { class: "cp-unlocked" });
    (last.unlocked || []).forEach((id, i) => setTimeout(() => { unl.append(unlockStamp(id)); sfx.fanfare(true); toast(id.startsWith("banner") ? `Banner earned: ${factionById(id.split(":")[1])?.name}` : `Notoriety ${id.split(":")[1]} unlocked`, "good", 4000); }, renownAt + 1300 + i * 700));
    setTimeout(() => (won ? sfx.fanfare(true) : null), 200);
    const bf = factionById(last.bossFaction);

    show(el("div", { class: `cp cp-over ${won ? "won" : "lost"}` },
      el("div", { class: "cp-over-card" },
        stamp(won ? "Contract chain complete" : last.abandoned ? "Run abandoned" : "Chain broken", `big ${won ? "win" : "loss"} anim`),
        el("p", { class: "cp-type" }, won ? `The ${bf?.name} Warlord is scrap. The outfit's name travels.` : last.reachedBoss ? `You reached the ${bf?.short} Warlord, and it held.` : `The outfit limps home after ${last.steps} step${last.steps === 1 ? "" : "s"}.`),
        el("div", { class: "cp-tally" }, statEls.map((s) => s.node),
          el("div", { class: "cp-line" }, el("span", {}, "Reached the boss"), el("b", {}, last.reachedBoss ? "Yes" : "No"))),
        el("div", { class: "cp-renown big" }, el("span", {}, RENOWN), renown, el("small", {}, `Renown (+${earned} this run)`)),
        unl,
        el("button", { class: "btn big primary", onClick: async () => {
          if (run) await act(() => api.campaign.close());
          renownShown = S.profile.renown;
          hq();
        } }, "Back to HQ ▸"))));
  }

  // ---- boot -----------------------------------------------------------------
  if (!S) {
    loading("Opening the HQ ledger…");
    S = await act(() => api.campaign.get());
    if (!S) { onHome(); return; }
  }
  renownShown = S.profile.renown;
  if (fresh === "debrief" || S.run?.status === "over") route(); else hq();
}
