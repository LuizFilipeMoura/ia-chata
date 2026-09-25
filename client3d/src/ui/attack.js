// Attack picker: an illustrated briefing of the shot before you take it. A
// top-down diagram of the target's arcs with you plotted on it, a range bar
// against the weapon's sweet spot, cover, and one card per option (what it
// does, weapon stats, expected damage, heat).
import { el } from "./dom.js";
import { effectiveWeaponProfile } from "/shared/game-state.js";

const ARC = {
  front: { pen: 0, text: "Front: its toughest armour. No bonus.", col: "#c8412f" },
  side: { pen: 2, text: "Side: +2 Penetration.", col: "#f5b041" },
  rear: { pen: 3, text: "Rear: +3 Penetration. Its weakest spot!", col: "#7fcf6a" },
};
const LOC = {
  hull: "Hull. At 0 the rig loses 2 actions and aims worse.",
  arms: "Arms. At 0 a weapon is torn off.",
  legs: "Legs. At 0 movement is crippled.",
  engine: "Engine. At 0 the rig skips its next activation.",
};
const ICON = {
  fire: `<circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="6"/><path d="M32 6 V18 M32 46 V58 M6 32 H18 M46 32 H58"/>`,
  aimed: `<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="12" stroke-dasharray="4 3"/><circle cx="32" cy="32" r="3" fill="currentColor"/><path d="M32 4 V14 M32 50 V60 M4 32 H14 M50 32 H60"/>`,
  melee: `<path d="M14 50 L44 20 M44 20 L52 12 M38 16 L48 26"/><path d="M18 42 L22 46" /><path d="M10 54 L16 48" opacity=".6"/>`,
};
const svg = (inner, cls = "") => { const d = el("div", { class: cls }); d.innerHTML = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`; return d; };

// Top-down: target in the middle with its three arc wedges, you on the bearing.
function arcDiagram(rig, target, arc) {
  const d = el("div", { class: "atk-map" });
  const f = (target.facing ?? 0) * Math.PI / 180;
  const bearing = Math.atan2(rig.pos.y - target.pos.y, rig.pos.x - target.pos.x);
  const C = 60, R = 50, q = Math.PI / 4;
  const wedge = (a0, a1, col, on) => {
    const p = (a) => `${C + R * Math.cos(f + a)},${C + R * Math.sin(f + a)}`;
    return `<path d="M${C},${C} L${p(a0)} A${R},${R} 0 0 1 ${p(a1)} Z" fill="${col}" fill-opacity="${on ? 0.5 : 0.1}" stroke="${col}" stroke-opacity=".5"/>`;
  };
  const ax = C + 44 * Math.cos(bearing), ay = C + 44 * Math.sin(bearing);
  d.innerHTML = `<svg viewBox="0 0 120 120">
    ${wedge(-q, q, ARC.front.col, arc === "front")}
    ${wedge(q, 3 * q, ARC.side.col, arc === "side")}${wedge(-3 * q, -q, ARC.side.col, arc === "side")}
    ${wedge(3 * q, 5 * q, ARC.rear.col, arc === "rear")}
    <circle cx="${C}" cy="${C}" r="8" fill="#2a241a" stroke="#e9dcc0" stroke-width="2"/>
    <path d="M${C},${C} L${C + 15 * Math.cos(f)},${C + 15 * Math.sin(f)}" stroke="#e9dcc0" stroke-width="3"/>
    <line x1="${ax}" y1="${ay}" x2="${C}" y2="${C}" stroke="#5fd3c0" stroke-width="2" stroke-dasharray="4 3"/>
    <circle cx="${ax}" cy="${ay}" r="6" fill="#5fd3c0"/>
  </svg>`;
  return d;
}

// Range: a ruler from you to max range with the sweet spot marked.
function rangeArt(profile, distance, melee) {
  const d = el("div", { class: "atk-map" });
  if (melee) { d.innerHTML = `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="34" fill="#f5b041" fill-opacity=".15" stroke="#f5b041" stroke-dasharray="5 4"/><circle cx="48" cy="60" r="9" fill="#5fd3c0"/><circle cx="74" cy="60" r="9" fill="#2a241a" stroke="#e9dcc0" stroke-width="2"/></svg>`; return d; }
  const max = profile?.maxRange || 24, sweet = profile?.sweet || max / 2, min = profile?.minRange || 0;
  const x = (v) => 10 + Math.min(1, v / max) * 100;
  d.innerHTML = `<svg viewBox="0 0 120 120">
    <rect x="10" y="52" width="100" height="16" rx="3" fill="#2a241a" stroke="#6a5634"/>
    ${min ? `<rect x="10" y="52" width="${x(min) - 10}" height="16" fill="#c8412f" fill-opacity=".4"/>` : ""}
    <rect x="${x(sweet) - 8}" y="52" width="16" height="16" fill="#7fcf6a" fill-opacity=".55"/>
    <path d="M${x(distance)},40 L${x(distance) - 6},30 L${x(distance) + 6},30 Z" fill="#5fd3c0"/>
    <line x1="${x(distance)}" y1="40" x2="${x(distance)}" y2="72" stroke="#5fd3c0" stroke-width="2.5"/>
    <text x="10" y="90" fill="#a8997a" font-size="11">0"</text><text x="110" y="90" fill="#a8997a" font-size="11" text-anchor="end">${max}"</text>
  </svg>`;
  return d;
}

function coverArt(cover) {
  const d = el("div", { class: "atk-map" });
  const walls = cover ? (cover === 2 ? `<rect x="50" y="34" width="12" height="52" fill="#8a7550"/><rect x="66" y="40" width="10" height="40" fill="#8a7550"/>` : `<rect x="56" y="48" width="12" height="26" fill="#8a7550"/>`) : "";
  d.innerHTML = `<svg viewBox="0 0 120 120"><line x1="18" y1="60" x2="100" y2="60" stroke="#5fd3c0" stroke-width="2" stroke-dasharray="4 3"/>${walls}<circle cx="18" cy="60" r="7" fill="#5fd3c0"/><circle cx="100" cy="60" r="8" fill="#2a241a" stroke="#e9dcc0" stroke-width="2"/></svg>`;
  return d;
}

const tile = (art, label, value, col, meaning) => el("div", { class: "atk-tile", style: { borderColor: col } },
  art, el("div", { class: "atk-k" }, label), el("b", { class: "atk-v", style: { color: col } }, value), el("div", { class: "atk-mean" }, meaning));

const D12 = { hull: "1-4 (33%)", arms: "5-7 (25%)", legs: "8-10 (25%)", engine: "11-12 (17%)" };
const PART_NAME = { hull: "Hull", arms: "Arms", legs: "Legs", engine: "Engine" };

// Side-on rig schematic with the four parts; `on` highlights one.
function rigSchematic(target, on) {
  const d = el("div", { class: "atk-rig" });
  const f = (l) => { const sp = target[l]?.sp ?? 0, max = target[l]?.max || 1, x = sp / max; return x <= 0 ? "#5a2a20" : x < 0.35 ? "#c8412f" : x < 0.7 ? "#f5b041" : "#6f8f55"; };
  const st = (l) => `fill="${f(l)}" stroke="${on === l ? "#5fd3c0" : "#1b150c"}" stroke-width="${on === l ? 4 : 2}"`;
  d.innerHTML = `<svg viewBox="0 0 120 150">
    <rect x="40" y="96" width="14" height="46" rx="3" ${st("legs")}/><rect x="66" y="96" width="14" height="46" rx="3" ${st("legs")}/>
    <rect x="14" y="40" width="16" height="50" rx="4" ${st("arms")}/><rect x="90" y="40" width="16" height="50" rx="4" ${st("arms")}/>
    <rect x="32" y="30" width="56" height="64" rx="8" ${st("hull")}/>
    <rect x="46" y="8" width="28" height="22" rx="4" ${st("engine")}/>
  </svg>`;
  return d;
}

