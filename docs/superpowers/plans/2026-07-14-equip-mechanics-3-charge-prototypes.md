# Equipment Mechanics — Plan 3: Charge / Bank Prototypes (Group 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the six **Prototype** equipment upgrades that each carry per-round tracked state, a spend (active or reactive), and a real downside — Ablative Cascade, Cryo Reservoir, Nanite Swarm, Point-Defense System, Meltdown Protocol, Fire Solution Lock. Each replaces an inert `effect: {}` / `TODO(mechanics)` row with a live camelCase tag read through `equipmentUpgradeEffectOf`, fills its `refreshEquipState` Recovery branch, and enforces its downside.

**Architecture:** These build directly on the shared plumbing shipped by the earlier plans in this rollout:

- **Plan 0** relocated `EQUIPMENT_UPGRADES` + `equipmentUpgradeEffectOf(equipmentId, upgradeId)` into `shared/rules.js`, deleted the commission-time `equipmentUpgradeEffect` stamp, and scaffolded `rig.equipState` + the empty `refreshEquipState(rig)` hook called from `runRecovery`. This plan fills the mechanic branches those left blank.
  - Pinned `equipState` shape (Plan 0): `{ ablativeCharges, cryo, naniteStacks:[], interceptors, meltdownCharge, solution:{ targetId, count }, reactiveArmorLocs:[], grapnelCooldown }`. Group 3 owns `ablativeCharges`, `cryo`, `naniteStacks`, `interceptors`, `meltdownCharge`, `solution`.
- **Plan 2** created the reactive on-incoming-hit seam **`applyDefensiveReactions(target, hit, ctx)`** in `shared/combat.js` (first consumed by Reactive Armor + Chaff Burst). Ablative Cascade and Point-Defense System are **additional users of THAT exact seam** — they add branches, they do not create a parallel hook.

**Read path:** every mechanic gates on `equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.<tag>` — never re-search the catalog, never read a stamp (the stamp is gone). `combat.js` may import **only** from `rules.js`; `equipmentUpgradeEffectOf` is already imported there (Plan 0, Task 3).

**Tags introduced by this plan** (replace the six `effect: {}` rows in `EQUIPMENT_UPGRADES`, now in `shared/rules.js`):

| Prototype | equipment id | upgrade id | tag |
|---|---|---|---|
| Ablative Cascade | `ablative-plating` | `ablative-cascade` | `{ ablativeCascade: true }` |
| Cryo Reservoir | `radiator-array` | `cryo-reservoir` | `{ cryoReservoir: true }` |
| Nanite Swarm | `field-repair-suite` | `nanite-swarm` | `{ naniteSwarm: true }` |
| Point-Defense System | `reactive-plating` | `point-defense-system` | `{ pointDefense: true }` |
| Meltdown Protocol | `blast-furnace-core` | `meltdown-protocol` | `{ meltdownProtocol: true }` |
| Fire Solution Lock | `targeting-computer` | `fire-solution-lock` | `{ fireSolutionLock: true }` |

**Rules are VERBATIM** from the 2026-07-12 equipment-depth design (lines 105-137). This plan does not re-derive them; it fixes the engine hook, the state field, and the test surface.

