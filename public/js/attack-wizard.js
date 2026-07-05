import { S } from "./state.js";
import { sendCommand } from "./api.js";

// Collect the physical facts the app can't see (target, weapon, arc, range,
// cover, fire-mode), then post a fire/aimed/ram action. In auto mode the server
// rolls; in manual mode we ask for the dice after confirming the shot.
let scrim = null;

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
  card.innerHTML = `<div class="aw-title">${mode === "ram" ? "Ram" : mode === "aimed" ? "Aimed Shot" : "Fire Weapon"} — ${rig.name}</div>`;
  card.appendChild(field("Target", enemies.map((e) => e.name), state.target, (v) => (state.target = v)));
  if (mode !== "ram") {
    card.appendChild(field("Weapon", [rig.weapons.longRange, rig.weapons.melee], rig.weapons.longRange,
      (v) => (state.weapon = v === rig.weapons.melee ? "melee" : "longRange")));
    card.appendChild(field("Arc", ["front", "side", "rear"], state.arc, (v) => (state.arc = v)));
    card.appendChild(field("Range", ["near", "far", "out"], state.range, (v) => (state.range = v)));
    card.appendChild(field("Cover", ["0", "1", "2"], "0", (v) => (state.cover = Number(v))));
    if (mode === "aimed") card.appendChild(field("Location", ["hull", "arms", "legs", "engine"], state.loc, (v) => (state.loc = v)));
  }

  const go = document.createElement("button");
  go.className = "aw-go";
  go.textContent = mode === "ram" ? "Ram" : "Fire";
  go.addEventListener("click", () => submit(rig, state));
  card.appendChild(go);
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

function field(label, options, selected, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "aw-field";
  const l = document.createElement("label");
  l.textContent = label;
  wrap.appendChild(l);
  const seg = document.createElement("div");
  seg.className = "aw-seg";
  for (const opt of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "aw-opt" + (opt === selected ? " sel" : "");
    b.textContent = opt;
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
