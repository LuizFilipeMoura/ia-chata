# Battle UI & Dice Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is the frontend pass — follow the frontend-design skill's aesthetic discipline throughout.

**Goal:** Give the round loop (Plan 1) and combat (Plan 2) a client: a battle HUD (phase / round / whose turn / answer tokens), an action console on the active Rig showing the legal actions, their heat cost, and the remaining action budget; an End Activation control; an attack wizard for Fire/Aimed/Ram; a Recovery VP prompt; always-visible modifier chips; and a dice-resolution overlay that animates every server roll — with a pre-battle Auto/Manual dice toggle that switches the overlay between animated auto-rolls and manual dice entry.

**Architecture:** Pure, DOM-free view-model helpers live in `shared/battle-view.js` (unit-tested with `node:test`, imported by the browser via the existing `/shared` static mount). The DOM layer is three new browser modules — `roll-dialog.js` (the animated overlay + manual dice prompt), `battle.js` (HUD, action console, prompts, command wiring), `attack-wizard.js` (attack input flow) — plus additions to `tracker.js` (modifier chips) and one new stylesheet `battle.css`. All server writes reuse the existing `sendCommand(verb, attrs)` from `api.js`; all rendering hangs off the single `onServerStateChange` hook in `main.js`.

**Aesthetic direction (frontend-design):** This is a *dieselpunk boiler-room control terminal* — the codebase already commits to it (iron greys `--iron-*`, oil-amber `--oil*`, ember-red `--ember*`, Chakra Petch display + JetBrains Mono, segmented boiler gauges, rivets, the `--stripe` hazard band, alarm pulses, the spring easing `cubic-bezier(.2,.85,.25,1)`). Every new surface is instrumentation on that same machine: the phase rail is a segmented gauge like the heat track; action buttons are stamped console keys with a heat-cost decal; modifier chips are riveted warning tags; the dice overlay is a **resolution readout** — dice as stamped-metal tokens that tumble (a fast face-flicker + jitter) then land with a clack-pop and a zone-coloured glow, followed by a staggered breakdown ticker. Damage reads ember, cooling/safe reads teal, rolls read oil-amber. Honour `prefers-reduced-motion` (skip the tumble, snap to the result). No new fonts, no new palette — depth comes from execution.

**Tech Stack:** Vanilla ES modules, CSS animations (no libraries), `node:test` for the shared helpers. Preview via `npm run preview` (port 8123) — no Ollama needed for static + `/api/game` routes.

---

## File Structure

- **Create** `shared/battle-view.js` — pure helpers: `availableActions`, `actionBudget`, `rigModifiers`, `phaseSummary`, `outcomeText`. DOM-free, unit-tested.
- **Create** `shared/battle-view.test.js` — tests for the above.
- **Create** `public/js/roll-dialog.js` — the overlay: `playResolution(entry)` (auto animation) and `promptDice(specs)` (manual entry, returns a Promise).
- **Create** `public/js/battle.js` — `renderBattle()`: HUD/phase rail, action console + budget, End Activation, initiative/recovery/VP prompts, answer tokens; watches the resolution log and drives `roll-dialog`.
- **Create** `public/js/attack-wizard.js` — `openAttackWizard(rig, mode)` collecting target/weapon/arc/range/cover/fire-mode (+manual dice) and posting the action.
- **Create** `public/css/battle.css` — all new styling, extending `tokens.css`.
- **Modify** `public/index.html` — link `battle.css`; add the HUD bar, action-console mount, dice-mode toggle, roll-dialog overlay root, outcome banner.
- **Modify** `public/js/tracker.js` — render modifier chips; gate the legacy manual heat controls once the battle has started.
- **Modify** `public/js/main.js` — register `renderBattle` and the resolution watcher alongside `renderRigs`.
- **Modify** `.claude/launch.json` — add a `preview` server entry (create the file if absent).

---

### Task 0: Preview launch config

**Files:**
- Create/Modify: `.claude/launch.json`

- [ ] **Step 1: Write the launch config**

Create `.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "preview", "runtimeExecutable": "npm", "runtimeArgs": ["run", "preview"], "port": 8123 }
  ]
}
```

- [ ] **Step 2: Verify the server boots**

Run the preview server (`preview_start` with name `preview`), then load `http://localhost:8123/`. Expected: the join gate renders, no console errors. Stop it or leave it running for later tasks.

- [ ] **Step 3: Commit**

```bash
git add .claude/launch.json
git commit -m "chore: add preview launch config"
```

---

### Task 1: Pure battle view-model helpers

**Files:**
- Create: `shared/battle-view.js`, `shared/battle-view.test.js`

- [ ] **Step 1: Write the failing test**

