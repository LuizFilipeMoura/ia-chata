// In-battle HUD: top bar (round / VP / whose turn), squad roster with per-location
// SP + heat, action bar, battle log, banners, cursor tips and a hover card.
import { el, clear, fill } from "./dom.js";
import { LOCS } from "/shared/game-state.js";
import { HEAT_CAPACITY, HEAT_THRESHOLDS } from "/shared/rules.js";
import { chassisOf } from "../game/director.js";

export class Hud {
  constructor(root) {
    this.root = root;
    clear(root);
    this.topEl = el("div", { class: "hud-top" });
    this.rosterEl = el("div", { class: "hud-roster" });
    this.enemyEl = el("div", { class: "hud-roster enemy" });
    this.actions = el("div", { class: "hud-actions" });
    this.logEl = el("div", { class: "hud-log" });
    this.tipEl = el("div", { class: "hud-tip" });
    this.hoverEl = el("div", { class: "hud-hover" });
    this.bannerEl = el("div", { class: "hud-banner" });
    this.extra = el("div", { class: "hud-extra" });
    root.append(this.topEl, this.rosterEl, this.enemyEl, this.actions, this.logEl, this.tipEl, this.hoverEl, this.bannerEl, this.extra);
    this.logLines = [];
  }

  destroy() { clear(this.root); }

  top(state, side) {
    const g = state.game;
    const turn = g.turn?.side;
    const who = g.phase === "finished" ? "Battle over" : g.phase === "initiative" ? "Rolling initiative…" : g.pendingAnswer ? (g.pendingAnswer.side === side ? "Place your Answer token" : "Enemy placing Answer…") : turn === side ? "YOUR TURN" : "ENEMY TURN";
    fill(this.topEl, 
      el("div", { class: "vp a" }, el("span", { class: "k" }, "YOU"), el("b", {}, String(g.sides.find((s) => s.id === side)?.vp ?? 0)), el("span", { class: "k" }, "VP")),
      el("div", { class: `turn ${turn === side ? "mine" : "theirs"}` }, el("div", { class: "round" }, `ROUND ${g.round || 1} / 10${g.suddenDeath ? " · SUDDEN DEATH" : ""}`), el("div", { class: "who" }, who)),
      el("div", { class: "vp b" }, el("span", { class: "k" }, "VP"), el("b", {}, String(g.sides.find((s) => s.id !== side)?.vp ?? 0)), el("span", { class: "k" }, g.sides.find((s) => s.id !== side)?.bot ? `BOT · ${g.sides.find((s) => s.id !== side).bot.toUpperCase()}` : "ENEMY")),
    );
  }

  rigCard(r, state, selected, onPick) {
    const cap = HEAT_CAPACITY[r.weightClass] ?? 6;
    const heat = r.engine?.heat ?? 0;
    const pri = Object.values(state.game.priorityTargets || {}).includes(r.id);
    return el("div", { class: `rig-card ${r.destroyed ? "dead" : ""} ${r.activated ? "spent" : ""} ${selected ? "sel" : ""} ${state.game.turn?.activeRigId === r.id ? "active" : ""}`, onClick: () => onPick?.(r.id) },
      el("div", { class: "rc-head" }, el("span", { class: `swatch sw-${r.name}` }), el("b", {}, r.name), pri ? el("span", { class: "tag pri", title: "Priority target: +2 VP for the kill" }, "★") : null,
        r.preparation ? el("span", { class: "tag", title: "Prepared reaction" }, r.preparation.hidden ? "?" : r.preparation.type) : null,
        r.engagedWith != null ? el("span", { class: "tag", title: "Locked in melee" }, "⚔") : null),
      el("div", { class: "rc-sub" }, chassisOf(r)?.label || ""),
      el("div", { class: "rc-sp" }, LOCS.map((l) => {
        const p = r[l]; const f = p ? p.sp / p.max : 0;
        return el("div", { class: "loc", title: `${l}: ${p?.sp}/${p?.max}` }, el("span", { class: "ln" }, l[0].toUpperCase()), el("div", { class: "bar" }, el("i", { style: { width: `${f * 100}%`, background: f > 0.6 ? "#58d68d" : f > 0.3 ? "#f5b041" : "#e74c3c" } })));
      })),
      el("div", { class: "rc-heat", title: `Heat ${heat}/${cap} — over capacity rolls on the overheat table at end of activation` },
        Array.from({ length: Math.max(cap + 4, heat) }, (_, i) => el("i", { class: i < heat ? (i >= cap ? "over" : "on") : i >= cap ? "danger" : "" }))),
    );
  }

  roster(state, side, selectedId, onPick) {
    fill(this.rosterEl, el("div", { class: "rh" }, "Your squad"), state.rigs.filter((r) => r.owner === side).map((r) => this.rigCard(r, state, r.id === selectedId, onPick)));
    fill(this.enemyEl, el("div", { class: "rh" }, "Enemy"), state.rigs.filter((r) => r.owner !== side).map((r) => this.rigCard(r, state, r.id === selectedId, onPick)));
  }

  log(l, name) {
    const line = el("div", { class: `ll k-${l.kind}` }, l.summary || l.kind);
    this.logEl.prepend(line);
    while (this.logEl.children.length > 40) this.logEl.lastChild.remove();
  }

  banner(text, kind = "info") {
    const b = el("div", { class: `banner ${kind}` }, text);
    this.bannerEl.append(b);
    setTimeout(() => b.classList.add("out"), 1600);
    setTimeout(() => b.remove(), 2100);
  }

  tip(text) { this.tipEl.textContent = text || ""; this.tipEl.style.display = text ? "block" : "none"; }

  hoverRig(r, state) {
    if (!r) { this.hoverEl.style.display = "none"; return; }
    const ch = chassisOf(r);
    const cap = HEAT_CAPACITY[r.weightClass] ?? 6;
    fill(this.hoverEl, 
      el("b", {}, `${r.name} `), el("span", { class: "muted" }, `${ch?.class || ""} · speed ${r.speed ?? ch?.speed ?? "?"}"`),
      el("div", {}, `🔫 ${r.weapons?.longRange}  ·  🗡 ${r.weapons?.melee}`),
      el("div", {}, `Heat ${r.engine?.heat ?? 0}/${cap}${r.equipment ? ` · ⚙ ${r.equipment}` : ""}`),
      r.destroyed ? el("div", { class: "bad" }, "DESTROYED") : null,
    );
    this.hoverEl.style.display = "block";
  }
}

export function heatTable() {
  return el("table", { class: "mini" }, HEAT_THRESHOLDS.slice().reverse().map((t) => el("tr", {}, el("td", {}, `${t.min}+`), el("td", {}, t.label))));
}
