// Combat log, Baldur's Gate 3 style: one readable line per event (newest at the
// bottom, a divider per round), rig names coloured by side, and a hover card
// with the full roll breakdown the engine recorded (to-hit target and the terms
// that built it, every die, location, wound roll, damage riders, side effects).
import { el, fill } from "./dom.js";
import { openInspector } from "./inspector.js";
import { icon, STAT_ICON } from "./icons.js";

// name -> rig (plus optional loadout) for the ledger's clickable stats. The live
// match / replay registers one; examples pass their own.
let rigSource = () => null;
export function setRigSource(fn) { rigSource = fn || (() => null); }

const LOC = { hull: "Hull", arms: "Arms", legs: "Legs", engine: "Engine" };
const ICON = { attack: "⚔", overheat: "🔥", destruction: "💥", initiative: "⚑", reaction: "🛡", prepare: "🛡", repair: "🔧", reload: "🔄", equipment: "⚙", blast: "💥", perk: "✦", lock: "📡", barrage: "💣", emplace: "⚓", shutdown: "❄" };
const signed = (v) => (v > 0 ? `+${v}` : `${v}`);

export class CombatLog {
  constructor(parent, { side = "a", nameSide = () => null } = {}) {
    this.side = side; this.nameSide = nameSide;
    this.root = el("div", { class: "clog" });
    this.head = el("div", { class: "clog-h" }, "Combat log");
    this.list = el("div", { class: "clog-list" });
    this.card = el("div", { class: "clog-card" });
    this.root.append(this.head, this.list);
    parent.append(this.root);
    document.body.append(this.card);
    this.round = null;
    this.onKey = (e) => { if (e.key === "Escape" && this.pinned) this.unpin(); };
    document.addEventListener("keydown", this.onKey);
  }

  unpin() {
    this.pinned?.classList.remove("pinned");
    this.pinned = null;
    this.card.classList.remove("pinned");
    this.card.style.display = "none";
  }

  // A rig name, coloured by its side.
  who(name) {
    const s = this.nameSide(name);
    return el("b", { class: s === "a" ? "c-a" : s === "b" ? "c-b" : "" }, name);
  }

  add(l, round) {
    if (round != null && round !== this.round) {
      this.round = round;
      this.list.append(el("div", { class: "clog-round" }, `Round ${round}`));
    }
    const line = el("div", { class: `clog-line k-${l.kind}` }, el("span", { class: "ic" }, ICON[l.kind] || "•"), this.text(l));
    line.title = ""; // no native tip; our card is the tip
    line.addEventListener("mouseenter", (e) => { if (!this.pinned) this.show(l, e); });
    line.addEventListener("mousemove", (e) => { if (!this.pinned) this.place(e); });
    line.addEventListener("mouseleave", () => { if (!this.pinned) this.card.style.display = "none"; });
    // Click: lock this entry's card open to study it (click again / ✕ / Esc to release).
    line.addEventListener("click", (e) => {
      if (this.pinned === line) return this.unpin();
      this.unpin();
      this.show(l, e);
      this.pinned = line;
      line.classList.add("pinned");
      this.card.classList.add("pinned");
      this.card.prepend(el("div", { class: "cc-pin" }, "📌 Pinned", el("button", { class: "cc-x", title: "Release (Esc)", onClick: () => this.unpin() }, "✕")));
      const r = this.root.getBoundingClientRect(), c = this.card.getBoundingClientRect();
      this.card.style.left = `${Math.max(8, r.left - c.width - 12)}px`;
      this.card.style.top = `${Math.max(8, Math.min(innerHeight - c.height - 8, r.bottom - c.height))}px`;
    });
    const stick = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 30;
    this.list.append(line);
    while (this.list.children.length > 200) this.list.firstChild.remove();
    if (stick) this.list.scrollTop = this.list.scrollHeight;
  }

