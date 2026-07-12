# Answer-Token Counters & Prep Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Answer tokens into a signature second-player mechanic — three Answer-exclusive counters (Riposte / Sidestep the Shooter / Exploit Opening) plus real agency on Return Fire (free pivot-to-face) and Brace (immovable + retaliate).

**Architecture:** The engine is a headless rules core in `shared/` (`game-state.js` drives turns/preps; `combat.js` resolves attacks). The board has **no coordinates** — arcs and movement are player-supplied per attack and spatial effects are narrated as log instructions, not simulated. So "pivot to face" is a rules/reveal-copy change, "immovable" means *suppressing* combat's knockback instructions, and "move ½ Speed" stays a player-judged `evaded` boolean. New preps are new `preparation.type` values plus branches in the existing facedown-reveal / `react`-verb machinery. The V2 React client (`client/src/v2/`) surfaces them.

**Tech Stack:** Vanilla ES modules (`shared/`), Node built-in test runner (`node --test`) for engine, React + Vitest for the client.

**Test commands:**
- One engine file: `node --test shared/game-state.test.js` (or `shared/combat.test.js`)
- Filter by name: `node --test --test-name-pattern="Riposte" shared/game-state.test.js`
- One client file: `npx vitest run client/src/v2/overlays/ReactionPicker.test.tsx`
- Everything: `npm test`

**Design constants (decided in the spec):**
- `BRACE_RIPOSTE_STR = 6` (flat, ⚙ TUNING — mirrors Anvil Boss).
- Exploit "overcommitted" = attacker spends its **final** action on this shot (`t.actionsUsed + 1 >= t.actionsMax`) **or** attacker heat ≥ its Heat Capacity.
- Immovable v1 negates the pure knockback/stagger riders (Momentum Swing, Piledriver, Staggering). Tow Chain / Harpoon Winch (fling/reel with their own heat+root economy) are **out of scope** — documented, not silently skipped.

---

## File Structure

**Engine (`shared/`)**
- `game-state.js` — new prep constants + `normalizeAnswerPrep`; `prepName`/`prepEffectLine` entries; `maybeBraceRetaliate` + `braceRetaliatedThisRound` lifecycle; the facedown-trigger predicate + restructure; `answer`/`react` verb branches.
- `combat.js` — aim-penalty waiver (`waiveAimPenalty`); brace immovability guards on knockback instructions.
- `game-state.test.js`, `combat.test.js` — mirrored tests.
- `battle-view.js` (+ `.test.js`) — `prepLabel`/gloss entries for the new types.
- `glossary.js` (+ `.test.js`) — three new glossary entries.

**Client (`client/src/`)**
- `state/types.ts` — extend `PrepType`.
- `v2/overlays/ReactionPicker.tsx` (+ new `.test.tsx`) — `answerMode` prop showing the three counters.
- `v2/hooks/useV2BattleWatchers.tsx` — pass `answerMode` in the Answer gate.
- `lib/glossaryTerms.ts` (+ `.test.ts`) — mirror glossary entries.

**Docs**
- `rules.md` §5 — Return Fire pivot, Brace rewrite, Answer-counters subsection.

---

## Task 1: Answer-exclusive prep vocabulary (normalizer split + names)

Adds the three counter type-strings to the Answer path only. The Prepare action keeps using `normalizePrep` (generic three + shield), so counters are Answer-exclusive by construction.

**Files:**
- Modify: `shared/game-state.js` (near `PREP_TYPES` line 320; `normalizePrep` line 332; `prepName`/`prepEffectLine` lines 1096–1107; `answer` verb line 2702)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
import {
  // ...existing imports...
  normalizeAnswerPrep, ANSWER_COUNTERS,
} from "./game-state.js";

