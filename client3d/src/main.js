// App shell: one persistent 3D World, screens swapped over it (title, squad
// builder, live battle, tutorial, replay theatre, balance lab).
import "./styles.css";
import { installTooltips } from "./ui/tooltip.js";
installTooltips();
import { World } from "./scene/world.js";
import { Director } from "./game/director.js";
import { LiveMatch } from "./game/live.js";
import { Replay } from "./game/replay.js";
import { Hud } from "./ui/hud.js";
import { titleScreen, squadBuilder, createBotRoom, createVersusRoom, addSquad, opponentOf, readyUntilStarted, TABLES } from "./ui/menu.js";
import { labScreen } from "./ui/lab.js";
import { simCenter } from "./ui/simcenter.js";
import { campaignScreen } from "./ui/campaign.js";
import { Coach, LESSONS } from "./ui/tutorial.js";
import { el, clear, fill, toast, modal } from "./ui/dom.js";
import { api } from "./api.js";
import { icon } from "./ui/icons.js";
import { sfx, isMuted, setMuted } from "./audio.js";
import { settings } from "./settings.js";
import { resetWires } from "./ui/tips.js";
import { outcomeWords } from "./ui/mission.js";

function muteButton() {
  const b = el("button", { class: "btn ghost", title: "Sound on/off" }, icon(isMuted() ? "mute" : "sound"));
  b.addEventListener("click", () => { setMuted(!isMuted()); b.replaceChildren(icon(isMuted() ? "mute" : "sound")); });
  return b;
}
// Every button clicks.
document.addEventListener("click", (e) => { if (e.target.closest?.("button")) sfx.click(); }, true);
import { CHASSIS } from "/shared/game-state.js";
import { mulberry32 } from "/shared/sim/match.js";

const world = new World(document.getElementById("stage"));
// Debug handle (console / automated checks): inspect the live scene.
window.__oi3d = { world };
const screen = document.getElementById("screen");
const hudRoot = document.getElementById("hud");
let active = null; // current LiveMatch / Replay / Coach
let attract = null;

function teardown() {
  active?.coach?.destroy();
  active?.destroy?.();
  active = null;
  attract?.destroy(); attract = null;
  clear(hudRoot); clear(screen);
  world.clearOverlay();
  world.fx.clear();
  screen.style.display = "";
}

// Title backdrop: a slow orbit over a staged table of every chassis.
function attractMode() {
  const d = new Director(world, { quiet: true });
  const rnd = mulberry32(Date.now() % 1e6);
  world.buildField({ width: 54, height: 36, terrain: [
    { kind: "building", shape: "rect", x: 20, y: 14, w: 6, h: 4.5, rot: 10 }, { kind: "building", shape: "rect", x: 36, y: 23, w: 5, h: 5, rot: -12 },
    { kind: "barricade", shape: "rect", x: 27, y: 25, w: 7, h: 0.9, rot: 80 }, { kind: "rock", shape: "rect", x: 12, y: 24, w: 2.5, h: 2, rot: 30 },
    { kind: "crate", shape: "rect", x: 42, y: 11, w: 2, h: 2, rot: 15 },
  ] }, [{ x: 27, y: 18, vp: 2 }, { x: 13, y: 9, vp: 1 }, { x: 41, y: 27, vp: 1 }]);
  const rigs = CHASSIS.map((c, i) => ({ id: i + 1, name: c.name, owner: i % 2 ? "b" : "a", chassis: c.id, pos: { x: 8 + (i % 6) * 8 + rnd() * 2, y: 10 + Math.floor(i / 6) * 14 + rnd() * 3 }, facing: rnd() * 360, heat: 0, destroyed: false, sp: { hull: [1, 1], arms: [1, 1], legs: [1, 1], engine: [1, 1] } }));
  d.snap({ rigs, round: 1, log: [] });
  const spin = (dt) => { world.cam.yaw += dt * 0.05; };
  world.tickers.add(spin);
  world.cam.dist = 48; world.cam.pitch = 0.6;
  let n = 0;
  const timer = setInterval(() => {
    const a = [...d.mechs.values()][Math.floor(rnd() * rigs.length)];
    const b = [...d.mechs.values()][Math.floor(rnd() * rigs.length)];
    if (a === b) return;
    const r = rigs.find((x) => x.id === a.id);
    if (n++ % 2) {
      const np = { x: Math.max(4, Math.min(50, r.pos.x + (rnd() - 0.5) * 10)), y: Math.max(4, Math.min(32, r.pos.y + (rnd() - 0.5) * 10)) };
      d.play({ round: 1, rigs: rigs.map((x) => x === r ? { ...x, pos: np } : x), log: [] });
      r.pos = np;
    } else {
      d.play({ round: 1, rigs, log: [{ kind: "attack", rigId: a.id, targetId: b.id, weapon: rnd() < 0.5 ? a.longRange : a.melee, summary: `${a.name} → ${b.name} with x (Pen 5): 2 hit(s) = ${1 + Math.floor(rnd() * 4)} SP to hull` }] });
    }
  }, 1800);
  return { destroy() { clearInterval(timer); world.tickers.delete(spin); d.dispose(); } };
}