  text(l) {
    const b = l.breakdown;
    if (l.kind === "attack" && b) {
      const hit = b.steps?.find((s) => s.kind === "hit");
      const hits = hit?.dice?.filter((d) => d.ok).length ?? 0;
      if (!b.sp) return el("span", {}, this.who(b.actor), hits ? " struck " : " missed ", this.who(b.target), el("span", { class: "muted" }, ` with ${b.weapon}`), hits ? el("span", { class: "muted" }, ": no damage") : null);
      return el("span", {}, this.who(b.actor), " hit ", this.who(b.target), el("span", { class: "muted" }, ` with ${b.weapon}: `), el("b", { class: "dmg" }, icon("dmg"), `${b.sp} damage`), el("span", { class: "muted" }, ` to ${LOC[b.location] || b.location}`));
    }
    if (l.kind === "overheat") {
      const m = /^(.*?):\s*(.*?)\s*\(/.exec(l.summary || "");
      return m ? el("span", {}, this.who(m[1]), /Nothing happens/.test(m[2]) ? el("span", { class: "muted" }, " overheated but held together") : [" overheated: ", el("b", { class: "bad" }, m[2])]) : l.summary;
    }
    if (l.kind === "initiative") {
      const m = /(\b[ab]\b) (?:activates )?first/.exec(l.summary || "");
      return m ? el("span", {}, `${m[1] === this.side ? "You act" : "The enemy acts"} first this round`, el("span", { class: "muted" }, ` (${(l.summary.match(/\(([^)]*)\)/) || [])[1] || "initiative"})`)) : l.summary;
    }
    if (l.kind === "destruction") return el("span", { class: "bad" }, l.summary);
    return el("span", {}, l.summary || l.kind);
  }

  // ---- Hover card ----
  show(l, e) {
    fill(this.card, breakdownBody(l));
    this.card.style.display = "block";
    this.place(e);
  }

  place(e) {
    const r = this.card.getBoundingClientRect();
    const x = Math.max(8, Math.min(window.innerWidth - r.width - 8, e.clientX - r.width - 16));
    const y = Math.max(8, Math.min(window.innerHeight - r.height - 8, e.clientY - r.height / 2));
    this.card.style.left = `${x}px`; this.card.style.top = `${y}px`;
  }

  destroy() { document.removeEventListener("keydown", this.onKey); this.root.remove(); this.card.remove(); }
}

// The hover card's content for one log entry, laid out as the four rolls of
// an attack. Each roll says which die, the number to meet ("NEED 9+") and
// WHY (the sum that built it), then shows every die as its own shape, marked
// pass/fail, and the outcome. Shared with the Training Grounds examples.
const ARC_PEN = { front: 0, side: 2, rear: 3 };
const LOC_D12 = { hull: "1-4", arms: "5-7", legs: "8-10", engine: "11-12" };
const die = (sides, value, ok) => el("span", { class: `die d${sides} ${ok ? "ok" : "no"}`, title: `D${sides} rolled ${value}: ${ok ? "success" : "fail"}` }, el("b", {}, String(value)), el("i", {}, ok ? "✓" : "✗"));
const roll = (icon, name, sides, need, why, dice, out, good) => el("div", { class: "rl" },
  el("div", { class: "rl-h" }, el("span", { class: "rl-ic" }, icon), el("b", {}, name),
    sides ? el("span", { class: `rl-die d${sides}` }, `D${sides}`) : null,
    need != null ? el("span", { class: "rl-need", title: "Each die must roll this or higher" }, `NEED ${need}+`) : null,
    el("span", { class: `rl-out ${good ? "good" : "bad"}` }, out)),
  why ? el("div", { class: "rl-why" }, why) : null,
  dice?.length ? el("div", { class: "rl-dice" }, dice) : null);

// Mini top-down of the target: its three arcs, the struck one lit with its bonus.
function arcMini(arc) {
  const d = el("div", { class: "rl-arc", title: `Struck its ${arc} arc: ${arc === "rear" ? "+3" : arc === "side" ? "+2" : "+0"} Penetration` });
  const C = 34, R = 30, q = Math.PI / 4, f = -Math.PI / 2; // facing up
  const w = (a0, a1, col, on) => { const p = (a) => `${C + R * Math.cos(f + a)},${C + R * Math.sin(f + a)}`; return `<path d="M${C},${C} L${p(a0)} A${R},${R} 0 0 1 ${p(a1)} Z" fill="${col}" fill-opacity="${on ? 0.6 : 0.12}" stroke="${col}" stroke-opacity=".6"/>`; };
  const lab = (a, t, on) => `<text x="${C + 20 * Math.cos(f + a)}" y="${C + 20 * Math.sin(f + a) + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="${on ? "#fff" : "#a8997a"}">${t}</text>`;
  d.innerHTML = `<svg viewBox="0 0 68 68">${w(-q, q, "#c8412f", arc === "front")}${w(q, 3 * q, "#f5b041", arc === "side")}${w(-3 * q, -q, "#f5b041", arc === "side")}${w(3 * q, 5 * q, "#7fcf6a", arc === "rear")}
    <circle cx="${C}" cy="${C}" r="6" fill="#2a241a" stroke="#e9dcc0" stroke-width="1.5"/><path d="M${C},${C} V${C - 11}" stroke="#e9dcc0" stroke-width="2"/>
    ${lab(0, "+0", arc === "front")}${lab(Math.PI / 2, "+2", arc === "side")}${lab(Math.PI, "+3", arc === "rear")}</svg>`;
  return el("div", { class: "rl-arcbox" }, d, el("div", {}, el("b", {}, `${arc} arc`), el("div", { class: "muted" }, "facing ↑")));
}

// A stat that opens the rig it belongs to.
function statChip(label, value, rigName, find, tip) {
  const open = () => { const hit = find(rigName); if (hit) openInspector(hit.rig || hit, { loadout: hit.loadout }); };
  return el("button", { class: "rl-chip", title: `${tip}\nClick: open ${rigName}'s sheet`, onClick: open }, STAT_ICON[label] ? icon(STAT_ICON[label]) : null, `${label} ${value}`);
}

export function breakdownBody(l, find = rigSource) {
  const b = l.breakdown;
  let body;
  if (l.kind === "attack" && b) {
    body = [el("div", { class: "cc-title" }, `${b.actor} → ${b.target}`, el("span", { class: "muted" }, ` · ${b.weapon}`))];
    for (const s of b.steps || []) {
      if (s.kind === "hit") {
        const base = s.terms?.find((t) => t.label === "base aim")?.value ?? s.target;
        const mods = (s.terms || []).filter((t) => t.label !== "base aim" && t.value);
        const why = el("span", {}, `One D6 per shot. Start at ${base}+`,
          mods.map((t) => ` · ${t.label} ${t.value > 0 ? `${t.value} easier` : `${-t.value} harder`}`), `. A 6 always hits.`);
        const hits = (s.dice || []).filter((d) => d.ok).length;
        body.push(roll("🎯", "To hit", 6, s.target, why, (s.dice || []).map((d) => die(6, d.value, d.ok)), s.out, hits > 0));
      } else if (s.kind === "location") {
        const loc = String(s.out).split(" ")[0];
        body.push(roll("🎲", "Location", s.die != null ? 12 : null, null,
          s.die != null ? `One D12 for the whole volley: Hull 1-4 · Arms 5-7 · Legs 8-10 · Engine 11-12. Rolled ${s.die}: ${LOC_D12[loc] ? loc : s.out}.` : "Aimed Shot: no roll, the shooter chose the part.",
          s.die != null ? [die(12, s.die, true)] : null, `→ ${s.out}`, true));
      } else if (s.kind === "wound") {
        if (s.target == null) { body.push(roll("🔩", "Wound", null, null, null, null, s.out, false)); continue; }
        const arc = b.arc || "front";
        const why = el("div", { class: "rl-wound" },
          el("div", { class: "rl-eq" }, "One D10 per hit. Need 6 + ",
            statChip("Toughness", s.toughness, b.target, find, `${b.target}'s ${b.location || "part"} armour`), " − ",
            statChip("Penetration", s.pen, b.actor, find, `${b.weapon}: ${(s.terms || []).map((t) => `${t.label} ${t.value > 0 ? "+" : ""}${t.value}`).join(", ")}`),
            ` = ${s.target}+`),
          arcMini(arc));
        const w = (s.dice || []).filter((d) => d.ok).length;
        body.push(roll("🔩", "Wound", 10, s.target, why, (s.dice || []).map((d) => die(10, d.value, d.ok)), s.out, w > 0));
      } else if (s.kind === "damage") {
        const wounds = s.terms?.find((t) => t.label === "wounds")?.value ?? 0;
        const extras = (s.terms || []).filter((t) => t.label !== "wounds");
        const dmgWhy = el("div", { class: "rl-eq" }, `${wounds} wound${wounds === 1 ? "" : "s"} × `,
          extras.length ? extras.map((t, i) => [i ? " + " : "", t.label === "weapon Damage"
            ? statChip("Damage", t.value, b.actor, find, `${b.weapon}'s Damage: SP removed per wound`)
            : `${t.label} ${t.value}`]) : "damage");
        body.push(roll("💥", "Damage", null, null, dmgWhy, null, s.out, b.sp > 0));
      }
    }
  } else {
    body = [el("div", { class: "cc-title" }, l.summary || l.kind),
      (l.rolls || []).length ? el("div", { class: "rl" }, el("div", { class: "rl-h" }, el("b", {}, "Rolls")), el("div", { class: "rl-dice" }, l.rolls.map((r) => el("span", { class: "rl-lab" }, die(r.sides, r.value, r.tone !== "miss"), el("small", {}, r.label))))) : null];
  }
  if (l.effects?.length) body.push(el("div", { class: "rl" }, el("div", { class: "rl-h" }, el("span", { class: "rl-ic" }, "⚡"), el("b", {}, "Effects")), l.effects.map((x) => el("div", { class: "fx" }, `• ${x}`))));
  return body;
}
