// A live battle against the server: owns the room socket, selection, the action
// bar, targeting/move modes, mandatory gates (Answer tokens, reactions, blasts)
// and the Advisor. Previews use the same shared rules engine the server runs
// (pathfinding, arcs, legal targets, expected damage), so what the UI offers is
// what the server will accept.
import * as THREE from "three";
import { api, connect } from "../api.js";
import { Director, frameFromState, chassisOf } from "./director.js";
import { availableActions } from "/shared/battle-view.js";
import { candidatesFor } from "/shared/bot/candidates.js";
import { chooseAction } from "/shared/bot/index.js";
import { scoreCandidate, PRESETS } from "/shared/bot/score.js";
import { expectedDamage } from "/shared/bot/evaluate.js";
import { findPath } from "/shared/pathfind.js";
import { terrainPolygons, radiusOf, controlsObjective, distanceBetween } from "/shared/geometry.js";
import { spatial, moveBudget, LOCS, EQUIPMENT, WEAPON_UPGRADES, ANSWER_COUNTERS, deriveAttackGeometry, meleeReachOf } from "/shared/game-state.js";
import { HEAT_CAPACITY, HEAT_THRESHOLDS } from "/shared/rules.js";
import { el, clear, toast, modal } from "../ui/dom.js";
import { Minimap } from "../ui/minimap.js";
import { sfx } from "../audio.js";

const DEG = Math.PI / 180;
const ICON = { move: "🦿", sprint: "💨", fire: "🎯", aimed: "🔭", prepare: "🛡️", repair: "🔧", shutdown: "❄️", disengage: "↩️", douse: "🧯", reload: "🔄", lock: "📡", emplace: "⚓", unplant: "⛏️", barrage: "💥", harden: "🧱", purge: "♨️", jumpjets: "🚀", overclock: "⚡", emergencypatch: "🩹", heatpurgewave: "🔥", locksight: "🎯", popsmoke: "🌫️", cryo: "🧊" };
const HELP = {
  move: "Walk up to Speed. 1 heat. You may pivot up to 90°.",
  sprint: "Run up to 1½× Speed. 2 heat — fast but hot.",
  fire: "Attack an enemy in your front arc: long-range if in band + line of sight, melee if in reach.",
  aimed: "Long-range shot at a chosen location (usually a to-hit penalty).",
  prepare: "Set a face-down reaction for when you're attacked (Brace, Evasive, Return Fire).",
  repair: "Patch a damaged location.",
  shutdown: "End activation now and vent 2 heat per unused action (max 5).",
};

export class LiveMatch {
  constructor(world, hud, { room, side = "a", tutorial = null, onExit }) {
    this.world = world; this.hud = hud; this.room = room; this.side = side; this.onExit = onExit;
    this.state = null; this.selected = null; this.mode = null; this.lastRes = -1; this.lastVersion = -1;
    this.tutorial = tutorial;
    this.events = new EventTarget();
    this.director = new Director(world, {
      onLog: (l) => this.hud.log(l, this.nameOf(l.rigId)),
      onBanner: (t, k) => this.hud.banner(t, k),
    });
    this.unsub = [
      world.on("click", (h, e) => this.onClick(h, e)),
      world.on("rclick", () => this.cancelMode()),
      world.on("move", (h) => this.onHover(h)),
    ];
    world.onShiftWheel = (dy) => { const used = this.wheelTurn(dy); if (used && world.pointerWorld) this.onHover(world.pick()); return used; };
    this.keyHandler = (e) => this.onKey(e);
    window.addEventListener("keydown", this.keyHandler);
    this.advisorWeights = PRESETS.hard;
    try { this.director.speed = Number(localStorage.getItem("oi3d-speed")) || 1; } catch {}
    this.minimap = new Minimap(hud.root, world);
  }

  emit(type, detail) { this.events.dispatchEvent(new CustomEvent(type, { detail })); }

  async start() {
    const joined = await api.join(this.room, this.side);
    this.apply(joined.state, true);
    this.disconnect = connect(this.room, this.side, (s) => this.apply(s));
  }

