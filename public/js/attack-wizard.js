import { S } from "./state.js";
import { sendCommand } from "./api.js";
import { WEAPONS } from "/shared/game-state.js";

// Collect the physical facts the app can't see (target, weapon, arc, range,
// cover, fire-mode), then post a fire/aimed/ram action. In auto mode the server
// rolls; in manual mode we ask for the dice after confirming the shot.
let scrim = null;

// Small glyphs so each control in the drawer reads at a glance (§ UI polish).
const FIELD_ICONS = { target: "🎯", weapon: "⚔️", arc: "🧭", range: "📏", cover: "🧱", location: "◎" };
// Per-option glyphs on the segmented buttons themselves.
const ARC_ICONS = { front: "⬆️", side: "↔️", rear: "⬇️" };
const RANGE_ICONS = { near: "📍", far: "🔭", out: "🚫" };
const COVER_ICONS = { "0": "○", "1": "◐", "2": "●" };
const LOC_ICONS = { hull: "🛡️", arms: "🦾", legs: "🦿", engine: "🔩" };
// One-line hint under each control label, describing the control in general.
const FIELD_DESC = {
  target: "The enemy Rig you're attacking",
  weapon: "Ranged reloads between shots; melee strikes within 1.5\"",
  arc: "Which of the target's facings you strike",
  range: "How far the target sits from you",
  cover: "Obstruction shielding the target",
  location: "Component to hit — an Aimed Shot takes −2 ACC",
};
// Per-option descriptions, shown under each button's label.
const ARC_DESC = { front: "No STR bonus", side: "+2 STR", rear: "+4 STR" };
const RANGE_DESC = { near: "Close band", far: "Far band", out: "Out of range" };
const COVER_DESC = { "0": "No cover", "1": "−1 ACC", "2": "−2 ACC" };
const LOC_DESC = { hull: "−2 actions at 0", arms: "Weapons at 0", legs: "Slows at 0", engine: "Heat at 0" };

function profileOf(rig, weaponSlot) {
  const name = rig.weapons?.[weaponSlot];
  return WEAPONS[weaponSlot]?.[name] || null;
}

function actionsLeft() {
  const t = S.game?.turn;
  return t ? Math.max(0, t.actionsMax - t.actionsUsed) : 0;
}