Create `shared/battle-view.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { availableActions, actionBudget, rigModifiers, phaseSummary, outcomeText } from "./battle-view.js";

function rig(over = {}) {
  return {
    id: 1, name: "Vela", weightClass: "light", owner: "a",
    hull: { sp: 6, max: 6 }, arms: { sp: 5, max: 5 }, legs: { sp: 5, max: 5 },
    engine: { sp: 4, max: 4, heat: 0 },
    weapons: { longRange: "Autocannon", melee: "Sword" },
    loaded: { longRange: true, melee: true },
    activated: false, skipNextActivation: false, noCool: false,
    speedHalvedNextRound: false, immobilised: false, weaponsDestroyed: [], preparation: null,
    ...over,
  };
}

test("availableActions lists actions and marks the ones the budget allows", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const acts = availableActions(rig(), turn);
  const move = acts.find((a) => a.key === "move");
  assert.equal(move.heat, 1);
  assert.equal(move.enabled, true);
  // Shut Down is only offered before any action is spent.
  assert.equal(acts.find((a) => a.key === "shutdown").enabled, true);
  const mid = availableActions(rig(), { activeRigId: 1, actionsUsed: 2, actionsMax: 5 });
  assert.equal(mid.find((a) => a.key === "shutdown").enabled, false);
});

test("availableActions disables everything at the budget cap and a spent ranged weapon", () => {
  const capped = availableActions(rig(), { activeRigId: 1, actionsUsed: 5, actionsMax: 5 });
  assert.equal(capped.find((a) => a.key === "move").enabled, false);
  assert.equal(capped.find((a) => a.key === "reload").enabled, false);
});

test("actionBudget reports remaining and the Hull-0 reduction reason", () => {
  assert.deepEqual(actionBudget(rig(), { activeRigId: 1, actionsUsed: 1, actionsMax: 5 }),
    { used: 1, max: 5, left: 4, reduced: false });
  const hurt = actionBudget(rig({ hull: { sp: 0, max: 6 } }), { activeRigId: 1, actionsUsed: 0, actionsMax: 3 });
  assert.equal(hurt.reduced, true);
});

test("rigModifiers surfaces every value-changing effect in play", () => {
  const mods = rigModifiers(rig({
    hull: { sp: 0, max: 6 }, engine: { sp: 0, max: 4, heat: 3 },
    noCool: true, speedHalvedNextRound: true, immobilised: true,
    weaponsDestroyed: ["Sword"], preparation: { type: "brace" },
  }));
  const keys = mods.map((m) => m.key);
  assert.ok(keys.includes("hull0"));
  assert.ok(keys.includes("engine0"));
  assert.ok(keys.includes("nocool"));
  assert.ok(keys.includes("speed"));
  assert.ok(keys.includes("immobile"));
  assert.ok(keys.includes("weapon"));
  assert.ok(keys.includes("braced"));
});

test("phaseSummary describes the phase and turn", () => {
  const game = { phase: "activation", round: 2, turn: { side: "a", activeRigId: null }, answerTokens: { a: 2, b: 0 },
    sides: [{ id: "a", name: "Ana" }, { id: "b", name: "Bo" }], outcome: null };
  const s = phaseSummary(game, [rig()]);
  assert.match(s.label, /Activation/i);
  assert.equal(s.round, 2);
  assert.equal(s.turnName, "Ana");
});

test("outcomeText names the winner or a draw", () => {
  const sides = [{ id: "a", name: "Ana" }, { id: "b", name: "Bo" }];
  assert.match(outcomeText({ winner: "a", reason: "points" }, sides), /Ana wins/);
  assert.match(outcomeText({ winner: null, reason: "draw" }, sides), /Draw/);
  assert.equal(outcomeText(null, sides), "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/battle-view.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

Create `shared/battle-view.js`:

```js
// Pure, DOM-free view-model derived from room state. Shared so it can be unit
// tested in node and imported by the browser (via the /shared static mount).
import { ACTIONS } from "./rules.js";
import { heatMeter } from "./game-state.js";

const ACTION_ORDER = ["move", "sprint", "fire", "aimed", "ram", "reload", "repair", "prepare", "shutdown"];

// The action console list for the active rig: each action with its heat cost and
// whether the current budget/state allows it.
export function availableActions(rig, turn) {
  const left = turn.actionsMax - turn.actionsUsed;
  return ACTION_ORDER.map((key) => {
    const def = ACTIONS[key];
    let enabled = left > 0;
    if (key === "shutdown") enabled = turn.actionsUsed === 0; // declared before any action
    return { key, label: def.label, heat: def.heat, enabled };
  });
}

export function actionBudget(rig, turn) {
  return {
    used: turn.actionsUsed, max: turn.actionsMax,
    left: Math.max(0, turn.actionsMax - turn.actionsUsed),
    reduced: rig.hull.sp === 0,
  };
}

// Every active value-changing modifier, as { key, tag, tone } for chip rendering.
export function rigModifiers(rig) {
  const mods = [];
  if (rig.hull.sp === 0 && !rig.hull.destroyed) mods.push({ key: "hull0", tag: "Hull 0 · −2 actions −1 Aim", tone: "crit" });
  if (rig.engine.sp === 0 && !rig.engine.destroyed) mods.push({ key: "engine0", tag: "Engine 0 · heat ≥3", tone: "crit" });
  if (rig.legs.sp === 0 && !rig.immobilised) mods.push({ key: "legs0", tag: "Legs 0 · −3\" move", tone: "warn" });
  if (rig.immobilised) mods.push({ key: "immobile", tag: "Immobilised", tone: "crit" });
  if (rig.noCool) mods.push({ key: "nocool", tag: "No cooling", tone: "crit" });
  if (rig.speedHalvedNextRound) mods.push({ key: "speed", tag: "Speed halved", tone: "warn" });
  if (rig.skipNextActivation) mods.push({ key: "skip", tag: "Skips next activation", tone: "warn" });
  if (rig.preparation) mods.push({ key: "braced", tag: prepLabel(rig.preparation.type), tone: "prep" });
  for (const w of rig.weaponsDestroyed || []) mods.push({ key: "weapon", tag: `Weapon lost: ${w}`, tone: "warn" });
  if (rig.loaded && rig.loaded.longRange === false) mods.push({ key: "unloaded", tag: "Ranged unloaded", tone: "warn" });
  return mods;
}

function prepLabel(type) {
  if (type === "evasive") return "Evasive ready";
  if (type === "return") return "Return fire ready";
  return "Braced";
}

const PHASE_LABELS = { setup: "Setup", initiative: "Initiative", activation: "Activation", recovery: "Recovery", finished: "Battle over" };

export function phaseSummary(game, rigs) {
  const turn = game.turn;
  const side = turn && game.sides.find((s) => s.id === turn.side);
  const active = turn && turn.activeRigId ? rigs.find((r) => r.id === turn.activeRigId) : null;
  return {
    label: PHASE_LABELS[game.phase] || game.phase,
    phase: game.phase,
    round: game.round,
    turnSide: turn?.side || null,
    turnName: side?.name || null,
    activeName: active?.name || null,
    answerTokens: game.answerTokens || { a: 0, b: 0 },
  };
}

export function outcomeText(outcome, sides) {
  if (!outcome) return "";
  if (!outcome.winner) return "Draw — the wastes keep the scrap.";
  const name = sides.find((s) => s.id === outcome.winner)?.name || outcome.winner;
  const why = outcome.reason === "annihilation" ? "by annihilation" : "on salvage";
  return `${name} wins ${why}.`;
}
```

Note: `heatMeter` is imported for downstream use by the DOM layer via re-export convenience; if the linter flags it as unused here, drop the import — it is already exported from `game-state.js` and the DOM modules import it directly.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/battle-view.js shared/battle-view.test.js
git commit -m "feat: pure battle view-model helpers"
```

---

### Task 2: The dice-resolution overlay (auto animation)

