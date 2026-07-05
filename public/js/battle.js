import { S } from "./state.js";
import { sendCommand } from "./api.js";
import { availableActions, actionBudget, phaseSummary, outcomeText } from "/shared/battle-view.js";
import { openAttackWizard } from "./attack-wizard.js";
import { playResolution, promptDice } from "./roll-dialog.js";
import { openDrawer, closeDrawer, choiceField } from "./drawer.js";

// A glyph per action so the console reads at a glance instead of as a wall of
// text. Equipment actives are keyed by their own action key; anything unmapped
// falls back to the cog.
const ACTION_ICONS = {
  move: "🦿", sprint: "💨", fire: "🎯", aimed: "◎", ram: "💥",
  reload: "🔄", repair: "🔧", prepare: "🛡️", shutdown: "⏻",
  harden: "🧱", purge: "❄️", jumpjets: "🚀", overclock: "⚡", emergencypatch: "🩹",
};
const iconFor = (key) => ACTION_ICONS[key] || "⚙️";

const LOC_CHOICES = [
  { value: "hull", label: "Hull", icon: "🛡️" },
  { value: "arms", label: "Arms", icon: "🦾" },
  { value: "legs", label: "Legs", icon: "🦿" },
  { value: "engine", label: "Engine", icon: "🔩" },
];

const hud = document.getElementById("battleHud");
const bhPhase = document.getElementById("bhPhase");
const bhRound = document.getElementById("bhRound");
const bhTurn = document.getElementById("bhTurn");
const bhTokens = document.getElementById("bhTokens");
const bhPrompt = document.getElementById("bhPrompt");
const outcomeBanner = document.getElementById("outcomeBanner");
const turnBanner = document.getElementById("turnBanner");
const tbIcon = document.getElementById("tbIcon");
const tbPrimary = document.getElementById("tbPrimary");
const tbSecondary = document.getElementById("tbSecondary");
const tbCta = document.getElementById("tbCta");

const mySide = () => S.session?.side || "a";
const enemySide = () => (mySide() === "a" ? "b" : "a");
const sideNameOf = (id) =>
  S.game?.sides?.find((s) => s.id === id)?.name || (id === "a" ? "Side A" : "Side B");
const sideReadyOf = (id) => Boolean(S.game?.sides?.find((s) => s.id === id)?.ready);
const rigCountOf = (id) => S.rigs.filter((r) => (r.owner || "a") === id).length;
const MIN_RIGS_TO_READY = 3;
let lastFocusPrimary = null; // drives the change-flash

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

// ---- Activation summary: when a Rig's activation ends (yours or the enemy's),
// recap what it actually did during that activation, drawn from the resolution
// log entries tagged with that Rig between its activation start and now.
let watchedActiveRig = null;      // rig id active on the previous render
let activationBaselineId = 0;     // highest resolution id when it started
let summaryReady = false;         // suppress a spurious recap on first load
function syncActivationSummary(g) {
  const active = g.turn?.activeRigId ?? null;
  const log = g.resolutions || [];
  const maxId = log.length ? log[log.length - 1].id : 0;
  if (!summaryReady) { watchedActiveRig = active; activationBaselineId = maxId; summaryReady = true; return; }
  if (active === watchedActiveRig) return;
  if (watchedActiveRig != null) {
    const rig = S.rigs.find((r) => r.id === watchedActiveRig);
    const entries = log.filter((e) => e.id > activationBaselineId && e.rigId === watchedActiveRig);
    if (rig) showActivationSummary(rig, entries);
  }
  watchedActiveRig = active;
  activationBaselineId = maxId;
}

function showActivationSummary(rig, entries) {
  const mine = (rig.owner || "a") === mySide();
  const lines = [];
  for (const e of entries) {
    if (e.summary) lines.push({ text: e.summary, effects: e.effects || [] });
  }
  const { card } = openDrawer({
    title: `${mine ? "🛠️ Your Rig" : "⚔️ Enemy"} · ${rig.name} — activation ended`,
    tone: mine ? "oil" : "ember",
    build: (host) => {
      const recap = document.createElement("div");
      recap.className = "dwr-recap";
      if (!lines.length) {
        const none = document.createElement("p");
        none.className = "dwr-hint";
        none.textContent = "No combat actions this activation — repositioning only.";
        recap.appendChild(none);
      } else {
        for (const l of lines) {
          const row = document.createElement("div");
          row.className = "dwr-recap-row";
          const s = document.createElement("div");
          s.className = "dwr-recap-line";
          s.textContent = l.text;
          row.appendChild(s);
          for (const eff of l.effects) {
            const em = document.createElement("div");
            em.className = "dwr-recap-eff";
            em.textContent = eff;
            row.appendChild(em);
          }
          recap.appendChild(row);
        }
      }
      host.appendChild(recap);
    },
    actions: [{ label: "Continue", primary: true, onClick: () => closeDrawer() }],
  });
  // Non-blocking: fade the recap on its own after a beat so the opponent's turns
  // don't stall play, but leave it if the player has since opened another drawer.
  setTimeout(() => { if (card?.isConnected) closeDrawer(); }, 6500);
}