export function openAttackWizard(rig, mode) {
  close();
  const enemies = S.rigs.filter((r) => (r.owner || "a") !== (rig.owner || "a") && !r.destroyed);
  if (!enemies.length) return;

  const state = {
    mode, target: enemies[0].name,
    weapon: "longRange", arc: "front", range: "near", cover: 0, loc: "hull",
    fullAuto: false, charged: false,
  };

  scrim = document.createElement("div");
  scrim.className = "aw-scrim";
  const card = document.createElement("div");
  card.className = "aw-card";
  card.innerHTML = `<div class="aw-title">${mode === "ram" ? "💥 Ram" : mode === "aimed" ? "◎ Aimed Shot" : "🎯 Fire Weapon"} — ${rig.name}</div>`;
  const targetDesc = (name) => {
    const e = enemies.find((x) => x.name === name);
    return e ? e.weightClass.charAt(0).toUpperCase() + e.weightClass.slice(1) : "";
  };
  const weaponDesc = (opt) => {
    const slot = opt === rig.weapons.melee ? "melee" : "longRange";
    const p = WEAPONS[slot]?.[opt];
    if (!p) return "";
    return slot === "melee" ? `Reach ${p.rng[0]}" · ROF ${p.rof}` : `RNG ${p.rng[0]}–${p.rng[1]}" · ROF ${p.rof}`;
  };
  card.appendChild(field("Target", enemies.map((e) => e.name), state.target, (v) => (state.target = v), FIELD_ICONS.target, () => "🤖", FIELD_DESC.target, targetDesc));

  let rangeInfo = null;
  let arcField = null;
  let rangeField = null;
  if (mode !== "ram") {
    card.appendChild(field("Weapon", [rig.weapons.longRange, rig.weapons.melee], rig.weapons.longRange,
      (v) => { state.weapon = v === rig.weapons.melee ? "melee" : "longRange"; syncWeaponFields(); update(); }, FIELD_ICONS.weapon,
      (opt) => (opt === rig.weapons.melee ? "🗡️" : "🎯"), FIELD_DESC.weapon, weaponDesc));
    arcField = field("Arc", ["front", "side", "rear"], state.arc, (v) => (state.arc = v), FIELD_ICONS.arc, ARC_ICONS, FIELD_DESC.arc, ARC_DESC);
    rangeField = field("Range", ["near", "far", "out"], state.range, (v) => { state.range = v; update(); }, FIELD_ICONS.range, RANGE_ICONS, FIELD_DESC.range, RANGE_DESC);
    card.appendChild(arcField);
    card.appendChild(rangeField);
    card.appendChild(field("Cover", ["0", "1", "2"], "0", (v) => (state.cover = Number(v)), FIELD_ICONS.cover, COVER_ICONS, FIELD_DESC.cover, COVER_DESC));
    if (mode === "aimed") card.appendChild(field("Location", ["hull", "arms", "legs", "engine"], state.loc, (v) => (state.loc = v), FIELD_ICONS.location, LOC_ICONS, FIELD_DESC.location, LOC_DESC));

    // Effective-range readout — updated as the weapon / range selection changes.
    rangeInfo = document.createElement("div");
    rangeInfo.className = "aw-range";
    card.appendChild(rangeInfo);
  }

  // Melee strikes within reach — arc facings and range bands don't apply, so we
  // hide those controls (and force a valid in-reach range) when melee is chosen.
  function syncWeaponFields() {
    const isMelee = state.weapon === "melee";
    if (arcField) arcField.hidden = isMelee;
    if (rangeField) rangeField.hidden = isMelee;
    if (isMelee && state.range === "out") state.range = "near";
  }
  syncWeaponFields();

  const go = document.createElement("button");
  go.className = "aw-go";
  go.addEventListener("click", () => submit(rig, state));
  card.appendChild(go);

  // Reflect the weapon's real ranges + the action cost (rushed reload = 2) into
  // the readout and the Fire button, and block plainly-invalid shots.
  function update() {
    if (mode === "ram") { go.textContent = "Ram"; return; }
    const slot = state.weapon;
    const profile = profileOf(rig, slot);
    const isMelee = slot === "melee";
    const spent = slot === "longRange" && rig.loaded?.longRange === false;
    const cost = spent ? 2 : 1;
    const left = actionsLeft();
    const outOfRange = state.range === "out";

    if (rangeInfo) {
      if (isMelee) {
        const reach = profile?.rng?.[0] ?? 1.5;
        rangeInfo.innerHTML = `<span class="aw-range-ic">📏</span>Reach <b>${reach}"</b> · melee never needs reloading`;
        rangeInfo.dataset.state = outOfRange ? "bad" : "ok";
      } else if (profile) {
        const [near, far] = profile.rng;
        rangeInfo.innerHTML =
          `<span class="aw-range-ic">📏</span>Effective range — Near <b>≤${near}"</b> · Far <b>≤${far}"</b> · beyond ${far}" is out` +
          (outOfRange ? `<span class="aw-range-warn">Target is out of range — this shot will fail</span>`
                      : spent ? `<span class="aw-range-note">Weapon spent — a rushed reload folds into this shot (2 actions)</span>` : "");
        rangeInfo.dataset.state = outOfRange ? "bad" : spent ? "warn" : "ok";
      }
    }

    const unaffordable = cost > left;
    go.disabled = outOfRange || unaffordable;
    const costTag = cost === 2 ? " · 2 actions" : "";
    go.textContent = outOfRange ? "Out of range"
      : unaffordable ? `Need ${cost} actions (${left} left)`
      : `Fire${costTag}`;
  }
  update();

  scrim.appendChild(card);
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);
  void scrim.offsetWidth;
  scrim.classList.add("show");
}