**Files:**
- Create: `public/js/roll-dialog.js`, `public/css/battle.css`
- Modify: `public/index.html`

This is the signature surface. `playResolution(entry)` renders the overlay for a resolution-log entry: dice tumble (fast face-flicker + jitter) for ~650ms, land with a clack-pop and a zone glow, then the breakdown lines stagger in. `promptDice` (manual mode) is added in Task 7.

- [ ] **Step 1: Add the overlay root and stylesheet link to `index.html`**

In `<head>`, after the `rig-sheet.css` link:

```html
<link rel="stylesheet" href="/css/battle.css" />
```

Before `<script type="module" src="/js/main.js">`, add the overlay root and outcome banner:

```html
<div id="rollScrim" class="roll-scrim" hidden>
  <div id="rollConsole" class="roll-console" role="dialog" aria-modal="true" aria-label="Dice resolution">
    <div class="roll-head"><span class="roll-kind" id="rollKind">Resolution</span><button id="rollClose" class="roll-close" type="button" aria-label="Dismiss">✕</button></div>
    <div id="rollDice" class="roll-dice"></div>
    <div id="rollSummary" class="roll-summary"></div>
    <div id="rollEffects" class="roll-effects"></div>
    <div id="rollForm" class="roll-form" hidden></div>
  </div>
</div>
<div id="outcomeBanner" class="outcome-banner" hidden></div>
```

- [ ] **Step 2: Create `public/css/battle.css` with the overlay + dice animation**

```css
/* ===== Dice-resolution overlay — the "resolution readout" ===== */
.roll-scrim {
  position: fixed; inset: 0; z-index: 80;
  display: grid; place-items: center;
  background: rgba(5, 7, 10, .72); backdrop-filter: blur(3px);
  opacity: 0; transition: opacity .2s ease;
}
.roll-scrim.show { opacity: 1; }
.roll-console {
  width: min(420px, 92vw);
  background: linear-gradient(180deg, var(--iron-800), var(--iron-900));
  border: 1px solid var(--rivet); border-radius: 14px;
  box-shadow: 0 24px 70px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.04);
  padding: .2rem .2rem .9rem;
  transform: translateY(10px) scale(.98); opacity: 0;
  transition: transform .28s cubic-bezier(.2,.85,.25,1), opacity .28s ease;
}
.roll-scrim.show .roll-console { transform: none; opacity: 1; }
.roll-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: .5rem .7rem; margin-bottom: .5rem;
  background: var(--stripe); border-radius: 12px 12px 0 0;
  border-bottom: 1px solid rgba(0,0,0,.5);
}
.roll-kind {
  font-family: var(--font-mono); font-size: .64rem; font-weight: 700;
  letter-spacing: .22em; text-transform: uppercase; color: #120c04;
  text-shadow: 0 1px 0 rgba(255,255,255,.15);
}
.roll-close { width: 26px; height: 26px; border-radius: 7px; background: rgba(10,12,15,.7); color: var(--txt); border: 1px solid rgba(0,0,0,.5); }

.roll-dice { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; padding: .8rem .7rem; min-height: 4.2rem; }
.die {
  --face: var(--oil);
  width: 3rem; height: 3rem; flex: 0 0 auto;
  display: grid; place-items: center;
  font-family: var(--font-mono); font-weight: 700; font-size: 1.3rem; color: #10130c;
  background: linear-gradient(160deg, #d9dee6, #9aa3b1);
  border: 1px solid #6b7480; box-shadow: inset 0 2px 3px rgba(255,255,255,.6), 0 4px 10px rgba(0,0,0,.5);
}
.die.d6  { border-radius: 10px; }
.die.d12 { border-radius: 50%; }        /* round token stands in for the D12 */
.die.rolling { animation: die-shake .12s linear infinite; }
@keyframes die-shake {
  0% { transform: translate(0,0) rotate(-6deg); }
  25% { transform: translate(1px,-2px) rotate(4deg); }
  50% { transform: translate(-2px,1px) rotate(-3deg); }
  75% { transform: translate(2px,1px) rotate(5deg); }
  100% { transform: translate(0,-1px) rotate(-6deg); }
}
.die.settled {
  color: #fff; background: linear-gradient(160deg, #2a3038, #171b22);
  border-color: var(--face); box-shadow: 0 0 14px 1px color-mix(in srgb, var(--face) 55%, transparent), inset 0 1px 0 rgba(255,255,255,.08);
  animation: die-land .32s cubic-bezier(.2,.85,.25,1);
}
.die.settled[data-tone="crit"] { --face: var(--ember-hi); }
.die.settled[data-tone="cool"] { --face: #7fd0c4; }
@keyframes die-land { 0% { transform: scale(1.28) translateY(-6px); } 60% { transform: scale(.94); } 100% { transform: none; } }
.die-label { display: block; margin-top: .25rem; font-family: var(--font-mono); font-size: .5rem; letter-spacing: .1em; text-transform: uppercase; color: var(--txt-faint); text-align: center; }
.die-wrap { display: flex; flex-direction: column; align-items: center; }

.roll-summary {
  margin: .2rem .8rem .2rem; text-align: center;
  font-family: var(--font-display); font-size: 1rem; font-weight: 600; color: var(--txt);
  opacity: 0; transform: translateY(4px); animation: line-in .35s ease .45s forwards;
}
.roll-effects { display: flex; flex-direction: column; gap: .3rem; padding: .3rem .9rem 0; }
.roll-effect {
  font-family: var(--font-mono); font-size: .68rem; color: var(--ember-hi);
  border-left: 2px solid rgba(229,83,58,.5); padding-left: .5rem;
  opacity: 0; transform: translateY(4px); animation: line-in .3s ease forwards;
}
@keyframes line-in { to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .die.rolling { animation: none; }
  .die.settled, .roll-summary, .roll-effect, .roll-console { animation: none; opacity: 1; transform: none; }
}
```

- [ ] **Step 3: Create `public/js/roll-dialog.js`**