export function renderBattle() {
  const g = S.game;
  if (!g) {
    hud.hidden = true; outcomeBanner.hidden = true;
    clearFocus();
    return;
  }
  if (!g.started) {
    // Pre-battle: HUD is dormant, but the banner still coaches setup.
    hud.hidden = true; outcomeBanner.hidden = true;
    if (bhPrompt) bhPrompt.innerHTML = "";
    renderFocus(g);
    return;
  }
  hud.hidden = false;
  const sum = phaseSummary(g, S.rigs);
  bhPhase.textContent = sum.label;
  bhRound.textContent = `R${sum.round}`;
  // Ownership by color: your side reads green, the opponent dim.
  bhTurn.innerHTML = sum.turnSide
    ? `Turn: <b class="${sum.turnSide === mySide() ? "bh-mine" : "bh-foe"}">${sum.turnName}</b>${sum.activeName ? ` — ${sum.activeName}` : ""}`
    : "";
  const tok = sum.answerTokens[mySide()] || 0;
  bhTokens.textContent = tok ? `⟡ ${tok} Answer` : "";
  if (bhPrompt) bhPrompt.innerHTML = ""; // CTAs now live in the banner

  renderFocus(g);
  renderOutcome(g);
  syncResolutions();
  syncActivationSummary(g);
}

// Reset the coach banner to hidden.
function clearFocus() {
  document.body.classList.remove("my-turn-glow");
  turnBanner.hidden = true;
  lastFocusPrimary = null;
  document.documentElement.style.setProperty("--turn-banner-h", "0px");
}

// The one thing this player should do right now, pinned above everything and
// independent of scroll — plus a whole-screen border while it's actually their
// move, so a glance at the device (not just the HUD) tells them to act.
function renderFocus(g) {
  const focus = computeFocus(g);
  document.body.classList.toggle("my-turn-glow", focus?.tone === "act");
  if (!focus) { clearFocus(); return; }

  turnBanner.hidden = false;
  turnBanner.dataset.tone = focus.tone;
  tbIcon.textContent = focus.icon || "◈";
  tbPrimary.textContent = focus.primary;
  tbSecondary.textContent = focus.secondary || "";

  // Inline CTA: build only when the next move is a single tap.
  tbCta.innerHTML = "";
  if (focus.cta) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn " + (focus.tone === "act" ? "btn--primary" : "btn--ghost");
    btn.textContent = focus.cta.label;
    btn.addEventListener("click", focus.cta.onClick);
    tbCta.appendChild(btn);
  }

  // Flash once when the duty actually changes.
  if (focus.primary !== lastFocusPrimary) {
    turnBanner.classList.remove("changed");
    void turnBanner.offsetWidth; // restart the animation
    turnBanner.classList.add("changed");
    lastFocusPrimary = focus.primary;
  }

  document.documentElement.style.setProperty("--turn-banner-h", `${turnBanner.offsetHeight}px`);
}

