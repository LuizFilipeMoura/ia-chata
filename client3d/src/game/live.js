// A live battle against the server: owns the room socket, selection, the action
// bar, targeting/move modes, mandatory gates (Answer tokens, reactions, blasts)
// and the Advisor. Previews use the same shared rules engine the server runs
// (pathfinding, arcs, legal targets, expected damage), so what the UI offers is
// what the server will accept.
import * as THREE from "three";
import { api, connect } from "../api.js";
import { Director, frameFromState, chassisOf, equipmentActiveOf } from "./director.js";
import { availableActions, overheatOdds, equipmentSpends, hopLanding, aoeVictims, reelTargets, naniteHosts, GRAPNEL_YANK_RANGE, GRAPNEL_REEL_RANGE, NANITE_REACH } from "/shared/battle-view.js";
import { candidatesFor } from "/shared/bot/candidates.js";
import { chooseAction } from "/shared/bot/index.js";
import { scoreCandidate, scoreParts, PRESETS } from "/shared/bot/score.js";
import { expectedDamage } from "/shared/bot/evaluate.js";
import { findPath } from "/shared/pathfind.js";
import { terrainPolygons, radiusOf, controlsObjective, distanceBetween, arcOf, sightCorridor } from "/shared/geometry.js";
import { spatial, moveBudget, moveBlockers, effectiveWeaponProfile, heatMeter, LOCS, EQUIPMENT, WEAPON_UPGRADES, ANSWER_COUNTERS, deriveAttackGeometry, meleeReachOf, inExitZone } from "/shared/game-state.js";
import { HEAT_CAPACITY, HEAT_THRESHOLDS } from "/shared/rules.js";
import { el, clear, fill, toast, modal } from "../ui/dom.js";
import { Minimap } from "../ui/minimap.js";
import { reactionCard, rigPortrait } from "../ui/reactions.js";
import { openInspector } from "../ui/inspector.js";
import { setRigSource } from "../ui/combatlog.js";
import { icon } from "../ui/icons.js";
import { attackBriefing } from "../ui/attack.js";
import { sfx, ambience } from "../audio.js";
import { settings } from "../settings.js";
import { Nameplates } from "../ui/nameplates.js";
import { Wires } from "../ui/tips.js";
import { DiceTray } from "../ui/dicetray.js";
import { MatchStats, debrief } from "../ui/outcome.js";
import { commanderTitle } from "../ui/mission.js";

const DEG = Math.PI / 180;
const ICON = { move: "move", sprint: "sprint", fire: "fire", aimed: "aimed", prepare: "prepare", repair: "repair", shutdown: "shutdown", disengage: "disengage", douse: "douse", reload: "reload", lock: "lock", emplace: "anchor", unplant: "anchor", barrage: "barrage", harden: "harden", purge: "purge", jumpjets: "jumpjets", overclock: "overclock", emergencypatch: "patch", heatpurgewave: "wave", locksight: "aimed", popsmoke: "smoke", cryo: "cryo", meltdown: "meltdown", nanite: "nanite", "grapnel-yank": "yank", "grapnel-reel": "reel", fieldweld: "repair", vent: "purge", paint: "lock", extract: "extract" };
const HELP = {
  move: "Walk up to Speed. 1 heat. You may pivot up to 90°.",
  sprint: "Run up to 1½× Speed. 2 heat: fast but hot.",
  fire: "Attack an enemy in your front arc: long-range if in band + line of sight, melee if in reach.",
  aimed: "Long-range shot at a chosen location (usually a to-hit penalty).",
  prepare: "Set a face-down reaction for when you're attacked (Brace, Evasive, Return Fire).",
  repair: "Patch a damaged location.",
  shutdown: "End activation now and vent 2 heat per unused action (max 5).",
  disengage: "Break the melee lock and step clear of the enemy.",
  extract: "Breakthrough: leave the table through the exit zone at the enemy corner. 1 action, no heat. The rig isn't wrecked and keeps its SP; it can't come back this battle.",
  douse: "Put out the flames: clears Burning.",
  reload: "Reload the long-range gun. No action, but a D6 heat gamble: 1-3 → +2 heat, 4-6 → +1.",
  lock: "Fire Control Lock: paint an enemy. Your next Missile Barrage volley at it auto-hits, Armour Piercing.",
  barrage: "Mortar Barrage: shell a zone for 2 rounds. While it runs the tube can't fire direct (you fall back to melee).",
  emplace: "Plant the Bulwark: a rooted fortress stance with the shield raised. No moving until you Un-plant.",
  unplant: "Pull up the Bulwark emplacement so the rig can move again. +2 heat.",
  fieldweld: "Field Weld: repair an allied unit in reach.",
  vent: "Vent: shed an ally's heat.",
  paint: "Recon Paint: mark an enemy. Allied ranged attacks ignore its cover and gain +1 Aim.",
  jumpjets: "Hop in a straight line up to base Speed, over terrain and rigs, ignoring leg damage. The landing spot must be clear. Land facing any way.",
  heatpurgewave: "Vent down to Heat Capacity and scald every enemy within 3\" (rim): +2 heat and a Penetration 4 hit each.",
  "grapnel-yank": `Hop up to ${GRAPNEL_YANK_RANGE}" in a straight line, over terrain, tearing free of any melee lock. Works while engaged. Then 3 rounds to recharge.`,
  "grapnel-reel": `Hook an enemy within ${GRAPNEL_REEL_RANGE}" (rim; line of sight, front arc) and drag it into base contact, engaged. Then 3 rounds to recharge.`,
  cryo: "Spend banked cryo. Free, no action: −2 heat each, and +1 Penetration each on your next attack.",
  meltdown: "Spend meltdown charge. Free, no action: +N Penetration on your attacks this activation, or a burst of +N heat on every enemy within 4\" (rim).",
  nanite: `Seed a nanite stack on yourself or an ally within ${NANITE_REACH}" (rim). It heals 1 SP on one location each Recovery (max 3 per location). Heat Capacity −1 on the host while it lives.`,
};
// Every action's own rules text: the table above, else the equipment active's.
const EQUIP_TEXT = Object.fromEntries(Object.values(EQUIPMENT).map((e) => [e.active.key, e.active.text]));
const helpFor = (key) => HELP[key] || EQUIP_TEXT[key] || "";

// Brass pressure dial: needle at current heat, red sector past capacity.
function heatGauge(heat, cap) {
  const max = cap + 6;
  const ang = (v) => Math.PI * (1 - Math.min(max, v) / max);
  const pt = (v, r) => [40 + Math.cos(ang(v)) * r, 40 - Math.sin(ang(v)) * r];
  const arc = (a, b, r) => { const [x1, y1] = pt(a, r), [x2, y2] = pt(b, r); return `M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`; };
  const [nx, ny] = pt(heat, 30);
  const ticks = Array.from({ length: max + 1 }, (_, i) => { const [a1, b1] = pt(i, 34), [a2, b2] = pt(i, 38); return `<line x1="${a1}" y1="${b1}" x2="${a2}" y2="${b2}" stroke="#c9a14a" stroke-width="1.2"/>`; }).join("");
  const wrap = el("div", { class: "gauge", title: `Heat ${heat} / capacity ${cap}` });
  wrap.innerHTML = `<svg viewBox="0 0 80 44">
    <path d="${arc(0, max, 36)}" stroke="#2a241a" stroke-width="8" fill="none"/>
    <path d="${arc(0, cap, 36)}" stroke="#7a8a4a" stroke-width="5" fill="none"/>
    <path d="${arc(cap, max, 36)}" stroke="#c8412f" stroke-width="5" fill="none"/>
    ${ticks}
    <line x1="40" y1="40" x2="${nx}" y2="${ny}" stroke="#f0cf7a" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="40" cy="40" r="4" fill="#c9a14a" stroke="#3a2a10"/></svg>`;
  return wrap;
}

// Tooltip line: what ending after this action would risk.
function oddsLine(rig, extra) {
  const o = overheatOdds(rig, extra);
  return o.pBad ? `\n⚠ Ending after this: ${Math.round(o.pBad * 100)}% overheat damage${o.pSevere ? ` (${Math.round(o.pSevere * 100)}% severe)` : ""}` : "\n✓ Stays under capacity";
}

export class LiveMatch {
  constructor(world, hud, { room, side = "a", tutorial = null, onExit, onRematch = null, onReplay = null, hotseat = false, noOutcomeModal = false, contract = null }) {
    hud.missionMeta = contract; // campaign: { faction } for the contract strip
    this.hotseat = hotseat; this.onReplay = onReplay;
    this.world = world; this.hud = hud; this.room = room; this.side = side; this.onExit = onExit; this.onRematch = onRematch;
    this.state = null; this.selected = null; this.mode = null; this.lastRes = -1; this.lastVersion = -1;
    this.tutorial = tutorial;
    this.noOutcomeModal = noOutcomeModal; // campaign: the Debrief screen owns the ending
    setRigSource((n) => this.state?.rigs?.find((r) => r.name === n));
    this.events = new EventTarget();
    this.stats = new MatchStats();
    this.frames = [];          // everything the Director played, for the post-battle replay
    this.digestLog = null;     // enemy-turn entries collected while it isn't our move
    this.tray = new DiceTray(hud.root);
    this.director = new Director(world, {
      side,
      onLog: (l, round) => this.onLog(l, round),
      onBanner: (t, k) => this.hud.banner(t, k),
      // Follow the enemy's moves and shots; punch in on kills and broken parts
      // (ours too). Our own actions happen where we're already looking.
      onCamera: (p, { punch, owner, score } = {}) => {
        if (!settings.get("followCam") || !p) return;
        if (punch) {
          // Remember the player's zoom from before any punch still in progress.
          if (this.zoomBack == null) this.zoomBack = this.world.cam.dist;
          this.world.focus(p.x, p.y, Math.min(this.zoomBack, 26));
          clearTimeout(this.punchT);
          this.punchT = setTimeout(() => { this.world.focus(p.x, p.y, this.zoomBack); this.zoomBack = null; }, 1400 / this.director.speed);
        } else if (owner !== this.side || score) this.world.focus(p.x, p.y);
      },
      onDice: (l) => (settings.get("diceTray") ? this.tray.show(l, { speed: this.director.speed, title: this.diceTitle(l) }) : null),
      onScore: (l) => { const flat = l.kind === "score" || l.kind === "crate"; const side = flat ? l.side : l.vp?.side; const amt = flat ? l.vp : l.vp?.amount; if (side && amt) this.hud.scoreFlash(side, amt); },
    });
    this.unsub = [
      world.on("click", (h, e) => this.onClick(h, e)),
      world.on("rclick", (h) => this.onRightClick(h)),
      world.on("move", (h) => this.onHover(h)),
      world.on("longpress", (h) => { const r = h.mechId != null ? this.rig(h.mechId) : null; if (r) openInspector(r); }),
    ];
    world.onDragStart = (h) => this.dragStart(h);
    world.onDrag = (h) => this.onHover(h);
    world.onDragEnd = (h, moved) => this.dragEnd(h, moved);
    world.onDragCancel = () => { if (this.mode?.locked) this.backOut(); };
    world.onShiftWheel = (dy) => { const used = this.wheelTurn(dy); if (used && world.pointerWorld) this.onHover(world.pick()); return used; };
    this.keyHandler = (e) => this.onKey(e);
    window.addEventListener("keydown", this.keyHandler);
    this.advisorWeights = PRESETS.hard;
    this.director.speed = settings.get("speed") || 1;
    this.plates = new Nameplates(hud.root, world, this.director);
    this.wires = tutorial ? null : new Wires(hud.root, this);
    this.minimap = new Minimap(hud.root, world);
  }

  emit(type, detail) { this.events.dispatchEvent(new CustomEvent(type, { detail })); }

  async start() {
    const joined = await api.join(this.room, this.side);
    this.apply(joined.state, true);
    this.disconnect = connect(this.room, this.side, (s) => this.apply(s));
    ambience.start();
  }