**Spatial convention (AGENTS.md):** the app is a tabletop assistant — the minis are physical. A spatial effect (Meltdown 4" burst) **narrates a player instruction** via `pushResolution`; the engine tracks state (charge spent), the player moves models and adjudicates who is in range.

**Tech Stack:** Node ESM modules, `node:test` + `node:assert` (run with `node --test`). Test helpers already in `shared/game-state.test.js`: `startedRoom()`, `readyThreeAndThree(r, equipmentByName)`, `activate(r, name)`, `findRig`, `makeRig`, `applyCommand`, `createRoom`, `claimSide`, and the `__test` harness (`__test.runRecovery(room)`). `shared/combat.test.js` drives `resolveAttack` fixtures directly.

**Shared helper (add once, Task 1) —** a terse accessor used by every task:

```js
// game-state.js, near rigEffects: the live effect tag for a rig's equipment upgrade.
function equipTag(rig) { return equipmentUpgradeEffectOf(rig?.equipment, rig?.equipmentUpgrade); }
```

`combat.js` already calls `equipmentUpgradeEffectOf(...)` inline; keep that style there.

**Transient STR field.** Cryo Reservoir and Meltdown Protocol both grant "+STR to your next attack". They share one transient field, **`rig.equipState.nextAttackStr`** (read with `?? 0`, never added to `freshEquipState` so Plan 0's `deepEqual` scaffold test stays green). It is added in `computeStr` and zeroed after an attack resolves in `resolveFire`, and cleared in `endActivation` so it can't leak past the activation that spent it.

---

### Task 1: Ablative Cascade (Armor) — 2 charges/round, spend to soften a hit, +1 heat/spend

**Rule (2026-07-12):** 2 ablative charges/round; each incoming damaging hit may spend 1 to soften it one step (Critical→Severe→Direct→negated). Each spend runs **+1 heat**. Refresh to 2 in Recovery. Uses `applyDefensiveReactions`.

**Files:**
- Modify: `shared/rules.js` — the `ablative-plating` prototype row (`ablative-cascade`), replace `effect: {}` with `effect: { ablativeCascade: true }`.
- Modify: `shared/game-state.js` — `refreshEquipState` (added by Plan 0, ~near `runRecovery` at line 1835): add the refill branch; add the `equipTag` helper near `rigEffects` (~416).
- Modify: `shared/combat.js` — extend Plan 2's `applyDefensiveReactions(target, hit, ctx)` with the Ablative branch; ensure it is invoked per damaging impact in `rollImpacts` (post-`impactSeverity`, ~line 320-327).
- Test: `shared/game-state.test.js`, `shared/combat.test.js`.

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js` (Recovery refill + downside cost, driven end-to-end):

```js
test("Ablative Cascade: Recovery refills charges to 2", () => {
  const rig = makeRig(1, "Aegis", "medium", "a",
    { longRange: "Autocannon", melee: "Claw" }, "ablative-plating", "ablative-cascade");
  rig.equipState.ablativeCharges = 0;
  const room = createRoom("X");
  room.rigs = [rig];
  __test.runRecovery(room);
  assert.equal(rig.equipState.ablativeCharges, 2);
});

test("Ablative Cascade: refill is scoped to the upgrade (base plating gets none)", () => {
  const rig = makeRig(1, "Plain", "medium", "a",
    { longRange: "Autocannon", melee: "Claw" }, "ablative-plating", "reinforced-plating");
  rig.equipState.ablativeCharges = 0;
  const room = createRoom("X"); room.rigs = [rig];
  __test.runRecovery(room);
  assert.equal(rig.equipState.ablativeCharges, 0);
});
```

Add to `shared/combat.test.js` (spend softens one severity step + costs the defender 1 heat; a spent-out rig stops softening). Mirror the module's existing `applyDefensiveReactions` fixture style from Plan 2:

```js
test("Ablative Cascade: spends a charge to soften a Critical to Severe, at +1 heat", () => {
  const target = {
    kind: "rig", weightClass: "medium", equipment: "ablative-plating", equipmentUpgrade: "ablative-cascade",
    engine: { heat: 0 }, equipState: { ablativeCharges: 2 },
  };
  let heated = 0;
  const ctx = { bumpHeat: (_t, n) => { heated += n; } };
  const hit = { kind: "impact", ranged: true, impact: { tier: "critical", sp: 3 } };
  applyDefensiveReactions(target, hit, ctx);
  assert.deepEqual(hit.impact, { tier: "severe", sp: 2 }); // softened one step
  assert.equal(target.equipState.ablativeCharges, 1);      // one charge spent
  assert.equal(heated, 1);                                 // +1 heat per spend
});

test("Ablative Cascade: with no charges left, the hit lands full", () => {
  const target = {
    kind: "rig", weightClass: "medium", equipment: "ablative-plating", equipmentUpgrade: "ablative-cascade",
    engine: { heat: 0 }, equipState: { ablativeCharges: 0 },
  };
  const hit = { kind: "impact", ranged: true, impact: { tier: "critical", sp: 3 } };
  applyDefensiveReactions(target, hit, { bumpHeat: () => {} });
  assert.deepEqual(hit.impact, { tier: "critical", sp: 3 }); // untouched
});
```

Ensure `applyDefensiveReactions` is in the `combat.test.js` import list and `__test` is imported in `game-state.test.js` (both already present after Plan 0/2).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: FAIL — `refreshEquipState` has no ablative branch (charges stay 0); `applyDefensiveReactions` has no `ablativeCascade` branch (impact untouched, heat 0).

- [ ] **Step 3: Implement**

`shared/rules.js` — the row:

```js
{ id: "ablative-cascade", nature: "prototype", name: "Ablative Cascade", tag: "Spend ablative charges to soften incoming hits — each costs heat", catch: "Each charge costs heat", effect: { ablativeCascade: true } },
```

`shared/game-state.js` — in `refreshEquipState(rig)`:

```js
const eff = equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade);
if (eff.ablativeCascade) s.ablativeCharges = 2; // Ablative Cascade — refill 2/round
```

`shared/combat.js` — add the branch to `applyDefensiveReactions(target, hit, ctx)` and invoke it per damaging impact. The severity ladder (one step gentler): `critical→severe→direct→none`.

```js
// Ablative Cascade (Armor Prototype) — spend one ablative charge to soften a
// damaging impact by exactly one severity step; each spend runs the defender +1
// heat. Charges refill to 2 each Recovery (game-state refreshEquipState).
const ABLATIVE_SOFTEN = { critical: { tier: "severe", sp: 2 }, severe: { tier: "direct", sp: 1 }, direct: { tier: "none", sp: 0 } };
// …inside applyDefensiveReactions, when hit.kind === "impact":
if (hit.impact && hit.impact.sp > 0
    && equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.ablativeCascade
    && (target.equipState?.ablativeCharges || 0) > 0) {
  const softened = ABLATIVE_SOFTEN[hit.impact.tier];
  if (softened) {
    hit.impact.tier = softened.tier;
    hit.impact.sp = softened.sp;
    target.equipState.ablativeCharges -= 1;
    ctx.bumpHeat(target, 1);
  }
}
```

In `rollImpacts` (`combat.js`, after `sev` is finalized ~line 326, before `out.push({ ... })`), route each damaging hit through the seam so a live rig softens it before the SP is booked:

```js
if (sev.sp > 0 && ctx?.applyDefensiveReactions) {
  const hit = { kind: "impact", ranged: !profile.melee, impact: { tier: sev.tier, sp: sev.sp } };
  ctx.applyDefensiveReactions(target, hit, ctx);
  sev = hit.impact;
}
```

`rollImpacts` already receives everything else it needs; thread `ctx` into its call from `resolveAttack` (add `ctx` to the `rollImpacts(...)` argument list at ~line 411, and to the `rollImpacts` signature) so the seam and `ctx.bumpHeat` are reachable. (If Plan 2 already threaded `ctx` here for Reactive Armor, reuse it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/combat.js shared/game-state.test.js shared/combat.test.js
git commit -m "feat(v2): wire Ablative Cascade — 2 charges/round soften a hit at +1 heat"
```

---

### Task 2: Cryo Reservoir (Cooling) — bank cold (cap 3), spend for cooling + STR spike; Radiator downside

**Rule (2026-07-12):** each Recovery you cool, bank 1 cryo (cap 3). At activation start spend N: **−2 heat each** and **+1 STR to your next attack per cryo spent**. Downside: while cryo > 0, the Radiator passive drops to cooling 1 per Recovery (hoarding, not dissipating).

**Files:**
- Modify: `shared/rules.js` — the `radiator-array` `cryo-reservoir` row → `effect: { cryoReservoir: true }`.
- Modify: `shared/game-state.js` — `refreshEquipState` (bank cryo, cap 3); `runRecovery` cooling calc ~1839-1841 (downside: cool 1 while cryo>0); a `cryo` spend action in `performAction`; `computeStr` reads `nextAttackStr`; `resolveFire`/`endActivation` clear it.
- Modify: `shared/combat.js` — `computeStr` (~152) adds `attacker.equipState?.nextAttackStr ?? 0`.
- Test: `shared/game-state.test.js`.

- [ ] **Step 1: Write the failing tests**

```js
test("Cryo Reservoir: banks 1 cryo each Recovery, capped at 3", () => {
  const rig = makeRig(1, "Frost", "medium", "a",
    { longRange: "Autocannon", melee: "Claw" }, "radiator-array", "cryo-reservoir");
  const room = createRoom("X"); room.rigs = [rig];
  __test.runRecovery(room); assert.equal(rig.equipState.cryo, 1);
  __test.runRecovery(room); assert.equal(rig.equipState.cryo, 2);
  __test.runRecovery(room); assert.equal(rig.equipState.cryo, 3);
  __test.runRecovery(room); assert.equal(rig.equipState.cryo, 3); // capped
});

test("Cryo Reservoir downside: while hoarding cryo the Radiator cools only 1", () => {
  const rig = makeRig(1, "Frost", "medium", "a",
    { longRange: "Autocannon", melee: "Claw" }, "radiator-array", "cryo-reservoir");
  rig.engine.heat = 5; rig.equipState.cryo = 2;         // already banked → hoarding
  const room = createRoom("X"); room.rigs = [rig];
  __test.runRecovery(room);
  assert.equal(rig.engine.heat, 4);                      // cooled 1, not the Radiator's usual 2
});

test("Cryo Reservoir: spending N cools 2 heat each and arms +1 STR/cryo on the next attack", () => {
  const r = startedRoom();
  const a1 = findRig(r, "a1");
  a1.equipment = "radiator-array"; a1.equipmentUpgrade = "cryo-reservoir";
  a1.equipState.cryo = 3; a1.engine.heat = 6;
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "cryo", n: 2 } });
  assert.equal(a1.equipState.cryo, 1);                   // 2 spent
  assert.equal(a1.engine.heat, 2);                       // −2 each → −4
  assert.equal(a1.equipState.nextAttackStr, 2);          // +1 STR per cryo spent
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — no cryo bank in `refreshEquipState`; Radiator still cools 2; `cryo` action rejected as unknown.

- [ ] **Step 3: Implement**

`shared/rules.js`:

```js
{ id: "cryo-reservoir", nature: "prototype", name: "Cryo Reservoir", tag: "Bank cold; spend for instant cooling + a STR spike", catch: "Must charge it up first", effect: { cryoReservoir: true } },
```

`shared/game-state.js` — `runRecovery` cooling (replace lines 1839-1841 body):

```js
// Radiator Array (Cooling) — cools 2 heat instead of 1. Cryo Reservoir downside:
// while cryo is banked the passive hoards, cooling only 1.
let cooling = equipmentRecoveryCool(rig.equipment);
if (equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.cryoReservoir && (rig.equipState?.cryo || 0) > 0) cooling = 1;
rig.engine.heat = Math.max(floor, rig.engine.heat - cooling);
```

`refreshEquipState` — bank AFTER the cooling read above (so the downside checks the pre-bank cryo count):

```js
if (eff.cryoReservoir) s.cryo = Math.min(3, s.cryo + 1); // Cryo Reservoir — bank 1/Recovery, cap 3
```

`performAction` — a `cryo` spend action. Add before the `ACTIONS[act]` gate (like `reload`), guarded by the tag; spend `min(n, cryo)`:

```js
if (act === "cryo") {
  if (!equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.cryoReservoir) return reject("This unit has no Cryo Reservoir.");
  const spend = Math.max(0, Math.min(Math.floor(Number(a.n) || 0), rig.equipState.cryo || 0));
  if (spend === 0) return reject("No cryo banked to spend.");
  rig.equipState.cryo -= spend;
  bumpHeat(rig, -2 * spend);
  rig.equipState.nextAttackStr = (rig.equipState.nextAttackStr || 0) + spend;
  pushResolution(room, { kind: "equipment", actor: rig.owner, rigId: rig.id, rolls: [],
    summary: `${rig.name} vents cryo ×${spend} — −${2 * spend} heat, +${spend} STR to the next attack.`, effects: [] });
  return true;
}
```

`shared/combat.js` — `computeStr`, add the transient to the return (near line 220):

```js
// Cryo Reservoir / Meltdown Protocol — a spent charge arms +STR on the next attack.
const nextStr = attacker.equipState?.nextAttackStr || 0;
return profile.str + weightMod + charged + bonus + nextStr;
```

`shared/game-state.js` — consume it once the shot resolves. In `resolveFire`, after `t.actionsUsed += cost;` (~line 2015):

```js
if (rig.equipState?.nextAttackStr) rig.equipState.nextAttackStr = 0; // one-shot STR spike consumed
```

And in `endActivation` (~1933, beside `rig.lockSightNext = false`), clear a leftover so it never leaks:

```js
if (rig.equipState) rig.equipState.nextAttackStr = 0;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/combat.js shared/game-state.test.js
git commit -m "feat(v2): wire Cryo Reservoir — bank cold, spend for cooling + a STR spike"
```

---

### Task 3: Nanite Swarm (Utility) — active seeds stacks that heal each Recovery; Heat Capacity −1 downside

**Rule (2026-07-12):** active (1 slot, +1 heat): seed a nanite stack on a location (self or ally in reach). Each Recovery every stack heals 1 SP there, then decays 1. Cap 3/location. Downside: while any stack rides this Rig, its **Heat Capacity −1**.

**Model.** The stack lives on the **healed** rig's `equipState.naniteStacks` as `{ loc, sp }` (Plan 0's pinned item shape) where `sp` is the stack's remaining charges (cap 3). Self-seeding is the common case; "ally in reach" is a player-adjudicated target named on the action (resolved by name, like `maybeEngageByName`) — the engine seeds the named ally's own `equipState`, the player confirms reach. The "+1 heat / 1 slot" is paid by the **seeding** rig; the "Heat Capacity −1" downside rides the **hosting** (healed) rig — which coincide on a self-seed.

**Files:**
- Modify: `shared/rules.js` — the `field-repair-suite` `nanite-swarm` row → `effect: { naniteSwarm: true }`.
- Modify: `shared/game-state.js` — `refreshEquipState` (heal+decay each stack); a `nanite` seed action in `performAction`; `heatMeter` (~1189) applies the cap −1 while stacks ride.
- Test: `shared/game-state.test.js`.

- [ ] **Step 1: Write the failing tests**

```js
test("Nanite Swarm: seeding costs 1 slot + 1 heat and stacks a location (cap 3)", () => {
  const r = startedRoom();
  const a1 = findRig(r, "a1");
  a1.equipment = "field-repair-suite"; a1.equipmentUpgrade = "nanite-swarm";
  a1.hull.sp = 2; // wounded so we can watch it heal later
  activate(r, "a1");
  const heatBefore = a1.engine.heat, usedBefore = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "nanite", loc: "hull" } });
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "nanite", loc: "hull" } });
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "nanite", loc: "hull" } });
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "nanite", loc: "hull" } });
  assert.equal(r.game.turn.actionsUsed, usedBefore + 4);
  assert.equal(a1.engine.heat, heatBefore + 4);                  // +1 heat each
  const st = a1.equipState.naniteStacks.find((x) => x.loc === "hull");
  assert.equal(st.sp, 3);                                        // capped at 3
});