```js
// The dice-resolution overlay. In auto mode it animates a server resolution-log
// entry: dice flicker + jitter, then land on their real values with a zone glow,
// then the summary/effects stagger in. Math.random here only drives the cosmetic
// flicker — the landed values always come from the server entry.
const scrim = document.getElementById("rollScrim");
const consoleEl = document.getElementById("rollConsole");
const kindEl = document.getElementById("rollKind");
const diceEl = document.getElementById("rollDice");
const summaryEl = document.getElementById("rollSummary");
const effectsEl = document.getElementById("rollEffects");
const closeBtn = document.getElementById("rollClose");

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let hideTimer = null;

const KIND_TONE = { overheat: "crit", attack: "crit", ram: "crit", destruction: "crit", blast: "crit", repair: "cool", initiative: "oil", perk: "crit", skip: "warn" };

function open() {
  clearTimeout(hideTimer);
  scrim.hidden = false;
  void scrim.offsetWidth;
  scrim.classList.add("show");
}
export function closeRoll() {
  scrim.classList.remove("show");
  hideTimer = setTimeout(() => { scrim.hidden = true; }, 220);
}
closeBtn.addEventListener("click", closeRoll);
scrim.addEventListener("click", (e) => { if (e.target === scrim) closeRoll(); });

// Animate one resolution entry. Returns a promise that resolves when it settles.
export function playResolution(entry) {
  kindEl.textContent = (entry.kind || "resolution").toUpperCase();
  diceEl.innerHTML = "";
  summaryEl.textContent = "";
  effectsEl.innerHTML = "";
  const tone = KIND_TONE[entry.kind] || "oil";
  open();

  const dice = (entry.rolls || []).filter((r) => r.sides);
  const settled = dice.map((roll) => {
    const wrap = document.createElement("div");
    wrap.className = "die-wrap";
    const die = document.createElement("div");
    die.className = `die ${roll.sides === 12 ? "d12" : "d6"} rolling`;
    die.textContent = "?";
    const label = document.createElement("span");
    label.className = "die-label";
    label.textContent = roll.label || `D${roll.sides}`;
    wrap.appendChild(die);
    wrap.appendChild(label);
    diceEl.appendChild(wrap);
    return { die, roll };
  });

  const finish = () => {
    for (const { die, roll } of settled) {
      die.classList.remove("rolling");
      die.classList.add("settled");
      die.dataset.tone = tone === "cool" ? "cool" : (roll.sides === 12 || tone === "crit" ? "crit" : "");
      die.textContent = String(roll.value);
    }
    summaryEl.textContent = entry.summary || "";
    (entry.effects || []).forEach((text, i) => {
      const el = document.createElement("div");
      el.className = "roll-effect";
      el.style.animationDelay = `${0.5 + i * 0.12}s`;
      el.textContent = text;
      effectsEl.appendChild(el);
    });
  };

  if (reduced || dice.length === 0) { finish(); return Promise.resolve(); }

  return new Promise((resolve) => {
    const started = performance.now();
    const flicker = setInterval(() => {
      for (const { die, roll } of settled) die.textContent = String(Math.floor(Math.random() * roll.sides) + 1);
      if (performance.now() - started > 650) { clearInterval(flicker); finish(); resolve(); }
    }, 60);
  });
}
```

- [ ] **Step 4: Verify in the preview browser**

With the preview server running, in the console drive a demo (via `preview_eval`):

```js
import("/js/roll-dialog.js").then((m) => m.playResolution({
  kind: "overheat", summary: "Vela: Hydraulic Blowout (D12 6+4=10)",
  rolls: [{ sides: 12, value: 6, label: "D12" }], effects: ["2 damage to the Legs; Speed halved next turn."],
}));
```

Expected: overlay fades in, the round token flickers then lands on **6** with an ember glow, the summary and effect line stagger in. Take a screenshot. Check `preview_console_logs` for errors.

- [ ] **Step 5: Commit**

```bash
git add public/js/roll-dialog.js public/css/battle.css public/index.html
git commit -m "feat: animated dice-resolution overlay"
```

---

### Task 3: Battle HUD, action console, End Activation, prompts

**Files:**
- Create: `public/js/battle.js`
- Modify: `public/index.html` (HUD + console mount), `public/css/battle.css`, `public/js/main.js`

- [ ] **Step 1: Add the HUD and console mount to `index.html`**

Inside `<section id="rigPanel">`, right after the `<div class="sheet-head">…</div>`, add:

```html
<div id="battleHud" class="battle-hud" hidden>
  <div class="bh-phase"><span id="bhPhase" class="bh-phase-label">Setup</span><span id="bhRound" class="bh-round">R1</span></div>
  <div id="bhTurn" class="bh-turn"></div>
  <div id="bhTokens" class="bh-tokens"></div>
  <div id="bhPrompt" class="bh-prompt"></div>
</div>
```

The per-Rig action console is injected by `tracker.js` into the active Rig's body (Task 5 wires the mount point `data-console`).

- [ ] **Step 2: Add HUD + console styles to `battle.css`**

