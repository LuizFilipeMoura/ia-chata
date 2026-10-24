// Screens and moments: the battle's printed matter. A poster slams in on a
// diagonal when VP is scored, a rig is scrapped or HQ issues a new Priority
// Target; the target itself hangs as a sepia WANTED poster; beacons call in
// like radio stations; the enemy's scores deface your last poster. Pure
// presentation over the public state: nothing here touches a rule.
import "./posters.css";
import { el, fill } from "./dom.js";
import { drawPoster, drawSlam, PROPAGANDA, GRAFFITI } from "../propaganda.js";
import { momentsBetween, stationCalls, factionsFor, hashSeed } from "./moments-logic.js";
import { KILL_VP, CHASSIS } from "/shared/game-state.js";
import { sfx } from "../audio.js";

export const reducedMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

// A crisp canvas at the device pixel ratio, painted by `paint(ctx, w, h)`.
export function artCanvas(w, h, paint, cls = "") {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const c = el("canvas", { class: cls, width: Math.round(w * dpr), height: Math.round(h * dpr), style: { width: `${w}px`, height: `${h}px` } });
  const ctx = c.getContext?.("2d");
  if (ctx) { ctx.scale(dpr, dpr); try { paint(ctx, w, h); } catch (e) { console.error(e); } }
  return c;
}

export const posterCanvas = (id, w, h, opts = {}, cls = "prop-poster") => artCanvas(w, h, (ctx) => drawPoster(ctx, id, w, h, opts), cls);

// Place name for the recap and the newsreel: the battlefield theme's name.
let place = null;
export const setBattlePlace = (name) => { if (name) place = name; };
export const battlePlace = () => place || "the Front";
// The factions flying posters in the current battle (set by Moments).
let factions = null;
export const battleFactions = () => factions || { mine: "arcus", theirs: "krim" };

// ---- Wanted poster ---------------------------------------------------------

// A side-on rig silhouette in SVG: boxy hull, cockpit slit, gun arm, bird legs.
// Light rigs stand taller and thinner, mediums squat and broad.
export function rigSilhouette(weightClass = "medium", seed = 1) {
  const light = weightClass === "light";
  const r = ((hashSeed(String(seed)) % 7) - 3) * 1.5;
  const hullW = light ? 44 : 58, hullH = light ? 30 : 38, hullY = light ? 22 : 30;
  const x0 = 60 - hullW / 2;
  const legTop = hullY + hullH;
  return `<svg viewBox="0 0 120 130" aria-hidden="true" class="wp-sil">
    <g fill="currentColor">
      <path d="M${x0 + 6},${hullY} L${x0 + hullW - 4},${hullY + 2} L${x0 + hullW},${hullY + hullH} L${x0},${hullY + hullH - 2} Z"/>
      <rect x="${x0 + hullW * 0.55}" y="${hullY - 8}" width="${hullW * 0.3}" height="9" rx="2"/>
      <rect x="${x0 - 30 + r}" y="${hullY + 10}" width="36" height="7" rx="2"/>
      <rect x="${x0 - 36 + r}" y="${hullY + 8}" width="8" height="11"/>
      <rect x="${x0 + hullW - 4}" y="${hullY + 12}" width="${light ? 14 : 20}" height="12" rx="3"/>
      <path d="M${x0 + 10},${legTop} l-8,${light ? 26 : 20} l10,${light ? 22 : 18} h-14 v6 h24 l-8,-24 l8,-22 z"/>
      <path d="M${x0 + hullW - 14},${legTop} l10,${light ? 26 : 20} l-10,${light ? 22 : 18} h14 v6 h-24 l8,-24 l-8,-22 z"/>
    </g>
    <rect x="${x0 + hullW * 0.6}" y="${hullY - 5}" width="${hullW * 0.18}" height="2.5" fill="#e9d6a8" opacity=".7"/>
  </svg>`;
}

const chassisLabel = (rig) => CHASSIS.find((c) => c.id === rig?.chassis)?.label || rig?.chassis || "Unknown make";
const weightOf = (rig) => rig?.weightClass || CHASSIS.find((c) => c.id === rig?.chassis)?.class || "medium";

// The WANTED poster for a Priority Target rig. size: "pin" (HUD) or "big" (the slam).
export function wantedPoster(rig, { round = 1, size = "pin" } = {}) {
  const portrait = el("div", { class: "wp-portrait", html: rigSilhouette(weightOf(rig), rig?.id) });
  return el("div", { class: `wanted ${size}`, role: "img", "aria-label": `Wanted: ${rig?.name}. ${KILL_VP} VP bounty.` },
    el("i", { class: "wp-nail" }),
    el("div", { class: "wp-head" }, "WANTED"),
    el("div", { class: "wp-sub" }, "DEAD OR SCRAPPED"),
    portrait,
    el("div", { class: "wp-name" }, String(rig?.name || "Unknown").toUpperCase()),
    el("div", { class: "wp-make" }, chassisLabel(rig)),
    el("div", { class: "wp-bounty" }, `+${KILL_VP} VP BOUNTY`),
    el("div", { class: "wp-foot" }, `Issued by HQ, round ${round}`));
}