test("Nanite Swarm: each Recovery a stack heals 1 SP then decays 1, dropping at 0", () => {
  const rig = makeRig(1, "Mender", "medium", "a",
    { longRange: "Autocannon", melee: "Claw" }, "field-repair-suite", "nanite-swarm");
  rig.hull.sp = rig.hull.max - 3;
  rig.equipState.naniteStacks = [{ loc: "hull", sp: 2 }];
  const room = createRoom("X"); room.rigs = [rig];
  __test.runRecovery(room);
  assert.equal(rig.hull.sp, rig.hull.max - 2);                   // healed 1
  assert.equal(rig.equipState.naniteStacks[0].sp, 1);           // decayed 1
  __test.runRecovery(room);
  assert.equal(rig.hull.sp, rig.hull.max - 1);                   // healed 1 more
  assert.equal(rig.equipState.naniteStacks.length, 0);          // stack spent → dropped
});

test("Nanite Swarm downside: Heat Capacity −1 while a stack rides", () => {
  const rig = makeRig(1, "Mender", "medium", "a",
    { longRange: "Autocannon", melee: "Claw" }, "field-repair-suite", "nanite-swarm");
  const capClean = heatMeter(rig).cap;
  rig.equipState.naniteStacks = [{ loc: "hull", sp: 1 }];
  assert.equal(heatMeter(rig).cap, capClean - 1);
});
```

`heatMeter` is already imported by `game-state.test.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `nanite` action unknown; stacks neither heal nor decay; `heatMeter.cap` unchanged by stacks.

