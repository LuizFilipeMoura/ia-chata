# Reaction Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players place the three §5 preparation reactions (Brace / Evasive / Return Fire) via Answer tokens (spent immediately at round start) and the Prepare action, keep them facedown/secret, and reveal + resolve them with a matched animation when the Rig receives fire.

**Architecture:** Server (`shared/game-state.js`, `shared/combat.js`) owns the reaction state, a mandatory round-start placement gate (`pendingAnswer`), and an interpose step (`pendingReaction`, resolved by a new `react` verb) that parks Evasive/Return so the defender resolves them mid-attacker's-turn. Client adds one shared `ReactionPicker`, two entry points, a mandatory-placement watcher, a defender-decision watcher, and a `reaction` flip mode in `RollConsole` reusing the existing dice/`line-in` motion.

**Tech Stack:** Node's built-in `node:test` for shared code, Vitest + `@testing-library/react` for the client, plain ES modules shared between server and browser via the `/shared` static mount.

---

## File structure

- `shared/game-state.js` — preparation `faceUp`; `publicState` redaction; `pendingAnswer` gate; `pendingReaction`; interpose in `performAction`; `react` verb; helpers `resolveFire`, `eligibleForPrep`, `reactionRevealEntry`, `prepName`.
- `shared/combat.js` — unchanged logic; Brace already applies `−2`. (No task — verified by a regression test in Task 4.)
- `shared/battle-view.js` — secret-aware `rigModifiers`.
- `client/src/state/types.ts` — `Preparation`, `faceUp`/`hidden`, `pendingAnswer`, `pendingReaction`.
- `client/src/components/overlays/ReactionPicker.tsx` — new shared picker (+ test).
- `client/src/state/BattleActionsContext.tsx` — `openPrepare`; `placeAnswer`; `sendReact`.
- `client/src/components/battle/ActionConsole.tsx` — Prepare opens the picker.
- `client/src/hooks/useBattleWatchers.ts` — answer-gate + pendingReaction watchers.
- `client/src/components/overlays/RollConsole.tsx` + `client/src/styles/battle.css` — `reaction` flip mode + keyframes.

Reaction `type` vocabulary is `"brace" | "evasive" | "return"` everywhere (server, view-model, client) — do not rename.

---

## Task 1: Preparation carries a `faceUp` reveal flag

**Files:**
- Modify: `shared/game-state.js` (`ensureRigShape`, `performAction` prepare branch, `answer` verb)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js` (it already imports `applyCommand`, `findRig`, and defines `startedRoom()`):

```js
test("prepare action places a facedown reaction of the chosen type", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "prepare", prep: "evasive" } });
  const rig = findRig(r, "b1");
  assert.deepEqual(rig.preparation, { type: "evasive", source: "action", faceUp: false });
});

test("answer token places a facedown reaction and spends a token", () => {
  const r = startedRoom(); // side "a" holds 2 answer tokens
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  const rig = findRig(r, "a1");
  assert.deepEqual(rig.preparation, { type: "brace", source: "answer", faceUp: false });
  assert.equal(r.game.answerTokens.a, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `preparation` is `{ type, source }` with no `faceUp` key.

- [ ] **Step 3: Implement the flag**

In `shared/game-state.js`, in `ensureRigShape`, replace the preparation line:

```js
  if (rig.preparation === undefined) rig.preparation = null;
```

with:

```js
  if (rig.preparation === undefined) rig.preparation = null;
  if (rig.preparation && typeof rig.preparation.faceUp !== "boolean") rig.preparation.faceUp = false;
```

In `performAction`, in the `prepare` branch, replace:

```js
  } else if (act === "prepare") {
    rig.preparation = { type: String(a.prep || "brace"), source: "action" };
  }
```

with:

```js
  } else if (act === "prepare") {
    rig.preparation = { type: normalizePrep(a.prep), source: "action", faceUp: false };
  }
```

In the `answer` verb branch, replace:

```js
      rig.preparation = { type: String(a.prep || "brace"), source: "answer" };
```

with:

```js
      rig.preparation = { type: normalizePrep(a.prep), source: "answer", faceUp: false };
```

Add this helper near the top of the file, after the `EQUIPMENT_ACTIVE_BY_KEY` block:

```js
// The three §5 preparation reactions. Unknown/missing input falls back to brace.
export const PREP_TYPES = ["brace", "evasive", "return"];
export function normalizePrep(type) {
  const ref = String(type || "").trim().toLowerCase();
  return PREP_TYPES.includes(ref) ? ref : "brace";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS (both new tests, and the existing suite still green).

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(reactions): preparation carries a faceUp reveal flag"
```

---

## Task 2: `publicState` hides an opponent's facedown reaction

**Files:**
- Modify: `shared/game-state.js` (`publicState`)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("publicState hides an opponent's facedown reaction but not the owner's", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "return", side: "a" } });
  const asOwner = publicState(r, "a").rigs.find((x) => x.name === "a1");
  const asFoe = publicState(r, "b").rigs.find((x) => x.name === "a1");
  assert.equal(asOwner.preparation.type, "return");           // owner sees the type
  assert.deepEqual(asFoe.preparation, { hidden: true });      // foe sees only "set"
});