// ---- Slams -----------------------------------------------------------------

// One slam at a time; later ones wait their turn. Never blocks input.
export class SlamQueue {
  constructor(host) { this.host = host; this.q = []; this.busy = false; }
  push(node, { hold = 1200, cls = "" } = {}) {
    if (this.q.length >= 3) this.q.shift(); // a flurry keeps only the latest few
    this.q.push({ node, hold, cls });
    if (!this.busy) this.next();
  }
  next() {
    const it = this.q.shift();
    if (!it || this.dead) { this.busy = false; return; }
    this.busy = true;
    const calm = reducedMotion();
    const tilt = hashSeed(`${Date.now()}`) % 2 ? "tl" : "tr";
    const card = el("div", { class: `slam ${tilt} ${it.cls} ${calm ? "calm" : ""}`, "aria-hidden": "true" }, it.node);
    this.host.append(card);
    sfx.posterSlam?.();
    const inMs = calm ? 200 : 380, outMs = calm ? 250 : 520;
    setTimeout(() => card.classList.add("peel"), inMs + it.hold);
    setTimeout(() => { card.remove(); this.next(); }, inMs + it.hold + outMs);
  }
  destroy() { this.dead = true; this.q = []; }
}

export const slamArt = (faction, headline, sub, opts = {}) =>
  artCanvas(360, 240, (ctx, w, h) => drawSlam(ctx, faction, w, h, { headline, sub, seed: opts.seed, graffiti: opts.graffiti }), "slam-art");

// ---- Radio stations (cycling beacons) --------------------------------------

function dial(station, count) {
  const n = Math.max(2, count || 5);
  const ticks = Array.from({ length: n }, (_, i) => {
    const a = Math.PI * (1 - i / (n - 1));
    const x = 60 + Math.cos(a) * 44, y = 56 - Math.sin(a) * 44;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2"/><text x="${(60 + Math.cos(a) * 32).toFixed(1)}" y="${(60 - Math.sin(a) * 32).toFixed(1)}" text-anchor="middle">${i + 1}</text>`;
  }).join("");
  const at = station ? Math.PI * (1 - (station - 1) / (n - 1)) : Math.PI / 2;
  const nx = 60 + Math.cos(at) * 40, ny = 56 - Math.sin(at) * 40;
  return `<svg viewBox="0 0 120 64" class="rd-dial" aria-hidden="true"><path d="M12,56 A48,48 0 0 1 108,56" class="rd-arc"/>${ticks}<line x1="60" y1="56" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" class="rd-needle"/><circle cx="60" cy="56" r="4" class="rd-hub"/></svg>`;
}

export function stationCard(beacons, objectives = []) {
  const calls = stationCalls(beacons);
  if (!calls.length) return null;
  const live = calls.find((c) => c.kind === "live");
  return el("div", { class: "radio", role: "status" },
    el("div", { class: "rd-face", html: dial(live?.station ?? null, objectives.length) }),
    el("div", { class: "rd-lines" }, calls.map((c) => el("div", { class: `rd-call ${c.kind}` }, el("i", { class: "rd-lamp" }), c.text))));
}

// ---- The battle's moments, wired to a LiveMatch ----------------------------

export class Moments {
  constructor(match, hudRoot, world = null) {
    this.match = match;
    this.layer = el("div", { class: "moments" });
    this.board = el("div", { class: "notice-board" });
    this.radioSlot = el("div", { class: "radio-slot" });
    this.layer.append(this.board, this.radioSlot);
    hudRoot.append(this.layer);
    this.slams = new SlamQueue(this.layer);
    this.world = world;
    this.lastFriendly = null; // { faction, slogan, seed } of our most recent poster
    this.onState = (e) => { try { this.update(e.detail); } catch (err) { console.error(err); } };
    match.events.addEventListener("state", this.onState);
  }

  get side() { return this.match.side; }

  update(state) {
    if (!state?.game) return;
    if (!this.factions) {
      this.factions = factions = factionsFor(this.match.room, this.side, state.campaign?.faction || null);
      setBattlePlace(this.world?.theme?.name);
    }
    const moments = momentsBetween(this.prev, state, this.side);
    this.prev = state;
    // A kill that scored folds into its VP poster instead of slamming twice.
    const scored = new Set(moments.filter((m) => m.kind === "vp").map((m) => m.ours));
    this.scrapped = moments.filter((m) => m.kind === "kill" && m.byUs).map((m) => m.name);
    for (const m of moments) if (!(m.kind === "kill" && scored.has(m.byUs))) this.play(m, state);
    this.pinWanted(state);
  }

