import { S } from "./state.js";
import { sendCommand } from "./api.js";
import { availableActions, actionBudget, phaseSummary, outcomeText } from "/shared/battle-view.js";
import { openAttackWizard } from "./attack-wizard.js";
import { playResolution, promptDice } from "./roll-dialog.js";

const hud = document.getElementById("battleHud");
const bhPhase = document.getElementById("bhPhase");
const bhRound = document.getElementById("bhRound");
const bhTurn = document.getElementById("bhTurn");
const bhTokens = document.getElementById("bhTokens");
const bhPrompt = document.getElementById("bhPrompt");
const outcomeBanner = document.getElementById("outcomeBanner");

const mySide = () => S.session?.side || "a";

// ---- Resolution log watcher: animate new server entries once each ----
let lastSeenResolution = 0;
export function syncResolutions() {
  const log = S.game?.resolutions || [];
  const fresh = log.filter((e) => e.id > lastSeenResolution);
  if (!fresh.length) return;
  lastSeenResolution = log[log.length - 1].id;
  // Play only the newest to avoid a backlog stampede; its summary reflects the change.
  playResolution(fresh[fresh.length - 1]);
}

export function renderBattle() {
  const g = S.game;
  if (!g || !g.started) { hud.hidden = true; outcomeBanner.hidden = true; return; }
  hud.hidden = false;
  const sum = phaseSummary(g, S.rigs);
  bhPhase.textContent = sum.label;
  bhRound.textContent = `R${sum.round}`;
  bhTurn.innerHTML = sum.turnName
    ? `Turn: <b>${sum.turnName}</b>${sum.activeName ? ` — ${sum.activeName}` : ""}`
    : "";
  const tok = sum.answerTokens[mySide()] || 0;
  bhTokens.textContent = tok ? `⟡ ${tok} Answer` : "";

  renderPrompt(g);
  renderOutcome(g);
  syncResolutions();
}

function renderPrompt(g) {
  bhPrompt.innerHTML = "";
  const auto = g.autoResolve;
  if (g.phase === "initiative" && g.round >= 2) {
    const btn = mkBtn("Roll initiative", () => {
      if (auto) sendCommand("initiative", {});
      else promptTwoDice("Initiative D12", (a, b) => sendCommand("initiative", { dice: { a, b } }));
    });
    bhPrompt.appendChild(btn);
  } else if (g.phase === "recovery") {
    if (!g.recoveryVp?.[mySide()]) {
      const btn = mkBtn("Score objectives (VP)", () => openVpPrompt());
      bhPrompt.appendChild(btn);
    } else {
      const note = document.createElement("div");
      note.className = "bh-tokens";
      note.textContent = "Waiting for opponent to score…";
      bhPrompt.appendChild(note);
    }
  } else if (g.pendingBlast) {
    const btn = mkBtn("Resolve blast (mark rigs in 12\")", () => openBlastPrompt());
    bhPrompt.appendChild(btn);
  }
}

function renderOutcome(g) {
  if (g.phase !== "finished") { outcomeBanner.hidden = true; return; }
  outcomeBanner.hidden = false;
  outcomeBanner.textContent = outcomeText(g.outcome, g.sides);
}

// ---- Action console injected into the active rig's body by tracker.js ----
export function buildActionConsole(rig) {
  const g = S.game;
  const t = g.turn;
  const wrap = document.createElement("div");
  wrap.className = "action-console";
  if (!t || t.activeRigId !== rig.id || g.phase !== "activation") return wrap;

  const b = actionBudget(rig, t);
  const budget = document.createElement("div");
  budget.className = "ac-budget";
  const pips = document.createElement("div");
  pips.className = "ac-pips";
  for (let i = 0; i < 5; i++) {
    const pip = document.createElement("span");
    pip.className = "ac-pip" + (i < b.used ? " spent" : i >= b.max ? " locked" : "");
    pips.appendChild(pip);
  }
  budget.innerHTML = `<span class="ac-budget-label">Actions ${b.left}/${b.max}${b.reduced ? " · <span class='ac-reduced'>Hull damage −2</span>" : ""}</span>`;
  budget.appendChild(pips);
  wrap.appendChild(budget);

  const grid = document.createElement("div");
  grid.className = "ac-grid";
  for (const act of availableActions(rig, t)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ac-btn";
    btn.disabled = !act.enabled;
    const heatLabel = act.heat > 0 ? `+${act.heat} heat` : act.heat < 0 ? `${act.heat} heat` : "0 heat";
    btn.innerHTML = `${act.label}<span class="ac-heat" data-heat="${act.heat}">${heatLabel}</span>`;
    btn.addEventListener("click", () => onAction(rig, act.key));
    grid.appendChild(btn);
  }
  wrap.appendChild(grid);

  const end = mkBtn("End Activation", () => endActivation(rig));
  end.classList.add("ac-end", "ghost");
  wrap.appendChild(end);
  return wrap;
}

function onAction(rig, key) {
  const auto = S.game.autoResolve;
  if (key === "fire" || key === "aimed" || key === "ram") { openAttackWizard(rig, key); return; }
  if (key === "repair") {
    const loc = window.prompt("Repair which location? (hull/arms/legs/engine)", "hull");
    if (!loc) return;
    if (auto) sendCommand("action", { name: rig.name, action: "repair", loc });
    else promptOneDie("Repair D12", (d) => sendCommand("action", { name: rig.name, action: "repair", loc, dice: { repair: d } }));
    return;
  }
  if (key === "emergencypatch") {
    const loc = window.prompt("Emergency Patch which location? (hull/arms/legs/engine)", "hull");
    if (!loc) return;
    sendCommand("action", { name: rig.name, action: "emergencypatch", loc });
    return;
  }
  sendCommand("action", { name: rig.name, action: key });
}

function endActivation(rig) {
  const auto = S.game.autoResolve;
  const meterOver = rig.engine.heat > (heatCap(rig));
  if (auto || !meterOver) sendCommand("endactivation", { name: rig.name });
  else promptOneDie("Overheat D12", (d) => sendCommand("endactivation", { name: rig.name, dice: { overheat: d } }));
}

function heatCap(rig) {
  return ({ light: 6, medium: 5, heavy: 4, colossal: 3 })[rig.weightClass] ?? 5;
}

// ---- Small prompt helpers (manual dice + VP + blast) ----
function openVpPrompt() {
  const pts = window.prompt("Victory points scored this Recovery (centre 2, each corner 1):", "0");
  if (pts == null) return;
  sendCommand("vp", { side: mySide(), points: String(parseInt(pts, 10) || 0) });
}
function openBlastPrompt() {
  const names = window.prompt("Names of rigs within 12\" (comma-separated):", "");
  if (names == null) return;
  const targets = names.split(",").map((s) => s.trim()).filter(Boolean);
  sendCommand("blast", { targets });
}
async function promptOneDie(label, cb) {
  const out = await promptDice([{ key: "d", label, sides: 12 }], label);
  cb(out.d);
}
async function promptTwoDice(label, cb) {
  const out = await promptDice([{ key: "a", label: "Side A", sides: 12 }, { key: "b", label: "Side B", sides: 12 }], label);
  cb(out.a, out.b);
}
function mkBtn(text, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bh-btn";
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}