// Aimed Shot: pick the spot. Same dice, -2 Aim, no location roll.
function aimedPicker(target, rows, onPick) {
  const byLoc = Object.fromEntries(rows.map((r) => [r.c.location, r]));
  const best = rows[0].c.location;
  const pic = el("div", { class: "atk-aimpic" }, rigSchematic(target, best),
    el("div", { class: "atk-mean" }, "Colour = its current state: green healthy, amber hurt, red critical."));
  const opts = ["hull", "arms", "legs", "engine"].filter((l) => byLoc[l]).map((l) => {
    const r = byLoc[l], sp = target[l]?.sp ?? 0, max = target[l]?.max ?? 0;
    const breaks = sp > 0 && r.ed >= sp;
    return el("button", { class: `atk-loc ${l === best ? "best" : ""} ${sp <= 0 ? "broken" : ""}`, onClick: () => onPick(r.c),
      onMouseenter: () => pic.replaceChild(rigSchematic(target, l), pic.firstChild) },
      el("div", { class: "atk-title" }, PART_NAME[l],
        breaks ? el("span", { class: "atk-break" }, "💥 BREAKS IT") : null,
        l === best ? el("span", { class: "atk-pick" }, "💡 Advisor pick") : null),
      el("div", { class: "atk-lsp" }, el("div", { class: "bar" }, el("i", { style: { width: `${max ? (sp / max) * 100 : 0}%` } })), `${sp}/${max} SP`),
      el("div", { class: "atk-what" }, sp <= 0 ? `Already broken. ${LOC[l].split(". ")[0]} again: ${l === "hull" || l === "engine" ? "DESTROYS the rig." : "damage spills to the Hull."}` : `At 0: ${LOC[l].split("At 0 ")[1] || LOC[l]}`),
      el("div", { class: "atk-ed small" }, el("b", {}, `≈${r.ed.toFixed(1)}`), el("span", {}, "SP expected")));
  });
  return el("div", { class: "atk-aim" }, pic, el("div", { class: "atk-locs" }, opts));
}

