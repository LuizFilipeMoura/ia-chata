// Floating nameplates: a tiny HTML card over every mech — name, total SP bar,
// heat pips (red past capacity), and status icons (active, activated, prepared,
// engaged, priority). Positioned by projecting each mech's label anchor to the
// screen every frame, so it tracks walks, camera moves and replays alike.
import * as THREE from "three";
import { el } from "./dom.js";
import { LOCS } from "/shared/game-state.js";
import { HEAT_CAPACITY } from "/shared/rules.js";
import { settings } from "../settings.js";

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

  // rigs: publicState-ish rigs (or replay frame rigs); extra: { activeId, priorityIds }
  set(rigs, { activeId = null, priorityIds = [] } = {}) {
    this.info = new Map(rigs.map((r) => [r.id, r]));
    this.activeId = activeId; this.priorityIds = priorityIds;
    for (const [id, c] of this.cards) if (!this.info.has(id)) { c.root.remove(); this.cards.delete(id); }
    for (const r of rigs) {
      let c = this.cards.get(r.id);
      if (!c) {
        c = { root: el("div", { class: `plate o-${r.owner || "a"}` }) };
        c.name = el("b"); c.icons = el("span", { class: "pi" });
        c.hp = el("i"); c.heat = el("div", { class: "ph" });
        c.root.append(el("div", { class: "pt" }, c.name, c.icons), el("div", { class: "pb" }, c.hp), c.heat);
        this.layer.append(c.root);
        this.cards.set(r.id, c);
      }
      const sp = (l) => (Array.isArray(r.sp?.[l]) ? r.sp[l] : [r[l]?.sp ?? 0, r[l]?.max ?? 0]);
      const tot = LOCS.reduce((a, l) => a + sp(l)[0], 0), max = LOCS.reduce((a, l) => a + sp(l)[1], 0) || 1;
      const f = tot / max;
      c.name.textContent = r.name;
      c.hp.style.width = `${f * 100}%`;
      c.hp.style.background = f > 0.6 ? "#58d68d" : f > 0.3 ? "#f5b041" : "#e74c3c";
      const cap = HEAT_CAPACITY[r.weightClass] ?? (r.chassis?.startsWith("medium") ? 5 : 6);
      const heat = r.heat ?? r.engine?.heat ?? 0;
      c.heat.replaceChildren(...Array.from({ length: Math.max(cap, heat) }, (_, i) => el("s", { class: i < heat ? (i >= cap ? "over" : "on") : "" })));
      const icons = [];
      if (r.id === activeId) icons.push("▶");
      if (priorityIds.includes(r.id)) icons.push("★");
      if (r.preparation) icons.push("🛡");
      if (r.engagedWith != null) icons.push("⚔");
      if (r.activated) icons.push("✓");
      c.icons.textContent = icons.join("");
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
      if (!m) { c.root.style.display = "none"; continue; }
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