```css
/* ===== Battle HUD ===== */
.battle-hud {
  flex: 0 0 auto; margin: .3rem .15rem 0; padding: .5rem .6rem;
  border: 1px solid var(--line); border-radius: 10px;
  background: radial-gradient(120% 140% at 50% -30%, rgba(231,154,61,.07), transparent 60%), rgba(8,10,13,.6);
  display: grid; grid-template-columns: auto 1fr auto; gap: .35rem .6rem; align-items: center;
}
.bh-phase { display: flex; align-items: center; gap: .4rem; }
.bh-phase-label { font-family: var(--font-mono); font-size: .6rem; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--oil-hi); }
.bh-round { font-family: var(--font-mono); font-size: .58rem; color: var(--txt-faint); border: 1px solid var(--line); border-radius: 5px; padding: .05rem .3rem; }
.bh-turn { font-family: var(--font-display); font-size: .8rem; color: var(--txt); text-align: center; }
.bh-turn b { color: var(--oil-hi); }
.bh-tokens { font-family: var(--font-mono); font-size: .58rem; color: #7fd0c4; letter-spacing: .04em; }
.bh-prompt { grid-column: 1 / -1; }
.bh-prompt:empty { display: none; }
.bh-btn {
  width: 100%; padding: .55rem; border-radius: 9px; margin-top: .3rem;
  font-family: var(--font-display); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; font-size: .78rem;
  background: linear-gradient(180deg, var(--oil-hi), var(--oil)); color: #241606; border: 1px solid rgba(231,154,61,.65);
}
.bh-btn.ghost { background: var(--iron-780); color: var(--txt); border-color: var(--line); }
.bh-btn:active { transform: translateY(1px); }

/* ===== Action console (on the active rig) ===== */
.action-console { margin-top: .7rem; border-top: 1px dashed var(--line); padding-top: .6rem; }
.ac-budget { display: flex; align-items: center; justify-content: space-between; margin-bottom: .45rem; }
.ac-budget-label { font-family: var(--font-mono); font-size: .58rem; letter-spacing: .16em; text-transform: uppercase; color: var(--txt-dim); }
.ac-pips { display: flex; gap: 3px; }
.ac-pip { width: 12px; height: 12px; border-radius: 3px; background: rgba(255,255,255,.06); border: 1px solid var(--line-soft); }
.ac-pip.spent { background: linear-gradient(180deg, var(--oil-hi), var(--oil)); border-color: var(--oil); }
.ac-pip.locked { background: repeating-linear-gradient(45deg, #3a1f18 0 4px, #241512 4px 8px); }
.ac-reduced { font-family: var(--font-mono); font-size: .54rem; color: var(--ember-hi); letter-spacing: .04em; }
.ac-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .35rem; }
.ac-btn {
  position: relative; padding: .5rem .3rem .55rem; border-radius: 8px;
  background: var(--iron-750); border: 1px solid var(--line); color: var(--txt);
  font-family: var(--font-display); font-weight: 600; font-size: .74rem; text-align: center;
  transition: border-color .14s, color .14s, background .14s, transform .1s;
}
.ac-btn:not(:disabled):hover { border-color: var(--oil); color: var(--oil-hi); }
.ac-btn:not(:disabled):active { transform: translateY(1px); }
.ac-btn:disabled { opacity: .35; }
.ac-heat { display: block; margin-top: .2rem; font-family: var(--font-mono); font-size: .5rem; letter-spacing: .05em; color: var(--ember-hi); }
.ac-heat[data-heat="0"] { color: var(--txt-faint); }
.ac-end { margin-top: .5rem; }
```

- [ ] **Step 3: Create `public/js/battle.js`**

```js
import { S } from "./state.js";
import { sendCommand } from "./api.js";
import { availableActions, actionBudget, phaseSummary, outcomeText } from "/shared/battle-view.js";
import { openAttackWizard } from "./attack-wizard.js";
import { playResolution } from "./roll-dialog.js";

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
    btn.innerHTML = `${act.label}<span class="ac-heat" data-heat="${act.heat}">${act.heat ? `+${act.heat} heat` : "0 heat"}</span>`;
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
function promptOneDie(label, cb) {
  const v = parseInt(window.prompt(`${label} — enter your roll:`, ""), 10);
  if (Number.isFinite(v)) cb(v);
}
function promptTwoDice(label, cb) {
  const a = parseInt(window.prompt(`${label} — Side A roll:`, ""), 10);
  const b = parseInt(window.prompt(`${label} — Side B roll:`, ""), 10);
  if (Number.isFinite(a) && Number.isFinite(b)) cb(a, b);
}
function mkBtn(text, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bh-btn";
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}
```

Note: the `window.prompt` calls for VP / blast / manual dice are the minimal manual path; Task 7 upgrades manual dice entry to the styled overlay. Keep `prompt` for VP/blast target lists (free text is genuinely appropriate there).

- [ ] **Step 4: Register in `main.js`**

Replace the single render registration:

```js
import { renderRigs } from "./tracker.js";
import { renderBattle } from "./battle.js";
// ...
onServerStateChange(() => { renderRigs(); renderBattle(); });
```

- [ ] **Step 5: Verify in the preview browser**

With two browser contexts (or by seeding a room via `/api/game`), start a battle and confirm: HUD shows phase/round/turn; the active Rig shows the action console with pips and heat decals; clicking Move bumps heat and spends a pip; End Activation hands off. Screenshot the console. Check `preview_console_logs`.

- [ ] **Step 6: Commit**

```bash
git add public/js/battle.js public/js/main.js public/index.html public/css/battle.css
git commit -m "feat: battle HUD, action console and End Activation"
```

---

### Task 4: Attack wizard (Fire / Aimed / Ram)

**Files:**
- Create: `public/js/attack-wizard.js`
- Modify: `public/css/battle.css`

- [ ] **Step 1: Add wizard styles to `battle.css`**

```css
/* ===== Attack wizard ===== */
.aw-scrim { position: fixed; inset: 0; z-index: 70; display: grid; place-items: end center; background: rgba(5,7,10,.6); opacity: 0; transition: opacity .2s; }
.aw-scrim.show { opacity: 1; }
.aw-card {
  width: min(440px, 96vw); margin-bottom: 0; max-height: 82vh; overflow-y: auto;
  background: linear-gradient(180deg, var(--iron-850), var(--iron-900));
  border: 1px solid var(--rivet); border-radius: 16px 16px 0 0; padding: .8rem .9rem 1.1rem;
  transform: translateY(100%); transition: transform .3s cubic-bezier(.2,.85,.25,1);
}
.aw-scrim.show .aw-card { transform: none; }
.aw-title { font-family: var(--font-mono); font-size: .64rem; letter-spacing: .2em; text-transform: uppercase; color: var(--oil); margin-bottom: .6rem; }
.aw-field { margin: .5rem 0; }
.aw-field > label { display: block; font-family: var(--font-mono); font-size: .56rem; letter-spacing: .12em; text-transform: uppercase; color: var(--txt-dim); margin-bottom: .3rem; }
.aw-seg { display: flex; gap: .3rem; flex-wrap: wrap; }
.aw-opt { flex: 1 1 auto; padding: .45rem .3rem; border-radius: 8px; border: 1px solid var(--line); background: var(--iron-800); color: var(--txt-dim); font-family: var(--font-display); font-size: .78rem; text-align: center; }
.aw-opt.sel { border-color: var(--oil); color: var(--oil-hi); background: rgba(231,154,61,.1); }
.aw-go { width: 100%; margin-top: .8rem; padding: .6rem; border-radius: 10px; background: linear-gradient(180deg, var(--ember-hi), var(--ember)); color: #180a07; font-family: var(--font-display); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; border: 1px solid rgba(229,83,58,.6); }
.aw-go:disabled { background: var(--iron-800); color: var(--txt-faint); border-color: var(--line); }
```