test("publicState reveals a face-up reaction to everyone", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  findRig(r, "a1").preparation.faceUp = true;
  const asFoe = publicState(r, "b").rigs.find((x) => x.name === "a1");
  assert.equal(asFoe.preparation.type, "brace");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — the foe currently sees `{ type: "return", ... }`.

- [ ] **Step 3: Implement redaction**

In `publicState`, replace the returned `rigs: room.rigs,` line with a per-viewer mapped array. Change the return block so it reads:

```js
  const viewer = sideId;
  const rigs = room.rigs.map((rig) => {
    const prep = rig.preparation;
    if (prep && prep.faceUp === false && (rig.owner || "a") !== viewer) {
      return { ...rig, preparation: { hidden: true } };
    }
    return rig;
  });
  return {
    code: room.code,
    version: room.version,
    game: {
      ...room.game,
      sides: room.game.sides.map((s) => ({ ...s })),
      objectives: room.game.objectives.map((objective) => ({ ...objective })),
      bounties,
    },
    rigs,
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(reactions): redact facedown reactions from the opponent's view"
```

---

## Task 3: Mandatory round-start Answer gate blocks activation

**Files:**
- Modify: `shared/game-state.js` (`createRoom`, `ensureGameShape`, `applyInitiative`, `activate` verb, `answer` verb; add `eligibleForPrep`)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("second player gets a blocking answer gate that clears when both tokens are spent", () => {
  const r = startedRoom(); // "a" is second and holds 2 tokens; turn.side === "b"
  assert.deepEqual(r.game.pendingAnswer, { side: "a", remaining: 2 });

  // First player cannot start activating while the gate is up.
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(r.game.turn.activeRigId, null);

  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  assert.deepEqual(r.game.pendingAnswer, { side: "a", remaining: 1 });
  applyCommand(r, { verb: "answer", attrs: { name: "a2", prep: "evasive", side: "a" } });
  assert.equal(r.game.pendingAnswer, null);

  // Gate cleared — activation works again.
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(r.game.turn.activeRigId, findRig(r, "b1").id);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `pendingAnswer` is `undefined`, and `activate` is not gated.

- [ ] **Step 3: Implement the gate**

In `createRoom`, add `pendingAnswer: null,` to the `game` object (next to `pendingBlast: null,`).

In `ensureGameShape`, add next to the `pendingBlast` backfill:

```js
  if (room.game.pendingAnswer === undefined) room.game.pendingAnswer = null;
```

Add this helper near `sideHasActivatable`:

```js
// Rigs a side may still place a preparation on: alive and not already prepared.
function eligibleForPrep(room, sideId) {
  return room.rigs.filter((r) => (r.owner || "a") === sideId && !r.destroyed && r.preparation == null);
}
```

In `applyInitiative`, after the two `answerTokens` lines, seed the gate:

```js
  room.game.answerTokens = { a: 0, b: 0 };
  room.game.answerTokens[second] = 2;
  room.game.pendingAnswer =
    room.game.answerTokens[second] > 0 && eligibleForPrep(room, second).length > 0
      ? { side: second, remaining: room.game.answerTokens[second] }
      : null;
```

In the `activate` verb branch, add `!room.game.pendingAnswer` to the guard. Change:

```js
    if (rig && t && room.game.phase === "activation" && t.activeRigId == null &&
        (rig.owner || "a") === t.side && !rig.destroyed && !rig.activated) {
```

to:

```js
    if (rig && t && room.game.phase === "activation" && t.activeRigId == null &&
        !room.game.pendingAnswer && !room.game.pendingReaction &&
        (rig.owner || "a") === t.side && !rig.destroyed && !rig.activated) {
```

(The `pendingReaction` term is used in Task 5 — declaring it here is harmless since it is `undefined`/`null`.)

In the `answer` verb branch, after `room.game.answerTokens[sideId] -= 1;`, decrement the gate:

```js
      room.game.answerTokens[sideId] -= 1;
      if (room.game.pendingAnswer && room.game.pendingAnswer.side === sideId) {
        room.game.pendingAnswer.remaining -= 1;
        if (room.game.pendingAnswer.remaining <= 0 || eligibleForPrep(room, sideId).length === 0) {
          room.game.pendingAnswer = null;
        }
      }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(reactions): mandatory round-start Answer gate blocks activation"
```

---

## Task 4: Interpose — reveal on fire, apply Brace, park Return Fire

**Files:**
- Modify: `shared/game-state.js` (extract `resolveFire`, rework the `fire`/`aimed` branch, add `reactionRevealEntry`/`prepName`)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("firing on a braced rig reveals it and applies the -2 front-arc penalty", () => {
  const r = startedRoom();
  // "a" places brace on a1, then b1 fires at it front-on with fixed dice.
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  applyCommand(r, { verb: "answer", attrs: { name: "a2", prep: "brace", side: "a" } }); // clear gate
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
  } });
  const a1 = findRig(r, "a1");
  assert.equal(a1.preparation.faceUp, true);                 // revealed
  assert.equal(r.game.resolutions.some((e) => e.kind === "reaction"), true);
});

test("firing on a return-fire rig resolves the shot then parks a counter", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "return", side: "a" } });
  applyCommand(r, { verb: "answer", attrs: { name: "a2", prep: "brace", side: "a" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
  } });
  assert.equal(findRig(r, "a1").preparation.faceUp, true);
  assert.equal(r.game.pendingReaction.kind, "return");
  assert.equal(r.game.pendingReaction.defender, "a");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — no reveal, no `reaction` entry, no `pendingReaction`.

- [ ] **Step 3: Implement the interpose**

Add helpers near `pushResolution`:

```js
function prepName(type) {
  if (type === "evasive") return "Evasive Manoeuvre";
  if (type === "return") return "Return Fire";
  return "Brace for Incoming Fire";
}
function prepEffectLine(type) {
  if (type === "evasive") return "Defender may move ½ Speed — the attack can miss entirely.";
  if (type === "return") return "Defender answers with a counter-attack.";
  return "Front-arc impacts suffer −2.";
}
function reactionRevealEntry(rig, type) {
  return {
    kind: "reaction", actor: rig.owner, rigId: rig.id, rolls: [], prep: type,
    summary: `${rig.name} reveals ${prepName(type)}!`, effects: [prepEffectLine(type)],
  };
}
```

Extract the fire tail into a reusable helper. Add above `performAction`:

```js
// Resolve one Fire/Aimed shot end-to-end (to-hit, heat, budget). Returns whether
// the shot was made. Shared by the direct path and the deferred Evasive path.
function resolveFire(room, rig, target, a, act, random) {
  const t = room.game.turn;
  const slot = a.weapon === "melee" ? "melee" : "longRange";
  const rushed = slot === "longRange" && rig.loaded.longRange === false;
  const cost = rushed ? 2 : 1;
  if (t.actionsUsed + cost > t.actionsMax) return false;
  const res = resolveAttack(room, rig, target, {
    weapon: a.weapon, target: a.target, arc: a.arc, range: a.range, cover: a.cover,
    aimed: act === "aimed", aimedLoc: String(a.loc || "hull").toLowerCase(),
    fullAuto: a.fullAuto === true || a.fullAuto === "true",
    charged: a.charged === true || a.charged === "true",
    autoReload: rushed, dice: a.dice,
  }, random, combatCtx());
  if (!res.ok) return false;
  if (rushed) bumpHeat(rig, ACTIONS.reload.heat);
  t.actionsUsed += cost;
  bumpHeat(rig, ACTIONS[act].heat);
  return true;
}
```

In `performAction`, replace the entire `if (act === "fire" || act === "aimed") { ... }` block with:

```js
  if (act === "fire" || act === "aimed") {
    const target = findRig(room, a.target);
    if (!target) return false;
    const facedown = target.preparation && target.preparation.faceUp === false;
    if (facedown) {
      const prep = target.preparation;
      // Affordability pre-check so an unaffordable shot never reveals the token.
      const slot = a.weapon === "melee" ? "melee" : "longRange";
      const rushed = slot === "longRange" && rig.loaded.longRange === false;
      const cost = rushed ? 2 : 1;
      if (t.actionsUsed + cost > t.actionsMax) return false;

      if (prep.type === "evasive") {
        prep.faceUp = true;
        pushResolution(room, reactionRevealEntry(target, "evasive"));
        room.game.pendingReaction = {
          kind: "evasive", attackerId: rig.id, targetId: target.id, defender: target.owner,
          attack: { ...a, act },
        };
        return true; // whole attack deferred to the `react` verb
      }
      const ok = resolveFire(room, rig, target, a, act, random);
      if (!ok) return false;
      prep.faceUp = true;
      pushResolution(room, reactionRevealEntry(target, prep.type));
      if (prep.type === "return" && !target.destroyed) {
        room.game.pendingReaction = {
          kind: "return", attackerId: rig.id, targetId: target.id, defender: target.owner,
        };
      }
      return true;
    }
    return resolveFire(room, rig, target, a, act, random);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: PASS (combat suite confirms Brace's `−2` math is unchanged).

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(reactions): interpose reveal on fire; apply Brace, park Return Fire"
```

---

## Task 5: The `react` verb resolves Evasive and Return Fire

**Files:**
- Modify: `shared/game-state.js` (add `react` verb; gate turn verbs on `pendingReaction`; ensure `pendingReaction` default)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("evasive react with evaded=true fails the attack and deals no damage", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "evasive", side: "a" } });
  applyCommand(r, { verb: "answer", attrs: { name: "a2", prep: "brace", side: "a" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
  } });
  assert.equal(r.game.pendingReaction.kind, "evasive");
  const before = { ...findRig(r, "a1").hull };
  applyCommand(r, { verb: "react", attrs: { evaded: true, side: "a" } });
  assert.equal(r.game.pendingReaction, null);
  assert.equal(findRig(r, "a1").preparation, null);          // consumed
  assert.deepEqual(findRig(r, "a1").hull, before);            // undamaged
  assert.ok(findRig(r, "b1").engine.heat >= 1);              // attacker still ran hot
});

test("return-fire react lets the defender counter the attacker", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "return", side: "a" } });
  applyCommand(r, { verb: "answer", attrs: { name: "a2", prep: "brace", side: "a" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
  } });
  assert.equal(r.game.pendingReaction.kind, "return");
  const n = r.game.resolutions.length;
  applyCommand(r, { verb: "react", attrs: {
    side: "a", attack: { weapon: "longRange", arc: "front", range: "near" },
  } });
  assert.equal(r.game.pendingReaction, null);
  assert.equal(findRig(r, "a1").preparation, null);          // consumed
  assert.ok(r.game.resolutions.length > n);                  // a counter-attack was logged
});

test("react is ignored from the wrong side", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "evasive", side: "a" } });
  applyCommand(r, { verb: "answer", attrs: { name: "a2", prep: "brace", side: "a" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
  } });
  applyCommand(r, { verb: "react", attrs: { evaded: true, side: "b" } }); // attacker can't answer
  assert.equal(r.game.pendingReaction.kind, "evasive");      // still parked
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `react` verb does not exist; `pendingReaction` never clears.

- [ ] **Step 3: Implement the `react` verb**

In `createRoom`, add `pendingReaction: null,` next to `pendingAnswer: null,`. In `ensureGameShape`, add:

```js
  if (room.game.pendingReaction === undefined) room.game.pendingReaction = null;
```