// rows: [{ c: candidate, ed: expected SP, name: weapon name }], best first.
export function attackBriefing(rig, target, rows, onPick) {
  const first = rows[0].c;
  const arc = ARC[first.arc] || ARC.front;
  const lr = effectiveWeaponProfile("longRange", rig.weapons.longRange, rig);
  const melee = rows.every((r) => r.c.weapon === "melee");
  const sweet = lr?.sweet || 12, off = Math.abs(first.distance - sweet);
  const tiles = el("div", { class: "atk-tiles" },
    tile(arcDiagram(rig, target, first.arc), "Striking its", `${first.arc} arc`, arc.col, arc.text),
    tile(rangeArt(lr, first.distance, melee), "Range", melee ? "In reach" : `${first.distance.toFixed(1)}"`, melee || off < 2 ? "#7fcf6a" : "#f5b041",
      melee ? "Blades ignore range and line of sight." : off < 2 ? `Sweet spot (best at ${sweet}"): full accuracy.` : `Best at ${sweet}". Off the sweet spot, aim suffers.`),
    tile(coverArt(first.cover), "Cover", first.cover ? (first.cover === 2 ? "Heavy" : "Light") : "None", first.cover ? "#f5b041" : "#7fcf6a",
      first.cover ? "Terrain in the way: harder to hit." : "Clean line of fire."));
  const aimed = rows.filter((r) => r.c.action === "aimed"), plain = rows.filter((r) => r.c.action !== "aimed");
  const cards = plain.map((r, i) => {
    const melee = r.c.weapon === "melee";
    const p = effectiveWeaponProfile(melee ? "melee" : "longRange", r.name, rig) || {};
    const kind = melee ? "melee" : r.c.action === "aimed" ? "aimed" : "fire";
    const title = kind === "aimed" ? `Aimed Shot at the ${r.c.location}` : melee ? `Strike with ${r.name}` : `Fire ${r.name}`;
    const what = melee ? "Swing the melee weapon. Locks you both in melee afterwards. Each hit rolls a D12 for where it lands." : "Full volley. Each hit rolls a D12 for where it lands: Hull 1-4, Arms 5-7, Legs 8-10, Engine 11-12.";
    return el("button", { class: `atk-card ${i === 0 ? "best" : ""}`, onClick: () => onPick(r.c) },
      svg(ICON[kind], "atk-ic"),
      el("div", { class: "atk-body" },
        el("div", { class: "atk-title" }, title, i === 0 ? el("span", { class: "atk-pick" }, "💡 Advisor pick") : null),
        el("div", { class: "atk-what" }, what),
        el("div", { class: "atk-stats" },
          el("span", { title: "Shots: dice rolled to hit" }, el("i", {}, "Shots"), String(p.rof ?? "?")),
          el("span", { title: "Penetration: how easily a hit wounds" }, el("i", {}, "Pen"), `${p.pen ?? "?"}${arc.pen ? ` +${arc.pen}` : ""}`),
          el("span", { title: "Damage per wound" }, el("i", {}, "Dmg"), String(p.dmg ?? "?")),
          el("span", { title: "Heat added to the boiler" }, el("i", {}, "Heat"), "1🔥"))),
      el("div", { class: "atk-ed" }, el("b", {}, `≈${r.ed.toFixed(1)}`), el("span", {}, "SP expected")));
  });
  return el("div", { class: "atk" },
    el("h4", { class: "atk-sec" }, "The situation"), tiles,
    cards.length ? el("h4", { class: "atk-sec" }, "Choose your attack") : null, cards.length ? el("div", { class: "atk-cards" }, cards) : null,
    aimed.length ? el("h4", { class: "atk-sec" }, "Aimed Shot: choose where it hits") : null,
    aimed.length ? el("p", { class: "atk-lead" }, `Same ${effectiveWeaponProfile("longRange", rig.weapons.longRange, rig)?.rof ?? ""} dice as a normal volley, but −2 Aim (fewer hits land). In exchange there's no D12 roll: every hit goes where you choose. Worth it to finish a weak part.`) : null,
    aimed.length ? aimedPicker(target, aimed, onPick) : null);
}