  play(m, state) {
    const { mine, theirs } = this.factions;
    const seed = hashSeed(`${this.match.room}:${state.game.round}:${m.kind}:${m.rigId ?? m.side ?? ""}`);
    if (m.kind === "wanted") {
      const rig = state.rigs.find((r) => r.id === m.rigId);
      if (rig) this.slams.push(wantedPoster(rig, { round: m.round, size: "big" }), { cls: "slam-wanted", hold: 1400 });
    } else if (m.kind === "station") {
      const card = stationCard(m.beacons, state.game.objectives || []);
      if (!card) return;
      fill(this.radioSlot, card);
      sfx.tapeHiss?.();
      clearTimeout(this.radioT);
      this.radioT = setTimeout(() => card.classList.add("off"), 6500);
    } else if (m.kind === "kill") {
      const f = m.byUs ? mine : theirs;
      const slogan = m.byUs ? `${m.name} IS SCRAP` : `${m.name} FALLS`;
      if (m.byUs) this.lastFriendly = { faction: f, slogan, seed };
      this.slams.push(slamArt(f, m.byUs ? "SCRAPPED!" : "IRON LOST", slogan, { seed }), { cls: m.byUs ? "ours" : "theirs" });
    } else if (m.kind === "vp") {
      if (m.ours) {
        const slogan = this.scrapped?.length ? `${this.scrapped[0]} IS SCRAP` : PROPAGANDA[mine].slogans[seed % PROPAGANDA[mine].slogans.length];
        this.lastFriendly = { faction: mine, slogan, seed };
        this.slams.push(slamArt(mine, `+${m.amount} VP`, slogan, { seed }), { cls: "ours" });
        this.pinPropaganda();
      } else {
        // The enemy scored: our most recent poster gets defaced, on screen.
        const last = this.lastFriendly || { faction: mine, slogan: PROPAGANDA[mine].slogans[0], seed };
        const tag = seed % 2 ? PROPAGANDA[mine].tag : GRAFFITI[seed % GRAFFITI.length];
        this.lastFriendly = { ...last, graffiti: tag };
        this.slams.push(slamArt(last.faction, `+${m.amount} VP`, last.slogan, { seed: last.seed, graffiti: tag }), { cls: "theirs defaced" });
        this.pinPropaganda(true);
      }
    }
  }

  // The HUD notice board: the standing WANTED poster plus our last poster.
  pinWanted(state) {
    const id = state.game.priorityTargets?.[this.side];
    const rig = id != null ? state.rigs.find((r) => r.id === id) : null;
    const key = rig ? `${rig.id}:${!!rig.destroyed}` : null;
    if (key === this.wantedKey) return;
    this.wantedKey = key;
    this.board.querySelector(".wanted")?.remove();
    if (!rig) return;
    const p = wantedPoster(rig, { round: state.game.round });
    if (rig.destroyed) p.append(el("div", { class: "wp-claimed" }, "CLAIMED"));
    this.board.prepend(p);
  }

  pinPropaganda(defaced = false) {
    const f = this.lastFriendly;
    if (!f) return;
    this.board.querySelector(".pin-prop")?.remove();
    const wrap = el("div", { class: `pin-prop ${defaced ? "sprayed" : ""}` }, el("i", { class: "wp-nail" }),
      posterCanvas(f.faction, 96, 140, { slogan: f.slogan, seed: f.seed, graffiti: f.graffiti || null, aged: 0.5 }));
    this.board.append(wrap);
  }

  destroy() {
    this.match.events.removeEventListener("state", this.onState);
    this.slams.destroy(); clearTimeout(this.radioT); this.layer.remove();
  }
}

// ---- Loading screens get a poster -----------------------------------------

// Any `.loading` card that appears under `root` gets a propaganda poster.
export function installLoadingPosters(root) {
  const dress = (n) => {
    if (!n.classList?.contains("loading") || n.querySelector(".prop-poster")) return;
    const seed = hashSeed(`${n.textContent}:${Date.now()}`);
    const ids = Object.keys(PROPAGANDA);
    const id = ids[seed % ids.length];
    const text = n.textContent;
    fill(n, el("div", { class: "loading-card" }, posterCanvas(id, 200, 300, { seed, aged: 0.6 }, "prop-poster loading-poster"), el("div", { class: "loading-text" }, text)));
  };
  const mo = new MutationObserver((recs) => recs.forEach((r) => r.addedNodes.forEach((n) => { if (n.nodeType === 1) { dress(n); n.querySelectorAll?.(".loading").forEach(dress); } })));
  mo.observe(root, { childList: true, subtree: true });
  return () => mo.disconnect();
}