async function submit(rig, s) {
  const attrs = { name: rig.name, action: s.mode, target: s.target };
  if (s.mode !== "ram") {
    Object.assign(attrs, { weapon: s.weapon, arc: s.arc, range: s.range, cover: s.cover });
    if (s.mode === "aimed") attrs.loc = s.loc;
  }
  if (S.game.autoResolve === false) {
    const { promptDice } = await import("./roll-dialog.js");
    const target = S.rigs.find((r) => r.name === s.target);
    if (s.mode === "ram") {
      const d = await promptDice([
        { key: "sl", label: "Self location", sides: 12 }, { key: "si", label: "Self impact", sides: 6 },
        { key: "tl", label: "Target location", sides: 12 }, { key: "ti", label: "Target impact", sides: 6 },
      ], "Ram dice");
      attrs.dice = { self: { location: d.sl, impact: d.si }, target: { location: d.tl, impact: d.ti } };
    } else {
      const profile = rig.weapons[s.weapon === "melee" ? "melee" : "longRange"];
      const rof = ({ "Mini Gun": 8, "Double MG": 8, "Autocannon": 4, "Arc Gun": 2, "Mortar": 3, "Sniper Cannon": 1, Sword: 2, "Circular Saw": 3, Chainsaw: 3, Claw: 2, Lance: 1, "Wrecking Ball": 1 })[profile] || 1;
      const specs = [];
      for (let i = 0; i < rof; i++) specs.push({ key: `h${i}`, label: `Hit die ${i + 1}`, sides: 6 });
      if (s.mode !== "aimed") specs.push({ key: "loc", label: "Location", sides: 12 });
      const d = await promptDice(specs, `${profile} dice`);
      const toHit = []; for (let i = 0; i < rof; i++) toHit.push(d[`h${i}`]);
      attrs.dice = { toHit };
      if (d.loc) attrs.dice.location = d.loc;
      // Impact dice are entered on demand only when hits land; for manual play we
      // supply a generous impacts array using the same hit dice count as an upper bound.
      attrs.dice.impacts = toHit.map(() => undefined);
    }
  }
  sendCommand("action", attrs);
  close();
}

function field(label, options, selected, onChange, icon, optIcon, desc, optDesc) {
  const iconFor = (opt) => (typeof optIcon === "function" ? optIcon(opt) : optIcon?.[opt]) || "";
  const descFor = (opt) => (typeof optDesc === "function" ? optDesc(opt) : optDesc?.[opt]) || "";
  const wrap = document.createElement("div");
  wrap.className = "aw-field";
  const l = document.createElement("label");
  l.innerHTML = `${icon ? `<span class="aw-field-ic">${icon}</span>` : ""}${label}`;
  wrap.appendChild(l);
  if (desc) {
    const d = document.createElement("p");
    d.className = "aw-field-desc";
    d.textContent = desc;
    wrap.appendChild(d);
  }
  const seg = document.createElement("div");
  seg.className = "aw-seg";
  for (const opt of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "aw-opt" + (opt === selected ? " sel" : "");
    const ic = iconFor(opt);
    const od = descFor(opt);
    b.innerHTML =
      (ic ? `<span class="aw-opt-ic" aria-hidden="true">${ic}</span>` : "") +
      `<span class="aw-opt-label">${opt}</span>` +
      (od ? `<span class="aw-opt-desc">${od}</span>` : "");
    b.addEventListener("click", () => {
      seg.querySelectorAll(".aw-opt").forEach((x) => x.classList.remove("sel"));
      b.classList.add("sel");
      onChange(opt);
    });
    seg.appendChild(b);
  }
  wrap.appendChild(seg);
  return wrap;
}

function close() {
  if (!scrim) return;
  const el = scrim;
  scrim = null;
  el.classList.remove("show");
  setTimeout(() => el.remove(), 250);
}
