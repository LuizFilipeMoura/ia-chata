// In-battle HUD: top bar (round / VP / whose turn), squad roster with per-location
// SP + heat, action bar, battle log, banners, cursor tips and a hover card.
import { icon } from "./icons.js";
import { el, clear, fill } from "./dom.js";
import { LOCS } from "/shared/game-state.js";
import { HEAT_CAPACITY, HEAT_THRESHOLDS } from "/shared/rules.js";
import { chassisOf } from "../game/director.js";
import { CombatLog } from "./combatlog.js";

export class Hud {
  constructor(root) {
    this.root = root;
    clear(root);
    this.topEl = el("div", { class: "hud-top" });
    this.rosterEl = el("div", { class: "hud-roster" });
    this.enemyEl = el("div", { class: "hud-roster enemy" });
    this.actions = el("div", { class: "hud-actions" });
    this.names = new Map();
    this.clog = new CombatLog(root, { side: "a", nameSide: (n) => this.names.get(n) ?? null });
    this.tipEl = el("div", { class: "hud-tip" });
    this.hoverEl = el("div", { class: "hud-hover" });
    this.bannerEl = el("div", { class: "hud-banner" });
    this.extra = el("div", { class: "hud-extra" });
    root.append(this.topEl, this.rosterEl, this.enemyEl, this.actions, this.tipEl, this.hoverEl, this.bannerEl, this.extra);
    this.logLines = [];
  }

  destroy() { this.clog.destroy(); clear(this.root); }

  // Who still has to act this round, in alternation from the side on the floor.
  turnOrder(state) {
    const g = state.game;
    const live = (s) => state.rigs.filter((r) => (r.owner || "a") === s && !r.destroyed);
    const first = g.turn?.side || "a", second = first === "a" ? "b" : "a";
    const wait = { [first]: live(first).filter((r) => !r.activated), [second]: live(second).filter((r) => !r.activated) };
    const done = [...live("a"), ...live("b")].filter((r) => r.activated);
    const seq = [];
    for (let i = 0; wait[first].length || wait[second].length; i++) {
      const s = i % 2 ? second : first;
      const r = wait[s].shift() || wait[s === first ? second : first].shift();
      if (r) seq.push(r);
    }
    return el("div", { class: "turnorder", title: "Activations left this round (dim = already acted)" },
      seq.map((r) => el("i", { class: r.owner || "a", title: r.name })), done.map((r) => el("i", { class: `${r.owner || "a"} done`, title: `${r.name} (acted)` })));
  }

  // `spectator` (replays): neutral Cyan/Red labels instead of you/enemy.
  top(state, side, spectator = this.spectator) {
    const g = state.game;
    const turn = g.turn?.side;
    if (spectator) {
      const va = g.sides.find((s) => s.id === "a")?.vp ?? 0, vb = g.sides.find((s) => s.id === "b")?.vp ?? 0;
      fill(this.topEl,
        el("div", { class: "vp a" }, el("span", { class: "k" }, "CYAN"), el("b", {}, String(va))),
        el("div", { class: `turn ${turn === "a" ? "mine" : "theirs"}` }, el("div", { class: "round" }, `ROUND ${g.round || 1} / 10`), el("div", { class: "who" }, g.phase === "finished" ? "Battle over" : turn === "a" ? "CYAN ACTS" : turn === "b" ? "RED ACTS" : "…"), this.turnOrder(state)),
        el("div", { class: "vp b" }, el("b", {}, String(vb)), el("span", { class: "k" }, "RED")));
      return;
    }
    const who = g.phase === "finished" ? "Battle over" : g.phase === "initiative" ? "Rolling initiative…" : g.pendingAnswer ? (g.pendingAnswer.side === side ? "Place your Answer token" : "Enemy placing Answer…") : turn === side ? "YOUR MOVE, IRONCLAD" : "ENEMY ADVANCING";
    fill(this.topEl, 
      el("div", { class: "vp a", title: "Victory points: salvage held + priority kills" }, el("span", { class: "k" }, "YOUR SALVAGE"), el("b", {}, String(g.sides.find((s) => s.id === side)?.vp ?? 0))),
      el("div", { class: `turn ${turn === side ? "mine" : "theirs"}` }, el("div", { class: "round" }, `ROUND ${g.round || 1} / 10${g.suddenDeath ? " · SUDDEN DEATH" : ""}`), el("div", { class: "who" }, who), this.turnOrder(state)),
      el("div", { class: "vp b", title: "Enemy victory points" }, el("b", {}, String(g.sides.find((s) => s.id !== side)?.vp ?? 0)), el("span", { class: "k" }, g.sides.find((s) => s.id !== side)?.bot ? `${g.sides.find((s) => s.id !== side).bot.toUpperCase()} WARLORD` : "ENEMY")),
    );
  }

  rigCard(r, state, selected, onPick) {
    const cap = HEAT_CAPACITY[r.weightClass] ?? 6;
    const heat = r.engine?.heat ?? 0;
    const pri = Object.values(state.game.priorityTargets || {}).includes(r.id);
    return el("div", { class: `rig-card ${r.destroyed ? "dead" : ""} ${r.activated ? "spent" : ""} ${selected ? "sel" : ""} ${state.game.turn?.activeRigId === r.id ? "active" : ""}`, onClick: () => onPick?.(r.id) },
      el("div", { class: "rc-head" }, el("span", { class: `swatch sw-${r.name}` }), el("b", {}, r.name), pri ? el("span", { class: "tag pri", title: "Priority target: +2 VP for the kill" }, icon("star")) : null,
        r.preparation ? el("span", { class: "tag", title: r.preparation.hidden ? "Hidden reaction: springs when attacked" : `Prepared reaction: ${r.preparation.type}` }, icon(r.preparation.hidden ? "hidden" : "prepare"), r.preparation.hidden ? "" : r.preparation.type) : null,
        r.engagedWith != null ? el("span", { class: "tag", title: "Locked in melee: must Disengage to move" }, icon("melee")) : null),
      el("div", { class: "rc-sub" }, chassisOf(r)?.label || ""),
      el("div", { class: "rc-sp" }, LOCS.map((l) => {
        const p = r[l]; const f = p ? p.sp / p.max : 0;
        return el("div", { class: "loc", title: `${l}: ${p?.sp}/${p?.max}` }, el("span", { class: "ln" }, icon(l)), el("div", { class: "bar" }, el("i", { style: { width: `${f * 100}%`, background: f > 0.6 ? "#58d68d" : f > 0.3 ? "#f5b041" : "#e74c3c" } })));
      })),
      el("div", { class: "rc-heat", title: `Heat ${heat}/${cap}. Over capacity rolls on the overheat table at end of activation` },
        Array.from({ length: Math.max(cap + 4, heat) }, (_, i) => el("i", { class: i < heat ? (i >= cap ? "over" : "on") : i >= cap ? "danger" : "" }))),
    );
  }

  roster(state, side, selectedId, onPick) {
    this.names = new Map(state.rigs.map((r) => [r.name, r.owner || "a"]));
    this.clog.side = side;
    fill(this.rosterEl, el("div", { class: "rh" }, this.spectator ? "Cyan" : "Your squadron"), state.rigs.filter((r) => r.owner === side).map((r) => this.rigCard(r, state, r.id === selectedId, onPick)));
    fill(this.enemyEl, el("div", { class: "rh" }, this.spectator ? "Red" : "Enemy"), state.rigs.filter((r) => r.owner !== side).map((r) => this.rigCard(r, state, r.id === selectedId, onPick)));
  }

  log(l, round) { this.clog.add(l, round); }


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