- [ ] **Step 3: Implement**

`shared/rules.js`:

```js
{ id: "nanite-swarm", nature: "prototype", name: "Nanite Swarm", tag: "Seed nanites that heal each Recovery — at a heat-cap cost", catch: "Costs heat-cap", effect: { naniteSwarm: true } },
```

`shared/game-state.js` — `performAction`, a `nanite` seed action (before the `ACTIONS[act]` gate, guarded by the tag; 1 slot + 1 heat; targets self or a named ally in reach):

```js
if (act === "nanite") {
  if (!equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.naniteSwarm) return reject("This unit has no Nanite Swarm.");
  if (t.actionsUsed >= t.actionsMax) return reject("No actions left this activation.");
  const host = a.target ? findRig(room, a.target) : rig; // self, or an ally in reach (player-adjudicated)
  if (!host || (host.owner || "a") !== (rig.owner || "a")) return reject("Seed the swarm on yourself or a friendly unit in reach.");
  const loc = LOCS.includes(String(a.loc || "").toLowerCase()) ? a.loc.toLowerCase() : "hull";
  const stacks = host.equipState.naniteStacks;
  const st = stacks.find((x) => x.loc === loc);
  if (st) st.sp = Math.min(3, st.sp + 1); else stacks.push({ loc, sp: 1 });
  t.actionsUsed += 1;
  bumpHeat(rig, 1);
  pushResolution(room, { kind: "equipment", actor: rig.owner, rigId: rig.id, rolls: [],
    summary: `${rig.name} seeds a nanite stack on ${host.name}'s ${loc}.`, effects: [] });
  return true;
}
```

`refreshEquipState` — heal then decay each stack (runs per rig in `runRecovery`):

```js
if (s.naniteStacks.length) {
  for (const st of s.naniteStacks) { repairRig(rig, st.loc, 1); st.sp -= 1; } // heal 1, decay 1
  s.naniteStacks = s.naniteStacks.filter((st) => st.sp > 0);
}
```

`heatMeter` — cap −1 while stacks ride (fold into the existing `effCap`, ~1201):

```js
const naniteDock = (rig?.equipState?.naniteStacks?.length || 0) > 0 ? 1 : 0;
const effCap = cap + margin - naniteDock;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/game-state.test.js
git commit -m "feat(v2): wire Nanite Swarm — seed self-repairing stacks at a Heat Capacity cost"
```

---

### Task 4: Point-Defense System (Countermeasures) — 2 interceptors/round, reroll a ranged hit; +1 heat + fire-lockout downsides

**Rule (2026-07-12):** 2 interceptor charges/round; when hit by a **ranged** attack, spend 1 to force the attacker to reroll all successful hit dice. Refresh 2 in Recovery. Downside: +1 heat per charge spent; PD is unusable the round after *you* fired your own ranged weapon. Uses `applyDefensiveReactions`.

**Files:**
- Modify: `shared/rules.js` — the `reactive-plating` `point-defense-system` row → `effect: { pointDefense: true }`.
- Modify: `shared/game-state.js` — `refreshEquipState` (refill interceptors to 2; roll the fired-ranged lockout forward); `resolveFire` (~2018) flags `firedRangedThisRound` on a ranged shot.
- Modify: `shared/combat.js` — extend `applyDefensiveReactions` with the Point-Defense branch at the **pre-impact** (`hit.kind === "tohit"`) seam site.
- Test: `shared/game-state.test.js`, `shared/combat.test.js`.

- [ ] **Step 1: Write the failing tests**

```js
test("Point-Defense: Recovery refills interceptors to 2 and rolls the fire-lockout forward", () => {
  const rig = makeRig(1, "Sentry", "medium", "a",
    { longRange: "Autocannon", melee: "Claw" }, "reactive-plating", "point-defense-system");
  rig.equipState.interceptors = 0;
  rig.equipState.firedRangedThisRound = true;                    // fired ranged this round
  const room = createRoom("X"); room.rigs = [rig];
  __test.runRecovery(room);
  assert.equal(rig.equipState.interceptors, 2);                  // refilled
  assert.equal(rig.equipState.pdLocked, true);                   // locked out next round
  assert.equal(rig.equipState.firedRangedThisRound, false);      // flag reset
});
```

Add to `shared/combat.test.js`:

```js
test("Point-Defense: a ranged hit spends 1 interceptor to force a reroll, at +1 heat", () => {
  const target = {
    kind: "rig", weightClass: "medium", equipment: "reactive-plating", equipmentUpgrade: "point-defense-system",
    engine: { heat: 0 }, equipState: { interceptors: 2, pdLocked: false },
  };
  let heated = 0;
  const ctx = { bumpHeat: (_t, n) => { heated += n; } };
  const hit = { kind: "tohit", ranged: true, rerollHits: false };
  applyDefensiveReactions(target, hit, ctx);
  assert.equal(hit.rerollHits, true);                            // attacker must reroll landed dice
  assert.equal(target.equipState.interceptors, 1);              // one spent
  assert.equal(heated, 1);                                       // +1 heat per charge
});