function home() {
  teardown();
  attract = attractMode();
  titleScreen(screen, {
    onPlay: () => builder(),
    onTutorial: () => tutorial(),
    onLab: () => lab(),
    onSims: () => sims(),
    onVersus: () => versus(),
    onWatch: () => watch(),
    onCampaign: () => campaign(),
  });
  screen.append(el("div", { class: "title-mute" }, el("button", { class: "btn ghost", title: "Settings", onClick: settingsPanel }, "⚙"), muteButton()));
  lastBattle().then((last) => {
    if (!last) return;
    const menu = screen.querySelector(".menu");
    menu?.prepend(el("button", { class: "btn big primary", onClick: () => play(last.room, { cfg: last.cfg, tutorial: last.tutorial, side: last.side || "a", hotseat: !!last.hotseat }) }, `▶  Continue battle · round ${last.round}`));
    menu?.querySelector(".btn.primary + .btn.primary, .menu > .btn:nth-child(2)")?.classList.remove("primary");
  });
}

function builder() {
  squadBuilder(screen, {
    onBack: home,
    onStart: async (cfg) => {
      fill(screen, el("div", { class: "loading" }, "Deploying…"));
      try { const room = await createBotRoom(cfg); play(room, { cfg }); }
      catch (e) { toast(e.message, "bad", 5000); builder(); }
    },
  });
}

async function play(room, { tutorial = false, lesson = null, cfg = null, side = "a", hotseat = false } = {}) {
  teardown();
  screen.style.display = "none";
  // Remember the battle so the title screen can offer "Continue".
  if (!lesson) try { localStorage.setItem("oi3d-last", JSON.stringify({ room, cfg, tutorial, side, hotseat, at: Date.now() })); } catch {}
  const hud = new Hud(hudRoot);
  const rematch = cfg ? async () => { fill(screen, el("div", { class: "loading" }, "Rematch: deploying…")); screen.style.display = ""; try { play(await createBotRoom(cfg), { cfg }); } catch (e) { toast(e.message, "bad"); home(); } } : null;
  const back = () => home();
  const match = new LiveMatch(world, hud, { room, side, hotseat, tutorial: !!lesson, onExit: home, onRematch: rematch, onReplay: (r) => replay(r, back) });
  active = match; if (window.__oi3d) window.__oi3d.match = match;
  hudRoot.append(el("div", { class: "hud-menu" },
    el("button", { class: "btn ghost", title: "Menu", onClick: () => modal({ title: "Paused", body: el("p", {}, `Room ${room} stays on the server. "Continue battle" on the title screen brings you back.`), actions: [{ label: "Resume", primary: true }, rematch ? { label: "Restart (same squads)", ghost: true, onClick: rematch } : null, { label: "Main menu", ghost: true, onClick: home }].filter(Boolean) }) }, "☰"),
    el("button", { class: "btn ghost", title: "Rules cheat-sheet", onClick: cheatSheet }, icon("book")),
    el("button", { class: "btn ghost", title: "Hotkeys (?)", onClick: hotkeys }, "⌨"),
    el("button", { class: "btn ghost", title: "Settings", onClick: settingsPanel }, "⚙"),
    muteButton()));
  try { await match.start(); } catch (e) { toast(e.message, "bad"); return home(); }
  if (lesson) {
    const next = LESSONS[LESSONS.indexOf(lesson) + 1];
    match.coach = new Coach(hudRoot, match, lesson, { onMenu: tutorial, onNext: next ? () => startLesson(next) : null });
  }
}