test("normalizeAnswerPrep accepts the three Answer counters; normalizePrep rejects them", () => {
  const rig = makeRig(1, "R", "medium", "a", { longRange: "Mini Gun", melee: "Sword" });
  for (const t of ["riposte", "sidestep", "exploit"]) {
    assert.equal(normalizeAnswerPrep(t, rig), t);   // Answer path keeps it
    assert.equal(normalizePrep(t, rig), "brace");   // Prepare path falls back
  }
  // Generic three and shield still work on both where valid.
  assert.equal(normalizeAnswerPrep("evasive", rig), "evasive");
  assert.deepEqual(ANSWER_COUNTERS, ["riposte", "sidestep", "exploit"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="normalizeAnswerPrep" shared/game-state.test.js`
Expected: FAIL — `normalizeAnswerPrep`/`ANSWER_COUNTERS` are not exported (import is `undefined`).

- [ ] **Step 3: Add the constants and normalizer**

In `shared/game-state.js`, replace the `PREP_TYPES` block (line ~320) with:

```js
// The three §5 preparation reactions available to the Prepare action. Unknown/
// missing input falls back to brace.
export const PREP_TYPES = ["brace", "evasive", "return"];

// Answer-exclusive counters (§5) — placeable ONLY by spending an Answer token,
// never by the Prepare action. Each reads what the enemy just did.
export const ANSWER_COUNTERS = ["riposte", "sidestep", "exploit"];
```

Then, just after `normalizePrep` (line ~336), add:

```js
// The Answer-token path may place any generic prep, the shield (if carried), OR
// one of the Answer-exclusive counters. Unknown input falls back to brace.
export function normalizeAnswerPrep(type, rig) {
  const ref = String(type || "").trim().toLowerCase();
  if (ANSWER_COUNTERS.includes(ref)) return ref;
  return normalizePrep(type, rig);
}
```

- [ ] **Step 4: Wire the `answer` verb to the new normalizer**

In `shared/game-state.js`, `answer` verb (line ~2702), change:

```js
      rig.preparation = { type: normalizePrep(a.prep, rig), source: "answer", faceUp: false };
```

to:

```js
      rig.preparation = { type: normalizeAnswerPrep(a.prep, rig), source: "answer", faceUp: false };
```

- [ ] **Step 5: Add display names + effect lines (incl. Return Fire pivot copy)**

In `shared/game-state.js`, replace `prepName` (line ~1096) and `prepEffectLine` (line ~1102) with:

```js
function prepName(type) {
  if (type === "evasive") return "Evasive Manoeuvre";
  if (type === "return") return "Return Fire";
  if (type === "raise-shield") return "Raise Shield";
  if (type === "riposte") return "Riposte";
  if (type === "sidestep") return "Sidestep the Shooter";
  if (type === "exploit") return "Exploit Opening";
  return "Brace for Incoming Fire";
}
function prepEffectLine(type) {
  if (type === "evasive") return "Defender may move ½ Speed — the attack can miss entirely.";
  if (type === "return") return "Defender pivots to face the attacker, then answers with a counter-attack.";
  if (type === "raise-shield") return "Front-arc attack negated; side/rear impacts suffer −4.";
  if (type === "riposte") return "Defender answers the melee attacker with a free melee counter.";
  if (type === "sidestep") return "Defender slips ½ Speed and may engage the shooter.";
  if (type === "exploit") return "Defender pivots and lands a free Aimed counter-shot (no aim penalty).";
  return "Front-arc impacts suffer −2 — and the braced Rig is immovable and counters melee that fails to breach.";
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS (all, including the new test).

- [ ] **Step 7: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(preps): Answer-exclusive counter vocabulary + reveal copy"
```

---

## Task 2: Exploit's aim-penalty waiver (combat.js)

Exploit's counter is an Aimed Shot with the −2 aim penalty waived. Thread a `waiveAimPenalty` opt through `computeModifiedAim`.

**Files:**
- Modify: `shared/combat.js:44`
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/combat.test.js`:

```js
test("computeModifiedAim waives the aim penalty when waiveAimPenalty is set", () => {
  const autocannon = WEAPONS.longRange["Autocannon"]; // no Precision
  // Baseline: aimed shot eats the -2 → target number 5.
  assert.equal(computeModifiedAim(attacker, autocannon, { distance: 12, aimed: true }), 5);
  // Waived: no -2 → 4 - 1 = 3.
  assert.equal(computeModifiedAim(attacker, autocannon, { distance: 12, aimed: true, waiveAimPenalty: true }), 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="waives the aim penalty" shared/combat.test.js`
Expected: FAIL — returns 5, expected 3 (opt ignored).

- [ ] **Step 3: Honor the waiver**

In `shared/combat.js` line 44, change:

```js
  const aimedPenalty = opts.aimed && !hasPerk(profile, "Precision") ? -2 : 0;
```

to:

```js
  const aimedPenalty = opts.aimed && !hasPerk(profile, "Precision") && !opts.waiveAimPenalty ? -2 : 0;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(combat): waiveAimPenalty opt for Exploit counter aimed shots"
```

---

## Task 3: Brace makes the Rig immovable (combat.js)

While braced, the two pure knockback instructions (Momentum Swing, Piledriver) and the Staggering displacement are suppressed and narrated as no-ops.

**Files:**
- Modify: `shared/combat.js` (`resolveAttack` ~483–496; `applyOnHitPerks` Staggering ~555–559)
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/combat.test.js`:

```js
test("Brace immovability suppresses the Momentum Swing knockback", () => {
  const ball = makeRig(1, "WB", "medium", "a", { longRange: "Mini Gun", melee: "Wrecking Ball", meleeUpgrade: "momentum-swing" });
  ball.movedThisActivation = true; // charge is live
  const wall = makeRig(2, "Wall", "medium", "b", { longRange: "Autocannon", melee: "Sword" });
  wall.preparation = { type: "brace" };
  const room = { rigs: [ball, wall], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, ball, wall,
    { weapon: "melee", target: wall.name, arc: "front", range: "near",
      dice: { toHit: [6], location: 1, impacts: [5] } }, () => 0, ctx);
  assert.ok(!ctx.resolutions.some((r) => /knock .* back 3"/.test(r.summary)),
    "a braced target must not receive a knockback instruction");
  assert.ok(ctx.resolutions.some((r) => /braced \(immovable\)/.test(r.summary)),
    "expected an immovable no-op note");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="Brace immovability" shared/combat.test.js`
Expected: FAIL — knockback instruction still emitted, no immovable note.

- [ ] **Step 3: Guard the knockback instructions**

In `shared/combat.js` `resolveAttack`, just after the `pushInstruction` definition (line ~485) add:

```js
  // §5 Brace — a braced Rig is IMMOVABLE: pure knockback/stagger riders are
  // narrated as no-ops. (Tow Chain / Harpoon fling+reel, which carry their own
  // heat/root economy, are intentionally out of scope for v1.)
  const targetImmovable = target.preparation?.type === "brace";
```

Replace the Momentum Swing block (line ~489):

```js
  if (profile.upgrade?.id === "momentum-swing" && attacker.movedThisActivation && landedDamage) {
    pushInstruction(targetImmovable
      ? `Momentum Swing — ${target.name} is braced (immovable): no knockback.`
      : `Momentum Swing — knock ${target.name} back 3" (move the mini).`);
  }
```

Replace the Piledriver block (line ~494):

```js
  if (piledriverSpend > 0 && landedDamage) {
    pushInstruction(targetImmovable
      ? `Piledriver — ${target.name} is braced (immovable): no shove.`
      : `Piledriver — shove ${target.name} back 3" (move the mini).`);
  }
```

- [ ] **Step 4: Guard Staggering displacement**

In `shared/combat.js` `applyOnHitPerks`, replace the Staggering block (line ~555):

```js
  if (perks.includes("Staggering")) {
    if (target.preparation?.type === "brace") {
      effects.push("Staggering — braced (immovable): no displacement");
    } else {
      const roll = rollD(6, opts.dice?.stagger, random);
      const note = roll <= 2 ? "pivot left" : roll <= 4 ? 'pushed 3"' : "pivot right";
      effects.push(`Staggering ${roll} — ${note} (positional)`);
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(combat): braced Rigs are immovable to knockback/stagger riders"
```

---

## Task 4: Brace retaliation helper (game-state.js)

A melee attacker that hits a braced **front** and deals **no SP** eats a free flat-STR melee counter, once per round.

**Files:**
- Modify: `shared/game-state.js` (add `maybeBraceRetaliate` near `maybeAnvilRiposte` line ~1844; recovery reset line ~1636; shape defaults `makeRig`/`ensureRigShape`)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
test("__test.maybeBraceRetaliate counters a withstood front melee once per round", () => {
  const attacker = makeRig(1, "Atk", "medium", "a", { longRange: "Mini Gun", melee: "Sword" });
  const braced = makeRig(2, "Def", "medium", "b", { longRange: "Autocannon", melee: "Sword" });
  braced.preparation = { type: "brace", faceUp: true };
  const room = { rigs: [attacker, braced], game: { round: 1, resolutions: [], nextResolutionId: 1 } };

  // Blow failed to breach (no SP dealt): retaliation fires.
  const failed = { hits: 1, impacts: [{ sp: 0 }] };
  assert.equal(__test.maybeBraceRetaliate(room, attacker, braced, "melee", "front", failed, () => 0), true);
  assert.equal(braced.braceRetaliatedThisRound, true);
  // Already retaliated this round → no second counter.
  assert.equal(__test.maybeBraceRetaliate(room, attacker, braced, "melee", "front", failed, () => 0), false);

  // A blow that dealt SP does NOT provoke (fresh braced rig).
  const dealt = { hits: 1, impacts: [{ sp: 3 }] };
  const braced2 = makeRig(3, "Def2", "medium", "b", { longRange: "Autocannon", melee: "Sword" });
  braced2.preparation = { type: "brace", faceUp: true };
  room.rigs.push(braced2);
  assert.equal(__test.maybeBraceRetaliate(room, attacker, braced2, "melee", "front", dealt, () => 0), false);

  // A side-arc blow does NOT provoke (front only).
  const braced3 = makeRig(4, "Def3", "medium", "b", { longRange: "Autocannon", melee: "Sword" });
  braced3.preparation = { type: "brace", faceUp: true };
  room.rigs.push(braced3);
  assert.equal(__test.maybeBraceRetaliate(room, attacker, braced3, "melee", "side", failed, () => 0), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="maybeBraceRetaliate" shared/game-state.test.js`
Expected: FAIL — `__test.maybeBraceRetaliate` is undefined.

- [ ] **Step 3: Add the helper**

In `shared/game-state.js`, immediately after `maybeAnvilRiposte` (ends line ~1844), add:

```js
// §5 Brace retaliation — a melee attacker that swings at a braced FRONT and
// fails to breach it (deals no SP) eats a free flat-STR melee counter. Once per
// round (braceRetaliatedThisRound). Needs a melee weapon to answer with. Reuses
// the same resolveAttack/strOverride path as Anvil Boss and `return`.
const BRACE_RIPOSTE_STR = 6; // ⚙ TUNING
function maybeBraceRetaliate(room, attacker, defender, incomingWeapon, incomingArc, res, random) {
  if (incomingWeapon !== "melee") return false;
  if (incomingArc !== "front") return false;
  if (!defender || defender.destroyed) return false;
  if (defender.preparation?.type !== "brace") return false;
  if (defender.braceRetaliatedThisRound) return false;
  if (!defender.weapons?.melee) return false;                    // needs a melee weapon
  if (!attacker || attacker.destroyed) return false;
  if ((attacker.owner || "a") === (defender.owner || "a")) return false; // enemy only
  const dealtSp = res && Array.isArray(res.impacts) && res.impacts.some((h) => h.sp > 0);
  if (dealtSp) return false;                                     // only a WITHSTOOD blow
  defender.braceRetaliatedThisRound = true;
  pushResolution(room, {
    kind: "riposte", actor: defender.owner, rigId: defender.id, rolls: [],
    summary: `${defender.name} holds the brace and counters ${attacker.name} — free STR ${BRACE_RIPOSTE_STR} melee.`,
    effects: [`Brace — free STR ${BRACE_RIPOSTE_STR} melee counter (attack failed to breach)`],
  });
  resolveAttack(room, defender, attacker, {
    weapon: "melee", target: attacker.name,
    arc: "front", range: "near", aimed: false, aimedLoc: "hull",
    engaged: defender.engagedWith != null, strOverride: BRACE_RIPOSTE_STR,
  }, random, combatCtx());
  return true;
}
```

- [ ] **Step 4: Reset the flag each round + default it on new rigs**

In `runRecovery` (line ~1636), directly after `rig.ripostedThisRound = false;` add:

```js
    rig.braceRetaliatedThisRound = false; // §5 Brace retaliation re-arms each round
```

Then export it for tests: in the `__test` object (line ~2888) add `maybeBraceRetaliate` to the list:

```js
export const __test = { applyDamage, applyOverheat, breachHull, tickBreach, repairRig, setRigSp, ensureRigShape, setEngagement, clearEngagement, maybeEngage, maybeBraceRetaliate, runRecovery, crackLocation, dismemberLocation, rivetHit, rerollPriorityTargets, advanceRound };
```

(`braceRetaliatedThisRound` needs no explicit init — it reads falsy until set, and `runRecovery` normalizes it each round. No shape change required.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(preps): Brace retaliates against a withstood front melee"
```

---

## Task 5: Facedown trigger predicate + reveal restructure (game-state.js)

Route the three counters through the existing facedown-reveal path: a counter reveals only when its trigger fires; otherwise the token stays down and the attack resolves normally. Also wires Brace retaliation into the reveal path.

**Files:**
- Modify: `shared/game-state.js` `performAction` fire/aimed block (lines ~2020–2056)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

This test drives a full mini-battle. Add a helper at the top of `shared/game-state.test.js` (after the `W` constant) if not already present, then the test:

```js
// Drive a 2-rig battle to the point where side A's rig is mid-activation and can
// Fire at side B's prepared rig. Returns { room, a, b }.
function battleWithPreparedDefender(defenderPrep) {
  const room = createRoom("PREP01");
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "add", name: "Atk", weightClass: "medium", attrs: { longRange: "Mini Gun", melee: "Sword" }, side: "a" });
  applyCommand(room, { verb: "add", name: "Def", weightClass: "medium", attrs: { longRange: "Autocannon", melee: "Sword" }, side: "b" });
  const a = findRig(room, "Atk");
  const b = findRig(room, "Def");
  b.preparation = { type: defenderPrep, source: "answer", faceUp: false };
  // Force the turn state: A active, mid-activation, plenty of actions left.
  room.game.phase = "activation";
  room.game.turn = { side: "a", activeRigId: a.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  a.loaded = { longRange: true, melee: true };
  return { room, a, b };
}

test("Riposte reveals only on a melee attack, arming a melee counter", () => {
  // A RANGED attack must NOT trigger Riposte — token stays down, no pendingReaction.
  {
    const { room, a, b } = battleWithPreparedDefender("riposte");
    applyCommand(room, { verb: "action", name: "Atk", action: "fire",
      target: "Def", weapon: "longRange", arc: "front", range: "near",
      dice: { toHit: [1], location: 1, impacts: [1] } });
    assert.equal(b.preparation.faceUp, false, "ranged attack leaves Riposte facedown");
    assert.equal(room.game.pendingReaction, null);
  }
  // A MELEE attack reveals Riposte and arms a melee counter.
  {
    const { room, a, b } = battleWithPreparedDefender("riposte");
    applyCommand(room, { verb: "action", name: "Atk", action: "fire",
      target: "Def", weapon: "melee", arc: "front", range: "near",
      dice: { toHit: [6], location: 1, impacts: [3] } });
    assert.equal(b.preparation.faceUp, true, "melee attack reveals Riposte");
    assert.equal(room.game.pendingReaction?.kind, "riposte");
    assert.equal(room.game.pendingReaction.targetId, b.id);
  }
});

test("Exploit reveals only when the attacker is overcommitted", () => {
  // Cautious attacker (actions to spare, cool) → no trigger.
  {
    const { room, b } = battleWithPreparedDefender("exploit");
    applyCommand(room, { verb: "action", name: "Atk", action: "fire",
      target: "Def", weapon: "longRange", arc: "front", range: "near",
      dice: { toHit: [1], location: 1, impacts: [1] } });
    assert.equal(b.preparation.faceUp, false);
    assert.equal(room.game.pendingReaction, null);
  }
  // Final-action attacker → overcommitted → Exploit arms a counter.
  {
    const { room, b } = battleWithPreparedDefender("exploit");
    room.game.turn.actionsUsed = 2; // this shot is action 3 of 3
    applyCommand(room, { verb: "action", name: "Atk", action: "fire",
      target: "Def", weapon: "longRange", arc: "front", range: "near",
      dice: { toHit: [1], location: 1, impacts: [1] } });
    assert.equal(b.preparation.faceUp, true);
    assert.equal(room.game.pendingReaction?.kind, "exploit");
  }
});

test("Sidestep defers a ranged attack but ignores melee", () => {
  // Ranged → deferred like evasive.
  {
    const { room, b } = battleWithPreparedDefender("sidestep");
    applyCommand(room, { verb: "action", name: "Atk", action: "fire",
      target: "Def", weapon: "longRange", arc: "front", range: "near",
      dice: { toHit: [4], location: 1, impacts: [3] } });
    assert.equal(b.preparation.faceUp, true);
    assert.equal(room.game.pendingReaction?.kind, "sidestep");
  }
  // Melee → no trigger, token stays down.
  {
    const { room, b } = battleWithPreparedDefender("sidestep");
    applyCommand(room, { verb: "action", name: "Atk", action: "fire",
      target: "Def", weapon: "melee", arc: "front", range: "near",
      dice: { toHit: [6], location: 1, impacts: [3] } });
    assert.equal(b.preparation.faceUp, false);
    assert.equal(room.game.pendingReaction, null);
  }
});
```

> **Note on `applyCommand` shape:** the tests above pass the action fields flat inside the command object. If the local `applyCommand` signature differs (e.g. `applyCommand(room, verb, attrs, ctx)`), match the pattern already used by the existing fire/attack tests in this file — search for `action: "fire"` and copy that call shape exactly. Keep the `dice` overrides so rolls are deterministic.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="Riposte reveals|Exploit reveals|Sidestep defers" shared/game-state.test.js`
Expected: FAIL — counters currently fall through `normalizePrep`/reveal as `brace`-like or don't arm reactions.

- [ ] **Step 3: Add the trigger predicate**

In `shared/game-state.js`, just above `performAction` (line ~1926), add:

```js
// §5 — does a facedown preparation FIRE against this incoming attack? The three
// generic preps trigger on any attack; the Answer counters are conditional:
//  • riposte  — melee attacks only
//  • sidestep — ranged attacks only
//  • exploit  — attacker is overcommitted: this shot spends its final action, or
//               its heat is at/over its Heat Capacity.
// A non-triggering counter stays facedown and the attack resolves normally.
function prepTriggeredBy(prep, weapon, attacker, t) {
  const melee = weapon === "melee";
  switch (prep.type) {
    case "riposte":  return melee;
    case "sidestep": return !melee;
    case "exploit": {
      const cap = HEAT_CAPACITY[attacker.weightClass];
      const overheated = cap != null && (attacker.engine?.heat || 0) >= cap;
      const finalAction = (t.actionsUsed + 1) >= t.actionsMax;
      return overheated || finalAction;
    }
    default: return true; // brace / evasive / return
  }
}
```

- [ ] **Step 4: Restructure the facedown block**

In `shared/game-state.js` `performAction`, replace the whole facedown block (lines ~2020–2057, from `const facedown = ...` through the `return true;` that closes `if (facedown) {`) with:

```js
    const facedown = target.preparation && target.preparation.faceUp === false;
    if (facedown && prepTriggeredBy(target.preparation, a.weapon, rig, t)) {
      const prep = target.preparation;
      // Affordability pre-check so an unaffordable (or unloaded) shot never
      // reveals the token: a spent ranged weapon must be reloaded first.
      const slot = a.weapon === "melee" ? "melee" : "longRange";
      if (slot === "longRange" && rig.loaded.longRange === false) return false;
      const cost = 1;
      if (t.actionsUsed + cost > t.actionsMax) return false;

      // Pre-resolution dodges — Evasive and Sidestep — defer the WHOLE attack to
      // the `react` verb (the defender declares whether it broke LoS/range).
      if (prep.type === "evasive" || prep.type === "sidestep") {
        prep.faceUp = true;
        pushResolution(room, reactionRevealEntry(target, prep.type));
        room.game.pendingReaction = {
          kind: prep.type, attackerId: rig.id, targetId: target.id, defender: target.owner,
          attack: { ...a, act },
        };
        return true; // whole attack deferred to the `react` verb
      }

      const res = resolveFire(room, rig, target, a, act, random);
      if (!res) return false;
      prep.faceUp = true;
      pushResolution(room, reactionRevealEntry(target, prep.type));
      // Post-resolution counters: Return Fire, Riposte, Exploit each arm a
      // pending counter-attack keyed to their type.
      if ((prep.type === "return" || prep.type === "riposte" || prep.type === "exploit") && !target.destroyed) {
        room.game.pendingReaction = {
          kind: prep.type, attackerId: rig.id, targetId: target.id, defender: target.owner,
        };
      }
      // Brace answers a withstood front melee.
      if (prep.type === "brace") maybeBraceRetaliate(room, rig, target, a.weapon, a.arc, res, random);
      // Anvil Boss — a raised shield answers the first melee attacker to land a hit.
      maybeAnvilRiposte(room, rig, target, a.weapon, res.hits, random);
      // Skewer — a damaging Lance blow impales the target it just locked.
      maybeSkewer(room, rig, target, a.weapon, res);
      // Dead Weight — a damaging Anchor blow pins the target's next Disengage.
      maybeDeadWeight(room, rig, target, a.weapon, res);
      // Ground Anchor — a damaging Anchor blow drives the anchor into the target it just locked.
      maybeGroundAnchor(room, rig, target, a.weapon, res);
      return true;
    }
```

Everything below (the non-facedown `const res = resolveFire(...)` path) is unchanged — a facedown-but-untriggered counter now falls through to it, resolving the attack without revealing the token.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS (new + existing evasive/return/brace tests still green).

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(preps): conditional facedown triggers for Answer counters"
```

---

## Task 6: `react` verb — resolve the three counters (game-state.js)

Handle the `pendingReaction` kinds `sidestep`, `riposte`, and `exploit`.

**Files:**
- Modify: `shared/game-state.js` `react` verb (lines ~2712–2760)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js` (reuses `battleWithPreparedDefender` from Task 5):

```js
test("react resolves a Riposte as a free melee counter and clears the prep", () => {
  const { room, a, b } = battleWithPreparedDefender("riposte");
  applyCommand(room, { verb: "action", name: "Atk", action: "fire",
    target: "Def", weapon: "melee", arc: "front", range: "near",
    dice: { toHit: [6], location: 1, impacts: [3] } });
  assert.equal(room.game.pendingReaction?.kind, "riposte");
  const before = a.hull.sp;
  applyCommand(room, { verb: "react", side: "b",
    attack: { weapon: "melee", arc: "front", range: "near", dice: { toHit: [6], location: 1, impacts: [4] } } });
  assert.equal(room.game.pendingReaction, null);
  assert.equal(b.preparation, null, "prep is consumed");
  assert.ok(a.hull.sp <= before, "the melee counter struck the attacker");
});

test("react resolves an Exploit counter as an aimed shot with no aim penalty", () => {
  const { room, a, b } = battleWithPreparedDefender("exploit");
  room.game.turn.actionsUsed = 2; // final-action attacker → triggers Exploit
  applyCommand(room, { verb: "action", name: "Atk", action: "fire",
    target: "Def", weapon: "longRange", arc: "front", range: "near",
    dice: { toHit: [1], location: 1, impacts: [1] } });
  assert.equal(room.game.pendingReaction?.kind, "exploit");
  applyCommand(room, { verb: "react", side: "b",
    attack: { weapon: "longRange", arc: "front", range: "near", loc: "arms",
      dice: { toHit: [4], location: 1, impacts: [5] } } });
  assert.equal(room.game.pendingReaction, null);
  assert.equal(b.preparation, null);
});

test("react resolves a Sidestep: evaded fails the shot and may engage the shooter", () => {
  const { room, a, b } = battleWithPreparedDefender("sidestep");
  applyCommand(room, { verb: "action", name: "Atk", action: "fire",
    target: "Def", weapon: "longRange", arc: "front", range: "near",
    dice: { toHit: [4], location: 1, impacts: [3] } });
  assert.equal(room.game.pendingReaction?.kind, "sidestep");
  applyCommand(room, { verb: "react", side: "b", evaded: true, engage: true });
  assert.equal(room.game.pendingReaction, null);
  assert.equal(b.preparation, null);
  assert.equal(b.engagedWith, a.id, "reaching the shooter locks it down");
  assert.equal(a.engagedWith, b.id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="react resolves a Riposte|react resolves an Exploit|react resolves a Sidestep" shared/game-state.test.js`
Expected: FAIL — `react` has no branch for these kinds, so `pendingReaction` never clears.

- [ ] **Step 3: Add the three react branches**

In `shared/game-state.js` `react` verb, immediately after the `else if (pr.kind === "return" && reactor && attacker) { ... }` block (ends line ~2759), add:

```js
      } else if (pr.kind === "sidestep" && reactor && attacker) {
        // Anti-ranged dodge: like evasive, plus an optional free engage when the
        // ½-Speed slip reaches the shooter (player asserts the reach).
        const evaded = a.evaded === true || a.evaded === "true";
        if (evaded) {
          const slot = pr.attack.weapon === "melee" ? "melee" : "longRange";
          const rt = room.game.turn;
          const secondShot = slot === "longRange" && (rt.longRangeShots || 0) >= 1;
          if (slot === "longRange") attacker.loaded.longRange = false;
          const profile = effectiveWeaponProfile(slot, attacker.weapons?.[slot], attacker);
          const hot = profile?.perks?.includes("Hot") ? 1 : 0;
          bumpHeat(attacker, (ACTIONS[pr.attack.act]?.heat || 1) + hot + (secondShot ? 1 : 0));
          rt.actionsUsed += 1;
          if (slot === "longRange") rt.longRangeShots = (rt.longRangeShots || 0) + 1;
          pushResolution(room, {
            kind: "attack", actor: attacker.owner, rigId: reactor.id, rolls: [],
            summary: `${reactor.name} sidesteps — ${attacker.name}'s shot fails.`, effects: [],
          });
        } else {
          resolveFire(room, attacker, reactor, pr.attack, pr.attack.act, options.random);
        }
        if ((a.engage === true || a.engage === "true") && maybeEngage(room, reactor, attacker)) {
          pushResolution(room, {
            kind: "engage", actor: reactor.owner, rigId: reactor.id, rolls: [],
            summary: `${reactor.name} closes and engages ${attacker.name}.`, effects: [],
          });
        }
        reactor.preparation = null;
        room.game.pendingReaction = null;
        changed = true;
      } else if (pr.kind === "riposte" && reactor && attacker) {
        // Free melee counter against the melee attacker.
        const declined = a.decline === true || a.decline === "true";
        if (!declined && a.attack && !reactor.destroyed) {
          resolveAttack(room, reactor, attacker, {
            weapon: "melee", target: attacker.name,
            arc: a.attack.arc, range: a.attack.range, distance: a.attack.distance, cover: a.attack.cover,
            engaged: reactor.engagedWith != null,
            aimed: false, aimedLoc: "hull",
            charged: a.attack.charged === true || a.attack.charged === "true",
            dice: a.attack.dice,
          }, options.random, combatCtx());
        }
        reactor.preparation = null;
        room.game.pendingReaction = null;
        changed = true;
      } else if (pr.kind === "exploit" && reactor && attacker) {
        // Pivot-to-face (player-supplied arc) + free AIMED counter-shot with the
        // aim penalty waived.
        const declined = a.decline === true || a.decline === "true";
        if (!declined && a.attack && !reactor.destroyed) {
          resolveAttack(room, reactor, attacker, {
            weapon: a.attack.weapon, target: attacker.name,
            arc: a.attack.arc, range: a.attack.range, distance: a.attack.distance, cover: a.attack.cover,
            engaged: reactor.engagedWith != null,
            aimed: true, aimedLoc: String(a.attack.loc || "hull").toLowerCase(),
            waiveAimPenalty: true,
            charged: a.attack.charged === true || a.attack.charged === "true",
            dice: a.attack.dice,
          }, options.random, combatCtx());
        }
        reactor.preparation = null;
        room.game.pendingReaction = null;
        changed = true;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(preps): react-verb resolution for Riposte/Sidestep/Exploit"
```

---

## Task 7: Battle-view labels for the new preps (battle-view.js)

Expose readable labels + glossary keys for the three counters in the state view.

**Files:**
- Modify: `shared/battle-view.js` (`prepLabel` line ~195; gloss map line ~184)
- Test: `shared/battle-view.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/battle-view.test.js`:

```js
test("prepLabel names the Answer counters", () => {
  // Import via the module's public surface used elsewhere in this file.
  const r = rig({ preparation: { type: "riposte", faceUp: true } });
  const game = { phase: "activation", round: 2, turn: { side: "a", activeRigId: null }, answerTokens: { a: 0, b: 0 } };
  const view = buildRigMods ? buildRigMods(r) : null; // use the same accessor the other tests use
  // If this file tests mods through a higher-level view, assert the tag text instead:
  // e.g. assert.ok(JSON.stringify(view).includes("Riposte ready"));
  assert.ok(true);
});
```

> **Note:** `shared/battle-view.test.js` already exercises `preparation` (see its line ~141 `type: "return"` test). Copy that exact test's accessor/assertion style — assert that a rig with `preparation.type: "riposte"` surfaces the tag `"Riposte ready"`, `"sidestep"` → `"Sidestep ready"`, `"exploit"` → `"Exploit ready"`. Replace the placeholder above with that concrete assertion before running.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="prepLabel names" shared/battle-view.test.js`
Expected: FAIL — the new types fall through to `"Braced"`.

- [ ] **Step 3: Extend `prepLabel` and the gloss map**

In `shared/battle-view.js`, replace `prepLabel` (line ~195):

```js
function prepLabel(type) {
  if (type === "evasive") return "Evasive ready";
  if (type === "return") return "Return fire ready";
  if (type === "riposte") return "Riposte ready";
  if (type === "sidestep") return "Sidestep ready";
  if (type === "exploit") return "Exploit ready";
  return "Braced";
}
```

Replace the gloss line (line ~184):

```js
    const gloss = hidden ? "reaction-set" : (
      p.type === "evasive" ? "evasive" :
      p.type === "return" ? "return-fire" :
      p.type === "riposte" ? "riposte" :
      p.type === "sidestep" ? "sidestep" :
      p.type === "exploit" ? "exploit" : "braced");
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/battle-view.js shared/battle-view.test.js
git commit -m "feat(battle-view): labels + gloss keys for Answer counters"
```

---

## Task 8: Glossary entries (glossary.js + client mirror)

**Files:**
- Modify: `shared/glossary.js`, `shared/glossary.test.js`
- Modify: `client/src/lib/glossaryTerms.ts`, `client/src/lib/glossaryTerms.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `shared/glossary.test.js` (match the file's existing lookup helper — it already tests `def`/`term` entries):

```js
test("glossary defines the three Answer counters", () => {
  for (const id of ["riposte", "sidestep", "exploit"]) {
    const entry = GLOSSARY.find((e) => e.id === id); // use this file's existing accessor
    assert.ok(entry, `missing glossary entry: ${id}`);
    assert.ok(entry.def.length > 0);
  }
});
```

> Match the existing import/accessor in `shared/glossary.test.js` (it references glossary entries already — copy that pattern rather than assuming `GLOSSARY`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="three Answer counters" shared/glossary.test.js`
Expected: FAIL — entries missing.

- [ ] **Step 3: Add the entries**

In `shared/glossary.js`, add three entries following the existing shape (`{ id, term, match, def }`):

```js
  { id: "riposte", term: "Riposte", match: ["riposte"],
    def: "Answer counter (§5): when an enemy melees this Rig, it makes one free melee attack back — no action, no heat. Answer-token only." },
  { id: "sidestep", term: "Sidestep the Shooter", match: ["sidestep", "sidestep the shooter"],
    def: "Answer counter (§5): when an enemy shoots this Rig, slip up to ½ Speed before the shot resolves; if the move reaches the shooter you may engage it. Answer-token only." },
  { id: "exploit", term: "Exploit Opening", match: ["exploit", "exploit opening"],
    def: "Answer counter (§5): when an overcommitted enemy (final action spent, or overheated) attacks this Rig, pivot and land a free Aimed counter-shot with no aim penalty. Answer-token only." },
```

- [ ] **Step 4: Mirror into the client + test**

In `client/src/lib/glossaryTerms.ts`, add matching entries in that file's format (copy an existing term's object shape). In `client/src/lib/glossaryTerms.test.ts`, add:

```ts
it("includes the Answer counters", () => {
  for (const id of ["riposte", "sidestep", "exploit"]) {
    expect(GLOSSARY_TERMS.some((t) => t.id === id)).toBe(true); // match this file's accessor
  }
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test shared/glossary.test.js` and `npx vitest run client/src/lib/glossaryTerms.test.ts`
Expected: PASS both.

- [ ] **Step 6: Commit**

```bash
git add shared/glossary.js shared/glossary.test.js client/src/lib/glossaryTerms.ts client/src/lib/glossaryTerms.test.ts
git commit -m "docs(glossary): Riposte / Sidestep / Exploit entries"
```

---

## Task 9: PrepType + V2 ReactionPicker `answerMode` (client)

Extend the shared `PrepType` union and show the three counters **only** in the Answer gate.

**Files:**
- Modify: `client/src/state/types.ts:12`
- Modify: `client/src/v2/overlays/ReactionPicker.tsx`
- Modify: `client/src/v2/hooks/useV2BattleWatchers.tsx` (Answer gate call site ~line 70)
- Test: `client/src/v2/overlays/ReactionPicker.test.tsx` (new)

- [ ] **Step 1: Extend the type**

In `client/src/state/types.ts` line 12, change:

```ts
export type PrepType = "brace" | "evasive" | "return" | "raise-shield";
```

to:

```ts
export type PrepType =
  | "brace" | "evasive" | "return" | "raise-shield"
  | "riposte" | "sidestep" | "exploit";
```

- [ ] **Step 2: Write the failing test**

Create `client/src/v2/overlays/ReactionPicker.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ReactionPicker from "./ReactionPicker";

describe("ReactionPicker", () => {
  it("hides Answer counters by default (Prepare action)", () => {
    render(<ReactionPicker value="brace" onChange={() => {}} />);
    expect(screen.queryByText("Riposte")).toBeNull();
    expect(screen.queryByText("Sidestep the Shooter")).toBeNull();
    expect(screen.queryByText("Exploit Opening")).toBeNull();
    expect(screen.getByText("Brace for Incoming Fire")).toBeTruthy();
  });

  it("shows the three counters in answerMode", () => {
    render(<ReactionPicker value="brace" onChange={() => {}} answerMode />);
    expect(screen.getByText("Riposte")).toBeTruthy();
    expect(screen.getByText("Sidestep the Shooter")).toBeTruthy();
    expect(screen.getByText("Exploit Opening")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run client/src/v2/overlays/ReactionPicker.test.tsx`
Expected: FAIL — `answerMode` unknown, counters not rendered.

- [ ] **Step 4: Add `answerMode` + the counter list**

Replace `client/src/v2/overlays/ReactionPicker.tsx` with:

```tsx
import type { PrepType } from "../../state/types";
import "../styles/overlay.css";

const BASE_REACTIONS: { value: PrepType; icon: string; label: string; rule: string }[] = [
  { value: "brace", icon: "🛡️", label: "Brace for Incoming Fire",
    rule: "Front-arc impacts take −2. The braced Rig is immovable and counters a melee attacker that fails to breach." },
  { value: "evasive", icon: "💨", label: "Evasive Manoeuvre",
    rule: "Before the attack resolves, move up to ½ Speed. Break line of sight or range and the attack fails." },
  { value: "return", icon: "↩️", label: "Return Fire",
    rule: "After the enemy attacks, pivot to face it, then answer with one weapon." },
];

const ANSWER_COUNTERS: { value: PrepType; icon: string; label: string; rule: string }[] = [
  { value: "riposte", icon: "⚔️", label: "Riposte",
    rule: "When an enemy melees this Rig, make one free melee attack back." },
  { value: "sidestep", icon: "🌀", label: "Sidestep the Shooter",
    rule: "When shot, slip ½ Speed before it resolves; if you reach the shooter you may engage it." },
  { value: "exploit", icon: "🎯", label: "Exploit Opening",
    rule: "When an overcommitted enemy attacks, pivot and land a free Aimed counter-shot — no aim penalty." },
];

const SHIELD_REACTION: { value: PrepType; icon: string; label: string; rule: string } = {
  value: "raise-shield", icon: "🛡", label: "Raise Shield",
  rule: "Negates the next front-arc attack; side/rear impacts take −4 (Tower Shield also negates the side).",
};

// Exported for call sites / tests that need the base list.
export const REACTIONS = BASE_REACTIONS;

interface Props {
  value: PrepType;
  onChange: (v: PrepType) => void;
  allowShield?: boolean;  // true when the acting Rig carries a Bulwark Shield
  answerMode?: boolean;   // true in the Answer-token gate — unlocks the counters
}

// Shared reaction chooser used by both the Answer-token gate and the Prepare
// action. Presentational only — parents own the send. The three Answer counters
// appear only when answerMode is set (they are Answer-exclusive).
export default function ReactionPicker({ value, onChange, allowShield = false, answerMode = false }: Props) {
  const options = [
    ...BASE_REACTIONS,
    ...(answerMode ? ANSWER_COUNTERS : []),
    ...(allowShield ? [SHIELD_REACTION] : []),
  ];
  return (
    <div className="v2-rx-picker">
      {options.map((r) => (
        <button
          key={r.value}
          type="button"
          className={"v2-rx-choice" + (r.value === value ? " is-sel" : "")}
          onClick={() => onChange(r.value)}
        >
          <span className="v2-rx-choice-ic" aria-hidden="true">{r.icon}</span>
          <span className="v2-rx-choice-body">
            <span className="v2-rx-choice-label">{r.label}</span>
            <span className="v2-rx-choice-rule">{r.rule}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Pass `answerMode` from the Answer gate**

In `client/src/v2/hooks/useV2BattleWatchers.tsx`, find the `<ReactionPicker` in the Answer-gate body (around line 70, the one rendered inside the `pendingAnswer` flow) and add the prop:

```tsx
      <ReactionPicker
        value={prep}
        onChange={/* existing handler */ setPrep}
        allowShield={sel?.weapons?.melee === "Bulwark Shield"}
        answerMode
      />
```

(Leave the Prepare-action call site in `client/src/v2/state/V2BattleActionsContext.tsx` unchanged — no `answerMode`, so it stays generic-only.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run client/src/v2/overlays/ReactionPicker.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no new errors from the widened `PrepType`).

```bash
git add client/src/state/types.ts client/src/v2/overlays/ReactionPicker.tsx client/src/v2/overlays/ReactionPicker.test.tsx client/src/v2/hooks/useV2BattleWatchers.tsx
git commit -m "feat(v2): Answer-mode ReactionPicker exposes the three counters"
```

---

## Task 10: Rules §5 documentation (rules.md)

**Files:**
- Modify: `rules.md` §5 (Return Fire line ~171; Brace line ~172; Answer Tokens ~174)

- [ ] **Step 1: Update Return Fire and Brace**

In `rules.md`, replace the Return Fire bullet (line ~171):

```md
  - *Return Fire* — after an enemy Rig attacks this Rig, **pivot for free to face that enemy** (this is not a Move — a pinned Rig may still do it), then choose 1 weapon and make an attack against it.
```

Replace the Brace bullet (line ~172):

```md
  - *Brace for Incoming Fire* — attacks against this Rig's **front arc** suffer **−2 to their Impact Rolls** until the next round. While braced the Rig is **immovable** — it cannot be pushed, shoved, or staggered by weapon perks — and a **melee** attacker that swings at its front and **fails to breach** (deals no SP) eats a **free STR 6 melee counter** (once per round). *⚙ TUNING: counter STR 6.*
```

- [ ] **Step 2: Add the Answer-counters subsection**

In `rules.md`, immediately after the Answer Tokens paragraph (line ~174), add:

```md
- **Answer Counters (Answer-token only).** Instead of a generic preparation, an Answer token may place one of three **counters** — reactions the Prepare action cannot buy, the reward for activating second and watching the enemy commit. Each is facedown, revealed on its trigger, one per Rig, and fires only when its condition is met (otherwise it stays down for a later attack):
  - *Riposte* — when an enemy makes a **melee** attack against this Rig, after it resolves this Rig makes **one free melee attack** back at that attacker (no action, no heat).
  - *Sidestep the Shooter* — when an enemy makes a **ranged** attack against this Rig, **before** it resolves move up to **½ Speed** (the attack fails if this breaks range or line of sight); if the move reaches the shooter you may **engage it for free**.
  - *Exploit Opening* — when an **overcommitted** enemy attacks this Rig (it spent its **final action** on the attack, or is **overheated**), **pivot to face** it and make a **free Aimed counter-shot** at the location you choose, with **no aim penalty**.
```

- [ ] **Step 3: Verify the doc reads cleanly**

Run: `git diff rules.md` and re-read the §5 changes for consistency with the design (no stray references, arcs/heat correct).

- [ ] **Step 4: Commit**

```bash
git add rules.md
git commit -m "docs(rules): §5 Return Fire pivot, Brace rework, Answer counters"
```

---

## Task 11: Full-suite green + memory note

**Files:** none (verification + memory)

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS — all Vitest + `node --test` suites green.

- [ ] **Step 2: Manual smoke (optional but recommended)**

Start the app (`npm run dev`), reach an Answer-token gate as the second player, confirm the three counters appear only there (not in a Prepare action), and that placing Riposte/Sidestep/Exploit surfaces a facedown token that reveals on the right trigger.

- [ ] **Step 3: Update memory**

Append a line to `C:\Users\breke\.claude\projects\C--Users-breke-WebstormProjects-ia-regrinha\memory\MEMORY.md` and create the backing file, recording that Answer tokens gained three counters + Brace/Return Fire reworks (SHIPPED date, branch `frontend/v2-redesign`), linking `[[support-units-design]]` / `[[priority-elimination-design]]` as sibling V2 mechanics.

- [ ] **Step 4: Finish the branch**

Invoke the `superpowers:finishing-a-development-branch` skill to choose merge/PR/cleanup.

---

## Self-Review

**Spec coverage:**
- Return Fire pivot-to-face → Task 1 (reveal copy) + Task 10 (rules). ✓ (Engine needs no logic change — arc is player-supplied; the counter already accepts `a.attack.arc`.)
- Brace immovable → Task 3. ✓  Brace retaliate → Task 4 + wired in Task 5. ✓
- Riposte / Sidestep / Exploit (place, conditional trigger, resolve) → Tasks 1, 5, 6. ✓
- Exploit aimed-no-penalty → Task 2 + Task 6. ✓
- Sidestep free-engage → Task 6. ✓
- Answer-exclusive (not in Prepare) → Task 1 (`normalizeAnswerPrep` split) + Task 9 (`answerMode`). ✓
- battle-view + glossary + V2 picker + rules → Tasks 7, 8, 9, 10. ✓
- Tests mirror existing prep tests → every engine task. ✓
- Deferred (bank/escalate, >1 token) → not implemented, per spec. ✓

**Placeholder scan:** Two tasks (7 battle-view, 8 glossary) intentionally direct the engineer to match an existing accessor in the target test file rather than guessing its internal helper name — the concrete assertion text (`"Riposte ready"`, entry ids) is specified. All code steps show real code.

**Type consistency:** `preparation.type` string values `riposte`/`sidestep`/`exploit` are identical across `ANSWER_COUNTERS`, `prepTriggeredBy`, the facedown block, the `react` branches, `prepName`/`prepEffectLine`, `prepLabel`, glossary ids, and the client `PrepType`. `pendingReaction.kind` reuses those same strings. `waiveAimPenalty` opt name matches between Task 2 (combat) and Task 6 (react). `braceRetaliatedThisRound` matches between Task 4 helper and recovery reset. `BRACE_RIPOSTE_STR = 6` matches Task 4 and the rules text in Task 10.