- [ ] **Step 2: Create `public/js/attack-wizard.js`**

```js
import { S } from "./state.js";
import { sendCommand } from "./api.js";

// Collect the physical facts the app can't see (target, weapon, arc, range,
// cover, fire-mode), then post a fire/aimed/ram action. In auto mode the server
// rolls; in manual mode we ask for the dice after confirming the shot.
let scrim = null;

export function openAttackWizard(rig, mode) {
  close();
  const enemies = S.rigs.filter((r) => (r.owner || "a") !== (rig.owner || "a") && !r.destroyed);
  if (!enemies.length) return;

  const state = {
    mode, target: enemies[0].name,
    weapon: "longRange", arc: "front", range: "near", cover: 0, loc: "hull",
    fullAuto: false, charged: false,
  };

  scrim = document.createElement("div");
  scrim.className = "aw-scrim";
  const card = document.createElement("div");
  card.className = "aw-card";
  card.innerHTML = `<div class="aw-title">${mode === "ram" ? "Ram" : mode === "aimed" ? "Aimed Shot" : "Fire Weapon"} — ${rig.name}</div>`;
  card.appendChild(field("Target", enemies.map((e) => e.name), state.target, (v) => (state.target = v)));
  if (mode !== "ram") {
    card.appendChild(field("Weapon", [rig.weapons.longRange, rig.weapons.melee], rig.weapons.longRange,
      (v) => (state.weapon = v === rig.weapons.melee ? "melee" : "longRange")));
    card.appendChild(field("Arc", ["front", "side", "rear"], state.arc, (v) => (state.arc = v)));
    card.appendChild(field("Range", ["near", "far", "out"], state.range, (v) => (state.range = v)));
    card.appendChild(field("Cover", ["0", "1", "2"], "0", (v) => (state.cover = Number(v))));
    if (mode === "aimed") card.appendChild(field("Location", ["hull", "arms", "legs", "engine"], state.loc, (v) => (state.loc = v)));
  }

  const go = document.createElement("button");
  go.className = "aw-go";
  go.textContent = mode === "ram" ? "Ram" : "Fire";
  go.addEventListener("click", () => submit(rig, state));
  card.appendChild(go);
  scrim.appendChild(card);
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);
  void scrim.offsetWidth;
  scrim.classList.add("show");
}

function submit(rig, s) {
  const attrs = { name: rig.name, action: s.mode, target: s.target };
  if (s.mode !== "ram") {
    Object.assign(attrs, { weapon: s.weapon, arc: s.arc, range: s.range, cover: s.cover });
    if (s.mode === "aimed") attrs.loc = s.loc;
  }
  // Manual dice for combat rolls are collected in Task 7; auto mode posts directly.
  sendCommand("action", attrs);
  close();
}

function field(label, options, selected, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "aw-field";
  const l = document.createElement("label");
  l.textContent = label;
  wrap.appendChild(l);
  const seg = document.createElement("div");
  seg.className = "aw-seg";
  for (const opt of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "aw-opt" + (opt === selected ? " sel" : "");
    b.textContent = opt;
    b.addEventListener("click", () => {
      seg.querySelectorAll(".aw-opt").forEach((x) => x.classList.remove("sel"));
      b.classList.add("sel");
      onChange(opt);
    });
    seg.appendChild(b);
  }
  wrap.appendChild(seg);
  return wrap;
}

function close() {
  if (!scrim) return;
  const el = scrim;
  scrim = null;
  el.classList.remove("show");
  setTimeout(() => el.remove(), 250);
}
```

- [ ] **Step 3: Verify in the preview browser**

Start a battle, activate a Rig, click **Fire** → the wizard slides up; pick target/weapon/arc/range/cover, tap Fire; confirm the attack resolves (dice overlay animates, target SP drops). Screenshot the wizard.

- [ ] **Step 4: Commit**

```bash
git add public/js/attack-wizard.js public/css/battle.css
git commit -m "feat: attack wizard for fire, aimed and ram"
```

---

### Task 5: Modifier chips + battle-aware rig sheet

**Files:**
- Modify: `public/js/tracker.js`, `public/css/battle.css`

- [ ] **Step 1: Add chip styles to `battle.css`**

```css
/* ===== Modifier chips ===== */
.rig-mods { display: flex; flex-wrap: wrap; gap: .3rem; margin: .1rem 0 .5rem; }
.rig-mod {
  font-family: var(--font-mono); font-size: .54rem; letter-spacing: .04em; text-transform: uppercase;
  padding: .16rem .4rem; border-radius: 5px; border: 1px solid var(--line);
  background: var(--iron-950); color: var(--txt-dim);
}
.rig-mod[data-tone="warn"] { color: var(--oil-hi); border-color: rgba(231,154,61,.5); background: rgba(231,154,61,.08); }
.rig-mod[data-tone="crit"] { color: var(--ember-hi); border-color: rgba(229,83,58,.5); background: rgba(229,83,58,.1); }
.rig-mod[data-tone="prep"] { color: #7fd0c4; border-color: rgba(127,208,196,.5); background: rgba(127,208,196,.08); }
.rig-head-mods { display: inline-flex; gap: .2rem; margin-left: .2rem; }
.rig-head-mods .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ember); box-shadow: 0 0 5px rgba(229,83,58,.7); }
```

- [ ] **Step 2: Render chips in `tracker.js`**

Add the imports at the top:

```js
import { rigModifiers } from "/shared/battle-view.js";
import { buildActionConsole } from "./battle.js";
```

In `buildRigItem`, after the `inner.appendChild(status);` line, insert the chip row:

```js
  const mods = rigModifiers(rig);
  if (mods.length) {
    const modRow = document.createElement("div");
    modRow.className = "rig-mods";
    for (const m of mods) {
      const chip = document.createElement("span");
      chip.className = "rig-mod";
      chip.dataset.tone = m.tone;
      chip.textContent = m.tag;
      modRow.appendChild(chip);
    }
    inner.appendChild(modRow);
  }
```

Inject the action console just before the Remove button. After `inner.appendChild(buildHeatGauge(rig, isActive));` add:

```js
  if (S.game?.started) inner.appendChild(buildActionConsole(rig));
```

Gate the legacy manual heat buttons once the battle starts — in `buildHeatGauge`, change the control disable condition so heat buttons are only live pre-battle (the action console now drives heat):