// ---- Campaign (single player, server-authoritative run) ----
function campaign(opts = {}) {
  teardown();
  attract = attractMode();
  campaignScreen(screen, { onHome: home, onDeploy: (room, contract) => playCampaign(room, contract), ...opts });
}

// A campaign battle: like play(), but no "Continue battle" save, no rematch,
// no outcome modal; when it ends the server reads the room (/run/resolve) and
// the Debrief takes over.
async function playCampaign(room, contract = null) {
  teardown();
  screen.style.display = "none";
  const hud = new Hud(hudRoot);
  const back = () => campaign();
  const match = new LiveMatch(world, hud, { room, side: "a", onExit: back, onRematch: null, noOutcomeModal: true, contract });
  active = match; if (window.__oi3d) window.__oi3d.match = match;
  let resolving = false;
  const resolve = async () => {
    if (resolving || active !== match) return;
    resolving = true;
    try { campaign({ view: await api.campaign.resolve(), fresh: "debrief" }); }
    catch (e) { toast(e.message, "bad"); campaign(); }
  };
  match.events.addEventListener("finished", (e) => {
    const won = e.detail?.winner === "a";
    const why = outcomeWords(e.detail, match.state?.campaign);
    hudRoot.append(el("div", { class: `cp-battle-end ${won ? "won" : "lost"}` },
      el("div", { class: "cp-stamp big anim " + (won ? "win" : "loss") }, won ? "Victory" : e.detail?.winner == null ? "Draw" : "Defeat"),
      why ? el("div", { class: `cp-end-why ${won ? "win" : "loss"}` }, why) : null,
      el("button", { class: "btn big primary", onClick: resolve }, "Debrief ▸")));
    setTimeout(resolve, 4500);
  });
  hudRoot.append(el("div", { class: "hud-menu" },
    el("button", { class: "btn ghost", title: "Menu", onClick: () => modal({ title: "Paused", body: el("p", {}, "The contract stays live on the server: \"Continue run\" at HQ brings you back to this battle."), actions: [{ label: "Resume", primary: true }, { label: "Back to HQ", ghost: true, onClick: back }] }) }, "☰"),
    el("button", { class: "btn ghost", title: "Rules cheat-sheet", onClick: cheatSheet }, icon("book")),
    el("button", { class: "btn ghost", title: "Hotkeys (?)", onClick: hotkeys }, "⌨"),
    el("button", { class: "btn ghost", title: "Settings", onClick: settingsPanel }, "⚙"),
    muteButton()));
  try { await match.start(); } catch (e) { toast(e.message, "bad"); return campaign(); }
}

// Resume the last battle if the server still has it and it isn't over.
async function lastBattle() {
  let last = null;
  try { last = JSON.parse(localStorage.getItem("oi3d-last") || "null"); } catch {}
  if (!last?.room) return null;
  try {
    const r = await api.state(last.room, last.side || "a");
    if (!r.state?.game?.started || r.state.game.phase === "finished") return null;
    return { ...last, round: r.state.game.round };
  } catch { return null; }
}