test("Point-Defense: no intercept on a melee hit, when spent out, or while fire-locked", () => {
  const base = { kind: "rig", weightClass: "medium", equipment: "reactive-plating", equipmentUpgrade: "point-defense-system", engine: { heat: 0 } };
  const melee = { kind: "tohit", ranged: false, rerollHits: false };
  applyDefensiveReactions({ ...base, equipState: { interceptors: 2, pdLocked: false } }, melee, { bumpHeat: () => {} });
  assert.equal(melee.rerollHits, false);                         // melee is not intercepted
  const spent = { kind: "tohit", ranged: true, rerollHits: false };
  applyDefensiveReactions({ ...base, equipState: { interceptors: 0, pdLocked: false } }, spent, { bumpHeat: () => {} });
  assert.equal(spent.rerollHits, false);                         // no charges
  const locked = { kind: "tohit", ranged: true, rerollHits: false };
  applyDefensiveReactions({ ...base, equipState: { interceptors: 2, pdLocked: true } }, locked, { bumpHeat: () => {} });
  assert.equal(locked.rerollHits, false);                        // locked the round after firing
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: FAIL — interceptors stay 0; `applyDefensiveReactions` has no `pointDefense` branch.

- [ ] **Step 3: Implement**

`shared/rules.js`:

```js
{ id: "point-defense-system", nature: "prototype", name: "Point-Defense System", tag: "Intercept incoming fire; force rerolls — at a heat cost", catch: "Costs heat", effect: { pointDefense: true } },
```

`shared/game-state.js` — `refreshEquipState`:

```js
if (eff.pointDefense) {
  s.interceptors = 2;                       // refill 2/round
  s.pdLocked = !!s.firedRangedThisRound;    // unusable the round after you fired ranged
  s.firedRangedThisRound = false;
}
```

`resolveFire` — after a `longRange` shot resolves (near the `secondShot`/`t.longRangeShots` bookkeeping, ~2018), flag the fire so next Recovery arms the lockout:

```js
if (slot === "longRange" && rig.equipState && equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.pointDefense) {
  rig.equipState.firedRangedThisRound = true;
}
```

`shared/combat.js` — the Point-Defense branch in `applyDefensiveReactions`, at the pre-impact `hit.kind === "tohit"` site (spend an interceptor, force the reroll, +1 heat):

```js
// Point-Defense System (Countermeasures Prototype) — a ranged hit may be met by
// one interceptor charge, forcing the attacker to reroll every landed hit die.
// +1 heat per charge; unusable the round after this rig fired its own ranged
// weapon (equipState.pdLocked, rolled forward in refreshEquipState).
if (hit.kind === "tohit" && hit.ranged
    && equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.pointDefense
    && (target.equipState?.interceptors || 0) > 0
    && !target.equipState?.pdLocked) {
  hit.rerollHits = true;
  target.equipState.interceptors -= 1;
  ctx.bumpHeat(target, 1);
}
```

Wire the `tohit` seam + reroll in `resolveAttack`: after `rollToHit` returns `th` (~line 386-398), call `applyDefensiveReactions(target, { kind: "tohit", ranged: !profile.melee, rerollHits: false }, ctx)`; if it flags `rerollHits`, re-roll `th`'s successful hit dice once (reuse the module's existing reroll helper that Lock Sight / Fire Control already use — reroll only dice `>= th.modAim`, keeping the rest) and recompute `th.hits`. Place this **before** the `if (th.hits > 0)` location/impact block so the softened hit count drives everything downstream. If Plan 2 already invokes the `tohit` seam for Reactive Armor/Chaff, add the reroll handling there rather than a second call.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/combat.js shared/game-state.test.js shared/combat.test.js
git commit -m "feat(v2): wire Point-Defense System — intercept ranged hits, force rerolls, fire-lockout"
```

---

### Task 5: Meltdown Protocol (Thermal) — bank over-capacity heat as charge; spend for STR or a burst; no-cooling + detonate downsides

**Rule (2026-07-12):** heat over Capacity at activation end converts to **meltdown charge** (cap 6) instead of rolling overheat. Spend N at activation start: **+N STR** split across attacks, or a **4" burst** (N heat-damage to enemies in range). Downside: while charge > 0 you can't Shut Down or use Cooling actions; an Engine destroyed while charged detonates the charge on yourself.

**Files:**
- Modify: `shared/rules.js` — the `blast-furnace-core` `meltdown-protocol` row → `effect: { meltdownProtocol: true }`.
- Modify: `shared/game-state.js` — `endActivation` overheat branch (~1889-1903: convert over-capacity heat to charge instead of rolling); a `meltdown` spend action in `performAction`; `shutdown` (~2204) + cooling actives (`purge`/`heatpurgewave`, ~2252) blocked while charged; `onRigDamaged` (~1653) self-detonation when the engine dies charged.
- Test: `shared/game-state.test.js`.

- [ ] **Step 1: Write the failing tests**

```js
test("Meltdown Protocol: over-capacity heat at activation end banks as charge (no overheat roll)", () => {
  const r = startedRoom();
  const a1 = findRig(r, "a1");
  a1.equipment = "blast-furnace-core"; a1.equipmentUpgrade = "meltdown-protocol";
  activate(r, "a1");
  a1.engine.heat = heatMeter(a1).cap + 3;                         // 3 over the redline
  applyCommand(r, { verb: "endactivation", attrs: { name: "a1" } });
  assert.equal(a1.equipState.meltdownCharge, 3);                 // banked, not rolled
  assert.equal(r.game.resolutions.some((x) => x.kind === "overheat" && x.rigId === a1.id), false);
});

test("Meltdown Protocol: charge caps at 6", () => {
  const rig = makeRig(1, "Furnace", "medium", "a",
    { longRange: "Autocannon", melee: "Claw" }, "blast-furnace-core", "meltdown-protocol");
  rig.equipState.meltdownCharge = 5;
  const room = createRoom("X");
  room.game = { turn: { activeRigId: rig.id, side: "a" }, round: 1, resolutions: [], sides: [] };
  rig.engine.heat = heatMeter(rig).cap + 4;
  __test.endActivation
    ? __test.endActivation(room, rig, null, () => 0)             // if exposed
    : (rig.equipState.meltdownCharge = Math.min(6, rig.equipState.meltdownCharge + 4)); // else assert the cap directly
  assert.equal(rig.equipState.meltdownCharge, 6);
});

test("Meltdown Protocol: while charged, Shut Down and Cooling are refused", () => {
  const r = startedRoom();
  const a1 = findRig(r, "a1");
  a1.equipment = "blast-furnace-core"; a1.equipmentUpgrade = "meltdown-protocol";
  a1.equipState.meltdownCharge = 2;
  activate(r, "a1");
  const before = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "shutdown" } });
  assert.equal(a1.activated, false);                             // shutdown refused (didn't end activation)
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "heatpurgewave" } });
  assert.equal(r.game.turn.actionsUsed, before);                 // cooling active refused (no slot spent)
});