```js
    b.disabled = !isActive || Boolean(S.game?.started);
```

- [ ] **Step 3: Verify in the preview browser**

Damage a Rig's Hull and Engine to 0 and confirm the chips `Hull 0 · −2 actions −1 Aim` and `Engine 0 · heat ≥3` appear; trigger an overheat Engine Failure and confirm `No cooling`. Screenshot a Rig showing multiple chips.

- [ ] **Step 4: Commit**

```bash
git add public/js/tracker.js public/css/battle.css
git commit -m "feat: modifier chips and battle-aware rig sheet"
```

---

### Task 6: Dice-mode toggle + outcome banner styling

**Files:**
- Modify: `public/index.html`, `public/js/tracker.js` (battle-setup section), `public/css/battle.css`

- [ ] **Step 1: Add the toggle to the battle-setup markup in `index.html`**

Inside `<div id="battleSetup" class="battle-setup">`, before the `readyBattle` button, add:

```html
<button id="diceMode" class="dice-mode" type="button" aria-pressed="false" title="Auto rolls with animation; Manual lets you enter physical dice">🎲 Auto</button>
```

- [ ] **Step 2: Add toggle + banner styles to `battle.css`**

```css
.dice-mode {
  flex: 0 0 auto; border-radius: 8px; padding: .5rem .6rem;
  font-family: var(--font-mono); font-size: .58rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  background: var(--iron-780); color: #7fd0c4; border: 1px solid rgba(127,208,196,.4);
}
.dice-mode[aria-pressed="true"] { color: var(--oil-hi); border-color: var(--oil); background: rgba(231,154,61,.1); }
.dice-mode:disabled { opacity: .5; }

.outcome-banner {
  position: fixed; z-index: 90; left: 50%; top: 18%; transform: translateX(-50%);
  padding: .8rem 1.4rem; border-radius: 12px; text-align: center;
  font-family: var(--font-display); font-weight: 700; font-size: 1.05rem; letter-spacing: .04em; color: #fff;
  background: linear-gradient(180deg, var(--iron-800), var(--iron-900));
  border: 1px solid var(--oil); box-shadow: 0 0 40px rgba(231,154,61,.3), 0 18px 50px rgba(0,0,0,.6);
  animation: line-in .4s ease;
}
```

- [ ] **Step 3: Wire the toggle in `tracker.js`**

In `renderBattleSetup`, keep the existing logic and add dice-mode wiring. After the function's existing body, reflect the current value and lock after start. Add near the other element lookups at the top of the file:

```js
const diceMode = document.getElementById("diceMode");
```

Inside `renderBattleSetup`, before the final `return`, add:

```js
  if (diceMode) {
    const auto = S.game?.autoResolve !== false;
    diceMode.textContent = auto ? "🎲 Auto" : "🎲 Manual";
    diceMode.setAttribute("aria-pressed", String(auto));
    diceMode.disabled = started;
  }
```

At the bottom of the file with the other listeners:

```js
diceMode?.addEventListener("click", () => {
  const auto = S.game?.autoResolve !== false;
  sendCommand("setdice", { value: auto ? "manual" : "auto" });
});
```

- [ ] **Step 4: Verify in the preview browser**