function hotkeys() {
  const rows = [["WASD / arrows", "pan camera"], ["Q / E, right-drag", "rotate camera"], ["Wheel", "zoom"], ["Two fingers", "pinch zoom · twist rotate · drag pan"], ["Tab", "next ready rig"], ["1 · 2 · 3 · 4 · 5 · 6", "Move · Sprint · Fire · Aimed · Prepare · Shut Down"], ["Press, drag, release", "move: pick the spot, drag to face, release to confirm"], ["Shift + wheel", "turn while placing a move"], ["Right-click enemy", "quick attack (best plain option)"], ["Long-press a rig", "full rig sheet"], ["T", "threat map on/off"], ["Enter", "end activation"], ["Esc / right-click", "cancel"], ["Ctrl+Z", "undo (dice-free steps only)"], ["Space", "skip animation"], ["?", "this list"]];
  modal({ title: "⌨ Hotkeys", body: el("table", { class: "keys" }, rows.map(([k, v]) => el("tr", {}, el("td", {}, el("kbd", {}, k)), el("td", {}, v)))), actions: [{ label: "Close", primary: true }] });
}
window.addEventListener("keydown", (e) => { if (e.key === "?" && !e.target.closest?.("input,textarea")) hotkeys(); });

function settingsPanel() {
  const toggle = (k, label) => el("label", { class: "set-row" }, el("input", { type: "checkbox", checked: !!settings.get(k), onChange: (e) => settings.set(k, e.target.checked) }), label);
  modal({
    title: "⚙ Settings",
    body: el("div", { class: "settings" },
      toggle("nameplates", "Nameplates over mechs"),
      toggle("barks", "Pilot speech bubbles"),
      toggle("dangerPreview", "Show danger when placing a move"),
      toggle("followCam", "Camera follows the enemy's actions (and punches in on kills)"),
      toggle("diceTray", "Roll the dice on screen"),
      toggle("threat", "Threat map (enemy fire zones, T)"),
      toggle("edgePan", "Pan the camera at screen edges"),
      toggle("wires", "Wires from HQ (situational tips)"),
      el("button", { class: "btn ghost", onClick: () => { resetWires(); toast("All HQ wires will be sent again.", "good"); } }, "Replay all tips"),
      el("label", { class: "set-row" }, "Volume ", el("input", { type: "range", min: 0, max: 1, step: 0.05, value: settings.get("volume"), onInput: (e) => settings.set("volume", Number(e.target.value)) })),
      el("label", { class: "set-row" }, "Animation speed ", el("select", { onChange: (e) => { settings.set("speed", Number(e.target.value)); if (active?.director) active.director.speed = Number(e.target.value); } }, [1, 2, 4].map((v) => el("option", { value: v, selected: settings.get("speed") === v }, `${v}×`))))),
    actions: [{ label: "Done", primary: true }],
  });
}

// Training Grounds: pick a lesson; each is its own scripted scenario room.
function tutorial() {
  teardown();
  screen.style.display = "";
  let done = [];
  try { done = JSON.parse(localStorage.getItem("oi3d-lessons") || "[]"); } catch {}
  fill(screen, el("div", { class: "training" },
    el("h1", {}, "Training Grounds"),
    el("p", { class: "muted" }, "One mechanic per lesson, in a set-up situation against a practice dummy. A few minutes each; take them in order or jump to what you need."),
    el("div", { class: "lessons" }, LESSONS.map((l, i) => el("button", { class: `lesson ${done.includes(l.id) ? "done" : ""}`, onClick: () => startLesson(l) },
      el("span", { class: "l-n" }, String(i + 1)), el("span", { class: "l-ic" }, icon(l.icon)),
      el("div", {}, el("b", {}, l.title), el("div", { class: "muted" }, l.blurb)),
      done.includes(l.id) ? el("span", { class: "l-ok", title: "Completed" }, "✓") : null))),
    el("button", { class: "btn ghost", onClick: home }, "‹ Back")));
}