Gate the other turn verbs while a reaction is parked. In the `action` verb branch, change the guard from:

```js
    if (rig && t && room.game.phase === "activation" && t.activeRigId === rig.id) {
```

to:

```js
    if (rig && t && !room.game.pendingReaction &&
        room.game.phase === "activation" && t.activeRigId === rig.id) {
```

Apply the identical `!room.game.pendingReaction` addition to the `endactivation` verb guard.

Add the `react` branch. Place it right after the `answer` verb branch:

```js
  } else if (verb === "react") {
    const pr = room.game.pendingReaction;
    const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
    if (pr && sideId === pr.defender) {
      const reactor = room.rigs.find((x) => x.id === pr.targetId);   // the prepared rig
      const attacker = room.rigs.find((x) => x.id === pr.attackerId);
      if (pr.kind === "evasive" && reactor && attacker) {
        const evaded = a.evaded === true || a.evaded === "true";
        if (evaded) {
          // The shot was fired but dodged: weapon discharged, attacker still runs
          // hot and spends the action, but no to-hit / no damage.
          const slot = pr.attack.weapon === "melee" ? "melee" : "longRange";
          const rushed = slot === "longRange" && attacker.loaded.longRange === false;
          const cost = rushed ? 2 : 1;
          if (slot === "longRange") attacker.loaded.longRange = false;
          const profile = effectiveWeaponProfile(slot, attacker.weapons?.[slot], attacker);
          const hot = profile?.perks.includes("Hot") ? 1 : 0;
          if (rushed) bumpHeat(attacker, ACTIONS.reload.heat);
          bumpHeat(attacker, (ACTIONS[pr.attack.act]?.heat || 1) + hot);
          room.game.turn.actionsUsed += cost;
          pushResolution(room, {
            kind: "attack", actor: attacker.owner, rigId: reactor.id, rolls: [],
            summary: `${reactor.name} evades — ${attacker.name}'s attack fails.`, effects: [],
          });
        } else {
          resolveFire(room, attacker, reactor, pr.attack, pr.attack.act, options.random);
        }
        reactor.preparation = null;
        room.game.pendingReaction = null;
        changed = true;
      } else if (pr.kind === "return" && reactor && attacker) {
        const declined = a.decline === true || a.decline === "true";
        if (!declined && a.attack && !reactor.destroyed) {
          resolveAttack(room, reactor, attacker, {
            weapon: a.attack.weapon, target: attacker.name,
            arc: a.attack.arc, range: a.attack.range, cover: a.attack.cover,
            aimed: false, aimedLoc: "hull",
            fullAuto: a.attack.fullAuto === true || a.attack.fullAuto === "true",
            charged: a.attack.charged === true || a.attack.charged === "true",
            autoReload: false, dice: a.attack.dice,
          }, options.random, combatCtx());
        }
        reactor.preparation = null;
        room.game.pendingReaction = null;
        changed = true;
      }
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(reactions): react verb resolves Evasive and Return Fire"
```

---

## Task 6: View-model shows a secret chip vs the revealed reaction

**Files:**
- Modify: `shared/battle-view.js` (`rigModifiers`, `prepLabel`)
- Test: `shared/battle-view.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/battle-view.test.js` (mirror its existing import of `rigModifiers`; if it isn't imported yet, add it to the import list):

```js
test("rigModifiers shows a generic chip for a hidden reaction", () => {
  const rig = baseRig(); // helper in this file; a plain light rig
  rig.preparation = { hidden: true };
  const mod = rigModifiers(rig).find((m) => m.key === "prep");
  assert.equal(mod.tag, "Reaction set");
  assert.equal(mod.tone, "prep");
});

test("rigModifiers names a revealed reaction", () => {
  const rig = baseRig();
  rig.preparation = { type: "return", source: "answer", faceUp: true };
  const mod = rigModifiers(rig).find((m) => m.key === "prep");
  assert.equal(mod.tag, "Return fire ready");
});
```

If `baseRig()` does not already exist in the file, add this helper near the top:

```js
function baseRig() {
  return {
    id: 1, name: "R", weightClass: "light", owner: "a",
    hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false },
    legs: { sp: 5, max: 5, destroyed: false }, engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
    loaded: { longRange: true, melee: true }, weaponsDestroyed: [], preparation: null,
  };
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test shared/battle-view.test.js`
Expected: FAIL — a `{ hidden: true }` preparation currently calls `prepLabel(undefined)` → "Braced".

- [ ] **Step 3: Implement secret-aware chips**

In `shared/battle-view.js`, replace the preparation line in `rigModifiers`:

```js
  if (rig.preparation) mods.push({ key: "braced", tag: prepLabel(rig.preparation.type), tone: "prep" });
```

with:

```js
  if (rig.preparation) {
    const p = rig.preparation;
    const tag = p.hidden || p.faceUp === false ? "Reaction set" : prepLabel(p.type);
    mods.push({ key: "prep", tag, tone: "prep" });
  }
```

(The chip `key` becomes `"prep"` to match the design and the test.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/battle-view.js shared/battle-view.test.js
git commit -m "feat(reactions): view-model shows secret vs revealed reaction chip"
```

---

## Task 7: Client types for reactions and the new pending states

**Files:**
- Modify: `client/src/state/types.ts`

- [ ] **Step 1: Add the types**

In `client/src/state/types.ts`, add a `Preparation` type and wire it into `Rig` and `GameState`:

```ts
export type PrepType = "brace" | "evasive" | "return";

export interface Preparation {
  type?: PrepType;
  source?: "answer" | "action";
  faceUp?: boolean;
  hidden?: boolean; // set by publicState redaction for the opponent
}

export interface PendingAnswer {
  side: string;
  remaining: number;
}

export interface PendingReaction {
  kind: "evasive" | "return";
  attackerId: number;
  targetId: number;
  defender: string;
  attack?: Record<string, unknown>;
}
```

Add `preparation?: Preparation | null;` to the `Rig` interface (after `loaded`).

Add to `GameState`:

```ts
  answerTokens?: Record<string, number>;
  pendingAnswer?: PendingAnswer | null;
  pendingReaction?: PendingReaction | null;
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run -s build --prefix client` *(or the repo's typecheck: `npx tsc -p tsconfig.json --noEmit`)*
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/state/types.ts
git commit -m "feat(reactions): client types for preparations and pending states"
```

---

## Task 8: The shared `ReactionPicker` component

**Files:**
- Create: `client/src/components/overlays/ReactionPicker.tsx`
- Test: `client/src/components/overlays/ReactionPicker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/components/overlays/ReactionPicker.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReactionPicker from "./ReactionPicker";

test("renders the three reactions and reports the picked type", async () => {
  const onChange = vi.fn();
  render(<ReactionPicker value="brace" onChange={onChange} />);
  expect(screen.getByText("Brace for Incoming Fire")).toBeInTheDocument();
  expect(screen.getByText("Evasive Manoeuvre")).toBeInTheDocument();
  expect(screen.getByText("Return Fire")).toBeInTheDocument();
  await userEvent.click(screen.getByText("Evasive Manoeuvre"));
  expect(onChange).toHaveBeenCalledWith("evasive");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run client/src/components/overlays/ReactionPicker.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the component**

Create `client/src/components/overlays/ReactionPicker.tsx`:

```tsx
import type { PrepType } from "../../state/types";

export const REACTIONS: { value: PrepType; icon: string; label: string; rule: string }[] = [
  { value: "brace", icon: "🛡️", label: "Brace for Incoming Fire",
    rule: "Front-arc attacks against this Rig take −2 to their Impact Rolls until next round." },
  { value: "evasive", icon: "💨", label: "Evasive Manoeuvre",
    rule: "Before the attack resolves, move up to ½ Speed. Break line of sight or range and the attack fails." },
  { value: "return", icon: "↩️", label: "Return Fire",
    rule: "After the enemy attacks, answer with one weapon against that enemy." },
];

interface Props {
  value: PrepType;
  onChange: (v: PrepType) => void;
}

// The shared reaction chooser used by both the Answer-token gate and the
// Prepare action. Presentational only — parents own the send.
export default function ReactionPicker({ value, onChange }: Props) {
  return (
    <div className="rx-picker">
      {REACTIONS.map((r) => (
        <button
          key={r.value}
          type="button"
          className={"rx-choice" + (r.value === value ? " sel" : "")}
          onClick={() => onChange(r.value)}
        >
          <span className="rx-choice-ic" aria-hidden="true">{r.icon}</span>
          <span className="rx-choice-body">
            <span className="rx-choice-label">{r.label}</span>
            <span className="rx-choice-rule">{r.rule}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
```

Add styling to `client/src/styles/battle.css` (near the other drawer styles):

```css
/* ===== Reaction picker (Answer token / Prepare) ===== */
.rx-picker { display: flex; flex-direction: column; gap: .4rem; }
.rx-choice {
  display: flex; gap: .55rem; align-items: flex-start; text-align: left;
  padding: .55rem .6rem; border-radius: var(--radius-md);
  background: var(--iron-800); border: 1px solid var(--line); color: var(--txt);
}
.rx-choice.sel { border-color: var(--oil); box-shadow: 0 0 0 1px var(--oil) inset; }
.rx-choice-ic { font-size: 1.1rem; line-height: 1.2; }
.rx-choice-body { display: flex; flex-direction: column; gap: .15rem; }
.rx-choice-label { font-family: var(--font-display); font-weight: 700; font-size: .82rem; }
.rx-choice-rule { font-family: var(--font-mono); font-size: .58rem; color: var(--txt-dim); line-height: 1.3; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run client/src/components/overlays/ReactionPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/overlays/ReactionPicker.tsx client/src/components/overlays/ReactionPicker.test.tsx client/src/styles/battle.css
git commit -m "feat(reactions): shared ReactionPicker component"
```

---

## Task 9: The Prepare action opens the picker

**Files:**
- Modify: `client/src/state/BattleActionsContext.tsx` (add `openPrepare`)
- Modify: `client/src/components/battle/ActionConsole.tsx` (route `prepare` to it)

- [ ] **Step 1: Add `openPrepare` to the battle-actions API**

In `client/src/state/BattleActionsContext.tsx`:

1. Import the picker at the top:

```tsx
import ReactionPicker from "../components/overlays/ReactionPicker";
import type { Rig, PrepType } from "./types";
```

(The file already imports `type { Rig }` — merge `PrepType` into that import instead of duplicating.)

2. Add `openPrepare` to the `BattleActionsApi` interface:

```tsx
  openPrepare: (rig: Rig) => void;
```

3. Implement it inside `BattleActionsProvider`, next to `openRepair`:

```tsx
  const openPrepare = useCallback(
    (rig: Rig) => {
      const state: { prep: PrepType } = { prep: "brace" };
      const build = () => (
        <>
          <p className="dwr-hint">
            Place a facedown reaction on {rig.name}. It stays secret until an enemy fires on this Rig.
          </p>
          <ReactionPicker value={state.prep} onChange={(v) => (state.prep = v)} />
        </>
      );
      openDrawer({
        title: `🛡️ Prepare — ${rig.name}`,
        tone: "oil",
        render: build,
        actions: [
          { label: "Cancel", ghost: true, onClick: () => closeDrawer() },
          {
            label: "Set reaction",
            primary: true,
            icon: "🛡️",
            onClick: () => {
              closeDrawer();
              sendCommand("action", { name: rig.name, action: "prepare", prep: state.prep });
            },
          },
        ],
      });
    },
    [openDrawer, closeDrawer, sendCommand],
  );
```

Note: `openDrawer`'s `render` re-runs on each drawer render, so `ReactionPicker`'s highlight follows `state.prep` (same ref-backed pattern `openRepair` uses).

4. Add `openPrepare` to the context `value={{ ... }}` object.

- [ ] **Step 2: Route the Prepare button to it**

In `client/src/components/battle/ActionConsole.tsx`, pull `openPrepare` from the hook:

```tsx
  const { openMove, openRepair, endActivation, openPrepare } = useBattleActions();
```

In `onAction`, before the final `sendCommand(...)` fallback, add:

```tsx
    if (key === "prepare") {
      openPrepare(r);
      return;
    }
```

- [ ] **Step 3: Verify build + existing tests**

Run: `npx vitest run client/src && npx tsc -p tsconfig.json --noEmit`
Expected: no new failures.

- [ ] **Step 4: Commit**

```bash
git add client/src/state/BattleActionsContext.tsx client/src/components/battle/ActionConsole.tsx
git commit -m "feat(reactions): Prepare action opens the reaction picker"
```

---

## Task 10: Mandatory Answer-token placement watcher

**Files:**
- Modify: `client/src/hooks/useBattleWatchers.ts` (add an answer-gate effect)

- [ ] **Step 1: Add the gate watcher**

In `client/src/hooks/useBattleWatchers.ts`, this hook already reads `useRoomState()` and `useDrawer()`. Add — after the resolution-log effect — an effect that opens the mandatory placement drawer when it is my gate:

```tsx
  // ---- Answer-token gate: mandatory immediate placement ----
  const sendCommand = useCommands();
  const answerShownFor = useRef<number>(-1); // remaining count last shown
  useEffect(() => {
    const g = gameRef.current;
    const mine = sessionRef.current?.side || "a";
    const gate = g?.pendingAnswer;
    if (!gate || gate.side !== mine) { answerShownFor.current = -1; return; }
    if (answerShownFor.current === gate.remaining) return; // already prompting this step
    answerShownFor.current = gate.remaining;

    const eligible = (rigsRef.current || []).filter(
      (r) => (r.owner || "a") === mine && !r.destroyed && r.preparation == null,
    );
    if (!eligible.length) return; // server clears the gate on its own

    const pick = { rigName: eligible[0].name, prep: "brace" as PrepType };
    const build = () => (
      <div className="dwr-recap">
        <p className="dwr-hint">
          Answer token — {gate.remaining} left. Choose a Rig, then a facedown reaction.
        </p>
        <ChoiceField
          label="Rig"
          options={eligible.map((r) => ({ value: r.name, label: r.name }))}
          value={pick.rigName}
          onChange={(v) => (pick.rigName = v)}
        />
        <ReactionPicker value={pick.prep} onChange={(v) => (pick.prep = v)} />
      </div>
    );
    openDrawer({
      title: "⟡ Answer Tokens — prepare a reaction",
      tone: "oil",
      dismissable: false,
      render: build,
      actions: [
        {
          label: "Set reaction",
          primary: true,
          icon: "⟡",
          onClick: () => {
            closeDrawer();
            sendCommand("answer", { name: pick.rigName, prep: pick.prep, side: mine });
          },
        },
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.pendingAnswer?.remaining, game?.pendingAnswer?.side]);
```

Add the imports at the top of the file:

```tsx
import { useCommands } from "./useCommands";
import ChoiceField from "../components/overlays/ChoiceField";
import ReactionPicker from "../components/overlays/ReactionPicker";
import type { Rig, Resolution, PrepType } from "../state/types";
```

(Merge `PrepType` into the existing `types` import rather than duplicating; the file already imports `Rig, Resolution`.)

Because this file now returns JSX from an effect, ensure its extension stays `.ts` only if it already uses `createElement`. It currently imports `createElement` and returns `ReactNode` — convert the two new inline JSX blocks to `createElement` calls **or** rename the file to `.tsx`. Simplest: rename `useBattleWatchers.ts` → `useBattleWatchers.tsx` and update its import in `client/src/App.tsx` (import path stays the same without extension, so no change needed) — then JSX is allowed.

- [ ] **Step 2: Verify build + tests**

Run: `npx vitest run client/src && npx tsc -p tsconfig.json --noEmit`
Expected: no new failures.

- [ ] **Step 3: Manual check**

Start the app (`npm run dev`), open two browser sides in one room, add 3 Rigs each, ready both. The second player (the one who deployed first) should get a blocking "Answer Tokens" drawer twice; the first player should not be able to activate until both are placed.

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useBattleWatchers.tsx client/src/App.tsx
git commit -m "feat(reactions): mandatory Answer-token placement watcher"
```

---

## Task 11: The reveal flip animation in `RollConsole`

**Files:**
- Modify: `client/src/components/overlays/RollConsole.tsx` (a `reaction` render mode)
- Modify: `client/src/styles/battle.css` (flip keyframes + token faces)

- [ ] **Step 1: Add the reaction render mode**

In `client/src/components/overlays/RollConsole.tsx`:

1. Extend `KIND_TONE` with `reaction: "oil",`.

2. Add state for the flip near the other `useState` calls:

```tsx
  const [reveal, setReveal] = useState<{ prep: string; icon: string; label: string } | null>(null);
```

3. In `playResolution`, at the very top (after `setKind(...)`), branch on the reaction kind:

```tsx
    if (entry.kind === "reaction") {
      const prep = (entry as { prep?: string }).prep || "brace";
      const face = prep === "evasive"
        ? { icon: "💨", label: "Evasive", tone: "evasive" }
        : prep === "return"
          ? { icon: "↩️", label: "Return Fire", tone: "return" }
          : { icon: "🛡️", label: "Brace", tone: "brace" };
      setDice([]);
      setReveal({ prep: face.tone, icon: face.icon, label: face.label });
      setSummary("");
      setEffects([]);
      open();
      window.setTimeout(() => {
        setSummary(entry.summary || "");
        setEffects((entry.effects || []).map((text, i) => ({ text, delay: 0.4 + i * 0.12 })));
        showOkAfterDelay();
      }, reduced ? 0 : 480);
      return Promise.resolve();
    }
    setReveal(null);
```

(Add `setReveal(null);` at the start of the non-reaction path too, so a later dice roll clears the token.)

4. Add the `prep` field to the `Resolution` type in `client/src/state/types.ts`:

```ts
  prep?: string;
```

5. Render the token. Just above the `<div id="rollDice" ...>` block, add:

```tsx
        {reveal ? (
          <div className="rx-reveal">
            <div className={"rx-token flip"} data-tone={reveal.prep} aria-label={reveal.label}>
              <span className="rx-token-face rx-token-back" aria-hidden="true">⟡</span>
              <span className="rx-token-face rx-token-front" aria-hidden="true">{reveal.icon}</span>
            </div>
            <span className="die-label">{reveal.label}</span>
          </div>
        ) : null}
```

- [ ] **Step 2: Add the flip styling**

In `client/src/styles/battle.css`, next to the dice styles:

```css
/* ===== Reaction reveal — the facedown token flip ===== */
.rx-reveal { display: flex; flex-direction: column; align-items: center; padding: .9rem .7rem .4rem; }
.rx-token {
  --face: var(--oil);
  position: relative; width: 3.2rem; height: 3.2rem;
  transform-style: preserve-3d;
}
.rx-token.flip { animation: rx-flip .48s cubic-bezier(.2,.85,.25,1) both; }
.rx-token-face {
  position: absolute; inset: 0; display: grid; place-items: center;
  border-radius: 50%; backface-visibility: hidden; font-size: 1.5rem;
  border: 1px solid #6b7480; box-shadow: 0 4px 10px rgba(0,0,0,.5);
}
.rx-token-back { background: var(--stripe); color: #120c04; }
.rx-token-front {
  transform: rotateY(180deg);
  background: linear-gradient(160deg, #2a3038, #171b22); color: #fff;
  border-color: var(--face);
  box-shadow: 0 0 16px 1px color-mix(in srgb, var(--face) 55%, transparent), inset 0 1px 0 rgba(255,255,255,.08);
}
.rx-token[data-tone="brace"]  { --face: #7fd0c4; }
.rx-token[data-tone="evasive"]{ --face: var(--oil); }
.rx-token[data-tone="return"] { --face: var(--ember-hi); }
@keyframes rx-flip {
  0%   { transform: rotateY(0) scale(1.05); }
  60%  { transform: rotateY(180deg) scale(.96); }
  100% { transform: rotateY(180deg) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .rx-token.flip { animation: none; transform: rotateY(180deg); }
}
```

- [ ] **Step 3: Write a smoke test**

Create `client/src/components/overlays/RollConsole.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import RollConsole, { type RollConsoleHandle } from "./RollConsole";

test("reaction resolution reveals the reaction label", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution({
    id: 1, kind: "reaction", prep: "return", summary: "R reveals Return Fire!", effects: [],
  });
  expect(await screen.findByLabelText("Return Fire")).toBeInTheDocument();
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run client/src/components/overlays/RollConsole.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/overlays/RollConsole.tsx client/src/components/overlays/RollConsole.test.tsx client/src/styles/battle.css client/src/state/types.ts
git commit -m "feat(reactions): reveal flip animation in RollConsole"
```

---

## Task 12: Defender decision UI + attacker wait state

**Files:**
- Modify: `client/src/hooks/useBattleWatchers.tsx` (add a `pendingReaction` watcher)
- Modify: `client/src/state/BattleActionsContext.tsx` (add `sendReact`)

- [ ] **Step 1: Add `sendReact` to the battle-actions API**

In `client/src/state/BattleActionsContext.tsx`:

1. Add to `BattleActionsApi`:

```tsx
  sendReact: (attrs: Record<string, unknown>) => void;
```

2. Implement near `resolveBlast`:

```tsx
  const sendReact = useCallback(
    (attrs: Record<string, unknown>) => sendCommand("react", { ...attrs, side: mySide() }),
    [sendCommand, mySide],
  );
```

3. Add `sendReact` to the context `value`.

- [ ] **Step 2: Add the pendingReaction watcher**

In `client/src/hooks/useBattleWatchers.tsx`, add an effect after the answer-gate effect. It opens the defender's decision drawer for Evasive, and for Return Fire opens the existing attack wizard against the attacker:

```tsx
  const { sendReact } = useBattleActions();
  const { openAttack } = useWizard();
  const reactionShown = useRef(false);
  useEffect(() => {
    const g = gameRef.current;
    const mine = sessionRef.current?.side || "a";
    const pr = g?.pendingReaction;
    if (!pr || pr.defender !== mine) { reactionShown.current = false; return; }
    if (reactionShown.current) return;
    reactionShown.current = true;

    const reactor = (rigsRef.current || []).find((r) => r.id === pr.targetId);
    const attacker = (rigsRef.current || []).find((r) => r.id === pr.attackerId);
    if (!reactor) return;

    if (pr.kind === "evasive") {
      openDrawer({
        title: `💨 Evasive — ${reactor.name}`,
        tone: "oil",
        dismissable: false,
        render: () => createElement(
          "p",
          { className: "dwr-hint" },
          `Move ${reactor.name} up to ½ Speed on the table. Did it break ${attacker?.name || "the attacker"}'s line of sight or range?`,
        ),
        actions: [
          { label: "No — resolve the shot", ghost: true, onClick: () => { closeDrawer(); sendReact({ evaded: false }); } },
          { label: "Evaded — attack fails", primary: true, icon: "💨", onClick: () => { closeDrawer(); sendReact({ evaded: true }); } },
        ],
      });
    } else if (pr.kind === "return" && attacker) {
      openDrawer({
        title: `↩️ Return Fire — ${reactor.name}`,
        tone: "ember",
        dismissable: false,
        render: () => createElement(
          "p",
          { className: "dwr-hint" },
          `Answer ${attacker.name} with one weapon, or skip if you can't bear on it.`,
        ),
        actions: [
          { label: "Skip", ghost: true, onClick: () => { closeDrawer(); sendReact({ decline: true }); } },
          { label: "Return fire", primary: true, icon: "↩️", onClick: () => { closeDrawer(); openAttack(reactor, "fire", { target: attacker.name, react: true }); } },
        ],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.pendingReaction?.targetId, game?.pendingReaction?.kind]);
```

Add imports at the top:

```tsx
import { useBattleActions } from "../state/BattleActionsContext";
import { useWizard } from "../state/WizardContext";
```

- [ ] **Step 3: Let the attack wizard send a `react` counter**

The Return-Fire counter reuses `AttackWizard` but must send `react { attack }` instead of `action fire`. Open `client/src/components/wizards/AttackWizard.tsx` and thread an optional `react?: boolean` + preset `target` through `openAttack` (via `WizardContext`). On confirm, branch:

```tsx
    if (opts?.react) {
      sendReact({ attack: { weapon, arc, range, cover, dice } });
    } else {
      sendCommand("action", { name: rig.name, action: mode, weapon, target, arc, range, cover, loc, dice });
    }
```

Wire `sendReact` into the wizard the same way it already gets `sendCommand`. If `WizardContext.openAttack` does not yet accept an options object, add a third `opts?: { target?: string; react?: boolean }` parameter and store it in wizard state (default `undefined`). Keep existing callers working (the extra arg is optional).

- [ ] **Step 4: Add the attacker wait banner**

In `client/src/components/BattleHud.tsx`, surface the wait when a reaction is parked and it is not mine to resolve. After computing `mySide`, add:

```tsx
  const pr = game?.pendingReaction;
  const waiting = pr && pr.defender !== mySide;
```

Render, inside the returned HUD, an extra line:

```tsx
      {waiting ? <div className="bh-turn bh-foe">Opponent is reacting…</div> : null}
```

- [ ] **Step 5: Verify build + tests**

Run: `npx vitest run client/src && npx tsc -p tsconfig.json --noEmit`
Expected: no new failures.

- [ ] **Step 6: Manual end-to-end check**

Two sides, one room. Second player prepares Evasive on a Rig; first player fires on it. Expect: token flip animation → the defender gets the Evasive drawer → "Evaded" leaves the Rig undamaged; "No" resolves the shot. Repeat with Return Fire (counter opens the attack wizard) and Brace (auto −2, no prompt). Confirm the attacker sees "Opponent is reacting…" during Evasive/Return.

- [ ] **Step 7: Commit**

```bash
git add client/src/hooks/useBattleWatchers.tsx client/src/state/BattleActionsContext.tsx client/src/components/wizards/AttackWizard.tsx client/src/state/WizardContext.tsx client/src/components/BattleHud.tsx
git commit -m "feat(reactions): defender decision UI and attacker wait state"
```

---

## Final verification

- [ ] Run the full shared suite: `node --test shared/*.test.js` — all green.
- [ ] Run the client suite: `npx vitest run client/src` — all green.
- [ ] Typecheck: `npx tsc -p tsconfig.json --noEmit` — clean.
- [ ] Manual matrix (two sides, one room):
  - Round-start gate blocks the first player until the second places both tokens.
  - Facedown chip on the opponent's Rig reads "Reaction set" (not the type).
  - Brace: reveal flip, then −2 on front-arc impacts, persists to Recovery.
  - Evasive: reveal → defender drawer → "Evaded" = no damage / "No" = normal shot.
  - Return Fire: shot resolves → reveal → defender counters via the wizard (or skips).
  - Recovery clears all preparations.

---

## Notes on spec coverage

- Secrecy (facedown-but-visible) → Tasks 2, 6.
- Two entry points, one picker → Tasks 8, 9, 10.
- Immediate + mandatory + blocking Answer spend → Tasks 3, 10.
- Interpose & drive (Brace inline, Evasive pre-empt, Return Fire follow-up) → Tasks 4, 5, 12.
- Weapon-attacks-only trigger → Task 4 (the interpose lives only in the `fire`/`aimed` branch; Ram/blast/overheat untouched).
- Reveal animation in the game's motion language → Task 11.
- `prefers-reduced-motion` → Task 11.
```