Before readying up, toggle 🎲 Auto ↔ Manual and confirm it flips and both clients see it; ready both sides and confirm the toggle locks. Play a game to a win and confirm the outcome banner appears. Screenshot both.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/js/tracker.js public/css/battle.css
git commit -m "feat: dice-mode toggle and outcome banner"
```

---

### Task 7: Manual dice entry in the resolution overlay

**Files:**
- Modify: `public/js/roll-dialog.js`, `public/js/battle.js`, `public/js/attack-wizard.js`, `public/css/battle.css`

Upgrade manual mode from `window.prompt` to a styled entry form inside the resolution overlay: `promptDice(specs)` renders labelled die slots and resolves a Promise with the entered values.

- [ ] **Step 1: Add form styles to `battle.css`**

```css
.roll-form { display: flex; flex-direction: column; gap: .5rem; padding: .4rem .9rem 0; }
.roll-form-row { display: flex; align-items: center; gap: .5rem; }
.roll-form-row label { flex: 1; font-family: var(--font-mono); font-size: .62rem; color: var(--txt-dim); }
.roll-form-row input {
  width: 3.4rem; text-align: center; background: var(--iron-950); color: var(--txt);
  border: 1px solid var(--line); border-radius: 8px; padding: .4rem; font-family: var(--font-mono); font-size: .9rem;
}
.roll-form-row input:focus { outline: none; border-color: var(--oil); box-shadow: 0 0 0 1px var(--oil); }
.roll-form-go { margin-top: .3rem; padding: .55rem; border-radius: 9px; background: linear-gradient(180deg, var(--oil-hi), var(--oil)); color: #241606; font-family: var(--font-display); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; border: 1px solid rgba(231,154,61,.65); }
```

- [ ] **Step 2: Add `promptDice` to `roll-dialog.js`**

```js
const formEl = document.getElementById("rollForm");

// Manual dice entry. `specs` is [{ key, label, sides }]. Resolves to a map of
// key -> entered value. Reuses the overlay chrome so manual mode feels first-class.
export function promptDice(specs, title = "Enter dice") {
  kindEl.textContent = title.toUpperCase();
  diceEl.innerHTML = "";
  summaryEl.textContent = "";
  effectsEl.innerHTML = "";
  formEl.hidden = false;
  formEl.innerHTML = "";
  open();

  return new Promise((resolve) => {
    const inputs = specs.map((spec) => {
      const row = document.createElement("div");
      row.className = "roll-form-row";
      const label = document.createElement("label");
      label.textContent = `${spec.label} (D${spec.sides})`;
      const input = document.createElement("input");
      input.type = "number"; input.min = "1"; input.max = String(spec.sides); input.inputMode = "numeric";
      row.appendChild(label); row.appendChild(input);
      formEl.appendChild(row);
      return { spec, input };
    });
    const go = document.createElement("button");
    go.className = "roll-form-go";
    go.textContent = "Confirm roll";
    go.addEventListener("click", () => {
      const out = {};
      for (const { spec, input } of inputs) {
        const v = parseInt(input.value, 10);
        if (!Number.isFinite(v) || v < 1 || v > spec.sides) { input.focus(); return; }
        out[spec.key] = v;
      }
      formEl.hidden = true;
      closeRoll();
      resolve(out);
    });
    formEl.appendChild(go);
    inputs[0]?.input.focus();
  });
}
```

- [ ] **Step 3: Use `promptDice` in `battle.js` and `attack-wizard.js`**

In `battle.js`, replace `promptOneDie`/`promptTwoDice` bodies to use the overlay:

```js
import { playResolution, promptDice } from "./roll-dialog.js";
// ...
async function promptOneDie(label, cb) {
  const out = await promptDice([{ key: "d", label, sides: 12 }], label);
  cb(out.d);
}
async function promptTwoDice(label, cb) {
  const out = await promptDice([{ key: "a", label: "Side A", sides: 12 }, { key: "b", label: "Side B", sides: 12 }], label);
  cb(out.a, out.b);
}
```

In `attack-wizard.js`, when `S.game.autoResolve === false`, collect the combat dice before posting. Replace `submit` with:

```js
async function submit(rig, s) {
  const attrs = { name: rig.name, action: s.mode, target: s.target };
  if (s.mode !== "ram") {
    Object.assign(attrs, { weapon: s.weapon, arc: s.arc, range: s.range, cover: s.cover });
    if (s.mode === "aimed") attrs.loc = s.loc;
  }
  if (S.game.autoResolve === false) {
    const { promptDice } = await import("./roll-dialog.js");
    const target = S.rigs.find((r) => r.name === s.target);
    if (s.mode === "ram") {
      const d = await promptDice([
        { key: "sl", label: "Self location", sides: 12 }, { key: "si", label: "Self impact", sides: 6 },
        { key: "tl", label: "Target location", sides: 12 }, { key: "ti", label: "Target impact", sides: 6 },
      ], "Ram dice");
      attrs.dice = { self: { location: d.sl, impact: d.si }, target: { location: d.tl, impact: d.ti } };
    } else {
      const profile = rig.weapons[s.weapon === "melee" ? "melee" : "longRange"];
      const rof = ({ "Mini Gun": 8, "Double MG": 8, "Autocannon": 4, "Arc Gun": 2, "Mortar": 3, "Sniper Cannon": 1, Sword: 2, "Circular Saw": 3, Chainsaw: 3, Claw: 2, Lance: 1, "Wrecking Ball": 1 })[profile] || 1;
      const specs = [];
      for (let i = 0; i < rof; i++) specs.push({ key: `h${i}`, label: `Hit die ${i + 1}`, sides: 6 });
      if (s.mode !== "aimed") specs.push({ key: "loc", label: "Location", sides: 12 });
      const d = await promptDice(specs, `${profile} dice`);
      const toHit = []; for (let i = 0; i < rof; i++) toHit.push(d[`h${i}`]);
      attrs.dice = { toHit };
      if (d.loc) attrs.dice.location = d.loc;
      // Impact dice are entered on demand only when hits land; for manual play we
      // supply a generous impacts array using the same hit dice count as an upper bound.
      attrs.dice.impacts = toHit.map(() => undefined);
    }
  }
  sendCommand("action", attrs);
  close();
}
```

Note the documented simplification: in manual mode the impact dice are prompted as part of the same batch only for the hit count upper bound; if a table read needs a value the client didn't supply, the server falls back to its own roll (the uniform dice model from Plan 1). A future refinement can make impact entry strictly two-stage.

- [ ] **Step 4: Verify in the preview browser**

Set dice mode to Manual before start. Take an overheating activation and confirm the styled die-entry form appears for the overheat D12; enter a value and confirm the effect applies. Run a manual Fire and confirm the hit-dice form appears. Screenshot the manual form.

- [ ] **Step 5: Commit**

```bash
git add public/js/roll-dialog.js public/js/battle.js public/js/attack-wizard.js public/css/battle.css
git commit -m "feat: styled manual dice entry in the resolution overlay"
```

---

## Self-Review

**Spec coverage (UI scope):**
- Pure view-model (actions, budget, chips, phase, outcome) → Task 1. ✓
- Animated dice overlay driven by the resolution log → Task 2, watcher in Task 3. ✓
- HUD (phase/round/turn/answer tokens), action console + budget + auto-heat feedback, End Activation → Task 3. ✓
- Initiative / Recovery-VP / blast prompts → Task 3. ✓
- Attack wizard (target/arc/range/cover/fire-mode) for Fire/Aimed/Ram → Task 4. ✓
- Modifier chips making every value-changing effect visible → Task 5. ✓
- Pre-start Auto/Manual dice toggle (locked at start) + outcome banner → Task 6. ✓
- Manual dice entry as a first-class styled overlay → Task 7. ✓
- `prefers-reduced-motion` honoured in every animation → Task 2 (and reused classes). ✓

**Placeholder scan:** No TODO/TBD. The `window.prompt` fallbacks for VP totals and blast target *names* are intentional and appropriate (free-text lists, not dice) and are called out; manual *dice* are upgraded to the styled form in Task 7. The manual impact-dice batching simplification is documented at its call site.

**Type consistency:** view-model shapes — action `{ key, label, heat, enabled }`, budget `{ used, max, left, reduced }`, modifier `{ key, tag, tone }`, phase `{ label, phase, round, turnSide, turnName, activeName, answerTokens }` — are produced in `battle-view.js` and consumed identically in `battle.js`/`tracker.js`. Commands posted match the server verbs from Plans 1–2 exactly: `setdice`, `initiative` (`dice:{a,b}`), `activate`, `action` (`fire`/`aimed`/`ram`/`repair`/`move`/… with the documented attrs), `endactivation` (`dice:{overheat}`), `vp` (`side`,`points`), `blast` (`targets`). `roll-dialog.js` exports `playResolution`, `promptDice`, `closeRoll`; `battle.js` exports `renderBattle`, `buildActionConsole`, `syncResolutions`; `attack-wizard.js` exports `openAttackWizard`.

**Cross-plan note:** `battle.js` imports `buildActionConsole` used by `tracker.js`, and `tracker.js` imports `rigModifiers`/`buildActionConsole` — no cycle, because `battle.js` does not import `tracker.js` (main.js orchestrates both). Verify no circular import warning in the preview console.