test("Meltdown Protocol: spending N in STR mode arms +N STR and burns N charge", () => {
  const r = startedRoom();
  const a1 = findRig(r, "a1");
  a1.equipment = "blast-furnace-core"; a1.equipmentUpgrade = "meltdown-protocol";
  a1.equipState.meltdownCharge = 4;
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "meltdown", mode: "str", n: 3 } });
  assert.equal(a1.equipState.meltdownCharge, 1);
  assert.equal(a1.equipState.nextAttackStr, 3);
});

test("Meltdown Protocol: burst mode narrates the 4\" spatial instruction and spends the charge", () => {
  const r = startedRoom();
  const a1 = findRig(r, "a1");
  a1.equipment = "blast-furnace-core"; a1.equipmentUpgrade = "meltdown-protocol";
  a1.equipState.meltdownCharge = 3;
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "meltdown", mode: "burst", n: 3 } });
  assert.equal(a1.equipState.meltdownCharge, 0);
  const note = r.game.resolutions.at(-1);
  assert.match(note.summary, /4"/);                              // narrated player instruction
  assert.match(note.summary, /3 heat-damage/);
});

test("Meltdown Protocol: an engine destroyed while charged detonates the charge on self", () => {
  const rig = makeRig(1, "Furnace", "medium", "a",
    { longRange: "Autocannon", melee: "Claw" }, "blast-furnace-core", "meltdown-protocol");
  rig.equipState.meltdownCharge = 4;
  const room = createRoom("X"); room.rigs = [rig];
  const spBefore = rig.hull.sp + rig.arms.sp + rig.legs.sp;
  __test.applyDamage(room, rig, "engine", rig.engine.sp, { random: () => 0 });
  assert.equal(rig.equipState.meltdownCharge, 0);                // detonated
  assert.ok((rig.hull.sp + rig.arms.sp + rig.legs.sp) < spBefore, "self-damage from the meltdown");
});
```

(The cap test's `__test.endActivation` fallback keeps it green whether or not `endActivation` is exposed; prefer exposing it in `__test` — see Step 3 — and dropping the fallback.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — over-capacity heat still rolls overheat; `meltdown` action unknown; shutdown/cooling not gated; no self-detonation.

- [ ] **Step 3: Implement**

`shared/rules.js`:

```js
{ id: "meltdown-protocol", nature: "prototype", name: "Meltdown Protocol", tag: "Bank overheat as charge; spend for STR or a burst", catch: "Only banks while overheated", effect: { meltdownProtocol: true } },
```

`shared/game-state.js` — `endActivation`, replace the `if (m.over > 0) { …overheat roll… }` block (1891-1903) so a Meltdown rig banks instead of rolling:

```js
const m = heatMeter(rig);
if (m.over > 0) {
  if (equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.meltdownProtocol) {
    rig.equipState.meltdownCharge = Math.min(6, (rig.equipState.meltdownCharge || 0) + m.over);
    pushResolution(room, { kind: "equipment", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `${rig.name} banks ${m.over} meltdown charge (now ${rig.equipState.meltdownCharge}/6) — no overheat roll.`, effects: [] });
  } else {
    const roll = rollD(12, dice?.overheat, random);
    const total = roll + m.bonus;
    const row = applyOverheat(room, rig, total, { random });
    pushResolution(room, { kind: "overheat", actor: rig.owner, rigId: rig.id, heatKey: row.key,
      rolls: [{ sides: 12, value: roll, label: "D12" }],
      summary: `${rig.name}: ${row.label} (D12 ${roll}+${m.bonus}=${total})`, effects: [row.text] });
    checkAnnihilation(room);
  }
}
```

`performAction` — a `meltdown` spend action (before the `ACTIONS[act]` gate; STR mode arms `nextAttackStr`, burst mode narrates the 4" spatial instruction):

```js
if (act === "meltdown") {
  if (!equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.meltdownProtocol) return reject("This unit has no Meltdown Protocol.");
  const spend = Math.max(0, Math.min(Math.floor(Number(a.n) || 0), rig.equipState.meltdownCharge || 0));
  if (spend === 0) return reject("No meltdown charge to spend.");
  rig.equipState.meltdownCharge -= spend;
  if (a.mode === "burst") {
    pushResolution(room, { kind: "equipment", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `${rig.name} vents a meltdown burst — deal ${spend} heat-damage to every enemy within 4" (players adjudicate the AoE).`, effects: [] });
  } else {
    rig.equipState.nextAttackStr = (rig.equipState.nextAttackStr || 0) + spend;
    pushResolution(room, { kind: "equipment", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `${rig.name} overloads — +${spend} STR to its attacks this activation.`, effects: [] });
  }
  return true;
}
```

`performAction` — the no-cooling downside. Guard the `shutdown` branch (~2204) and the cooling actives (`purge`, `heatpurgewave`) while charged:

```js
// at the top of the shutdown branch:
if ((rig.equipState?.meltdownCharge || 0) > 0) return reject("Can't Shut Down while a meltdown charge is banked.");
// beside the equipment-active guards (before bumpHeat on purge/heatpurgewave):
if ((act === "purge" || act === "heatpurgewave") && (rig.equipState?.meltdownCharge || 0) > 0) return reject("Can't vent heat while a meltdown charge is banked.");
```

`onRigDamaged` — self-detonation when the engine dies charged. Add near the top (after the `_blastRolled` block, before `checkAnnihilation`):

```js
// Meltdown Protocol — an Engine destroyed with charge banked cooks off on self.
if (rig.engine?.sp === 0 && (rig.equipState?.meltdownCharge || 0) > 0 && !rig._meltdownDetonated) {
  rig._meltdownDetonated = true;
  const n = rig.equipState.meltdownCharge;
  rig.equipState.meltdownCharge = 0;
  applyDamage(room, rig, "hull", n, opts);
  pushResolution(room, { kind: "equipment", actor: rig.owner, rigId: rig.id, rolls: [],
    summary: `${rig.name}'s meltdown charge detonates — ${n} damage to its own Hull.`, effects: [] });
}
```

Expose `endActivation` in the `__test` harness (line 3441) so the cap test drives it directly:

```js
export const __test = { …, endActivation };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS. (Drop the `__test.endActivation ? … : …` fallback in the cap test once exposed.)

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/game-state.test.js
git commit -m "feat(v2): wire Meltdown Protocol — bank overheat as charge, spend for STR or a burst"
```

---

### Task 6: Fire Solution Lock (Fire Control) — stack a solution on one target, cash it for an auto-hit AP volley; move/heat downsides

**Rule (2026-07-12):** each Fire Weapon vs the *same* target +1 solution (cap 3, reset on target switch). At 3, next attack **auto-hits all dice + Armour Piercing**. Downside: **Moving loses the solution** (must hold still); each solution-building shot runs +1 heat.

**Files:**
- Modify: `shared/rules.js` — the `targeting-computer` `fire-solution-lock` row → `effect: { fireSolutionLock: true }`.
- Modify: `shared/game-state.js` — `resolveFire` (~1982): build/reset the solution, mark the payoff shot, +1 heat on a building shot; `move`/`sprint` action (~2379): moving clears the solution.
- Modify: `shared/combat.js` — `resolveAttack`: an `opts.solutionPayoff` shot auto-hits all dice and injects Armour Piercing (mirror the existing `fireControlLock` handling at ~366-371, 386).
- Test: `shared/game-state.test.js`.

- [ ] **Step 1: Write the failing tests**

```js
test("Fire Solution Lock: repeated fire on one target stacks a solution (cap 3) at +1 heat/shot", () => {
  const r = startedRoom();
  const a1 = findRig(r, "a1");
  a1.equipment = "targeting-computer"; a1.equipmentUpgrade = "fire-solution-lock";
  activate(r, "a1");
  const fire = () => applyCommand(r, { verb: "action", attrs: {
    name: "a1", action: "fire", weapon: "longRange", target: "b1", arc: "front", range: "near",
    dice: { toHit: [1, 1], impacts: [1, 1], location: 1 } } }) && applyCommand(r, { verb: "action", attrs: { name: "a1", action: "reload" } });
  const heat0 = a1.engine.heat;
  fire();
  assert.equal(a1.equipState.solution.targetId, findRig(r, "b1").id);
  assert.equal(a1.equipState.solution.count, 1);
  assert.ok(a1.engine.heat > heat0, "building shot runs +1 heat");
  fire(); fire(); fire();
  assert.equal(a1.equipState.solution.count, 3);                 // capped
});

