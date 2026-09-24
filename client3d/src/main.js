// App shell: one persistent 3D World, screens swapped over it (title, squad
// builder, live battle, tutorial, replay theatre, balance lab).
import "./styles.css";
import { World } from "./scene/world.js";
import { Director } from "./game/director.js";
import { LiveMatch } from "./game/live.js";
import { Replay } from "./game/replay.js";
import { Hud } from "./ui/hud.js";
import { titleScreen, squadBuilder, createBotRoom } from "./ui/menu.js";
import { labScreen } from "./ui/lab.js";
import { Coach, TUTORIAL_SQUAD } from "./ui/tutorial.js";
import { el, clear, fill, toast, modal } from "./ui/dom.js";
import { api } from "./api.js";
import { CHASSIS } from "/shared/game-state.js";
import { mulberry32 } from "/shared/sim/match.js";

const world = new World(document.getElementById("stage"));
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
  const d = new Director(world);
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
  return { destroy() { clearInterval(timer); world.tickers.delete(spin); d.reset(); } };
}

function home() {
  teardown();
  attract = attractMode();
  titleScreen(screen, {
    onPlay: () => builder(),
    onTutorial: () => tutorial(),
    onLab: () => lab(),
    onWatch: () => watch(),
  });
}

function builder() {
  squadBuilder(screen, {
    onBack: home,
    onStart: async (cfg) => {
      fill(screen, el("div", { class: "loading" }, "Deploying…"));
      try { const room = await createBotRoom(cfg); play(room); }
      catch (e) { toast(e.message, "bad", 5000); builder(); }
    },
  });
}

async function play(room, { tutorial = false } = {}) {
  teardown();
  screen.style.display = "none";
  const hud = new Hud(hudRoot);
  const match = new LiveMatch(world, hud, { room, side: "a", onExit: home });
  active = match;
  hudRoot.append(el("div", { class: "hud-menu" },
    el("button", { class: "btn ghost", onClick: () => modal({ title: "Leave battle?", body: el("p", {}, `Room ${room} stays on the server — you can't rejoin from here yet.`), actions: [{ label: "Stay", ghost: true }, { label: "Leave", primary: true, onClick: home }] }) }, "☰"),
    el("button", { class: "btn ghost", title: "Rules cheat-sheet", onClick: cheatSheet }, "📖")));
  try { await match.start(); } catch (e) { toast(e.message, "bad"); return home(); }
  if (tutorial) match.coach = new Coach(hudRoot, match);
}

async function tutorial() {
  fill(screen, el("div", { class: "loading" }, "Setting up the training ground…"));
  try { const room = await createBotRoom({ squad: TUTORIAL_SQUAD, tier: "easy" }); play(room, { tutorial: true }); }
  catch (e) { toast(e.message, "bad", 5000); home(); }
}

function lab() {
  teardown();
  labScreen(screen, { onBack: home, onReplay: (r) => replay(r, lab) });
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
      el("p", {}, el("b", {}, "Turns: "), "sides alternate activating one rig; each rig acts once per round with 3 actions. 10 rounds."),
      el("p", {}, el("b", {}, "Heat: "), "every action adds heat; only 1 bleeds off per round. End an activation over capacity (light 6, medium 5) and you roll D12 + 2×excess on the overheat table. Shut Down vents 2 per unused action."),
      el("p", {}, el("b", {}, "Attacks: "), "only into your front 90° arc. Side/rear hits are deadlier. Long-range needs line of sight and range band; melee needs base reach."),
      el("p", {}, el("b", {}, "Scoring: "), "hold objectives (within 2\", uncontested) at round end: centre 2 VP, others 1. Killing the ★ priority target: +2."),
      el("p", {}, el("b", {}, "Reactions: "), "Prepare a face-down Brace / Evasive / Return Fire; Answer tokens give free ones."),
    ),
    actions: [{ label: "Got it", primary: true }],
  });
}

home();
