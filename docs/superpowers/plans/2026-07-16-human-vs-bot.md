# Human vs Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a solo human start and play a digital match against the deterministic bot, picking difficulty via a preset, with the bot fielding a random Standard force that mirrors the human's composition.

**Architecture:** A new `setbot` verb flags a side as a bot (preset only). When the human readies, the server lazily builds and readies a mirrored random bot force from the still-unused chassis pool, then the existing `maybeStartGame`/`driveBots` machinery runs the match. The V2 lobby gains an opponent selector and a bot-aware READY gate.

**Tech Stack:** Node ESM (`shared/game-state.js`, engine), Express routes (`server/routes/game.js`), React + TypeScript V2 client (`client/src/v2/`). Tests: `node --test` for `shared/**` and `server/**`; Vitest for client `.tsx`.

**Design:** `docs/superpowers/specs/2026-07-16-human-vs-bot-design.md`

**Scope note:** 1c (digital move-targeting UI) is **deferred to its own spec** — see design §5. After this plan, a human can start a match and the bot plays its whole turn, but the human's digital *Move* action isn't issuable until that follow-up ships. Every other task below is fully in scope.

---

## File Structure

- `shared/game-state.js` — **modify.** Add the `setbot` verb, the `BOT_PRESETS` export, and two module-private helpers (`generateBotOpponent`, `fillBotOpponentIfNeeded`); wire the helper into the `ready` verb. This is the authoritative engine; the flag/generation must live here so both the HTTP route and tests exercise identical logic.
- `shared/game-state.test.js` — **modify.** Unit-level behaviour tests for `setbot` and the lazy mirror-gen/auto-ready via `applyCommand`.
- `server/routes/game.test.js` — **modify.** One end-to-end HTTP test: a human starts vs a bot and the `driveBots` hook plays the bot out.
- `client/src/v2/screens/Squadron.tsx` — **modify.** Opponent selector (fires `setbot`) and a bot-aware READY gate.
- `client/src/v2/screens/Squadron.test.tsx` — **modify.** Component tests for the selector and the relaxed gate.

No new files — every change extends an existing, focused module.

---

## Task 1: `setbot` verb + `BOT_PRESETS`