// Single source of truth for guidance copy (mirrors docs/DESIGN-SYSTEM.md §B1).
// Returns { tone, icon, primary, secondary?, cta? } or null.
function computeFocus(g) {
  const mine = mySide();
  const auto = g.autoResolve;

  // ---- Pre-battle setup ----
  if (!g.started) {
    const myCount = rigCountOf(mine);
    if (myCount === 0) {
      return { tone: "guide", icon: "◈", primary: "Commission your first Rig",
        secondary: "Every squadron needs at least one.",
        cta: { label: "Commission", onClick: () => document.getElementById("rigAddBtn")?.click() } };
    }
    if (myCount < MIN_RIGS_TO_READY) {
      const need = MIN_RIGS_TO_READY - myCount;
      return { tone: "guide", icon: "◈", primary: `Commission ${need} more Rig${need === 1 ? "" : "s"}`,
        secondary: `${myCount} of ${MIN_RIGS_TO_READY} ready to deploy.`,
        cta: { label: "Commission", onClick: () => document.getElementById("rigAddBtn")?.click() } };
    }
    if (!sideReadyOf(mine)) {
      return { tone: "guide", icon: "✔", primary: "Mark ready when set",
        secondary: "Tap Ready once your squadron is built.",
        cta: { label: "Ready", onClick: () => document.getElementById("readyBattle")?.click() } };
    }
    return { tone: "wait", icon: "⏳", primary: `Waiting for ${sideNameOf(enemySide())} to ready…` };
  }

  // ---- In battle ----
  if (g.phase === "finished") return null;

  if (g.phase === "initiative" && g.round >= 2) {
    return { tone: "act", icon: "🎲", primary: "Roll initiative",
      cta: { label: "Roll", onClick: () => {
        if (auto) sendCommand("initiative", {});
        else promptTwoDice("Initiative D12", (a, b) => sendCommand("initiative", { dice: { a, b } }));
      } } };
  }

  if (g.pendingBlast) {
    return { tone: "act", icon: "💥", primary: "Resolve blast",
      secondary: "Mark rigs within 12\".",
      cta: { label: "Resolve", onClick: () => openBlastPrompt() } };
  }

  if (g.phase === "recovery") {
    return g.recoveryVp?.[mine]
      ? { tone: "wait", icon: "⏳", primary: "Waiting for opponent to score…" }
      : { tone: "act", icon: "⟡", primary: "Score your objectives",
          secondary: "Tally VP for this round.",
          cta: { label: "Score VP", onClick: () => openVpPrompt() } };
  }

  if (g.phase === "activation") {
    const turn = g.turn;
    if (turn?.side !== mine) {
      return { tone: "wait", icon: "⏳", primary: `Waiting on ${sideNameOf(turn?.side)}…` };
    }
    if (turn.activeRigId) {
      const rig = S.rigs.find((r) => r.id === turn.activeRigId);
      const b = rig ? actionBudget(rig, turn) : null;
      return { tone: "act", icon: "▶", primary: "Choose your next action",
        secondary: b ? `${b.left} action${b.left === 1 ? "" : "s"} left` : "" };
    }
    return { tone: "act", icon: "▶", primary: "Activate one of your Rigs",
      secondary: "Tap a Rig to take its turn." };
  }
  return null;
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
    const costBadge = (act.cost ?? 1) === 2 ? `<span class="ac-cost" title="Costs 2 actions">2×</span>` : "";
    btn.innerHTML =
      `<span class="ac-ic" aria-hidden="true">${iconFor(act.key)}</span>` +
      `<span class="ac-label">${act.label}</span>${costBadge}` +
      `<span class="ac-heat" data-heat="${act.heat}">${heatLabel}</span>`;
    if (act.note) { btn.title = act.note; btn.dataset.note = "1"; }
    btn.addEventListener("click", () => onAction(rig, act.key));
    grid.appendChild(btn);
  }
  wrap.appendChild(grid);

  // Surface the "why" behind constrained actions as inline hints, deduplicated,
  // so a disabled or costlier button explains itself rather than staying silent.
  const notes = [...new Set(availableActions(rig, t).map((a) => a.note).filter(Boolean))];
  for (const note of notes.slice(0, 2)) {
    const h = document.createElement("p");
    h.className = "hint" + (/spent|no\s|already|can'?t|locked/i.test(note) ? " hint--warn" : "");
    h.textContent = note;
    wrap.appendChild(h);
  }

  const end = mkBtn("End Activation", () => endActivation(rig));
  end.classList.add("ac-end", "ghost");
  wrap.appendChild(end);
  return wrap;
}

function onAction(rig, key) {
  if (key === "fire" || key === "aimed" || key === "ram") { openAttackWizard(rig, key); return; }
  if (key === "move" || key === "sprint") { openMoveDrawer(rig, key); return; }
  if (key === "repair") { openRepairDrawer(rig, "repair"); return; }
  if (key === "emergencypatch") { openRepairDrawer(rig, "emergencypatch"); return; }
  sendCommand("action", { name: rig.name, action: key });
}

// §5 base Speed (inches) per weight class — the physical reach of a Move.
const SPEED = { light: 9, medium: 8, heavy: 6, colossal: 5 };
const MOVE_HOLD_MS = 5000;