test("Fire Solution Lock: switching target resets the solution", () => {
  const r = startedRoom();
  const a1 = findRig(r, "a1");
  a1.equipment = "targeting-computer"; a1.equipmentUpgrade = "fire-solution-lock";
  a1.equipState.solution = { targetId: findRig(r, "b1").id, count: 2 };
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "fire", weapon: "longRange", target: "b2", arc: "front", range: "near", dice: { toHit: [1, 1], impacts: [1, 1], location: 1 } } });
  assert.equal(a1.equipState.solution.targetId, findRig(r, "b2").id);
  assert.equal(a1.equipState.solution.count, 1);                 // reset to this target, then +1
});

test("Fire Solution Lock: at count 3 the next shot auto-hits every die and gains Armour Piercing", () => {
  const r = startedRoom();
  const a1 = findRig(r, "a1");
  a1.equipment = "targeting-computer"; a1.equipmentUpgrade = "fire-solution-lock";
  a1.equipState.solution = { targetId: findRig(r, "b1").id, count: 3 };
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: {
    name: "a1", action: "fire", weapon: "longRange", target: "b1", arc: "front", range: "near",
    dice: { toHit: [1, 1], location: 1, impacts: [6, 6], ap: [3, 3] } } }); // all-1 to-hit would miss without auto-hit
  const attack = r.game.resolutions.filter((x) => x.kind === "attack").at(-1);
  assert.match(attack.summary, /2 hit\(s\)/);                    // unmissable payoff volley
  assert.equal(a1.equipState.solution.count, 0);                 // solution consumed
});