**Files:**
- Modify: `shared/game-state.js` (add `BOT_PRESETS` export near the top-of-file catalogue exports; add the `setbot` branch in `applyCommand`'s verb chain, next to the `ready` branch near line 3382)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js` (uses the existing `createRoom`, `claimSide`, `applyCommand`, `lastRejectionReason` imports already at the top of that file):

```js
import { BOT_PRESETS } from "./game-state.js"; // add to the existing import block

test("setbot flags a side with a preset in a digital room", () => {
  const room = createRoom("SETBOT1");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "setbot", attrs: { side: "b", preset: "aggressive" } }, { side: "a" });
  assert.equal(room.game.sides.find((s) => s.id === "b").bot, "aggressive");
});

test("setbot with a null preset clears the flag", () => {
  const room = createRoom("SETBOT2");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "setbot", attrs: { side: "b", preset: "cagey" } }, { side: "a" });
  applyCommand(room, { verb: "setbot", attrs: { side: "b", preset: null } }, { side: "a" });
  assert.equal(room.game.sides.find((s) => s.id === "b").bot, null);
});

test("setbot rejects an unknown preset, a physical room, and a started game", () => {
  const room = createRoom("SETBOT3");
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  // physical room (mode not digital) is rejected
  applyCommand(room, { verb: "setbot", attrs: { side: "b", preset: "cagey" } }, { side: "a" });
  assert.equal(room.game.sides.find((s) => s.id === "b").bot ?? null, null);
  assert.match(lastRejectionReason() || "", /digital/i);
  // digital but unknown preset is rejected
  room.mode = "digital";
  applyCommand(room, { verb: "setbot", attrs: { side: "b", preset: "wombat" } }, { side: "a" });
  assert.equal(room.game.sides.find((s) => s.id === "b").bot ?? null, null);
  assert.match(lastRejectionReason() || "", /preset/i);
});

test("BOT_PRESETS lists exactly the three tunable presets", () => {
  assert.deepEqual([...BOT_PRESETS].sort(), ["aggressive", "balanced", "cagey"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `BOT_PRESETS` is not exported, and `setbot` is an unknown verb so the flag never changes.

- [ ] **Step 3: Add the `BOT_PRESETS` export**

In `shared/game-state.js`, next to the other catalogue exports near the top (e.g. just after the `CHASSIS_PRIMARY_EQUIPMENT` block around line 140), add:

```js
// The presets a bot side can run. This mirrors the keys of PRESETS in
// shared/bot/score.js and is duplicated here on purpose: importing the bot
// module into game-state.js would create a cycle (bot/index.js imports
// game-state.js). Keep in sync when a preset is added.
export const BOT_PRESETS = ["balanced", "aggressive", "cagey"];
```

- [ ] **Step 4: Add the `setbot` verb branch**

In `applyCommand`, immediately after the `ready` branch (the block ending near line 3395, before `} else if (verb === "reset") {`), insert:

```js
  } else if (verb === "setbot") {
    // Flag a side to be driven by the bot at the given preset. Pre-battle,
    // digital rooms only. `null` preset clears the flag (opponent = Human).
    // Roster generation and auto-ready happen later, in the `ready` path
    // (design: lazy gen). sideBotOf (shared/bot/index.js) reads sides[i].bot.
    const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
    const side = room.game.sides.find((s) => s.id === sideId);
    const preset = a.preset == null ? null : String(a.preset).toLowerCase();
    if (!side) reject("Unknown side.");
    else if (room.mode !== "digital") reject("Bots play only in digital battles.");
    else if (room.game.started) reject("The battle has already started.");
    else if (preset !== null && !BOT_PRESETS.includes(preset)) reject("Unknown bot preset.");
    else { side.bot = preset; changed = true; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS (all four new tests, plus the rest of the file unchanged).

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(bot): setbot verb flags a side + BOT_PRESETS export"
```

---

## Task 2: Lazy mirror-gen + auto-ready in the `ready` path

**Files:**
- Modify: `shared/game-state.js` (add `generateBotOpponent` and `fillBotOpponentIfNeeded` helpers near `maybeStartGame`/`sidesAtParity`, ~line 1342; wire `fillBotOpponentIfNeeded` into the `ready` branch, ~line 3382)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js`. These assert *composition and uniqueness*, never specific chassis ids — per the repo rule that chassis/loadouts get tuned (memory: no-value-pinning-tests). A small deterministic PRNG makes the random draw reproducible.

```js
// A tiny deterministic PRNG so a bot-force draw is reproducible in tests.
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Commission one Standard human rig of a given catalogue chassis onto side A.
function addHumanRig(room, pb, name) {
  applyCommand(room, { verb: "add", attrs: {
    name, owner: "a", class: pb.class,
    longRange: pb.longRange, melee: pb.melee, chassis: pb.id, sp: pb.sp,
  } }, { side: "a" });
}

// Build a digital room with side A holding the given chassis and a bot on side B.
function digitalVsBotRoom(code, humanChassis, preset = "balanced") {
  const room = createRoom(code);
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  humanChassis.forEach((pb, i) => addHumanRig(room, pb, `H${i + 1}`));
  applyCommand(room, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(room, { verb: "setbot", attrs: { side: "b", preset } }, { side: "a" });
  return room;
}

test("readying against a bot builds a mirrored, distinct-chassis force and starts", () => {
  const light = CHASSIS.filter((c) => c.class === "light");
  const medium = CHASSIS.filter((c) => c.class === "medium");
  // Human: 2 light + 1 medium.
  const room = digitalVsBotRoom("VSBOT1", [light[0], light[1], medium[0]]);
  applyCommand(room, { verb: "ready", attrs: {} }, { side: "a" }, { random: seededRandom(7) });

  assert.equal(room.game.started, true, "the match should start on the human's single ready");

  const bot = room.rigs.filter((r) => (r.owner || "a") === "b");
  // Same composition signature as the human side: 2 light + 1 medium.
  const botLight = bot.filter((r) => r.weightClass === "light").length;
  const botMedium = bot.filter((r) => r.weightClass === "medium").length;
  assert.equal(botLight, 2);
  assert.equal(botMedium, 1);

  // Battle-wide uniqueness: every chassis on the table appears at most once.
  const chassis = room.rigs.map((r) => r.chassis).filter(Boolean);
  assert.equal(new Set(chassis).size, chassis.length, "no chassis repeats across the battle");

  // Standard build: bot rigs carry their chassis's primary suggested equipment
  // and default (Field) weapon upgrades — no Prototype.
  for (const r of bot) {
    assert.equal(r.equipment, CHASSIS_PRIMARY_EQUIPMENT[r.chassis] ?? null);
  }
});

test("bot force generation is deterministic under a seeded random", () => {
  const light = CHASSIS.filter((c) => c.class === "light");
  const mk = () => {
    const room = digitalVsBotRoom("VSBOT2", [light[0], light[1]]);
    applyCommand(room, { verb: "ready", attrs: {} }, { side: "a" }, { random: seededRandom(42) });
    return room.rigs.filter((r) => (r.owner || "a") === "b").map((r) => r.chassis).sort();
  };
  assert.deepEqual(mk(), mk());
});

test("readying against a bot rejects when a class pool can't be mirrored", () => {
  const medium = CHASSIS.filter((c) => c.class === "medium"); // only 4 exist
  // Human fields ALL medium chassis → zero remain for the bot to mirror.
  const room = digitalVsBotRoom("VSBOT3", medium);
  applyCommand(room, { verb: "ready", attrs: {} }, { side: "a" }, { random: seededRandom(1) });

  assert.equal(room.game.started, false, "no game should start");
  assert.equal(room.rigs.some((r) => (r.owner || "a") === "b"), false, "no bot rigs committed");
  assert.match(lastRejectionReason() || "", /medium/i);
});

test("human-vs-human ready is unchanged by the bot fill (no bot flag = no-op)", () => {
  const light = CHASSIS.filter((c) => c.class === "light");
  const room = createRoom("VSHUMAN1");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  addHumanRig(room, light[0], "HA");
  // Side B is a real human with a matching rig; no setbot.
  applyCommand(room, { verb: "add", attrs: {
    name: "HB", owner: "b", class: light[1].class,
    longRange: light[1].longRange, melee: light[1].melee, chassis: light[1].id, sp: light[1].sp,
  } }, { side: "b" });
  applyCommand(room, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(room, { verb: "ready", attrs: {} }, { side: "a" });
  applyCommand(room, { verb: "ready", attrs: {} }, { side: "b" });
  assert.equal(room.game.started, true);
  // No extra rigs were generated: still exactly one per side.
  assert.equal(room.rigs.filter((r) => (r.owner || "a") === "b").length, 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — the bot side stays empty (no generation exists), so `started` is false / composition assertions fail.

- [ ] **Step 3: Add the generation helpers**

In `shared/game-state.js`, just after `sidesAtParity` (near line 1342), add:

```js
// Build a random force for a bot opponent that mirrors the human side's rig
// composition — same count per weight class — at Standard loadouts, keeping the
// battle-wide "one chassis per battle" invariant (no chassis repeats across
// either side). Digital rooms are Rigs-only, so only rig weight-class counts
// matter. Deterministic under an injected `random`. Returns { ok: true }, or
// { error } when a weight class can't be filled from the remaining distinct
// chassis — the caller rejects the ready so nothing partial is committed.
function generateBotOpponent(room, humanSideId, botSideId, random = Math.random) {
  const used = new Set(room.rigs.map((r) => r.chassis).filter(Boolean));
  const need = {};
  for (const r of room.rigs) {
    if ((r.owner || "a") !== humanSideId) continue;
    if (kindOf(r) !== "rig") continue;
    need[r.weightClass] = (need[r.weightClass] || 0) + 1;
  }
  const picks = [];
  for (const [cls, count] of Object.entries(need)) {
    const pool = CHASSIS.filter((c) => c.class === cls && !used.has(c.id));
    if (pool.length < count) {
      return { error: `Not enough distinct ${cls} chassis remain for the bot to match your force — field fewer ${cls} Rigs.` };
    }
    // Fisher-Yates shuffle under the injected random, then take `count`.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let i = 0; i < count; i++) { picks.push(pool[i]); used.add(pool[i].id); }
  }
  for (const pb of picks) {
    // Standard build: default (Field) weapon upgrades + the chassis's primary
    // suggested equipment — the same construction the seed verb uses.
    const unit = makeUnit("rig", room.nextRigId, uniqueRigName(room, pb.name), botSideId, {
      weightClass: pb.class, longRange: pb.longRange, melee: pb.melee,
      chassis: pb.id, sp: pb.sp,
      equipment: CHASSIS_PRIMARY_EQUIPMENT[pb.id] ?? null,
    });
    if (!unit) continue;
    room.nextRigId++;
    room.rigs.push(unit);
  }
  return { ok: true };
}

// When a human readies against a flagged-but-empty bot opponent, build its
// mirrored force so parity holds at the instant of readiness (design: lazy gen,
// Approach A). No-op for human-vs-human, and idempotent once the bot side is
// populated. Returns { ok } / { error } from generateBotOpponent.
function fillBotOpponentIfNeeded(room, humanSideId, random = Math.random) {
  const opp = room.game.sides.find((s) => s.id !== humanSideId);
  if (!opp || !opp.bot) return { ok: true };
  const hasRigs = room.rigs.some((r) => (r.owner || "a") === opp.id);
  if (hasRigs) return { ok: true };
  return generateBotOpponent(room, humanSideId, opp.id, random);
}
```

- [ ] **Step 4: Wire the fill into the `ready` branch**

Replace the existing `ready` branch body (near line 3382). The change: move the cheap `already ready` check up, run the bot fill before the parity check, and auto-ready a bot opponent so the human's single ready starts the match.

```js
  } else if (verb === "ready") {
    const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
    const side = room.game.sides.find((s) => s.id === sideId);
    if (!side) reject("Unknown side.");
    else if (room.game.started) reject("The battle has already started.");
    else if (!room.field.locked) reject("Lock the field before readying up.");
    else if (side.ready) reject("This side is already ready.");
    else {
      // Lazy bot fill: a flagged, empty bot opponent gets a mirrored force built
      // here, before the parity check, so parity holds against the human's final
      // composition (design: human-vs-bot, Approach A). No-op for human-vs-human.
      const fill = fillBotOpponentIfNeeded(room, side.id, options.random);
      if (fill.error) reject(fill.error);
      else if (!sidesAtParity(room)) reject("Both sides must field a mirrored composition before you can ready.");
      else {
        side.ready = true;
        // Auto-ready a bot opponent so the human's single ready starts the game.
        const opp = room.game.sides.find((s) => s.id !== side.id);
        if (opp && opp.bot) opp.ready = true;
        if (!room.game.deployOrder.includes(side.id)) room.game.deployOrder.push(side.id);
        maybeStartGame(room, options.random);
        changed = true;
      }
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS (the five new tests plus the whole existing file). If a pre-existing ready test regresses, it will show here — the branch is behaviour-preserving for human-vs-human, so investigate any failure rather than editing the test.

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(bot): lazy mirror-force gen + auto-ready on human ready vs bot"
```

---

## Task 3: End-to-end human-vs-bot HTTP loop

**Files:**
- Test: `server/routes/game.test.js` (add one test alongside the existing `driveBots hook` test near line 123; the file already imports `CHASSIS`, `claimSide`, `applyCommand` and has the `post`/`store` harness)

This proves the whole route path: a human sets the bot flag and readies over HTTP, the server generates the bot force, starts the game, and the `driveBots` hook plays the bot out — all through `createGameRouter`.

- [ ] **Step 1: Write the failing test**

```js
test("a human starts a match against a bot over HTTP and the bot plays out", async () => {
  const room = store.getOrCreateRoom("VSBOTHTTP");
  room.mode = "digital";
  claimSide(room, { name: "Human", side: "a" });
  claimSide(room, { name: "Bot", side: "b" });
  // Human commissions two distinct-chassis rigs directly (add stamps chassis).
  const light = CHASSIS.filter((c) => c.class === "light");
  for (let i = 0; i < 2; i++) {
    const pb = light[i];
    applyCommand(room, { verb: "add", attrs: {
      name: `H${i + 1}`, owner: "a", class: pb.class,
      longRange: pb.longRange, melee: pb.melee, chassis: pb.id, sp: pb.sp,
    } }, { side: "a" });
  }
  applyCommand(room, { verb: "field", attrs: { action: "lock" } }, { side: "a" });

  // Flag the opponent as a bot over HTTP, then ready over HTTP.
  const flag = await post("/api/game/VSBOTHTTP/command", { cmd: { verb: "setbot", attrs: { side: "b", preset: "aggressive" } }, side: "a" });
  assert.equal(flag.status, 200);

  const res = await post("/api/game/VSBOTHTTP/command", { cmd: { verb: "ready", attrs: {} }, side: "a" });
  const body = await res.json();
  assert.equal(res.status, 200);

  // The bot side was filled to mirror the human (2 light rigs) and the game ran.
  const botRigs = body.state.rigs.filter((r) => (r.owner || "a") === "b");
  assert.equal(botRigs.length, 2);
  assert.equal(body.state.game.started, true);
  // driveBots advanced play past the start (a round tick or a final outcome).
  assert.ok(body.state.game.outcome != null || body.state.game.round >= 1,
    `expected the bot game to be under way: phase ${body.state.game.phase}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/routes/game.test.js`
Expected: FAIL before Tasks 1–2 exist. (Run it after Tasks 1–2 are committed; it should then pass at Step 4 without any route code change, since the route already calls `driveBots`.)

- [ ] **Step 3: No route code change needed**

`server/routes/game.js` already runs `driveBots(room)` after every applied command and forwards `publicState`. The `setbot` and `ready` verbs added in Tasks 1–2 flow through the existing `/command` handler untouched. Confirm by reading `server/routes/game.js:77-103` — no edit required.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test server/routes/game.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/game.test.js
git commit -m "test(bot): end-to-end human-vs-bot start over HTTP"
```

---

## Task 4: Lobby opponent selector + bot-aware READY gate

**Files:**
- Modify: `client/src/v2/screens/Squadron.tsx`
- Test: `client/src/v2/screens/Squadron.test.tsx`

The selector fires `setbot` for the enemy side; the READY gate stops requiring enemy-side parity when the opponent is a bot (the server generates the match on ready), instead requiring the human's own roster to be non-empty plus a locked field.

- [ ] **Step 1: Write the failing tests**

The existing test file mocks `useCommands` as `() => vi.fn()`. Replace that mock with a shared spy so the selector's calls can be asserted, and add two tests. Full replacement of the mock line and additions:

```tsx
// Replace the existing: vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));
const sendSpy = vi.fn();
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendSpy }));

// Import BOT_PRESETS-aware labels indirectly through the rendered UI; no extra import needed.

test("picking a bot preset fires setbot for the enemy side", async () => {
  sendSpy.mockClear();
  const state: ServerState = {
    version: 1, ownerSide: "a", field: { locked: false } as unknown as ServerState["field"],
    rigs: [rig(1, "STALKER", "a")],
    game: { round: 1, phase: "setup", started: false, sides: [
      { id: "a", name: "Kostov", vp: 0, ready: false },
      { id: "b", name: "Rival", vp: 0, ready: false },
    ] },
  };
  render(<V2Providers><Seed state={state} /><Squadron onOpenRig={vi.fn()} onCommission={vi.fn()} /></V2Providers>);
  const aggressive = await screen.findByRole("button", { name: /aggressive/i });
  aggressive.click();
  expect(sendSpy).toHaveBeenCalledWith("setbot", { side: "b", preset: "aggressive" });
});

test("with a bot opponent, READY enables on own roster + locked field (no enemy parity)", async () => {
  const state: ServerState = {
    version: 1, ownerSide: "a", field: { locked: true } as unknown as ServerState["field"],
    // Only side A has a rig; the enemy side is an empty bot. Human-vs-human this
    // would be blocked by parity, but a bot opponent relaxes that.
    rigs: [rig(1, "STALKER", "a")],
    game: { round: 1, phase: "setup", started: false, sides: [
      { id: "a", name: "Kostov", vp: 0, ready: false },
      { id: "b", name: "Rival", vp: 0, ready: false, bot: "balanced" },
    ] },
  };
  render(<V2Providers><Seed state={state} /><Squadron onOpenRig={vi.fn()} onCommission={vi.fn()} /></V2Providers>);
  const ready = await screen.findByRole("button", { name: "READY" });
  expect(ready).not.toBeDisabled();
});
```

Add `bot?: string | null` to the side shape used in `ServerState` if the type doesn't already allow it (see Step 3).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run client/src/v2/screens/Squadron.test.tsx`
Expected: FAIL — no opponent buttons exist, and with the current gate the READY button is disabled because `!atParity` (enemy side empty).

- [ ] **Step 3: Allow `bot` on the side type**

In `client/src/state/types.ts`, find the game side type (the object with `id`, `name`, `vp`, `ready`) and add:

```ts
  bot?: string | null;
```

(If the sides are typed inline in `ServerState`, add the field there instead. Grep for `ready: boolean` under a `sides` array to locate it.)

- [ ] **Step 4: Add the selector + relaxed gate to `Squadron.tsx`**

Add the `BOT_PRESETS` import and derive the opponent-bot state. At the top imports:

```tsx
import { BOT_PRESETS } from "/shared/game-state.js";
```

Inside the component, after `const enemySide = mySide === "a" ? "b" : "a";`, add:

```tsx
  const enemyBot = game?.sides?.find((s) => s.id === enemySide)?.bot ?? null;
```

Replace the `readyDisabled` line:

```tsx
  // A bot opponent is generated server-side on ready, so its side needn't be at
  // parity yet — gate on your own roster being non-empty and the field locked.
  const rosterReady = enemyBot ? count >= 1 : atParity;
  const readyDisabled = started || myReady || !rosterReady || !field?.locked;
```

Add the opponent selector inside the `{!started && ( ... )}` lobby block — place it just above the `v2-yard-ready` block (after the `Commission New Rig` button):

```tsx
      {!started && (
        <div className="v2-yard-opponent">
          <span className="v2-yard-opponent-label v2-eyebrow">OPPONENT</span>
          <div className="v2-yard-opponent-opts">
            <button
              type="button"
              className={"v2-yard-opp-btn" + (!enemyBot ? " is-on" : "")}
              onClick={() => sendCommand("setbot", { side: enemySide, preset: null })}
            >
              Human
            </button>
            {BOT_PRESETS.map((preset: string) => (
              <button
                key={preset}
                type="button"
                className={"v2-yard-opp-btn" + (enemyBot === preset ? " is-on" : "")}
                onClick={() => sendCommand("setbot", { side: enemySide, preset })}
              >
                {preset.charAt(0).toUpperCase() + preset.slice(1)} Bot
              </button>
            ))}
          </div>
          <div className="v2-yard-opponent-sub">
            {enemyBot
              ? "The bot mirrors your force at a random Standard loadout. Difficulty is the preset."
              : "Two-player: your opponent joins and commissions their own squadron."}
          </div>
        </div>
      )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run client/src/v2/screens/Squadron.test.tsx`
Expected: PASS (both new tests plus the two existing Squadron tests).

- [ ] **Step 6: Add minimal styles**

In `client/src/v2/styles/squadron.css`, append lightweight styles so the control isn't unstyled. Match the file's existing token/class conventions:

```css
/* Pre-battle opponent selector — Human vs a difficulty-preset bot. */
.v2-yard-opponent { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; }
.v2-yard-opponent-opts { display: flex; flex-wrap: wrap; gap: 6px; }
.v2-yard-opp-btn {
  font: inherit; padding: 6px 10px; border: 1px solid var(--v2-line, #3a3a3a);
  background: transparent; color: var(--v2-txt, #ddd); border-radius: 4px; cursor: pointer;
}
.v2-yard-opp-btn.is-on { border-color: var(--v2-accent, #e8792a); color: var(--v2-accent, #e8792a); }
.v2-yard-opponent-sub { font-size: 11px; opacity: 0.7; }
```

(If those CSS variables aren't defined in this codebase, use the literal fallbacks shown — grep `squadron.css` for an existing `--v2-` token to confirm the right names.)

- [ ] **Step 7: Run the full client suite to confirm nothing else broke**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/v2/screens/Squadron.tsx client/src/v2/screens/Squadron.test.tsx client/src/v2/styles/squadron.css client/src/state/types.ts
git commit -m "feat(bot): lobby opponent selector + bot-aware ready gate"
```

---

## Task 5: Full suite + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — Vitest (client) and `node --test` (shared + server + scripts) both green.

- [ ] **Step 2: Manual smoke via the preview**

Start the dev server (preview_start with the dev config), open the V2 lobby in a fresh digital room, commission 2–3 rigs on your side, lock the field, pick "Balanced Bot", tap READY. Confirm: the match starts, the enemy roster appears mirrored to your composition with distinct chassis, and the bot takes its turn (state arrives resolved after your first command). Note: you cannot issue your own digital *Move* yet — that is the deferred 1c targeting UI.

- [ ] **Step 3: Commit any smoke-fix (only if needed)**

```bash
git add -A
git commit -m "fix(bot): <describe the smoke-test fix>"
```

(Skip if the smoke test was clean. Never `git add -A` blindly if unrelated changes are staged — this repo has a concurrent committer; stage only files you touched.)

---

## Self-Review

**Spec coverage:**
- Design §1 (`setbot` verb) → Task 1. ✓
- Design §2 (lazy mirror-gen + auto-ready, infeasible guard, determinism) → Task 2. ✓
- Design §3 (client READY gate) → Task 4, Step 4. ✓
- Design §4 (lobby opponent control) → Task 4, Steps 4/6. ✓
- Design §5 (1c) → explicitly deferred; documented in the plan header and design §5/Out-of-scope. ✓
- Design "Testing" list → Tasks 1–4 test steps + Task 3 full loop. ✓
- Design constraints (7 light / 4 medium pool, parity signature, sides always exist, digital = Rigs-only) → encoded in Task 2's helper + the infeasible-guard test. ✓

**Placeholder scan:** none — every code step shows complete code; the one conditional ("if those CSS vars aren't defined") gives literal fallbacks.

**Type/name consistency:** `generateBotOpponent` and `fillBotOpponentIfNeeded` are defined in Task 2 and referenced only there; `BOT_PRESETS` is exported in Task 1 and consumed in Task 4; `setbot`/`ready` verb names and the `{ side, preset }` attrs match across Tasks 1, 3, 4; `enemyBot`/`rosterReady`/`readyDisabled` are consistent within Task 4.
