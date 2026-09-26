// Floating nameplates: a tiny HTML card over every mech, name, Integrity bar
// (§8a, the kill clock, coloured by danger tier with a CRITICAL flag),
// heat pips (red past capacity), and status icons (active, activated, prepared,
// engaged, priority). Positioned by projecting each mech's label anchor to the
// screen every frame, so it tracks walks, camera moves and replays alike.
import * as THREE from "three";
import { el } from "./dom.js";
import { LOCS, integrityTier } from "/shared/game-state.js";
import { HEAT_CAPACITY } from "/shared/rules.js";
import { settings } from "../settings.js";
import { icon } from "./icons.js";

const TIER_COLOR = { ok: "#58d68d", bloodied: "#f5b041", critical: "#e74c3c", wrecked: "#5a2a20" };

export class Nameplates {
  constructor(parent, world, director) {
    this.world = world; this.director = director;
    this.layer = el("div", { class: "plates" });
    parent.append(this.layer);
    this.cards = new Map();
    this.info = new Map();
    this.tick = () => this.update();
    world.tickers.add(this.tick);
  }

  // rigs: publicState-ish rigs (or replay frame rigs); extra: { activeId,
  // priorityIds, commanderId, commanderTitle } (campaign: the crowned enemy).
  set(rigs, { activeId = null, priorityIds = [], commanderId = null, commanderTitle = "Commander" } = {}) {
    this.info = new Map(rigs.map((r) => [r.id, r]));
    this.activeId = activeId; this.priorityIds = priorityIds;
    for (const [id, c] of this.cards) if (!this.info.has(id)) { c.root.remove(); this.cards.delete(id); }
    for (const r of rigs) {
      let c = this.cards.get(r.id);
      if (!c) {
        c = { root: el("div", { class: `plate o-${r.owner || "a"}` }) };
        c.name = el("b"); c.icons = el("span", { class: "pi" }); c.tag = el("div", { class: "ptag" });
        c.hp = el("i"); c.heat = el("div", { class: "ph" }); c.num = el("em", { class: "pn" });
        c.root.append(c.tag, el("div", { class: "pt" }, c.name, c.icons), el("div", { class: "pbw" }, el("div", { class: "pb" }, c.hp), c.num), c.heat);
        this.layer.append(c.root);
        this.cards.set(r.id, c);
      }
      // Integrity (§8a) is what kills, so it's the bar. Replay frames that
      // predate it fall back to total SP.
      const sp = (l) => (Array.isArray(r.sp?.[l]) ? r.sp[l] : [r[l]?.sp ?? 0, r[l]?.max ?? 0]);
      const hasInt = Number.isFinite(r.integrity) && r.integrityMax > 0;
      const tot = hasInt ? r.integrity : LOCS.reduce((a, l) => a + sp(l)[0], 0);
      const max = (hasInt ? r.integrityMax : LOCS.reduce((a, l) => a + sp(l)[1], 0)) || 1;
      const tier = hasInt ? integrityTier(r) : (r.destroyed ? "wrecked" : "ok");
      c.name.textContent = r.name;
      c.hp.style.width = `${Math.max(0, tot / max) * 100}%`;
      c.hp.style.background = TIER_COLOR[tier];
      c.num.textContent = hasInt && !r.destroyed ? String(tot) : "";
      c.root.classList.toggle("bloodied", tier === "bloodied");
      c.root.classList.toggle("critical", tier === "critical");
      const cap = HEAT_CAPACITY[r.weightClass] ?? (r.chassis?.startsWith("medium") ? 5 : 6);
      const heat = r.heat ?? r.engine?.heat ?? 0;
      c.heat.replaceChildren(...Array.from({ length: Math.max(cap, heat) }, (_, i) => el("s", { class: i < heat ? (i >= cap ? "over" : "on") : "" })));
      const icons = [];
      if (r.id === activeId) icons.push(["active", "Acting now"]);
      const cmd = r.id === commanderId && !r.destroyed;
      if (priorityIds.includes(r.id) && !cmd) icons.push(["star", "Priority target"]);
      const crit = tier === "critical";
      if (c.cmd !== cmd || c.crit !== crit) {
        c.cmd = cmd; c.crit = crit;
        c.tag.replaceChildren(...(cmd ? [icon("crown"), commanderTitle.toUpperCase()] : []), ...(crit ? [el("span", { class: "pcrit" }, "CRITICAL")] : []));
        c.root.classList.toggle("cmd", cmd);
      }
      if (r.preparation) icons.push([r.preparation.hidden ? "hidden" : r.preparation.improved ? "grit" : "prepare", r.preparation.improved ? "Improved reaction (Grit)" : "Prepared reaction"]);
      if (r.engagedWith != null) icons.push(["melee", "Locked in melee"]);
      if (r.staggered) icons.push(["stagger", "Staggered: −1 Aim on its next attack"]);
      if (r.activated) icons.push(["check", "Already acted this round"]);
      const sig = icons.map((i) => i[0]).join(",");
      if (c.sig !== sig) { c.sig = sig; c.icons.replaceChildren(...icons.map(([n, t]) => { const i = icon(n); i.title = t; return i; })); }
      c.root.classList.toggle("dead", !!r.destroyed);
      c.root.classList.toggle("active", r.id === activeId);
    }
  }

  update() {
    const show = settings.get("nameplates");
    this.layer.style.display = show ? "" : "none";
    if (!show) return;
    const cam = this.world.camera, W = window.innerWidth, H = window.innerHeight;
    const v = new THREE.Vector3();
    const placed = [];
    const items = [];
    for (const [id, c] of this.cards) {
      const m = this.director.mechs.get(id);
      if (!m || !m.root.visible) { c.root.style.display = "none"; continue; }
      m.labelAnchor.getWorldPosition(v);
      v.project(cam);
      if (v.z > 1) { c.root.style.display = "none"; continue; }
      items.push({ c, x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H });
    }
    // Declutter: nearer plates (lower on screen) keep their spot; the rest
    // step upward until they stop overlapping.
    items.sort((a, b) => b.y - a.y);
    const PW = 84, PH = 32;
    for (const it of items) {
      let y = it.y;
      for (let guard = 0; guard < 6 && placed.some((p) => Math.abs(p.x - it.x) < PW && Math.abs(p.y - y) < PH); guard++) y -= PH;
      placed.push({ x: it.x, y });
      it.c.root.style.display = "";
      it.c.root.style.transform = `translate(${it.x}px, ${y}px) translate(-50%, -100%)`;
    }
  }

  destroy() { this.world.tickers.delete(this.tick); this.layer.remove(); }
}