async function startLesson(lesson) {
  fill(screen, el("div", { class: "loading" }, `Setting up: ${lesson.title}…`));
  screen.style.display = "";
  try {
    const room = `TRAIN-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    await api.join(room, "a");
    await api.command(room, "a", "scenario", { id: lesson.scenario || lesson.id });
    play(room, { lesson });
  } catch (e) { toast(e.message, "bad", 5000); tutorial(); }
}

function lab() {
  teardown();
  labScreen(screen, { onBack: home, onLibrary: (filter) => sims(filter) });
}

// ---- Versus: two humans ----
function versus() {
  const code = el("input", { placeholder: "Room code, e.g. VS-4K2Q", style: { width: "220px", textTransform: "uppercase" } });
  modal({
    title: "⚔ Versus: 2 players", cls: "wide",
    body: el("div", { class: "vs-menu" },
      el("div", { class: "vs-opt" }, el("h3", {}, "🌐 Host an online room"), el("p", { class: "muted" }, "Build your squadron and get a room code. Send it to your friend; the battle starts when they've deployed."),
        el("button", { class: "btn primary", onClick: () => { document.querySelector(".modal-back")?.remove(); hostVersus(); } }, "Host")),
      el("div", { class: "vs-opt" }, el("h3", {}, "🔗 Join a room"), el("p", { class: "muted" }, "Enter the code your friend sent you."),
        el("div", { style: { display: "flex", gap: "8px" } }, code, el("button", { class: "btn primary", onClick: () => { const c = code.value.trim().toUpperCase(); if (!c) return; document.querySelector(".modal-back")?.remove(); joinVersus(c); } }, "Join"))),
      el("div", { class: "vs-opt" }, el("h3", {}, "🪑 Same screen (hot-seat)"), el("p", { class: "muted" }, "Two players, one device. You take turns; a curtain hides the board while you swap."),
        el("button", { class: "btn primary", onClick: () => { document.querySelector(".modal-back")?.remove(); hotseatVersus(); } }, "Play"))),
    actions: [{ label: "Back", ghost: true }],
  });
}

function waiting(title, lines) {
  fill(screen, el("div", { class: "title" }, el("h2", {}, title), ...lines, el("button", { class: "btn ghost", onClick: home }, "Cancel")));
  screen.style.display = "";
}

async function hostVersus() {
  teardown();
  squadBuilder(screen, { mode: "pvp", title: "Commission your squadron (host)", cta: "Create room ▸", onBack: home, onStart: async ({ squad, table }) => {
    waiting("Setting up…", []);
    try {
      const room = await createVersusRoom({ squad, table });
      const link = `${location.origin}${location.pathname}?join=${room}`;
      const status = el("p", { class: "muted" }, "Waiting for your opponent to join…");
      waiting("Room ready", [el("p", {}, "Send this code to your opponent:"), el("div", { class: "vs-code" }, room),
        el("p", { class: "muted small" }, "or this link: ", el("b", { style: { userSelect: "all" } }, link)),
        el("button", { class: "btn", onClick: () => { navigator.clipboard?.writeText(link); toast("Link copied.", "good"); } }, "Copy link"), status]);
      await readyUntilStarted(room, "a", (st) => {
        const theirs = st.rigs.filter((r) => r.owner === "b").length;
        status.textContent = theirs ? `Opponent is deploying (${theirs} rigs)…` : "Waiting for your opponent to join…";
      });
      play(room, { side: "a" });
    } catch (e) { toast(e.message, "bad", 5000); home(); }
  } });
}

async function joinVersus(room) {
  teardown();
  waiting(`Joining ${room}…`, []);
  try {
    await api.join(room, "b", "Challenger");
    const opp = await opponentOf(room, "b");
    if (opp.started) { play(room, { side: "b" }); return; }
    if (!opp.need) { toast("That room has no host squadron yet. Check the code.", "bad", 5000); return home(); }
    squadBuilder(screen, { mode: "pvp", taken: opp.taken, need: opp.need, hostTable: false, title: `Commission your squadron (room ${room})`, cta: "Deploy ▸", onBack: home, onStart: async ({ squad }) => {
      waiting("Deploying…", [el("p", { class: "muted" }, "Waiting for the host to start the battle…")]);
      try { await addSquad(room, "b", squad); await readyUntilStarted(room, "b"); play(room, { side: "b" }); }
      catch (e) { toast(e.message, "bad", 5000); home(); }
    } });
  } catch (e) { toast(e.message, "bad", 5000); home(); }
}

async function hotseatVersus() {
  teardown();
  squadBuilder(screen, { mode: "pvp", title: "Cyan commander: commission your squadron", cta: "Next: Red commander ▸", onBack: home, onStart: ({ squad: cyan, table }) => {
    const need = { medium: 0, light: 0 };
    cyan.forEach((u) => { need[u.chassis.startsWith("medium") ? "medium" : "light"]++; });
    squadBuilder(screen, { mode: "pvp", taken: cyan.map((u) => u.chassis), need, hostTable: false, title: "Red commander: commission your squadron", cta: "Start battle ▸", onBack: home, onStart: async ({ squad: red }) => {
      waiting("Deploying…", []);
      try {
        const room = await createVersusRoom({ squad: cyan, table });
        await api.join(room, "b", "Red");
        await addSquad(room, "b", red);
        await api.command(room, "a", "ready", {});
        await readyUntilStarted(room, "b");
        play(room, { side: "a", hotseat: true });
      } catch (e) { toast(e.message, "bad", 5000); home(); }
    } });
  } });
}

function sims(filter = {}) {
  teardown();
  simCenter(screen, { onBack: home, filter, onOpen: (r) => replay(r, () => sims(filter)) });
}

async function watch() {
  const pick = { a: "normal", b: "hard" };
  const tiers = ["easy", "normal", "hard"];
  modal({
    title: "🍿 Watch bots fight",
    body: el("div", { class: "watch" },
      ["a", "b"].map((s) => el("label", {}, s === "a" ? "Cyan: " : "Red: ", el("select", { onChange: (e) => { pick[s] = e.target.value; } }, tiers.map((t) => el("option", { value: t, selected: pick[s] === t }, t))))),
      el("p", { class: "muted" }, "The server plays a full match headlessly (takes ~10s), then you watch the replay.")),
    actions: [{ label: "Cancel", ghost: true }, { label: "Fight!", primary: true, onClick: async () => {
      toast("Simulating the match…", "info", 8000);
      try { const r = await api.sim.match({ tiers: pick }); replay(r, home); } catch (e) { toast(e.message, "bad"); }
    } }],
  });
}

function replay(r, back) {
  teardown();
  screen.style.display = "none";
  active = new Replay(world, hudRoot, r, { onExit: back });
}

function cheatSheet() {
  modal({
    title: "📖 Quick rules",
    body: el("div", { class: "cheat" },
      el("p", {}, el("b", {}, "Turns: "), `sides alternate activating one rig; each rig acts once per round with 3 actions. ${active?.game?.maxRounds || 10} rounds.`),
      el("p", {}, el("b", {}, "Heat: "), "every action adds heat; only 1 bleeds off per round. End an activation over capacity (light 6, medium 5) and you roll D12 + 2×excess on the overheat table. Shut Down vents 2 per unused action."),
      el("p", {}, el("b", {}, "Attacks: "), "only into your front 90° arc. Side/rear hits are deadlier. Long-range needs line of sight and range band; melee needs base reach."),
      el("p", {}, el("b", {}, "Scoring: "), "hold objectives (within 2\", uncontested) at round end: centre 2 VP, others 1. Every kill: +1 VP; the ★ priority target pays +2 more."),
      el("p", {}, el("b", {}, "Grit: "), "the side behind gets Grit tokens each round (1 at 2+ VP behind, 2 at 5+, 3 at 8+): a free Improved reaction (Brace −3 Pen, dodges on 3+, counters +2 Pen), an upgrade to one already placed, or spent on an attack to reroll its misses. While behind, every kill pays a +2 VP bounty."),
      el("p", {}, el("b", {}, "Stagger: "), "an attack that deals no damage still rattles its target: +1 heat and −1 Aim on its next attack."),
      el("p", {}, el("b", {}, "Reactions: "), "Prepare a face-down Brace / Evasive / Return Fire; Answer tokens give free ones."),
    ),
    actions: [{ label: "Got it", primary: true }],
  });
}

// Debug handles for automated checks: mount a battle / campaign battle directly.
Object.assign(window.__oi3d, { play: (room, opts) => play(room, opts), playCampaign: (room, contract) => playCampaign(room, contract) });

// A shared link (?join=CODE) goes straight to joining.
const joinCode = new URLSearchParams(location.search).get("join");
if (joinCode) { history.replaceState(null, "", location.pathname); joinVersus(joinCode.toUpperCase()); } else home();