  destroy() {
    this.disconnect?.();
    this.unsub.forEach((f) => f());
    window.removeEventListener("keydown", this.keyHandler);
    this.director.dispose();
    document.querySelector(".inspector")?.remove();
    this.minimap.destroy();
    this.plates.destroy();
    this.wires?.destroy();
    ambience.stop();
    this.world.clearOverlay();
    this.world.setThreat(null);
    this.world.onShiftWheel = null;
    this.world.onDragStart = this.world.onDrag = this.world.onDragEnd = this.world.onDragCancel = null;
    this.tray.destroy();
    clearTimeout(this.punchT);
    this.curtain?.remove();
  }

  // Every log entry the Director plays: the combat log, the debrief stats, and
  // (while the enemy has the floor) the "while you waited" digest.
  onLog(l, round) {
    this.hud.log(l, round);
    const ownerOf = (n) => this.state?.rigs.find((r) => r.name === n)?.owner;
    this.stats.add(l, round, ownerOf);
    if (this.digestLog) this.digestLog.push(l);
  }

  diceTitle(l) {
    const b = l.breakdown;
    if (l.kind === "attack" && b) return `${b.actor} → ${b.target} · ${b.weapon}`;
    return l.summary?.split(/[:,(]/)[0] || "";
  }

  // The floor passed to the enemy: remember where their rigs stood.
  startDigest(rigs) {
    this.digestLog = [];
    this.digestFrom = new Map(rigs.map((r) => [r.id, r.pos && { ...r.pos }]));
  }

  // The floor came back: sum up what they did.
  showDigest() {
    const log = this.digestLog, from = this.digestFrom;
    this.digestLog = null;
    if (!log || this.hotseat || this.tutorial) return;
    const mine = (n) => this.state.rigs.find((r) => r.name === n)?.owner === this.side;
    const lines = [];
    for (const r of this.state.rigs) {
      const p = from?.get(r.id);
      if (r.owner === this.side || !p || !r.pos || r.destroyed) continue;
      const d = Math.hypot(r.pos.x - p.x, r.pos.y - p.y);
      if (d > 0.5) lines.push({ icon: "move", text: `${r.name} moved ${d.toFixed(1)}″` });
    }
    for (const l of log) {
      const b = l.breakdown;
      if (l.kind === "attack" && b) lines.push({ icon: b.sp ? "dmg" : "fire", tone: b.sp && mine(b.target) ? "bad" : "", text: b.sp ? `${b.actor} hit ${b.target} with ${b.weapon}: ${b.sp} SP to ${b.location}` : `${b.actor} ${l.stagger ? "staggered" : "missed"} ${b.target}${l.stagger ? " (no damage)" : ""}` });
      else if (l.kind === "attack") lines.push({ icon: "fire", text: l.summary });
      else if (l.kind === "destruction") lines.push({ icon: "dmg", tone: "bad", text: l.summary.split(",")[0] });
      else if (l.kind === "overheat" && !/Nothing happens/.test(l.summary || "")) lines.push({ icon: "heat", text: l.summary.split("(")[0] });
      else if (l.kind === "score" && !l.contested) lines.push({ icon: "beacon", tone: l.side === this.side ? "good" : "", text: `${l.side === this.side ? "You" : "Enemy"} scored a beacon: +${l.vp} VP${(l.mult || 1) > 1 ? ` (×${l.mult})` : ""}` });
      else if (l.kind === "grit") lines.push({ icon: "grit", tone: l.side === this.side ? "good" : "", text: l.summary });
      else if (l.kind === "reaction" || l.kind === "prepare") lines.push({ icon: "prepare", text: l.summary });
      else if (l.kind === "equipment" && l.summary) { const k = equipmentActiveOf(l); lines.push({ icon: ICON[k === "grapnel" ? "grapnel-yank" : k] || "sp", text: l.summary }); }
      else if (l.chaff) lines.push({ icon: "chaff", text: l.summary });
      else if (l.kind === "crate") lines.push({ icon: "crate", tone: l.side === this.side ? "good" : "bad", text: l.summary });
      else if (l.kind === "reinforcement") lines.push({ icon: "drop", tone: "bad", text: l.summary });
      else if (l.kind === "extract") lines.push({ icon: "extract", tone: "good", text: l.summary });
    }
    this.hud.digest(lines);
  }

  // Threat map: every enemy's front arc out to its gun's reach, plus melee reach.
  toggleThreat(on = !settings.get("threat")) {
    settings.set("threat", on);
    this.drawThreat();
    this.renderActions();
    toast(on ? "Threat map on: shaded wedges are where each enemy can shoot (T)" : "Threat map off (T)", "info", 1800);
  }
  drawThreat() {
    if (!settings.get("threat") || !this.state) return this.world.setThreat(null);
    this.world.setThreat(this.state.rigs.filter((r) => r.owner !== this.side && !r.destroyed && r.pos).map((r) => {
      const lr = r.loaded?.longRange === false ? null : effectiveWeaponProfile("longRange", r.weapons?.longRange, r);
      return { x: r.pos.x, y: r.pos.y, facing: r.facing ?? 0, range: Math.min(60, lr?.maxRange ?? 0) || radiusOf(r) + meleeReachOf(r), reach: radiusOf(r) + meleeReachOf(r) };
    }));
  }

  nameOf(id) { return this.state?.rigs.find((r) => r.id === id)?.name; }
  rig(id) { return this.state?.rigs.find((r) => r.id === id); }
  get game() { return this.state?.game; }
  get myTurn() { const g = this.game; return g?.phase === "activation" && g.turn?.side === this.side && !g.pendingReaction && !g.pendingAnswer && !g.pendingBlast; }
  get activeRig() { return this.rig(this.game?.turn?.activeRigId); }

  // ---- State ----
  apply(state, first = false) {
    // Pushes and HTTP responses race; never let an older state win.
    if (!state?.game || state.version <= this.lastVersion) return;
    this.lastVersion = state.version;
    const firstField = !this.state || first;
    const prevState = this.state;
    this.state = state;
    this.director.commanderId = state.campaign?.commanderId ?? null;
    if (firstField && state.field) {
      this.world.buildField({ ...state.field }, state.game.objectives || []);
      this.world.setMission(state.campaign || null);
      const mine = state.rigs.filter((r) => r.owner === this.side && r.pos);
      if (mine.length) { const c = mine.reduce((a, r) => ({ x: a.x + r.pos.x / mine.length, y: a.y + r.pos.y / mine.length }), { x: 0, y: 0 }); this.world.focus(c.x, c.y, 42); }
    }
    const maxRes = Math.max(-1, ...(state.game.resolutions || []).map((r) => r.id));
    this.stats.noteVp(state.game.round, state.game.sides);
    if (first || !prevState) {
      // Fresh battle (round 1, nothing logged beyond setup): drop the squads in
      // from orbit. Rejoining a game in progress just snaps.
      const fresh = state.game.round <= 1 && !(state.game.resolutions || []).some((r) => r.kind === "attack" || r.kind === "move");
      if (fresh && state.rigs.some((r) => r.pos)) {
        this.hud.banner("RAIL DROP · SQUADRONS INBOUND", "round");
        this.director.busy++;
        this.frames.push(frameFromState(state));
        this.director.queue = this.director.dropIn(frameFromState(state)).finally(() => { this.director.busy--; });
      } else { this.frames.push(frameFromState(state)); this.director.snap(frameFromState(state)); }
      this.lastRes = maxRes;
    } else {
      // A bot turn arrives as step frames: first play the human command's own
      // results (log entries older than the bot's first), then each bot step,
      // then settle on the final state.
      const frames = state.botFrames || [];
      const humanFrame = frameFromState(state, this.lastRes);
      if (frames.length) {
        const botIds = frames.flatMap((f) => f.log.map((l) => l.id));
        const firstBot = botIds.length ? Math.min(...botIds) : Infinity;
        const mineLog = humanFrame.log.filter((l) => l.id < firstBot);
        // Still the round the human acted in: the final state's round would
        // announce "Round N+1" before the bot's own turn plays back.
        const first = { ...humanFrame, round: prevState?.game?.round ?? frames[0].round, log: mineLog, rigs: this.rigsBeforeBot(prevState, frames[0]) };
        this.frames.push(first); this.director.play(first);
        // The bot's whole turn plays in one go: collect it for the digest.
        this.director.queue = this.director.queue.then(() => this.startDigest(first.rigs));
        [...frames, { ...humanFrame, log: [] }].forEach((f) => { this.frames.push(f); this.director.play(f); });
        this.director.queue = this.director.queue.then(() => { try { if (this.myTurn) this.showDigest(); } catch (e) { console.error(e); } });
      } else {
        this.frames.push(humanFrame);
        this.director.play(humanFrame);
      }
      this.lastRes = maxRes;
    }
    // The HUD (and any gate prompt) catches up once the show has played, so
    // health bars drop when the shot lands, not before.
    const token = (this.animToken = (this.animToken || 0) + 1);
    if (!first && prevState) this.renderActions();
    this.director.queue.then(() => { if (token === this.animToken) this.refresh(); this.emit("state", state); });
  }

  // The board between the human's command and the bot's first step: human rigs
  // as the bot found them, bot rigs where they stood before.
  rigsBeforeBot(prev, firstBot) {
    return firstBot.rigs.map((r) => {
      const p = prev.rigs.find((x) => x.id === r.id);
      return r.owner === this.side ? r : (p ? { ...r, pos: p.pos, facing: p.facing } : r);
    });
  }

  // Hot-seat: whoever must decide next (their turn, their reaction, their
  // Answer token) takes the device. Swap sides behind a curtain so neither
  // player sees the other's hidden reactions.
  hotseatSwap() {
    const g = this.game;
    if (!this.hotseat || !g || g.phase === "finished" || this.curtain) return false;
    const want = g.pendingAnswer?.side || g.pendingReaction?.defender || (g.phase === "activation" ? g.turn?.side : null);
    if (!want || want === this.side) return false;
    this.curtain = el("div", { class: "curtain" },
      el("div", { class: "curtain-box" },
        el("div", { class: "curtain-k" }, "Pass the device"),
        el("h2", { class: want === "a" ? "c-a" : "c-b" }, want === "a" ? "Cyan commander" : "Red commander"),
        el("p", {}, "Your opponent looks away. Press when you're ready."),
        el("button", { class: "btn big primary", onClick: async () => {
          this.side = want; this.selected = null; this.hud.clog.side = want; this.director.side = want;
          this.disconnect?.();
          this.disconnect = connect(this.room, this.side, (st) => this.apply(st));
          try { const r = await api.state(this.room, this.side); this.state = r.state; this.lastVersion = r.state.version; } catch {}
          this.curtain.remove(); this.curtain = null; this.wasMine = false;
          this.refresh();
        } }, "I'm ready")));
    document.body.append(this.curtain);
    return true;
  }

  refresh() {
    if (!this.state) return;
    if (this.hotseatSwap()) return;
    const g = this.game;
    // A chime when the floor comes back to you.
    const mine = this.myTurn;
    if (mine && !this.wasMine) { sfx.turn(true); this.hud.banner("YOUR MOVE, IRONCLAD", "turn"); this.showDigest(); }
    if (!mine && this.wasMine && !this.digestLog && g.phase !== "finished") this.startDigest(this.state.rigs);
    this.wasMine = mine;
    this.drawThreat();
    // Escalation: beacons pay more from rounds 4 and 8. Announce the step up.
    const mult = g.beaconMultiplier || 1;
    if (mult !== this.lastMult) {
      this.world.setBeaconMultiplier(mult);
      if (this.lastMult != null && mult > this.lastMult) { this.hud.banner(`BEACONS NOW PAY ×${mult}`, "grit"); sfx.score(true); }
      this.lastMult = mult;
    }
    this.hud.top(this.state, this.side);
    this.hud.mission(this.state, this.side);
    this.world.syncObjectives(g.objectives || []);
    const cp = this.state.campaign;
    this.minimap.set(this.state.field, g.objectives, this.state.rigs, g.turn?.activeRigId, cp);
    this.plates.set(this.state.rigs, { activeId: g.turn?.activeRigId, priorityIds: Object.values(g.priorityTargets || {}), commanderId: cp?.commanderId ?? null, commanderTitle: commanderTitle(cp) });
    this.wires?.check();
    this.hud.roster(this.state, this.side, this.selected, (id) => this.select(id));
    // Objective control tint.
    const ctrl = (g.objectives || []).map((m) => {
      const who = new Set(this.state.rigs.filter((r) => !r.destroyed && r.pos && controlsObjective(spatial(r), m)).map((r) => r.owner));
      return who.size === 2 ? "contested" : who.size ? [...who][0] : null;
    });
    this.world.setObjectiveControl(ctrl);
    for (const m of this.director.mechs.values()) {
      const r = this.rig(m.id);
      const active = g.turn?.activeRigId === m.id;
      m.setSelected(m.id === this.selected || active, active ? 0xffd35a : 0xffffff);
      if (m.ringMat && r) m.ringMat.opacity = r.activated ? 0.35 : 0.95;
      // The one acting now isn't "spent" yet; everyone who already acted is.
      m.setSpent?.(!!r?.activated && !active && g.phase !== "finished");
    }
    if (g.turn?.activeRigId != null && g.turn.side === this.side && this.selected !== g.turn.activeRigId) this.selected = g.turn.activeRigId;
    this.renderActions();
    this.handleGates();
    if (g.phase === "finished" || g.outcome) this.showOutcome();
  }

  select(id) {
    if (!this.allowed("select")) return this.locked();
    this.selected = id;
    const r = this.rig(id);
    if (r?.pos) this.world.focus(r.pos.x, r.pos.y);
    this.cancelMode();
    this.refresh();
    this.emit("select", r);
    // Enemies can't be commanded: clicking one shows everything about it.
    if (r && r.owner !== this.side) openInspector(r);
  }

  // A room shaped for the shared previews, with `rig` as the active unit (a rig
  // that hasn't activated yet previews as if it had a fresh budget).
  previewRoom(rig) {
    const g = this.game;
    const turn = g.turn?.activeRigId === rig.id ? g.turn : { side: rig.owner, activeRigId: rig.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
    return { ...this.state, game: { ...g, turn } };
  }

  canCommand(rig) {
    return rig && rig.owner === this.side && !rig.destroyed && this.myTurn
      && (this.game.turn.activeRigId == null ? !rig.activated : this.game.turn.activeRigId === rig.id);
  }

  // ---- Action bar ----
  renderActions() {
    const rig = this.rig(this.selected);
    const bar = this.hud.actions;
    clear(bar);
    if (this.hoverPreview) { this.hoverPreview = false; this.clearPreview(); } // its button is gone
    if (!this.director.idle) {
      bar.append(el("div", { class: "act-foot" },
        el("span", { class: "hint" }, "⏳ Resolving…"),
        el("span", {}, [1, 2, 4].map((sp) => el("button", { class: `btn ${this.director.speed === sp ? "primary" : "ghost"}`, onClick: () => { this.director.speed = sp; settings.set("speed", sp); this.renderActions(); } }, `${sp}×`)),
          el("button", { class: "btn", title: "Skip the animation (Space)", onClick: () => this.director.skip() }, "⏭ Skip"))));
      return;
    }
    if (!rig) { bar.append(el("div", { class: "hint" }, this.myTurn ? "Select one of your rigs (cyan ring) to activate it." : "Waiting…")); return; }
    const g = this.game;
    const cap = HEAT_CAPACITY[rig.weightClass] ?? 6;
    const turn = this.previewRoom(rig).game.turn;
    // Grapnel Launcher: one active, two ways to fire it.
    const acts = availableActions(rig, turn, g.round).flatMap((a) => a.grapnel
      ? [{ ...a, key: "grapnel-yank", label: "Grapnel Yank" }, { ...a, key: "grapnel-reel", label: "Grapnel Reel" }]
      : [a]);
    const extra = [];
    // Prototype spends (Cryo, Meltdown) and Nanite Swarm ride beside the actives.
    for (const sp of equipmentSpends(rig, turn)) extra.push(sp.key === "cryo" ? { ...sp, heatText: sp.max ? `−2×` : "0" } : sp);
    const special = new Set(acts.map((a) => a.key));
    for (const k of ["lock", "emplace", "unplant", "barrage"]) if (!special.has(k) && this.hasAction(rig, k)) extra.push({ key: k, label: k[0].toUpperCase() + k.slice(1), heat: k === "unplant" ? 2 : k === "lock" ? 1 : 0, enabled: turn.actionsUsed < turn.actionsMax });
    if (rig.loaded?.longRange === false) extra.push({ key: "reload", label: "Reload", heat: "d6", enabled: true, why: "" });
    // Campaign Breakthrough: leave the table from the exit zone.
    const cp = this.state.campaign;
    if (cp?.type === "breakthrough" && cp.exit && rig.owner === "a" && rig.pos) {
      const inZone = inExitZone(rig, cp.exit), engaged = rig.engagedWith != null, hasAct = turn.actionsUsed < turn.actionsMax;
      const far = Math.max(0, Math.hypot(rig.pos.x - cp.exit.x, rig.pos.y - cp.exit.y) - cp.exit.r);
      extra.push({ key: "extract", label: "Extract", heat: 0, mission: true, enabled: inZone && !engaged && hasAct,
        why: !inZone ? `Outside the extraction zone: move ${far.toFixed(1)}″ closer to the glowing enemy corner` : engaged ? "Locked in melee: Disengage first" : "No actions left this activation" });
    }
    const commandable = this.canCommand(rig);
    const left = turn.actionsMax - turn.actionsUsed;
    // Every readout is labelled: who this is, what it carries, actions left,
    // boiler heat against capacity.
    const hm = heatMeter(rig);
    bar.append(el("div", { class: "act-head" },
      el("div", { class: "ah-id" },
        el("span", { class: `swatch big sw-${rig.name}` }),
        el("button", { class: "btn ghost in-open", title: "Full details: weapons, upgrades, equipment, damage", onClick: () => openInspector(rig) }, "ⓘ"),
        el("div", {}, el("div", { class: "act-name" }, rig.name),
          el("div", { class: "ah-weps" }, el("span", { title: "Long-range weapon" }, icon("fire"), rig.weapons?.longRange), el("span", { title: "Melee weapon" }, icon("melee"), rig.weapons?.melee)))),
      el("div", { class: "ah-stat", title: "Actions left this activation. Most actions use one." },
        el("div", { class: "ah-k" }, "Actions left"),
        el("div", { class: "pips" }, Array.from({ length: turn.actionsMax }, (_, i) => el("span", { class: `pip ${i < left ? "on" : ""}` }))),
        el("div", { class: "ah-v" }, `${left} of ${turn.actionsMax}`)),
      el("div", { class: "ah-stat", title: "Boiler heat. Every action adds heat; only 1 cools per round. End a turn past capacity (the red zone) and you roll for engine damage." },
        el("div", { class: "ah-k" }, icon("heat"), "Boiler heat"),
        heatGauge(rig.engine?.heat ?? 0, hm.cap || cap),
        el("div", { class: `ah-v ${hm.over ? "bad" : hm.zone === "redline" ? "warn-t" : ""}` }, hm.over ? `${hm.heat} / ${hm.cap} · OVER` : `${hm.heat} / ${hm.cap} safe`)),
    ));
    if (!commandable) {
      bar.append(el("div", { class: "hint" }, rig.owner !== this.side ? "Enemy rig. Hover to inspect." : rig.activated ? "Already activated this round." : this.myTurn ? "" : "Not your turn."));
      if (rig.owner !== this.side || !this.myTurn) return;
    }
    const row = el("div", { class: "act-row" });
    for (const a of [...acts, ...extra]) {
      const heat = a.heat;
      const off = !commandable || !a.enabled || !this.allowed("act", a.key);
      const projected = (rig.engine?.heat ?? 0) + (Number(heat) || 0);
      const hot = projected > cap;
      const btn = el("button", {
        // Looks disabled but stays hoverable, so its tooltip explains why.
        class: `act ${hot ? "hot" : ""} ${a.mission ? "mission" : ""} ${this.mode?.key === a.key || (this.mode?.key === "yank" && a.key === "grapnel-yank") || (this.mode?.key === "reel" && a.key === "grapnel-reel") ? "on" : ""} ${off ? "off" : ""}`,
        "aria-disabled": off ? "true" : null,
        title: `${a.label}: ${helpFor(a.key)}${a.cost === 0 && ["cryo", "meltdown"].includes(a.key) ? "\nFree: no action slot." : ""}${a.note && a.enabled ? " · " + a.note : ""}${!this.allowed("act", a.key) ? "\n⚠ Tutorial: not part of this step yet" : !commandable ? "\n⚠ Not available: this rig can't act right now" : !a.enabled ? `\n⚠ Not available right now: ${a.why || a.note || "no actions left, or the situation doesn't allow it"}` : oddsLine(rig, Number(heat) || 0)}`,
        "data-act": a.key,
        onClick: () => { if (off) return sfx.bad(); this.hoverPreview = false; this.clearPreview(); this.beginAction(rig, a.key); },
        // Area actives: show the zone on the table while hovering the button.
        onMouseenter: () => { if (!this.mode && a.key === "heatpurgewave") { this.previewAoe(rig, 3, 0xff7a2a); this.hoverPreview = true; } },
        onMouseleave: () => { if (this.hoverPreview) { this.hoverPreview = false; this.clearPreview(); this.hud.tip(null); } },
      }, el("span", { class: "ico" }, ICON[a.key] ? icon(ICON[a.key]) : "•"), el("span", { class: "lbl" }, a.label), el("span", { class: "cost" }, a.heatText ?? String(heat), icon("heat")));
      row.append(btn);
    }
    bar.append(row);
    if (commandable) {
      const foot = el("div", { class: "act-foot" },
        el("span", {},
          this.mode ? el("button", { class: "btn danger", title: "Cancel (Esc or right-click)", onClick: () => this.backOut() }, this.mode.locked ? "✕ Pick another spot" : "✕ Cancel") : null,
          el("button", { class: "btn ghost", "data-act": "advisor", disabled: !this.allowed("advisor"), onClick: () => this.advise(rig) }, icon("advisor"), "Advisor"),
          el("button", { class: `btn ${settings.get("threat") ? "primary" : "ghost"}`, title: "Threat map: shade where each enemy can shoot (T)", onClick: () => this.toggleThreat() }, icon("threat"), "Threat"),
          g.canUndo && !this.gate ? el("button", { class: "btn ghost", title: "Take back your last action (Ctrl+Z). Only dice-free steps: once dice are rolled, everything before is locked in.", onClick: () => this.undo() }, "↶ Undo") : null),
        g.turn.activeRigId === rig.id ? (() => {
          const o = overheatOdds(rig, 0);
          return el("button", { class: `btn ${o.pBad ? "danger" : "primary"}`, "data-act": "end", disabled: !this.allowed("end"), title: o.pBad ? "Ending here triggers the overheat roll" : "Pass to the enemy",
            onClick: () => this.endActivation(rig) }, o.pBad ? `End: ${Math.round(o.pBad * 100)}% overheat ⚠` : "End activation ⏎");
        })() : null,
      );
      bar.append(foot);
      // Plain-numbers overheat warning: what ending now actually risks.
      const o = overheatOdds(rig, 0);
      if (o.pBad) {
        const worst = o.rows.filter((r) => r.key !== "safe").sort((x, y) => y.p - x.p)[0];
        bar.append(el("div", { class: "warn" }, `⚠ Boiler over pressure: ending now is a ${Math.round(o.pBad * 100)}% chance of damage`,
          o.pSevere ? ` (${Math.round(o.pSevere * 100)}% severe)` : "", `. Most likely: ${worst?.label}. `, el("b", {}, "Shut Down"), " vents 2 heat per unused action."));
      }
    }
  }

  hasAction(rig, key) {
    if (key === "emplace") return rig.weaponUpgrades?.melee === "emplacement" && !rig.emplaced;
    if (key === "unplant") return !!rig.emplaced;
    const up = (slot) => WEAPON_UPGRADES[rig.weapons?.[slot]]?.find((u) => u.id === rig.weaponUpgrades?.[slot])?.effect || {};
    if (key === "lock") return !!up("longRange").fireControl;
    if (key === "barrage") return !!up("longRange").barrage && !(rig.barrageRoundsLeft > 0);
    return false;
  }

  async send(verb, attrs = {}) {
    try {
      const res = await api.command(this.room, this.side, verb, attrs);
      this.apply(res.state);
      this.emit("command", { verb, attrs });
      return true;
    } catch (e) {
      sfx.bad();
      toast(e.message || "Command rejected", "bad");
      if (e.data?.state) this.apply(e.data.state);
      return false;
    }
  }

  async ensureActive(rig) {
    if (this.game.turn?.activeRigId === rig.id) return true;
    return this.send("activate", { name: rig.name });
  }

  async act(rig, attrs) {
    if (!(await this.ensureActive(rig))) return false;
    return this.send("action", { name: rig.name, ...attrs });
  }

  // The engine keeps turn-scoped snapshots; undo pops the last one (dice and all).
  async undo() {
    if (!this.game?.canUndo || this.gate) return;
    this.cancelMode();
    if (await this.send("undo", { side: this.side })) toast("↶ Undone", "info", 1200);
  }

  // Tutorial lock: when the coach sets `this.gate` ({ acts: [...], select,
  // end, advisor }), only what the current step teaches is allowed.
  // Two escape hatches are always open while a step lets you act, so bad dice
  // or a wasted action can never strand you: Reload whenever the step shoots
  // (a gun fires once, then needs one), and End activation (the dummy waits,
  // and the next round hands you three fresh actions).
  allowed(kind, key) {
    const g = this.gate;
    if (!g) return true;
    const acts = g.acts || [];
    if (kind === "act") return acts.includes(key) || (key === "reload" && (acts.includes("fire") || acts.includes("aimed")));
    if (kind === "end") return !!g.end || acts.length > 0;
    return !!g[kind];
  }
  locked() { toast("Tutorial: follow the current step first (see the coach panel).", "warn", 2200); }

  async endActivation(rig, { force = false } = {}) {
    if (!this.allowed("end")) return this.locked();
    this.cancelMode();
    const t = this.game.turn;
    const left = t ? t.actionsMax - t.actionsUsed : 0;
    // Actions left on the table: offer Shut Down (vents heat) before wasting them.
    if (!force && !this.tutorial && left > 0 && t.activeRigId === rig.id) {
      const canShut = availableActions(rig, t, this.game.round).some((a) => a.key === "shutdown" && a.enabled);
      const vent = Math.min(5, left * 2), heat = rig.engine?.heat ?? 0;
      modal({
        title: `${left} action${left > 1 ? "s" : ""} unused`,
        body: el("p", {}, `${rig.name} still has ${left} action${left > 1 ? "s" : ""}. Ending now wastes ${left > 1 ? "them" : "it"}.`,
          canShut && heat > 0 ? [" ", el("b", {}, "Shut Down"), ` instead would vent ${Math.min(vent, heat)} heat (${heat} → ${Math.max(0, heat - vent)}).`] : ""),
        actions: [
          { label: "Cancel", ghost: true },
          canShut && heat > 0 ? { label: `Shut Down (vent ${Math.min(vent, heat)})`, onClick: () => this.act(rig, { action: "shutdown" }) } : null,
          { label: "End anyway", primary: !(canShut && heat > 0), onClick: () => this.endActivation(rig, { force: true }) },
        ].filter(Boolean),
      });
      return;
    }
    await this.send("endactivation", { name: rig.name });
  }

  beginAction(rig, key) {
    if (!this.allowed("act", key)) return this.locked();
    this.cancelMode();
    if (key === "move" || key === "sprint") return this.startMove(rig, key);
    if (key === "fire" || key === "aimed") return this.startTarget(rig, key);
    if (key === "prepare") return this.pickPrepare(rig);
    if (key === "repair") return this.pickLocation(rig, "Repair which location?", (loc) => this.act(rig, { action: "repair", loc }));
    if (key === "emergencypatch") return this.pickLocation(rig, "Patch which location?", (loc) => this.act(rig, { action: key, loc }));
    if (key === "lock") return this.startTarget(rig, "lock");
    if (key === "jumpjets") return this.startMove(rig, "jumpjets");
    if (key === "grapnel-yank") return this.startMove(rig, "yank");
    if (key === "grapnel-reel") return this.startReel(rig);
    if (key === "cryo") return this.pickCryo(rig);
    if (key === "meltdown") return this.pickMeltdown(rig);
    if (key === "nanite") return this.pickNanite(rig);
    if (key === "shutdown") return this.act(rig, { action: "shutdown" });
    return this.act(rig, { action: key });
  }

  cancelMode() {
    this.clearSight();
    this.previewMeshes = [];
    this.mode = null;
    this.reachFor = undefined; this.reachMeshes = [];
    this.world.clearOverlay();
    this.ghost && this.world.scene.remove(this.ghost);
    this.ghost = null;
    this.hud.tip(null);
    for (const m of this.director.mechs.values()) m.aimAt(null);
    this.emit("movephase", "idle");
    this.renderActions();
  }

  // Right-click / Esc: from "turning" go back to picking a spot; else cancel.
  backOut() {
    if (this.mode?.locked) { this.mode.locked = null; this.hud.tip("Click a spot inside the ring · Right-click to cancel"); this.emit("movephase", "dest"); return; }
    this.cancelMode();
  }

  // ---- Move ----
  isHop(key = this.mode?.key) { return key === "jumpjets" || key === "yank"; }
  startMove(rig, key) {
    // Jump Jets: base Speed, straight line, ignores terrain + leg damage.
    // Grapnel yank: 4", same rules.
    const budget = key === "jumpjets" ? (Number.isFinite(rig.speed) ? rig.speed : moveBudget(rig, "move")) : key === "yank" ? GRAPNEL_YANK_RANGE : moveBudget(rig, key);
    this.mode = { key, rig, budget, facingOffset: 0 };
    this.world.clearOverlay();
    const col = key === "sprint" ? 0xffaa33 : this.isHop(key) ? 0xffd27a : 0x33ff99;
    this.world.disc(rig.pos.x, rig.pos.y, budget + radiusOf(rig), col, 0.08);
    this.world.ring(rig.pos.x, rig.pos.y, budget, col, 0.6);
    const g = new THREE.Group();
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(radiusOf(rig) - 0.1, radiusOf(rig), 40), new THREE.MeshBasicMaterial({ color: 0x33ff99, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ringMesh.rotation.x = -Math.PI / 2; ringMesh.position.y = 0.1; g.add(ringMesh);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1, 3), ringMesh.material); arrow.rotation.z = -Math.PI / 2; arrow.position.set(radiusOf(rig) + 0.6, 0.1, 0); g.add(arrow);
    const arc = new THREE.Mesh(new THREE.CircleGeometry(8, 24, -Math.PI / 4, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x33ff99, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    arc.rotation.x = -Math.PI / 2; arc.position.y = 0.05; g.add(arc);
    this.ghost = g; this.ghostMat = ringMesh.material;
    this.world.scene.add(g);
    this.hud.tip(this.isHop(key)
      ? `${key === "yank" ? "Grapnel yank" : "Jump Jets"}: click a clear landing spot inside the ring (straight line, flies over terrain) · 2) then turn any way · Right-click to cancel`
      : "1) Click a spot inside the ring · 2) then turn · Right-click to cancel");
    this.renderActions();
    this.emit("movephase", "dest");
  }

  movePreview(field) {
    const { rig, budget } = this.mode;
    const polys = terrainPolygons(this.state.field);
    const blockers = moveBlockers(this.state.rigs, rig);
    const hop = this.isHop();
    // Pointing at a friend's base: you can drive through it but not park on
    // it, so slide the spot to just clear of it (away from its centre).
    let note = "";
    if (!hop) {
      const pal = blockers.find((b) => b.pass && Math.hypot(field.x - b.pos.x, field.y - b.pos.y) <= radiusOf(rig) + b.radius);
      if (pal) {
        let dx = field.x - pal.pos.x, dy = field.y - pal.pos.y, len = Math.hypot(dx, dy);
        if (len < 0.5) { dx = pal.pos.x - rig.pos.x; dy = pal.pos.y - rig.pos.y; len = Math.hypot(dx, dy) || 1; } // dead centre: through it
        const k = (radiusOf(rig) + pal.radius + 0.3) / len;
        const far = { x: pal.pos.x + dx * k, y: pal.pos.y + dy * k }, near = { x: pal.pos.x - dx * k, y: pal.pos.y - dy * k };
        // That side off the table or walled in: the other side of the friend.
        field = findPath(this.state.field, polys, blockers, radiusOf(rig), rig.pos, far) ? far : near;
        const name = this.state.rigs.find((r) => r.pos && r.pos.x === pal.pos.x && r.pos.y === pal.pos.y)?.name || "a friend";
        note = `clear of ${name}`;
      }
    }
    const landing = hop ? hopLanding(this.state, rig, field, budget) : null;
    const route = hop ? { path: [rig.pos, field], length: landing.dist } : findPath(this.state.field, polys, blockers, radiusOf(rig), rig.pos, field);
    const ok = hop ? landing.ok : route && route.length <= budget + 1e-6;
    let facing = rig.facing;
    if (route && route.path.length >= 2) {
      const a = route.path[route.path.length - 2], b = route.path[route.path.length - 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) > 0.05) facing = Math.atan2(b.y - a.y, b.x - a.x) / DEG;
    }
    facing += this.mode.facingOffset;
    // Pivot cap ±90° from current facing (a hop lands facing any way).
    const d = ((facing - rig.facing + 540) % 360) - 180;
    if (!hop) facing = rig.facing + Math.max(-89, Math.min(89, d));
    // Danger preview: the bot's own exposure metric at the destination, how
    // much every enemy could expect to deal to you standing there, as posed.
    // Throttled to real cursor movement; it traces LOS for each enemy.
    let danger = null;
    if (ok && settings.get("dangerPreview")) {
      const k = `${field.x.toFixed(1)},${field.y.toFixed(1)},${Math.round(facing)}`;
      if (this.dangerKey !== k) {
        this.dangerKey = k;
        const room = this.previewRoom(rig);
        const parts = scoreParts(room, rig, { action: hop ? "move" : this.mode.key, dest: { x: field.x, y: field.y }, facing });
        this.dangerVal = -parts.threat;
      }
      danger = this.dangerVal;
    }
    const why = landing && !landing.ok ? landing.reason : !route ? "blocked: no way round the terrain or enemies" : route.length > budget + 1e-6 ? "out of reach" : "";
    return { route, ok, facing, danger, why, dest: field, note };
  }

  // Standing at `dest` facing `facing`: which enemies could I attack (green
  // lines + expected SP), and which could attack me (red lines)? Pure preview
  // from the shared geometry the server measures with; cached per spot.
  sightlines(rig, dest, facing) {
    const k = `${dest.x.toFixed(1)},${dest.y.toFixed(1)},${Math.round(facing)}`;
    if (this.sightKey !== k) {
      this.sightKey = k;
      const me = { ...rig, pos: { x: dest.x, y: dest.y }, facing };
      const lr = effectiveWeaponProfile("longRange", rig.weapons?.longRange, rig);
      const shots = [], threats = [];
      for (const e of this.state.rigs) {
        if (e.owner === rig.owner || e.destroyed || !e.pos) continue;
        const g = deriveAttackGeometry(this.state, me, e);
        let slot = null;
        if (g.inFrontArc && g.inMeleeReach) slot = "melee";
        else if (g.inFrontArc && g.los && lr && rig.loaded?.longRange !== false && g.distance <= (lr.maxRange ?? 24) && g.distance >= (lr.minRange || 0)) slot = "longRange";
        if (slot) shots.push({ e, slot, arc: g.arc, ed: expectedDamage(me, e, slot, { arc: g.arc, distance: g.distance, cover: g.cover, round: this.game.round }) });
        const t = deriveAttackGeometry(this.state, e, me);
        const elr = e.loaded?.longRange === false ? null : effectiveWeaponProfile("longRange", e.weapons?.longRange, e);
        if (t.inFrontArc && (t.inMeleeReach || (t.los && elr && t.distance <= (elr.maxRange ?? 24) && t.distance >= (elr.minRange || 0)))) threats.push({ e, arc: t.arc });
      }
      this.sight = { shots: shots.sort((a, b) => b.ed - a.ed), threats };
    }
    for (const m of this.sightMeshes || []) this.world.overlay.remove(m);
    this.sightMeshes = [];
    const at = new THREE.Vector3(dest.x, 1.4, dest.y);
    for (const s of this.sight.shots) this.sightMeshes.push(this.world.line(at, new THREE.Vector3(s.e.pos.x, 1.4, s.e.pos.y), 0x33ff99));
    for (const t of this.sight.threats) this.sightMeshes.push(this.world.line(new THREE.Vector3(t.e.pos.x, 1.2, t.e.pos.y), at.clone().setY(1.2), 0xff4433));
    const left = this.previewRoom(rig).game.turn;
    const later = left.actionsMax - left.actionsUsed <= 1 ? " (next activation)" : "";
    const best = this.sight.shots[0];
    return best ? ` · can hit ${best.e.name}${later}: ${best.arc}, ≈${best.ed.toFixed(1)} SP${this.sight.shots.length > 1 ? ` (+${this.sight.shots.length - 1} more)` : ""}` : " · no target from here";
  }
  clearSight() { for (const m of this.sightMeshes || []) this.world.overlay.remove(m); this.sightMeshes = []; this.sightKey = null; }

  // ---- Drag to face: press on the spot, drag toward where to look, release ----
  isMoveMode() { return this.mode && ["move", "sprint", "jumpjets", "yank"].includes(this.mode.key); }
  dragStart(hit) {
    if (!this.isMoveMode() || !hit.field) return false;
    if (this.mode.locked) { this.dragFromLocked = true; return true; }
    this.onHover(hit);
    const p0 = this.mode.preview;
    if (!p0?.ok) return false;
    this.mode.locked = { ...p0, travelFacing: p0.facing, facing: p0.facing };
    this.dragFromLocked = false;
    this.hud.tip("Drag toward where it should face · release to confirm (or tap again) · right-click / ✕ to pick another spot");
    this.emit("movephase", "face");
    return true;
  }
  dragEnd(hit, moved) {
    if (!this.mode?.locked) return;
    // A real drag, or a second press after the spot was set: confirm the move.
    if (moved >= 10 || this.dragFromLocked) { if (hit.field) this.onHover(hit); this.confirmMove(); }
  }
  // Hovering an enemy: its front arc, gun reach and melee reach on the table.
  showReach(r) {
    if (this.reachFor === r?.id) return;
    this.reachFor = r?.id ?? null;
    for (const m of this.reachMeshes || []) this.world.overlay.remove(m);
    this.reachMeshes = [];
    if (!r || r.destroyed || !r.pos || this.mode) return;
    const lr = effectiveWeaponProfile("longRange", r.weapons?.longRange, r);
    const max = Math.min(60, lr?.maxRange ?? 24);
    const col = r.owner === this.side ? 0x5fd3c0 : 0xe0533d;
    this.reachMeshes.push(
      this.world.wedge(r.pos.x, r.pos.y, max, r.facing - 45, r.facing + 45, col, 0.07),
      this.world.ring(r.pos.x, r.pos.y, max, col, 0.35),
      this.world.ring(r.pos.x, r.pos.y, radiusOf(r) + meleeReachOf(r), 0xffaa33, 0.7),
    );
  }

  // ---- Targeting ----
  startTarget(rig, key) {
    // Buttons can hold the rig as it was when the bar was drawn (a round may
    // have ended since, reloading the gun): always aim with the live one.
    rig = this.rig(rig.id) || rig;
    const room = this.previewRoom(rig);
    const cands = key === "lock"
      ? this.state.rigs.filter((r) => r.owner !== rig.owner && !r.destroyed).map((r) => ({ action: "lock", target: r.name }))
      : candidatesFor(room, rig).filter((c) => c.action === key || (key === "fire" && c.action === "fire"));
    const byTarget = new Map();
    for (const c of cands) { if (!byTarget.has(c.target)) byTarget.set(c.target, []); byTarget.get(c.target).push(c); }
    this.mode = { key, rig, byTarget };
    this.world.clearOverlay();
    // Front arc wedge + reach bands.
    const lrMax = 36;
    this.world.wedge(rig.pos.x, rig.pos.y, lrMax, rig.facing - 45, rig.facing + 45, 0xff5544, 0.06);
    this.world.ring(rig.pos.x, rig.pos.y, radiusOf(rig) + meleeReachOf(rig), 0xffaa33, 0.5);
    for (const e of this.state.rigs) {
      if (e.owner === rig.owner || e.destroyed || !e.pos) continue;
      const ok = byTarget.has(e.name);
      this.world.ring(e.pos.x, e.pos.y, radiusOf(e) + 0.35, ok ? 0xff4433 : 0x555555, ok ? 0.9 : 0.4);
      if (ok) this.world.line(new THREE.Vector3(rig.pos.x, 1.5, rig.pos.y), new THREE.Vector3(e.pos.x, 1.5, e.pos.y), 0xff5544);
    }
    if (!byTarget.size) {
      if (key === "lock") toast("No enemies to lock.", "warn", 3500);
      else return this.explainNoTarget(rig, key);
    }
    this.hud.tip("Click a highlighted enemy · Right-click to cancel");
    this.renderActions();
  }

  // Nothing to shoot: say exactly why, instead of a generic "move or pivot".
  // A spent gun is the common case (the ranged weapon fires once, then needs a
  // Reload), so offer the Reload right here.
  explainNoTarget(rig, key) {
    const lr = effectiveWeaponProfile("longRange", rig.weapons?.longRange, rig);
    const enemies = this.state.rigs.filter((e) => e.owner !== rig.owner && !e.destroyed && e.pos)
      .map((e) => ({ e, geo: deriveAttackGeometry(this.state, rig, e) }))
      .sort((a, b) => a.geo.distance - b.geo.distance);
    const inBand = (d) => lr && d >= (lr.minRange ?? 0) && d <= (lr.maxRange ?? Infinity);
    const gunWouldBear = enemies.some(({ geo }) => geo.inFrontArc && geo.los && inBand(geo.distance));
    const spent = rig.loaded?.longRange === false;
    if (spent && gunWouldBear && key !== "aimed" || spent && key === "fire" && enemies.some(({ geo }) => geo.inFrontArc)) {
      this.cancelMode();
      // Reload spends no action (heat only), so it's open even at 0 actions left.
      const canReload = this.allowed("act", "reload");
      modal({
        title: `${rig.weapons.longRange} is spent`,
        body: el("div", {},
          el("div", { class: "modal-illus" },
            el("div", { class: "mi-art" }, icon("reload")),
            el("div", { class: "mi-odds" },
              el("span", { class: "mi-roll" }, icon("dice"), "D6 1–3", icon("heat"), "+2 heat"),
              el("span", { class: "mi-roll" }, icon("dice"), "D6 4–6", icon("heat"), "+1 heat"))),
          el("p", {}, `Your ${rig.weapons.longRange} fired already and must Reload before it can shoot again. Reloading costs no action, just heat.`,
            enemies.some(({ geo }) => geo.inMeleeReach && geo.inFrontArc) ? "" : ` Your ${rig.weapons.melee} can't reach anyone from here either.`)),
        actions: [
          { label: "Not now", ghost: true },
          { label: "Reload, then aim", primary: true, disabled: !canReload, onClick: async () => {
            const live = this.rig(rig.id) || rig;
            if (live.loaded?.longRange === false && !(await this.act(live, { action: "reload" }))) return;
            this.startTarget(this.rig(rig.id) || live, key);
          } },
        ],
      });
      return;
    }
    const near = enemies[0];
    let why = "No enemy to shoot at.";
    if (near) {
      const { e, geo } = near;
      const d = geo.distance.toFixed(1);
      if (!geo.inFrontArc) why = `${e.name} is outside ${rig.name}'s front arc: pivot to face it (a Move can turn up to 90°).`;
      else if (spent && !geo.inMeleeReach) why = `${rig.weapons.longRange} is spent (Reload it) and ${e.name} is out of ${rig.weapons.melee} reach.`;
      else if (!geo.los) why = `No line of sight to ${e.name}: a building blocks every line. Move to see past it.`;
      else if (lr && geo.distance > (lr.maxRange ?? Infinity)) why = `${e.name} is ${d}" away, beyond the ${rig.weapons.longRange}'s ${lr.maxRange}" range. Close in.`;
      else if (lr && geo.distance < (lr.minRange ?? 0)) why = `${e.name} is ${d}" away, inside the ${rig.weapons.longRange}'s ${lr.minRange}" minimum range. Back off or use the ${rig.weapons.melee}.`;
      else if (key === "aimed" && spent) why = `${rig.weapons.longRange} is spent: Reload before an Aimed Shot.`;
    }
    this.cancelMode();
    toast(why, "warn", 4500);
  }

  chooseAttack(rig, target, list) {
    if (this.mode?.key === "lock") return this.act(rig, { action: "lock", target: target.name }).then(() => this.cancelMode());
    if (this.mode?.key === "reel") return this.act(rig, { action: "jumpjets", mode: "reel", target: target.name, engage: target.name }).then(() => this.cancelMode());
    const room = this.previewRoom(rig);
    const grit = this.game.gritTokens?.[this.side] || 0;
    const rows = list.map((c) => {
      const o = { arc: c.arc, distance: c.distance, cover: c.cover, round: this.game.round, aimed: c.action === "aimed", aimedLoc: c.location };
      const ed = expectedDamage(rig, target, c.weapon, o);
      const edGrit = grit ? expectedDamage(rig, target, c.weapon, { ...o, grit: true }) : null;
      const score = scoreCandidate(room, rig, c, this.advisorWeights);
      return { c, ed, edGrit, score };
    }).sort((a, b) => b.score - a.score);
    const w = (c) => c.weapon === "melee" ? rig.weapons.melee : rig.weapons.longRange;
    // Keep the sight rays on the board while the briefing is up.
    const sight = this.previewSight(rig, target);
    this.previewSplash(rig, target, list[0]?.weapon);
    const m = modal({
      title: `Attack ${target.name}`, cls: "wide",
      body: attackBriefing(rig, target, rows.map((r) => ({ ...r, name: w(r.c) })), (c, o = {}) => { m.close(); this.act(rig, { action: c.action, weapon: c.weapon, target: target.name, loc: c.location, ...(o.grit ? { grit: true } : {}) }).then(() => this.cancelMode()); }, { grit, coverWhy: sight?.why }),
      actions: [{ label: "Cancel", ghost: true }],
    });
    this.onModalGone(m, () => this.clearPreview());
  }

  // ---- Equipment choosers ----

  // Grapnel reel: enemies within 8" (rim) in line of sight and your front arc.
  startReel(rig) {
    const targets = reelTargets(this.previewRoom(rig), rig);
    const byTarget = new Map(targets.map((e) => [e.name, [{ action: "reel", target: e.name, distance: Math.hypot(e.pos.x - rig.pos.x, e.pos.y - rig.pos.y) }]]));
    this.mode = { key: "reel", rig, byTarget };
    this.world.clearOverlay();
    this.world.wedge(rig.pos.x, rig.pos.y, GRAPNEL_REEL_RANGE + radiusOf(rig), rig.facing - 45, rig.facing + 45, 0xe0c080, 0.1);
    this.world.ring(rig.pos.x, rig.pos.y, GRAPNEL_REEL_RANGE + radiusOf(rig), 0xe0c080, 0.6);
    for (const e of this.state.rigs) {
      if (e.owner === rig.owner || e.destroyed || !e.pos) continue;
      const ok = byTarget.has(e.name);
      this.world.ring(e.pos.x, e.pos.y, radiusOf(e) + 0.35, ok ? 0xe0c080 : 0x555555, ok ? 0.9 : 0.4);
      if (ok) this.world.line(new THREE.Vector3(rig.pos.x, 1.5, rig.pos.y), new THREE.Vector3(e.pos.x, 1.5, e.pos.y), 0xe0c080);
    }
    if (!byTarget.size) toast(`No enemy within ${GRAPNEL_REEL_RANGE}" in your front arc with line of sight. Pivot or close in first.`, "warn", 3500);
    this.hud.tip("Grapnel reel: click a highlighted enemy to drag it into base contact · Right-click to cancel");
    this.renderActions();
  }

  // Board previews drawn while a chooser or hover is up (kept apart from the mode overlay).
  clearPreview() {
    for (const m of this.previewMeshes || []) this.world.overlay.remove(m);
    this.previewMeshes = [];
  }
  // Why a shot reads as cover: the three sight rays (green clear, amber through
  // cover, red through a building), a dot where each first enters terrain, and
  // the culprit pieces outlined. Returns the corridor plus a one-line reason.
  previewSight(rig, target) {
    this.clearPreview();
    if (!rig.pos || !target.pos) return null;
    const polys = terrainPolygons(this.state.field);
    const cor = sightCorridor(spatial(rig), spatial(target), polys);
    const pm = this.previewMeshes;
    const culprits = new Set();
    for (const ray of cor.rays) {
      const building = ray.hits.some((h) => h.kind === "building");
      const col = !ray.hits.length ? 0x7fcf6a : building ? 0xff4433 : 0xf5b041;
      pm.push(this.world.line(new THREE.Vector3(ray.from.x, 1.2, ray.from.y), new THREE.Vector3(ray.to.x, 1.2, ray.to.y), col));
      for (const h of ray.hits) {
        culprits.add(h.index);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: col, depthTest: false }));
        dot.position.set(h.x, 1.2, h.y); dot.renderOrder = 10;
        this.world.overlay.add(dot); pm.push(dot);
      }
    }
    for (const i of culprits) {
      const pts = polys[i].points.map(([x, y]) => new THREE.Vector3(x, 0.2, y));
      const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf5b041 }));
      this.world.overlay.add(loop); pm.push(loop);
    }
    const kinds = [...new Set([...culprits].map((i) => polys[i].kind || "terrain"))];
    const why = !cor.obstructed ? "clear line of fire (0 of 3 sight lines blocked)"
      : `${cor.obstructed} of 3 sight lines cross the ${kinds.join(", ")}: ${cor.cover === 2 ? "heavy" : "light"} cover${cor.buildingRays ? ` (${cor.buildingRays} through a building${cor.los ? "" : ": no line of sight"})` : ""}`;
    return { ...cor, why };
  }
  // An area weapon's splash around `target`: the ring, every rig it would catch
  // (red enemy, amber friend). Adds to the preview meshes; returns a tip line.
  previewSplash(rig, target, weapon) {
    const slot = weapon === "melee" ? "melee" : "longRange";
    const sp = effectiveWeaponProfile(slot, rig.weapons?.[slot], rig)?.splash;
    if (!sp || !target.pos) return null;
    const pm = this.previewMeshes;
    pm.push(this.world.disc(target.pos.x, target.pos.y, sp.radius, 0xff8a3a, 0.12), this.world.ring(target.pos.x, target.pos.y, sp.radius, 0xff8a3a, 0.8));
    const caught = this.state.rigs.filter((r) => r.id !== target.id && r.id !== rig.id && !r.destroyed && r.pos
      && Math.hypot(r.pos.x - target.pos.x, r.pos.y - target.pos.y) <= sp.radius + radiusOf(r));
    for (const r of caught) pm.push(this.world.ring(r.pos.x, r.pos.y, radiusOf(r) + 0.35, r.owner === rig.owner ? 0xf5b041 : 0xff4433, 0.95));
    const friends = caught.filter((r) => r.owner === rig.owner), foes = caught.filter((r) => r.owner !== rig.owner);
    return `splash ${sp.radius}": ${caught.length ? [foes.length ? `catches ${foes.map((r) => r.name).join(", ")}` : null, friends.length ? `⚠ friendly fire on ${friends.map((r) => r.name).join(", ")}` : null].filter(Boolean).join(" · ") : "nobody else in it"}`;
  }
  // An area ring `reach` inches out from the rig's rim, with the enemies it catches.
  previewAoe(rig, reach, color) {
    this.clearPreview();
    if (!rig.pos) return [];
    const hit = aoeVictims(this.state.rigs, rig, reach);
    const pm = this.previewMeshes;
    pm.push(this.world.disc(rig.pos.x, rig.pos.y, radiusOf(rig) + reach, color, 0.1), this.world.ring(rig.pos.x, rig.pos.y, radiusOf(rig) + reach, color, 0.85));
    for (const e of hit) pm.push(this.world.ring(e.pos.x, e.pos.y, radiusOf(e) + 0.35, 0xff4433, 0.95));
    this.hud.tip(`${reach}" from the base rim: ${hit.length ? `catches ${hit.map((e) => e.name).join(", ")}` : "no enemy in the zone"}`);
    return hit;
  }
  // Run `fn` once the modal is gone (closed by a button or the backdrop).
  onModalGone(m, fn) {
    const back = m.box.parentNode;
    const mo = new MutationObserver(() => { if (!back.isConnected) { mo.disconnect(); fn(); } });
    mo.observe(document.body, { childList: true });
  }

  pickCryo(rig) {
    const max = rig.equipState?.cryo || 0;
    const heat = rig.engine?.heat ?? 0;
    const m = modal({
      title: `Vent cryo: ${rig.name}`,
      body: el("div", {},
        el("p", { class: "rx-lead" }, `${max} cryo banked. Free, no action: each one vents 2 heat and adds +1 Penetration to your next attack.`),
        el("div", { class: "attack-list" }, Array.from({ length: max }, (_, i) => i + 1).map((n) => el("button", { class: "attack-opt", onClick: () => { m.close(); this.act(rig, { action: "cryo", n }); } },
          el("b", {}, icon("cryo"), ` Spend ${n}`), el("span", {}, `heat ${heat} → ${Math.max(0, heat - 2 * n)} · +${n} Pen next attack`))))),
      actions: [{ label: "Cancel", ghost: true }],
    });
  }

  pickMeltdown(rig) {
    const max = rig.equipState?.meltdownCharge || 0;
    const victims = this.previewAoe(rig, 4, 0xff5a10);
    const opts = (mode) => Array.from({ length: max }, (_, i) => i + 1).map((n) => el("button", { class: "attack-opt", onClick: () => { m.close(); this.act(rig, { action: "meltdown", n, mode }); } },
      el("b", {}, `Spend ${n}`), el("span", {}, mode === "pen" ? `+${n} Penetration this activation` : `+${n} heat on ${victims.length ? victims.map((e) => e.name).join(", ") : "nobody in range"}`)));
    const m = modal({
      title: `Meltdown: ${rig.name}`, cls: "wide",
      body: el("div", {},
        el("p", { class: "rx-lead" }, `${max} meltdown charge banked. Free, no action. While any is banked you can't vent heat or Shut Down.`),
        el("div", { class: "md-cols" },
          el("div", {}, el("h4", {}, icon("pen"), "Overload"), el("p", { class: "muted" }, "Pour it into your guns: +N Penetration on your attacks this activation."), el("div", { class: "attack-list" }, opts("pen"))),
          el("div", {}, el("h4", {}, icon("meltdown"), "Burst"), el("p", { class: "muted" }, "Blow it out: +N heat on every enemy within 4\" of your rim (orange ring)."), el("div", { class: "attack-list" }, opts("burst"))))),
      actions: [{ label: "Cancel", ghost: true }],
    });
    this.onModalGone(m, () => { this.clearPreview(); this.hud.tip(null); });
  }

  pickNanite(rig) {
    const hosts = naniteHosts(this.state.rigs, rig);
    this.clearPreview();
    const pm = this.previewMeshes;
    pm.push(this.world.ring(rig.pos.x, rig.pos.y, radiusOf(rig) + NANITE_REACH, 0x7fff6a, 0.8), this.world.disc(rig.pos.x, rig.pos.y, radiusOf(rig) + NANITE_REACH, 0x7fff6a, 0.07));
    for (const h of hosts) if (!h.self && h.rig.pos) pm.push(this.world.ring(h.rig.pos.x, h.rig.pos.y, radiusOf(h.rig) + 0.35, h.inReach ? 0x7fff6a : 0x555555, h.inReach ? 0.95 : 0.4));
    const pick = { host: rig, loc: null };
    const hostsEl = el("div", { class: "attack-list" }), locsEl = el("div", { class: "attack-list" });
    const stacksOn = (r, l) => (r.equipState?.naniteStacks || []).find((s) => s.loc === l)?.sp || 0;
    const draw = () => {
      fill(hostsEl, hosts.map((h) => el("button", {
        class: `attack-opt ${pick.host.id === h.rig.id ? "best" : ""}`, disabled: !h.inReach,
        title: h.inReach ? "" : `Out of reach: allies must be within ${NANITE_REACH}" of your base rim`,
        onClick: () => { if (!h.inReach) return sfx.bad(); pick.host = h.rig; draw(); },
      }, el("b", {}, h.self ? `${h.rig.name} (self)` : h.rig.name), el("span", {}, h.inReach ? (h.self ? "self" : `in reach`) : `out of reach (> ${NANITE_REACH}")`))));
      fill(locsEl, LOCS.filter((l) => pick.host[l] && !pick.host[l].destroyed).map((l) => el("button", { class: "attack-opt", onClick: () => {
        m.close();
        this.act(rig, { action: "nanite", loc: l, ...(pick.host.id !== rig.id ? { target: pick.host.name } : {}) });
      } }, el("b", {}, icon("nanite"), ` ${l}`), el("span", {}, `${pick.host[l].sp}/${pick.host[l].max} SP${stacksOn(pick.host, l) ? ` · stack ${stacksOn(pick.host, l)}/3` : ""}`))));
    };
    draw();
    const m = modal({
      title: `Nanite Swarm: ${rig.name}`, cls: "wide",
      body: el("div", {},
        el("p", { class: "rx-lead" }, `1 action, +1 heat. The stack heals 1 SP on its location each Recovery (max 3 per location). Allies must be within ${NANITE_REACH}" (green ring).`),
        el("h4", {}, "1. Host"), hostsEl, el("h4", {}, "2. Location"), locsEl),
      actions: [{ label: "Cancel", ghost: true }],
    });
    this.onModalGone(m, () => { this.clearPreview(); this.hud.tip(null); });
  }

  pickPrepare(rig) {
    const room = this.previewRoom(rig);
    const preps = candidatesFor(room, rig).filter((c) => c.action === "prepare").map((c) => c.prep);
    const m = modal({
      title: `Prepare a reaction: ${rig.name}`, cls: "wide",
      body: el("div", { class: "rx" },
        el("p", { class: "rx-lead" }, "Costs 1 action and 1 heat. The reaction stays face-down until this rig is attacked, then springs automatically."),
        el("div", { class: "rx-grid" }, preps.map((p) => reactionCard(p, { onClick: () => { m.close(); this.act(rig, { action: "prepare", prep: p }); } })))),
      actions: [{ label: "Cancel", ghost: true }],
    });
  }


  pickLocation(rig, title, fn) {
    modal({
      title,
      body: el("div", { class: "attack-list" }, LOCS.filter((l) => rig[l] && !rig[l].destroyed).map((l) => el("button", { class: "attack-opt", onClick: () => { document.querySelector(".modal-back")?.remove(); fn(l); } }, el("b", {}, l), el("span", {}, `${rig[l].sp}/${rig[l].max} SP`)))),
      actions: [{ label: "Cancel", ghost: true }],
    });
  }

  // The Advisor's pick as a command (also a handle for automated checks).
  botPick(rig) { return chooseAction(this.previewRoom(rig), rig, this.advisorWeights); }

  // ---- Advisor: the Hard bot's brain, pointed at your rig ----
  advise(rig) {
    if (!this.allowed("advisor")) return this.locked();
    const room = this.previewRoom(rig);
    const cmd = chooseAction(room, rig, this.advisorWeights);
    this.emit("advisor", cmd);
    if (!cmd) { toast("Advisor: nothing here beats standing still. End the activation.", "info", 4000); return; }
    const a = cmd.attrs;
    const what = {
      move: `move ${this.describeSpot(rig, a.dest)}`, sprint: `sprint ${this.describeSpot(rig, a.dest)}`,
      fire: `fire ${a.weapon === "melee" ? rig.weapons.melee : rig.weapons.longRange} at ${a.target}`, aimed: `aimed shot at ${a.target}'s ${a.loc}`,
      prepare: `prepare ${a.prep}`, repair: `repair ${a.loc}`, shutdown: "Shut Down to vent heat",
    }[a.action] || a.action;
    if (a.dest) {
      this.world.clearOverlay();
      this.world.ring(a.dest.x, a.dest.y, radiusOf(rig), 0xffd35a, 0.9);
      this.world.path([rig.pos, a.dest], 0xffd35a);
    }
    modal({
      title: "💡 Advisor",
      body: el("p", {}, `Best option by the Hard bot's evaluation: `, el("b", {}, what), "."),
      actions: [{ label: "Do it", primary: true, onClick: () => this.act(rig, a).then(() => this.cancelMode()) }, { label: "Thanks", ghost: true }],
    });
  }

  // "onto the centre beacon, behind the building" instead of coordinates.
  describeSpot(rig, dest) {
    if (!dest) return "";
    const parts = [];
    const objs = this.game.objectives || [];
    const obj = objs.map((o, i) => ({ o, i, d: Math.hypot(o.x - dest.x, o.y - dest.y) })).sort((a, b) => a.d - b.d)[0];
    const W = this.state.field.width, H = this.state.field.height;
    const where = (x, y) => { const cx = Math.abs(x - W / 2) < W / 6, cy = Math.abs(y - H / 2) < H / 6; return cx && cy ? "centre" : `${y < H / 3 ? "north" : y > (2 * H) / 3 ? "south" : ""}${x < W / 3 ? "west" : x > (2 * W) / 3 ? "east" : ""}` || "centre"; };
    if (obj && obj.d <= 2.2) parts.push(`onto the ${where(obj.o.x, obj.o.y)} beacon (${obj.o.vp} VP)`);
    else if (obj && obj.d <= 6) parts.push(`toward the ${where(obj.o.x, obj.o.y)} beacon`);
    const terr = (this.state.field.terrain || []).map((t) => ({ t, d: Math.hypot(t.x - dest.x, t.y - dest.y) - Math.max(t.w || t.rx || 1, t.h || t.ry || 1) / 2 })).sort((a, b) => a.d - b.d)[0];
    if (terr && terr.d <= 2.5) parts.push(`${parts.length ? "tucked " : ""}${["building", "barricade", "rock", "crate"].includes(terr.t.kind) ? "behind the" : "by the"} ${terr.t.kind === "wood" ? "woods" : terr.t.kind || "cover"}`);
    const foe = this.state.rigs.filter((e) => e.owner !== rig.owner && !e.destroyed && e.pos).map((e) => ({ e, d: Math.hypot(e.pos.x - dest.x, e.pos.y - dest.y) })).sort((a, b) => a.d - b.d)[0];
    if (!parts.length && foe) parts.push(foe.d < Math.hypot(foe.e.pos.x - rig.pos.x, foe.e.pos.y - rig.pos.y) ? `toward ${foe.e.name}` : `away from ${foe.e.name}`);
    const dist = Math.hypot(dest.x - rig.pos.x, dest.y - rig.pos.y);
    return `${dist.toFixed(1)}″ ${parts.join(", ")} (gold ring)`;
  }

  // ---- Input ----
  onHover(hit) {
    if (this.mode?.locked && hit.field && this.ghost) {
      // Phase 2: the spot is set; the ghost turns to face the cursor (±90°
      // from where the rig faces now). Near the ghost: keep the travel facing.
      const L = this.mode.locked, rig = this.mode.rig;
      let f = L.travelFacing;
      if (Math.hypot(hit.field.x - L.dest.x, hit.field.y - L.dest.y) > radiusOf(rig) + 0.5) f = Math.atan2(hit.field.y - L.dest.y, hit.field.x - L.dest.x) / DEG;
      const d = ((f - rig.facing + 540) % 360) - 180;
      const clamped = !this.isHop() && Math.abs(d) > 90;
      L.facing = this.isHop() ? f : rig.facing + Math.max(-89, Math.min(89, d));
      this.ghost.rotation.y = -L.facing * DEG;
      this.ghostMat.color.setHex(clamped ? 0xffd35a : 0x33ff99);
      // Keep your front to the enemy: warn about anyone who'd be on your side
      // or rear after this move (they hit harder there, and you can't shoot them).
      const me = { pos: L.dest, facing: L.facing };
      const exposed = this.state.rigs.filter((e) => e.owner !== rig.owner && !e.destroyed && e.pos)
        .map((e) => ({ e, arc: arcOf({ pos: e.pos }, me) })).filter((x) => x.arc !== "front")
        .sort((a, b) => (a.arc === "rear" ? -1 : 1));
      const warn = exposed.length ? ` · ⚠ ${exposed[0].e.name} would hit your ${exposed[0].arc} (${exposed[0].arc === "rear" ? "+3" : "+2"} Pen) and you couldn't shoot it` : " · ✓ enemies in front";
      const shots = this.sightlines(rig, L.dest, L.facing);
      this.hud.tip(`Facing ${Math.round(((L.facing % 360) + 360) % 360)}°${clamped ? " · max turn is 90° each way" : ""}${warn}${shots} · Click to confirm`);
      return;
    }
    if (this.isMoveMode() && hit.field && this.ghost) {
      const p = this.movePreview(hit.field);
      const at = p.dest;
      this.ghost.position.set(at.x, 0, at.y);
      this.ghost.rotation.y = -p.facing * DEG;
      // Red is only ever "can't go there"; danger on a legal spot is amber.
      this.ghostMat.color.setHex(p.ok ? 0x33ff99 : 0xff2233);
      if (this.pathLine) this.world.overlay.remove(this.pathLine);
      if (p.route) this.pathLine = this.isHop()
        ? this.world.arcPath(this.mode.rig.pos, at, Math.min(4, 1 + p.route.length * 0.4), p.ok ? 0xffd27a : 0xff2233)
        : this.world.path(p.route.path, p.ok ? 0x33ff99 : 0xff2233);
      const dz = p.danger == null ? "" : p.danger < 0.3 ? " · ✅ safe spot" : ` · ⚠ ≈${p.danger.toFixed(1)} SP incoming here`;
      if (p.ok && p.danger != null) this.ghostMat.color.setHex(p.danger < 0.3 ? 0x33ff99 : p.danger < 2 ? 0xffd35a : 0xffa020);
      const shots = p.ok ? this.sightlines(this.mode.rig, at, p.facing) : (this.clearSight(), "");
      const note = p.note ? ` · ${p.note}` : "";
      this.hud.tip(p.route ? `${p.route.length.toFixed(1)}" of ${this.mode.budget.toFixed(1)}"${note} · facing ${Math.round(p.facing)}°${p.ok ? dz : ` · ✖ ${p.why}`}${shots} · Shift+wheel to turn` : `✖ Can't go there: ${p.why}`);
      this.mode.preview = { ...p, dest: at };
      return;
    }
    // Hover tooltip for rigs.
    const r = hit.mechId != null ? this.rig(hit.mechId) : null;
    this.hud.hoverRig(r, this.state);
    this.showReach(r);
    // Sight rays follow the hovered target; off it, they go.
    if (this.mode?.byTarget && !this.mode.byTarget.has(r?.name)) this.clearPreview();
    if (this.mode?.byTarget && r) {
      const list = this.mode.byTarget.get(r.name);
      if (list) {
        const c = list.find((x) => x.action !== "aimed") || list[0];
        if (this.mode.key === "reel") {
          this.hud.tip(`Reel ${r.name}: ${c.distance.toFixed(1)}" · click to drag it into base contact and engage`);
          this.director.mechs.get(this.mode.rig.id)?.aimAt(new THREE.Vector3(r.pos.x, 2, r.pos.y));
          return;
        }
        const ed = c.weapon ? expectedDamage(this.mode.rig, r, c.weapon, { arc: c.arc, distance: c.distance, cover: c.cover, round: this.game.round }) : 0;
        const sight = c.weapon === "longRange" ? this.previewSight(this.mode.rig, r) : (this.clearPreview(), null);
        const splash = this.previewSplash(this.mode.rig, r, c.weapon);
        this.hud.tip(`${r.name}: ${c.arc} arc · ${c.distance?.toFixed(1)}" · ≈${ed.toFixed(1)} SP${splash ? ` · ${splash}` : ""}${sight ? ` · ${sight.why}` : ""} · click to choose weapon`);
        this.director.mechs.get(this.mode.rig.id)?.aimAt(new THREE.Vector3(r.pos.x, 2, r.pos.y));
      }
    }
  }

  onClick(hit) {
    if (this.isMoveMode()) {
      // Touch has no hover: aim the ghost at the tapped point first.
      if (hit.field) this.onHover(hit);
      if (!this.mode.locked) {
        // Phase 1: lock the destination, then let the player turn.
        const p0 = this.mode.preview;
        if (!p0) return;
        if (!p0.ok) { toast(p0.why ? `Can't land there: ${p0.why}.` : "Out of reach. Pick a spot inside the ring.", "warn"); return; }
        this.mode.locked = { ...p0, travelFacing: p0.facing, facing: p0.facing };
        this.hud.tip("Now move the mouse to turn · Click to confirm · Right-click to pick another spot");
        this.emit("movephase", "face");
        return;
      }
      this.confirmMove();
      return;
    }
    if (this.mode?.byTarget && hit.mechId != null) {
      const r = this.rig(hit.mechId);
      const list = r && this.mode.byTarget.get(r.name);
      if (list) { this.chooseAttack(this.mode.rig, r, list); return; }
    }
    if (hit.mechId != null) { if (!this.allowed("select")) return this.locked(); this.select(hit.mechId); return; }
    if (this.mode) this.cancelMode();
  }

  confirmMove() {
    const rig = this.mode.rig, L = this.mode.locked;
    if (Math.abs(((L.facing - L.travelFacing + 540) % 360) - 180) > 10) this.emit("turned", L.facing);
    const yank = this.mode.key === "yank";
    const attrs = { action: yank ? "jumpjets" : this.mode.key, ...(yank ? { mode: "yank" } : {}), dest: { x: +L.dest.x.toFixed(2), y: +L.dest.y.toFixed(2) }, facing: Math.round(L.facing) };
    // Auto-declare engagement when ending in base contact with an enemy (a
    // grapnel yank is for tearing free, never for locking on).
    const foe = !yank && this.state.rigs.find((e) => e.owner !== rig.owner && !e.destroyed && e.pos && Math.hypot(e.pos.x - L.dest.x, e.pos.y - L.dest.y) - radiusOf(e) - radiusOf(rig) < 0.3);
    if (foe) attrs.engage = foe.name;
    this.cancelMode();
    this.act(rig, attrs);
  }

  // Right-click: back out of a mode; on an enemy with no mode open, attack it
  // with the Advisor's best plain option (no dialog).
  onRightClick(hit) {
    if (this.mode) return this.backOut();
    const target = hit.mechId != null ? this.rig(hit.mechId) : null;
    const rig = this.rig(this.selected);
    if (!target || target.owner === this.side || target.destroyed || !this.canCommand(rig)) return;
    if (!this.allowed("act", "fire")) return this.locked();
    const room = this.previewRoom(rig);
    const list = candidatesFor(room, rig).filter((c) => c.action === "fire" && c.target === target.name);
    if (!list.length) return toast(`${rig.name} can't hit ${target.name} from here (front arc, range, line of sight).`, "warn", 3000);
    const best = list.map((c) => ({ c, s: scoreCandidate(room, rig, c, this.advisorWeights) })).sort((a, b) => b.s - a.s)[0].c;
    toast(`${rig.name} fires ${best.weapon === "melee" ? rig.weapons.melee : rig.weapons.longRange} at ${target.name}`, "info", 1600);
    this.act(rig, { action: "fire", weapon: best.weapon, target: target.name });
  }

  onKey(e) {
    if (e.target.closest?.("input,textarea")) return;
    if (e.key === "Escape") this.backOut();
    if (e.key.toLowerCase() === "t" && !e.ctrlKey && !e.metaKey) this.toggleThreat();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); this.undo(); return; }
    if (e.key === " " && !this.director.idle) { e.preventDefault(); this.director.skip(); }
    if (e.key === "Enter" && this.activeRig && this.activeRig.owner === this.side) this.endActivation(this.activeRig);
    if (e.key === "Tab") {
      e.preventDefault();
      const mine = this.state.rigs.filter((r) => r.owner === this.side && !r.destroyed && !r.activated);
      if (mine.length) { const i = mine.findIndex((r) => r.id === this.selected); this.select(mine[(i + 1) % mine.length].id); }
    }
    const rig = this.rig(this.selected);
    const map = { 1: "move", 2: "sprint", 3: "fire", 4: "aimed", 5: "prepare", 6: "shutdown" };
    if (map[e.key] && rig && this.canCommand(rig)) this.beginAction(rig, map[e.key]);
  }

  wheelTurn(dy) {
    if (!this.isMoveMode()) return false;
    this.mode.facingOffset += Math.sign(dy) * 15;
    return true;
  }

  // ---- Gates the human owes ----
  handleGates() {
    const g = this.game;
    // The Answer gate can close without this modal (the battle ended, or the
    // token was spent elsewhere): drop the stale modal instead of leaving it
    // over the next screen.
    if (this.answerModal && (g.phase === "finished" || g.outcome || g.pendingAnswer?.side !== this.side)) {
      this.answerModal.close();
      this.answerModal = null;
      this.gateOpen = false;
    }
    if (this.gateOpen) return;
    if (g.pendingAnswer?.side === this.side) {
      // Answer token: a free face-down reaction. Grit token (you're 2+ VP
      // behind): the same, but Improved, and it may instead upgrade a
      // reaction a rig already holds.
      const answers = g.pendingAnswer.remaining ?? g.answerTokens?.[this.side] ?? 0;
      const grit = g.pendingAnswer.grit ?? g.gritTokens?.[this.side] ?? 0;
      const mine = this.state.rigs.filter((r) => r.owner === this.side && !r.destroyed);
      const free = mine.filter((r) => r.preparation == null);
      const upgradable = mine.filter((r) => r.preparation != null && !r.preparation.improved);
      const useGrit = grit > 0 && (free.length || upgradable.length);
      if (!useGrit && !(answers > 0 && free.length)) return;
      this.gateOpen = true;
      const pick = { grit: !!useGrit && !(answers > 0 && free.length), rig: null, prep: "brace" };
      const preps = ["brace", "evasive", "return", ...ANSWER_COUNTERS];
      const eligible = () => (pick.grit ? [...free, ...upgradable] : free);
      if (!eligible().some((r) => r.name === pick.rig)) pick.rig = eligible()[0]?.name;
      let placeBtn = null;
      const stepEl = el("h4", {}, "2. Choose its reaction");
      const tokenEl = el("div", { class: "rx-tokens" }), rigsEl = el("div", { class: "rx-rigs" }), cardsEl = el("div", { class: "rx-grid" }), leadEl = el("p", { class: "rx-lead" });
      const draw = () => {
        if (!eligible().some((r) => r.name === pick.rig)) pick.rig = eligible()[0]?.name;
        const rig = mine.find((r) => r.name === pick.rig);
        const upgrade = pick.grit && rig?.preparation != null;
        // One kind of token: a plain chip. Both: a two-way switch.
        const hasAnswer = answers > 0 && free.length > 0;
        const chip = (grt) => grt ? [icon("grit"), ` Grit ×${grit} · Improved`] : [`Answer ×${answers}`];
        fill(tokenEl, hasAnswer && useGrit
          ? el("div", { class: "rx-seg" },
            el("button", { class: `seg ${pick.grit ? "" : "on"}`, onClick: () => { pick.grit = false; draw(); } }, chip(false)),
            el("button", { class: `seg ${pick.grit ? "on" : ""}`, onClick: () => { pick.grit = true; draw(); } }, chip(true)))
          : el("span", { class: `rx-chip ${pick.grit ? "grit" : ""}` }, chip(pick.grit)));
        fill(leadEl, pick.grit
          ? "You're 2+ VP behind, so HQ sent Grit: an Improved reaction, placed face-down. Or keep it to reroll missed shots this round."
          : "A free reaction for the new round, placed face-down: it springs the next time that rig is attacked. The enemy won't know which trick it is.");
        fill(rigsEl, eligible().map((r) => rigPortrait(r, { selected: r.name === pick.rig, onClick: () => { pick.rig = r.name; draw(); } })));
        cardsEl.classList.toggle("single", upgrade);
        fill(stepEl, upgrade ? "2. Upgrade its reaction" : "2. Choose its reaction");
        fill(cardsEl, upgrade
          ? el("div", { class: "rx-upg" },
            el("p", { class: "rx-upg-note" }, `${rig.name} already holds this reaction face-down. Grit makes it Improved:`),
            reactionCard(rig.preparation.type, { selected: true, improved: true }))
          : preps.map((p) => reactionCard(p, { selected: p === pick.prep, improved: pick.grit, onClick: () => { pick.prep = p; draw(); } })));
        placeBtn && (placeBtn.textContent = upgrade ? "Upgrade reaction" : "Place reaction");
      };
      draw();
      const body = el("div", { class: "rx" }, tokenEl, leadEl,
        el("h4", {}, "1. Choose a rig"), rigsEl,
        stepEl, cardsEl);
      this.answerModal = modal({ title: useGrit ? "Answer · Grit" : "Answer token", cls: "wide", body, dismissable: false, actions: [
        useGrit ? { label: "Keep Grit for attacks", ghost: true, onClick: async () => { this.answerModal = null; await this.send("answer", { side: this.side, keep: true }); this.gateOpen = false; this.refresh(); } } : null,
        { label: "Place reaction", primary: true, onClick: async () => {
        const rig = mine.find((r) => r.name === pick.rig);
        const attrs = { name: pick.rig, prep: pick.prep, side: this.side };
        if (pick.grit) { attrs.grit = true; if (rig?.preparation != null) attrs.upgrade = true; }
        this.answerModal = null;
        await this.send("answer", attrs); this.gateOpen = false; this.refresh();
      } }].filter(Boolean) });
      placeBtn = [...this.answerModal.box.querySelectorAll("button")].find((b) => /reaction/i.test(b.textContent));
      draw();
      return;
    }
    const pr = g.pendingReaction;
    if (pr && pr.defender === this.side) {
      this.gateOpen = true;
      const reactor = this.rig(pr.targetId), attacker = this.rig(pr.attackerId);
      if (pr.kind === "evasive" || pr.kind === "sidestep") {
        // Digital adjudication: the server rolls the D6 (4+ breaks the shot).
        this.send("react", { side: this.side }).then(() => { this.gateOpen = false; });
      } else if (pr.kind === "return" && attacker && reactor) {
        const geo = deriveAttackGeometry(this.state, reactor, attacker);
        const inReach = geo.inMeleeReach;
        const weapon = inReach ? "melee" : "longRange";
        modal({
          title: `↩️ Return Fire: ${reactor.name}`,
          body: el("p", {}, `${attacker.name} attacked. Shoot back with ${inReach ? reactor.weapons.melee : reactor.weapons.longRange}? (${geo.distance.toFixed(1)}", ${geo.los ? "clear line" : "no line of sight"})`),
          dismissable: false,
          actions: [
            { label: "Skip", ghost: true, onClick: () => this.send("react", { decline: true, side: this.side }).then(() => { this.gateOpen = false; }) },
            { label: "Return fire", primary: true, disabled: !geo.los && !inReach, onClick: () => this.send("react", { side: this.side, attack: { weapon, arc: geo.arc, distance: geo.distance, cover: geo.cover } }).then(() => { this.gateOpen = false; }) },
          ],
        });
      } else {
        this.send("react", { decline: true, side: this.side }).then(() => { this.gateOpen = false; });
      }
      return;
    }
    const pb = g.pendingBlast;
    if (pb) {
      const src = this.rig(pb.sourceId);
      if (src && src.owner === this.side) {
        this.gateOpen = true;
        // Digital: the server finds every rig within 4" of the wreck.
        this.send("blast", {}).then(() => { this.gateOpen = false; });
      }
    }
    if (g.phase === "initiative" && !this.gateOpen && !g.sides.some((s) => s.bot)) {
      this.gateOpen = true;
      this.send("initiative", {}).then(() => { this.gateOpen = false; });
    }
  }

  showOutcome() {
    if (this.outcomeShown) return;
    this.outcomeShown = true;
    const o = this.game.outcome;
    const won = o?.winner === this.side;
    this.director.queue.then(() => {
      sfx.fanfare(won);
      if (won) for (let i = 0; i < 6; i++) setTimeout(() => this.world.fx.explosion(new THREE.Vector3(10 + Math.random() * 34, 6 + Math.random() * 6, 6 + Math.random() * 24), false), i * 300);
      this.emit("finished", o);
      // Training Grounds: the coach owns the ending; no game-over screen.
      if (this.tutorial || this.noOutcomeModal) return;
      const g = this.game;
      const replay = { frames: this.frames, field: this.state.field, objectives: g.objectives, winner: o?.winner ?? null, vp: g.sides.map((s) => s.vp) };
      modal({
        title: o?.winner == null ? "Draw" : won ? "🏆 Victory" : "💀 Defeat",
        cls: `wide ${won ? "victory" : "defeat"}`,
        body: debrief(this.stats, { game: g, side: this.side, reason: o?.reason }),
        actions: [
          this.onRematch ? { label: "⚔ Rematch", primary: true, onClick: () => this.onRematch() } : null,
          this.onReplay && this.frames.length > 1 ? { label: "▶ Watch replay", ghost: true, onClick: () => this.onReplay(replay) } : null,
          { label: "Main menu", primary: !this.onRematch, ghost: !!this.onRematch, onClick: () => this.onExit?.() },
        ].filter(Boolean),
        dismissable: false,
      });
    });
  }
}