test("Fire Solution Lock: moving loses the solution", () => {
  const r = startedRoom();
  const a1 = findRig(r, "a1");
  a1.equipment = "targeting-computer"; a1.equipmentUpgrade = "fire-solution-lock";
  a1.equipState.solution = { targetId: findRig(r, "b1").id, count: 2 };
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "move" } });
  assert.deepEqual(a1.equipState.solution, { targetId: null, count: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — solution never changes; a count-3 all-1 volley misses; moving leaves it intact.

- [ ] **Step 3: Implement**

`shared/rules.js`:

```js
{ id: "fire-solution-lock", nature: "prototype", name: "Fire Solution Lock", tag: "Hold still and stack a solution → an auto-hit AP volley", catch: "Must hold still to charge it", effect: { fireSolutionLock: true } },
```

`shared/game-state.js` — `resolveFire`, resolve the solution around the `resolveAttack` call. Before building the `resolveAttack` opts (~2000):

```js
const fsl = slot === "longRange" && equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.fireSolutionLock;
let solutionPayoff = false;
if (fsl) {
  const sol = rig.equipState.solution;
  if (sol.targetId !== target.id) { sol.targetId = target.id; sol.count = 0; } // reset on switch
  solutionPayoff = sol.count >= 3;                                             // cash a full solution
}
```

Pass `solutionPayoff` into the `resolveAttack` opts object, then after the shot resolves (after `t.actionsUsed += cost;`):

```js
if (fsl) {
  const sol = rig.equipState.solution;
  if (solutionPayoff) { sol.count = 0; }                 // payoff consumed
  else { sol.count = Math.min(3, sol.count + 1); bumpHeat(rig, 1); } // building shot: stack + run hot
}
```

`shared/combat.js` — `resolveAttack`, treat `opts.solutionPayoff` exactly like `fireControlLock` (auto-hit + Armour Piercing). Extend the AP-injection guard (~366-371) and the `autoHit` flag (~386):

```js
const solutionPayoff = !!opts.solutionPayoff;
if (fireControlLock || solutionPayoff) {
  profile = { ...profile, perks: [...new Set([...(profile.perks || []), "Armour Piercing"])] };
}
// …in the rollToHit opts:
const th = rollToHit(attacker, profile, { ...opts, target, autoHit: fireControlLock || solutionPayoff, /* …unchanged… */ }, opts.dice?.toHit, random);
```

`shared/game-state.js` — `move`/`sprint` action (~2379), moving loses the solution (gated on the tag so it doesn't clobber other rigs):

```js
if (equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.fireSolutionLock) {
  rig.equipState.solution = { targetId: null, count: 0 }; // Fire Solution Lock — moving breaks the firing solution
}
```

Place this alongside the other move-time state clears, after the movement is committed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/combat.js shared/game-state.test.js
git commit -m "feat(v2): wire Fire Solution Lock — stack a solution for an auto-hit AP volley"
```

---

### Task 7: Prototype-cap regression — a wired equipment Prototype still counts against the one-per-rig cap

The six rows are already `nature: "prototype"` and already counted by `countPrototypes` (via `equipmentUpgradeNature`). Wiring an effect tag must **not** change that — a rig may still run at most one Prototype across its two picks (AGENTS.md). This task adds the guard test.

**Files:**
- Test only: `shared/game-state.test.js`.

- [ ] **Step 1: Write the failing test**

```js
test("a wired equipment Prototype still counts against the one-Prototype-per-rig cap", () => {
  // Equipment Prototype alone → 1.
  assert.equal(
    countPrototypes({ longRange: "Autocannon", melee: "Claw" }, {}, "ablative-plating", "ablative-cascade"),
    1,
  );
  // Every newly-wired equipment Prototype counts as exactly 1.
  for (const [equip, up] of [
    ["ablative-plating", "ablative-cascade"], ["radiator-array", "cryo-reservoir"],
    ["field-repair-suite", "nanite-swarm"], ["reactive-plating", "point-defense-system"],
    ["blast-furnace-core", "meltdown-protocol"], ["targeting-computer", "fire-solution-lock"],
  ]) {
    assert.equal(equipmentUpgradeNature(equip, up), "prototype", `${up} stays prototype`);
    assert.equal(countPrototypes({ longRange: "Autocannon", melee: "Claw" }, {}, equip, up), 1, `${up} counts 1`);
  }
  // A weapon Prototype + an equipment Prototype → 2 (the wizard/server caps at 1).
  assert.equal(
    countPrototypes({ longRange: "Talon", melee: "Talon" }, { longRange: "evisceration" }, "blast-furnace-core", "meltdown-protocol"),
    2,
  );
  // A Field equipment upgrade contributes nothing.
  assert.equal(
    countPrototypes({ longRange: "Autocannon", melee: "Claw" }, {}, "ablative-plating", "reinforced-plating"),
    0,
  );
});
```

Confirm `countPrototypes` and `equipmentUpgradeNature` are in the `game-state.test.js` import list (add if absent).

- [ ] **Step 2: Run test to verify it fails/passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS immediately if `nature` was preserved by every prior task (the intended outcome — this is a regression lock, not a red-first mechanic). If it FAILS, a Task-1..6 edit accidentally dropped a `nature: "prototype"` — fix that row before continuing.

- [ ] **Step 3: Implement**

No production change expected. This test pins the invariant that wiring the `effect` tag never touched the `nature` field the cap reads.

- [ ] **Step 4: Run the full shared suite**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.test.js
git commit -m "test(v2): lock the one-Prototype-per-rig cap for wired equipment Prototypes"
```

---

## Self-review notes

- **Read path is uniform.** Every mechanic gates on `equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.<tag>` — no stamp (removed in Plan 0), no catalog re-search. `combat.js` reads the same lookup it already imports from `rules.js` (import-cycle-safe).
- **Reactive mechanics share Plan 2's seam.** Ablative Cascade (`hit.kind === "impact"`, post-severity) and Point-Defense (`hit.kind === "tohit"`, pre-impact) both add branches to `applyDefensiveReactions(target, hit, ctx)` — the exact name Plan 2 introduced. If Plan 2 wired only one call site, add the other (Ablative post-impact in `rollImpacts`; PD pre-impact in `resolveAttack`) as noted in Tasks 1 and 4.
- **One shared transient for the STR spike.** Cryo Reservoir and Meltdown Protocol both write `rig.equipState.nextAttackStr`; `computeStr` reads it, `resolveFire` zeroes it after an attack, `endActivation` clears any leftover. It is intentionally **not** in `freshEquipState`, so Plan 0's `deepEqual` scaffold test stays green.
- **Recovery upkeep in one place.** `refreshEquipState` gains four branches (ablative refill, interceptor refill + fire-lockout roll-forward, cryo bank, nanite heal/decay); Cryo's Radiator downside lives in `runRecovery`'s cooling calc; Meltdown's charge persists across Recovery untouched.
- **Spatial → narrated.** Meltdown's 4" burst emits a `pushResolution` player instruction (heat-damage to enemies within 4", players adjudicate the AoE) — the engine only tracks the charge spend, per the AGENTS.md tabletop convention. No other Group-3 mechanic is spatial.
- **rules.md.** Fill the "Tuned / Prototype Equipment Mechanics" subsection under §15 for each Prototype as it ships (same cadence as the weapon-Prototype rollout) — fold the doc edit into each task's commit if kept in lockstep.
- **Final sweep.** After Task 7, run `node --test shared/game-state.test.js shared/combat.test.js` once more; all six `effect: {}` / `TODO(mechanics)` markers for these rows must be gone from `shared/rules.js`.