  destroy() {
    this.disconnect?.();
    this.unsub.forEach((f) => f());
    window.removeEventListener("keydown", this.keyHandler);
    this.director.reset();
    this.minimap.destroy();
    this.world.clearOverlay();
    this.world.onShiftWheel = null;
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
    if (firstField && state.field) {
      this.world.buildField({ ...state.field }, state.game.objectives || []);
      const mine = state.rigs.filter((r) => r.owner === this.side && r.pos);
      if (mine.length) { const c = mine.reduce((a, r) => ({ x: a.x + r.pos.x / mine.length, y: a.y + r.pos.y / mine.length }), { x: 0, y: 0 }); this.world.focus(c.x, c.y, 42); }
    }
    const maxRes = Math.max(-1, ...(state.game.resolutions || []).map((r) => r.id));
    if (first || !prevState) {
      // Fresh battle (round 1, nothing logged beyond setup): drop the squads in
      // from orbit. Rejoining a game in progress just snaps.
      const fresh = state.game.round <= 1 && !(state.game.resolutions || []).some((r) => r.kind === "attack" || r.kind === "move");
      if (fresh && state.rigs.some((r) => r.pos)) {
        this.hud.banner("DROP ZONE", "round");
        this.director.busy++;
        this.director.queue = this.director.dropIn(frameFromState(state)).finally(() => { this.director.busy--; });
      } else this.director.snap(frameFromState(state));
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
        this.director.play({ ...humanFrame, log: mineLog, rigs: this.rigsBeforeBot(prevState, frames[0]) });
        frames.forEach((f) => this.director.play(f));
        this.director.play({ ...humanFrame, log: [] });
      } else {
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

  refresh() {
    if (!this.state) return;
    const g = this.game;
    // A chime when the floor comes back to you.
    const mine = this.myTurn;
    if (mine && !this.wasMine) { sfx.turn(true); this.hud.banner("YOUR TURN", "turn"); }
    this.wasMine = mine;
    this.hud.top(this.state, this.side);
    this.minimap.set(this.state.field, g.objectives, this.state.rigs, g.turn?.activeRigId);
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
    }
    if (g.turn?.activeRigId != null && g.turn.side === this.side && this.selected !== g.turn.activeRigId) this.selected = g.turn.activeRigId;
    this.renderActions();
    this.handleGates();
    if (g.phase === "finished" || g.outcome) this.showOutcome();
  }

  select(id) {
    this.selected = id;
    const r = this.rig(id);
    if (r?.pos) this.world.focus(r.pos.x, r.pos.y);
    this.cancelMode();
    this.refresh();
    this.emit("select", r);
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
    if (!this.director.idle) {
      bar.append(el("div", { class: "act-foot" },
        el("span", { class: "hint" }, "⏳ Resolving…"),
        el("span", {}, [1, 2, 4].map((sp) => el("button", { class: `btn ${this.director.speed === sp ? "primary" : "ghost"}`, onClick: () => { this.director.speed = sp; try { localStorage.setItem("oi3d-speed", String(sp)); } catch {} this.renderActions(); } }, `${sp}×`)),
          el("button", { class: "btn", title: "Skip the animation (Space)", onClick: () => this.director.skip() }, "⏭ Skip"))));
      return;
    }
    if (!rig) { bar.append(el("div", { class: "hint" }, this.myTurn ? "Select one of your rigs (cyan ring) to activate it." : "Waiting…")); return; }
    const g = this.game;
    const cap = HEAT_CAPACITY[rig.weightClass] ?? 6;
    const turn = this.previewRoom(rig).game.turn;
    const acts = availableActions(rig, turn, g.round);
    const extra = [];
    const special = new Set(acts.map((a) => a.key));
    for (const k of ["lock", "emplace", "unplant", "barrage"]) if (!special.has(k) && this.hasAction(rig, k)) extra.push({ key: k, label: k[0].toUpperCase() + k.slice(1), heat: k === "unplant" ? 2 : k === "lock" ? 1 : 0, enabled: turn.actionsUsed < turn.actionsMax });
    if (rig.loaded?.longRange === false) extra.push({ key: "reload", label: "Reload", heat: "d6", enabled: turn.actionsUsed < turn.actionsMax });
    const commandable = this.canCommand(rig);
    const left = turn.actionsMax - turn.actionsUsed;
    bar.append(el("div", { class: "act-head" },
      el("div", { class: "act-name" }, `${rig.name}`, el("span", { class: "sub" }, ` ${chassisOf(rig)?.label || ""}`)),
      el("div", { class: "pips" }, Array.from({ length: turn.actionsMax }, (_, i) => el("span", { class: `pip ${i < left ? "on" : ""}` }))),
      el("div", { class: "heatline" }, `Heat ${rig.engine?.heat ?? 0}/${cap}`),
    ));
    if (!commandable) {
      bar.append(el("div", { class: "hint" }, rig.owner !== this.side ? "Enemy rig — hover to inspect." : rig.activated ? "Already activated this round." : this.myTurn ? "" : "Not your turn."));
      if (rig.owner !== this.side || !this.myTurn) return;
    }
    const row = el("div", { class: "act-row" });
    for (const a of [...acts, ...extra]) {
      const heat = a.heat;
      const projected = (rig.engine?.heat ?? 0) + (Number(heat) || 0);
      const hot = projected > cap;
      const btn = el("button", {
        class: `act ${hot ? "hot" : ""} ${this.mode?.key === a.key ? "on" : ""}`, disabled: !commandable || !a.enabled,
        title: `${a.label} — ${HELP[a.key] || EQUIPMENT[rig.equipment]?.active?.text || ""}${a.note ? " · " + a.note : ""}`,
        "data-act": a.key,
        onClick: () => this.beginAction(rig, a.key),
      }, el("span", { class: "ico" }, ICON[a.key] || "•"), el("span", { class: "lbl" }, a.label), el("span", { class: "cost" }, `${heat}🔥`));
      row.append(btn);
    }
    bar.append(row);
    if (commandable) {
      const foot = el("div", { class: "act-foot" },
        el("button", { class: "btn ghost", "data-act": "advisor", onClick: () => this.advise(rig) }, "💡 Advisor"),
        g.turn.activeRigId === rig.id ? el("button", { class: "btn primary", "data-act": "end", onClick: () => this.endActivation(rig) }, "End activation ⏎") : null,
      );
      bar.append(foot);
      if ((rig.engine?.heat ?? 0) > cap) bar.append(el("div", { class: "warn" }, `⚠ Over capacity: ending now rolls D12+${Math.min(10, 2 * ((rig.engine?.heat ?? 0) - cap))} on the overheat table. Shut Down vents heat.`));
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

  async endActivation(rig) {
    this.cancelMode();
    await this.send("endactivation", { name: rig.name });
  }

  beginAction(rig, key) {
    this.cancelMode();
    if (key === "move" || key === "sprint") return this.startMove(rig, key);
    if (key === "fire" || key === "aimed") return this.startTarget(rig, key);
    if (key === "prepare") return this.pickPrepare(rig);
    if (key === "repair") return this.pickLocation(rig, "Repair which location?", (loc) => this.act(rig, { action: "repair", loc }));
    if (key === "emergencypatch") return this.pickLocation(rig, "Patch which location?", (loc) => this.act(rig, { action: key, loc }));
    if (key === "lock") return this.startTarget(rig, "lock");
    if (key === "jumpjets") return this.startMove(rig, "jumpjets");
    if (key === "shutdown") return this.act(rig, { action: "shutdown" });
    return this.act(rig, { action: key });
  }

  cancelMode() {
    this.mode = null;
    this.world.clearOverlay();
    this.ghost && this.world.scene.remove(this.ghost);
    this.ghost = null;
    this.hud.tip(null);
    for (const m of this.director.mechs.values()) m.aimAt(null);
    this.renderActions();
  }

  // ---- Move ----
  startMove(rig, key) {
    const budget = key === "jumpjets" ? 6 : moveBudget(rig, key);
    this.mode = { key, rig, budget, facingOffset: 0 };
    this.world.clearOverlay();
    this.world.disc(rig.pos.x, rig.pos.y, budget + radiusOf(rig), key === "sprint" ? 0xffaa33 : 0x33ff99, 0.08);
    this.world.ring(rig.pos.x, rig.pos.y, budget, key === "sprint" ? 0xffaa33 : 0x33ff99, 0.6);
    const g = new THREE.Group();
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(radiusOf(rig) - 0.1, radiusOf(rig), 40), new THREE.MeshBasicMaterial({ color: 0x33ff99, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ringMesh.rotation.x = -Math.PI / 2; ringMesh.position.y = 0.1; g.add(ringMesh);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1, 3), ringMesh.material); arrow.rotation.z = -Math.PI / 2; arrow.position.set(radiusOf(rig) + 0.6, 0.1, 0); g.add(arrow);
    const arc = new THREE.Mesh(new THREE.CircleGeometry(8, 24, -Math.PI / 4, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x33ff99, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    arc.rotation.x = -Math.PI / 2; arc.position.y = 0.05; g.add(arc);
    this.ghost = g; this.ghostMat = ringMesh.material;
    this.world.scene.add(g);
    this.hud.tip("Click to move · Shift+wheel to turn · Right-click to cancel");
    this.renderActions();
  }

  movePreview(field) {
    const { rig, budget } = this.mode;
    const polys = terrainPolygons(this.state.field);
    const blockers = this.state.rigs.filter((r) => r.id !== rig.id && !r.destroyed && r.pos).map(spatial);
    const route = this.mode.key === "jumpjets" ? { path: [rig.pos, field], length: Math.hypot(field.x - rig.pos.x, field.y - rig.pos.y) } : findPath(this.state.field, polys, blockers, radiusOf(rig), rig.pos, field);
    const ok = route && route.length <= budget + 1e-6;
    let facing = rig.facing;
    if (route && route.path.length >= 2) {
      const a = route.path[route.path.length - 2], b = route.path[route.path.length - 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) > 0.05) facing = Math.atan2(b.y - a.y, b.x - a.x) / DEG;
    }
    facing += this.mode.facingOffset;
    // Pivot cap ±90° from current facing.
    const d = ((facing - rig.facing + 540) % 360) - 180;
    facing = rig.facing + Math.max(-90, Math.min(90, d));
    return { route, ok, facing };
  }

  // ---- Targeting ----
  startTarget(rig, key) {
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
    if (!byTarget.size) toast(key === "lock" ? "No enemies to lock." : "No enemy in your front arc with line of sight/range. Move or pivot first.", "warn", 3500);
    this.hud.tip("Click a highlighted enemy · Right-click to cancel");
    this.renderActions();
  }

  chooseAttack(rig, target, list) {
    if (this.mode?.key === "lock") return this.act(rig, { action: "lock", target: target.name }).then(() => this.cancelMode());
    const room = this.previewRoom(rig);
    const rows = list.map((c) => {
      const ed = expectedDamage(rig, target, c.weapon, { arc: c.arc, distance: c.distance, cover: c.cover, round: this.game.round, aimed: c.action === "aimed", aimedLoc: c.location });
      const score = scoreCandidate(room, rig, c, this.advisorWeights);
      return { c, ed, score };
    }).sort((a, b) => b.score - a.score);
    const w = (c) => c.weapon === "melee" ? rig.weapons.melee : rig.weapons.longRange;
    modal({
      title: `Attack ${target.name}`,
      body: el("div", { class: "attack-list" },
        el("p", { class: "muted" }, `Arc: ${list[0].arc} · ${list[0].distance.toFixed(1)}" · cover: ${list[0].cover || "none"}. Rear arcs hit harder — flank!`),
        rows.map((r, i) => el("button", { class: `attack-opt ${i === 0 ? "best" : ""}`, onClick: () => { document.querySelector(".modal-back")?.remove(); this.act(rig, { action: r.c.action, weapon: r.c.weapon, target: target.name, loc: r.c.location }).then(() => this.cancelMode()); } },
          el("b", {}, `${r.c.action === "aimed" ? "Aimed · " + r.c.location : "Fire"} — ${w(r.c)}`),
          el("span", {}, `≈${r.ed.toFixed(1)} SP expected${i === 0 ? " · advisor pick" : ""}`)))),
      actions: [{ label: "Cancel", ghost: true }],
    });
  }

  pickPrepare(rig) {
    const room = this.previewRoom(rig);
    const preps = candidatesFor(room, rig).filter((c) => c.action === "prepare");
    const desc = { brace: "Brace — reduce the next hit's damage.", evasive: "Evasive — chance to dodge the next shot entirely.", return: "Return Fire — shoot back when attacked.", "raise-shield": "Raise Shield — the Bulwark takes the hit." };
    modal({
      title: "Prepare a reaction",
      body: el("div", { class: "attack-list" }, preps.map((p) => el("button", { class: "attack-opt", onClick: () => { document.querySelector(".modal-back")?.remove(); this.act(rig, { action: "prepare", prep: p.prep }); } }, el("b", {}, p.prep), el("span", {}, desc[p.prep] || "")))),
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

  // ---- Advisor: the Hard bot's brain, pointed at your rig ----
  advise(rig) {
    const room = this.previewRoom(rig);
    const cmd = chooseAction(room, rig, this.advisorWeights);
    this.emit("advisor", cmd);
    if (!cmd) { toast("Advisor: nothing here beats standing still — end the activation.", "info", 4000); return; }
    const a = cmd.attrs;
    const what = {
      move: `move to (${a.dest?.x.toFixed(1)}, ${a.dest?.y.toFixed(1)})`, sprint: `sprint to (${a.dest?.x.toFixed(1)}, ${a.dest?.y.toFixed(1)})`,
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

  // ---- Input ----
  onHover(hit) {
    if (this.mode && (this.mode.key === "move" || this.mode.key === "sprint" || this.mode.key === "jumpjets") && hit.field && this.ghost) {
      const p = this.movePreview(hit.field);
      this.ghost.position.set(hit.field.x, 0, hit.field.y);
      this.ghost.rotation.y = -p.facing * DEG;
      this.ghostMat.color.setHex(p.ok ? 0x33ff99 : 0xff4433);
      if (this.pathLine) this.world.overlay.remove(this.pathLine);
      if (p.route) this.pathLine = this.world.path(p.route.path, p.ok ? 0x33ff99 : 0xff4433);
      this.hud.tip(p.route ? `${p.route.length.toFixed(1)}" of ${this.mode.budget.toFixed(1)}" · facing ${Math.round(p.facing)}° ${p.ok ? "" : "— out of reach"} · Shift+wheel to turn` : "No path there");
      this.mode.preview = { ...p, dest: hit.field };
      return;
    }
    // Hover tooltip for rigs.
    const r = hit.mechId != null ? this.rig(hit.mechId) : null;
    this.hud.hoverRig(r, this.state);
    if (this.mode?.byTarget && r) {
      const list = this.mode.byTarget.get(r.name);
      if (list) {
        const c = list.find((x) => x.action !== "aimed") || list[0];
        const ed = c.weapon ? expectedDamage(this.mode.rig, r, c.weapon, { arc: c.arc, distance: c.distance, cover: c.cover, round: this.game.round }) : 0;
        this.hud.tip(`${r.name}: ${c.arc} arc · ${c.distance?.toFixed(1)}" · ≈${ed.toFixed(1)} SP — click to choose weapon`);
        this.director.mechs.get(this.mode.rig.id)?.aimAt(new THREE.Vector3(r.pos.x, 2, r.pos.y));
      }
    }
  }

  onClick(hit) {
    if (this.mode && (this.mode.key === "move" || this.mode.key === "sprint" || this.mode.key === "jumpjets")) {
      const p = this.mode.preview;
      if (!p) return;
      if (!p.ok) { toast("Out of reach — pick a spot inside the ring.", "warn"); return; }
      const rig = this.mode.rig;
      const attrs = this.mode.key === "jumpjets"
        ? { action: "jumpjets", dest: { x: +p.dest.x.toFixed(2), y: +p.dest.y.toFixed(2) }, facing: Math.round(p.facing) }
        : { action: this.mode.key, dest: { x: +p.dest.x.toFixed(2), y: +p.dest.y.toFixed(2) }, facing: Math.round(p.facing) };
      // Auto-declare engagement when ending in base contact with an enemy.
      const foe = this.state.rigs.find((e) => e.owner !== rig.owner && !e.destroyed && e.pos && Math.hypot(e.pos.x - p.dest.x, e.pos.y - p.dest.y) - radiusOf(e) - radiusOf(rig) < 0.3);
      if (foe) attrs.engage = foe.name;
      this.cancelMode();
      this.act(rig, attrs);
      return;
    }
    if (this.mode?.byTarget && hit.mechId != null) {
      const r = this.rig(hit.mechId);
      const list = r && this.mode.byTarget.get(r.name);
      if (list) { this.chooseAttack(this.mode.rig, r, list); return; }
    }
    if (hit.mechId != null) { this.select(hit.mechId); return; }
    if (this.mode) this.cancelMode();
  }

  onKey(e) {
    if (e.target.closest?.("input,textarea")) return;
    if (e.key === "Escape") this.cancelMode();
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
    if (!this.mode || !["move", "sprint", "jumpjets"].includes(this.mode.key)) return false;
    this.mode.facingOffset += Math.sign(dy) * 15;
    return true;
  }

  // ---- Gates the human owes ----
  handleGates() {
    const g = this.game;
    if (this.gateOpen) return;
    if (g.pendingAnswer?.side === this.side) {
      const eligible = this.state.rigs.filter((r) => r.owner === this.side && !r.destroyed && r.preparation == null);
      if (!eligible.length) return;
      this.gateOpen = true;
      let pick = { rig: eligible[0].name, prep: "brace" };
      setTimeout(() => document.querySelector(".modal .attack-opt")?.classList.add("best"), 0);
      const preps = ["brace", "evasive", "return", ...ANSWER_COUNTERS];
      const desc = { brace: "soak the next hit", evasive: "dodge the next shot", return: "shoot back", riposte: "counter a melee strike", sidestep: "slip a charging attacker", exploit: "punish an overcommitted attacker" };
      const body = el("div", {},
        el("p", {}, `🎁 Free reaction! Pick a mech and a trick it will pull the next time it's attacked. Not sure? `, el("b", {}, "Brace"), ` (take less damage) is always a good pick.`),
        el("label", {}, "Rig ", el("select", { onChange: (e) => { pick.rig = e.target.value; } }, eligible.map((r) => el("option", { value: r.name }, r.name)))),
        el("div", { class: "attack-list" }, preps.map((p) => el("button", { class: "attack-opt", onClick: (e) => { pick.prep = p; e.currentTarget.parentNode.querySelectorAll(".attack-opt").forEach((b) => b.classList.remove("best")); e.currentTarget.classList.add("best"); } }, el("b", {}, p), el("span", {}, desc[p])))));
      modal({ title: "Answer token", body, dismissable: false, actions: [{ label: "Place it", primary: true, onClick: async () => { await this.send("answer", { name: pick.rig, prep: pick.prep, side: this.side }); this.gateOpen = false; this.refresh(); } }] });
      return;
    }
    const pr = g.pendingReaction;
    if (pr && pr.defender === this.side) {
      this.gateOpen = true;
      const reactor = this.rig(pr.targetId), attacker = this.rig(pr.attackerId);
      if (pr.kind === "evasive") {
        // Digital adjudication: the manoeuvre breaks the shot on a 4+ (rules.md §5, digital note).
        const roll = 1 + Math.floor(Math.random() * 6);
        const evaded = roll >= 4;
        toast(`💨 ${reactor?.name} evades… rolled ${roll} — ${evaded ? "dodged!" : "caught!"}`, evaded ? "good" : "bad", 3500);
        this.send("react", { evaded, side: this.side }).then(() => { this.gateOpen = false; });
      } else if (pr.kind === "return" && attacker && reactor) {
        const geo = deriveAttackGeometry(this.state, reactor, attacker);
        const inReach = geo.inMeleeReach;
        const weapon = inReach ? "melee" : "longRange";
        modal({
          title: `↩️ Return Fire — ${reactor.name}`,
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
        // Digital: the cook-off hits every rig within 4" of the wreck.
        const targets = this.state.rigs.filter((r) => r.id !== src.id && !r.destroyed && r.pos && src.pos && distanceBetween(spatial(r), spatial(src)) <= 4 + radiusOf(r)).map((r) => r.name);
        this.send("blast", { targets }).then(() => { this.gateOpen = false; });
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
      modal({
        title: o?.winner == null ? "Draw" : won ? "🏆 Victory" : "💀 Defeat",
        cls: won ? "victory" : "defeat",
        body: el("div", {},
          el("p", {}, `Reason: ${o?.reason || "—"} · VP ${this.game.sides.map((s) => `${s.id.toUpperCase()} ${s.vp}`).join(" – ")} · Round ${this.game.round}`)),
        actions: [{ label: "Main menu", primary: true, onClick: () => this.onExit?.() }],
        dismissable: false,
      });
    });
  }
}