// Move and Sprint resolve on the tabletop, not on the device — the console can't
// see the model shift. So instead of firing the action the instant it's tapped,
// we hold the player on a timed drawer: the Confirm button stays locked for
// MOVE_HOLD_MS (long enough to actually push the Rig) before it unlocks. Cancel
// is live the whole time so a misclick isn't a trap — nothing is spent until
// Confirm, and the server re-validates the action budget regardless.
function openMoveDrawer(rig, key) {
  const sprint = key === "sprint";
  const base = SPEED[rig.weightClass] ?? 8;
  const dist = sprint ? base * 1.5 : base;
  const heat = sprint ? (rig.equipment === "servo-actuators" ? 1 : 2) : 1;
  const holdSec = Math.round(MOVE_HOLD_MS / 1000);
  let timer = null;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

  openDrawer({
    title: `${iconFor(key)} ${sprint ? "Sprint" : "Move"} — ${rig.name}`,
    tone: "oil",
    dismissable: false, // the whole point is that they can't tap away and skip the move
    build: (card) => {
      const hint = document.createElement("p");
      hint.className = "dwr-hint";
      hint.innerHTML = sprint
        ? `Reposition up to <b>${dist}"</b> (1½× Speed). Backpedal / side-step at half. Generates <b>+${heat} heat</b>.`
        : `Reposition up to <b>${dist}"</b> (full Speed). Backpedal / side-step at half; pivot up to 90° free. Generates <b>+${heat} heat</b>.`;
      card.appendChild(hint);

      const call = document.createElement("p");
      call.className = "dwr-hint dwr-move-call";
      call.textContent = "Move the Rig on the table now, then confirm.";
      card.appendChild(call);

      const track = document.createElement("div");
      track.className = "dwr-hold-track";
      const fill = document.createElement("div");
      fill.className = "dwr-hold-fill";
      track.appendChild(fill);
      card.appendChild(track);

      const row = document.createElement("div");
      row.className = "dwr-actions";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "dwr-btn ghost";
      cancel.innerHTML = "<span>Cancel</span>";
      cancel.addEventListener("click", () => { stop(); closeDrawer(); });

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "dwr-btn primary";
      confirm.disabled = true;
      const setLabel = (s) => { confirm.innerHTML = `<span>${s > 0 ? `Moving… ${s}s` : "Done — moved"}</span>`; };
      setLabel(holdSec);
      confirm.addEventListener("click", () => {
        if (confirm.disabled) return;
        stop();
        closeDrawer();
        sendCommand("action", { name: rig.name, action: key });
      });

      row.appendChild(cancel);
      row.appendChild(confirm);
      card.appendChild(row);

      // A 10 Hz interval keeps the label and the fill bar in sync cheaply and is
      // trivial to tear down. If the drawer is torn down another way, the
      // isConnected guard stops the orphaned timer on its next tick.
      const start = performance.now();
      timer = setInterval(() => {
        if (!confirm.isConnected) { stop(); return; }
        const elapsed = performance.now() - start;
        fill.style.width = `${Math.min(1, elapsed / MOVE_HOLD_MS) * 100}%`;
        if (elapsed >= MOVE_HOLD_MS) {
          stop();
          confirm.disabled = false;
          setLabel(0);
        } else {
          setLabel(Math.ceil((MOVE_HOLD_MS - elapsed) / 1000));
        }
      }, 100);
    },
  });
}

// Location picker for the two repair-family actions, replacing the old raw
// window.prompt with a drawer consistent with the rest of the console.
function openRepairDrawer(rig, action) {
  const auto = S.game.autoResolve;
  const isPatch = action === "emergencypatch";
  const state = { loc: "hull" };
  openDrawer({
    title: `${isPatch ? "🩹 Emergency Patch" : "🔧 Repair"} — ${rig.name}`,
    tone: "cool",
    build: (card) => {
      const hint = document.createElement("p");
      hint.className = "dwr-hint";
      hint.textContent = isPatch
        ? "Restores a guaranteed 2 SP to the chosen location — no dice."
        : auto ? "Rolls a D12: 10+ restores 2 SP, 7–9 restores 1 SP."
               : "You'll roll a D12 next: 10+ restores 2 SP, 7–9 restores 1 SP.";
      card.appendChild(hint);
      card.appendChild(choiceField("Location", LOC_CHOICES, state.loc, (v) => (state.loc = v)));
    },
    actions: [
      { label: "Cancel", ghost: true, onClick: () => closeDrawer() },
      {
        label: isPatch ? "Patch" : "Repair", primary: true,
        icon: isPatch ? "🩹" : "🔧",
        onClick: () => {
          closeDrawer();
          if (isPatch) { sendCommand("action", { name: rig.name, action: "emergencypatch", loc: state.loc }); return; }
          if (auto) sendCommand("action", { name: rig.name, action: "repair", loc: state.loc });
          else promptOneDie("Repair D12", (d) => sendCommand("action", { name: rig.name, action: "repair", loc: state.loc, dice: { repair: d } }));
        },
      },
    ],
  });
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
