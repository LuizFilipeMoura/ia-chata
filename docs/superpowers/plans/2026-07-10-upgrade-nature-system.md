# Upgrade Nature System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every weapon three upgrades — one per **nature** (Field / Tuned / Prototype) — badge them in the commission wizard, and enforce "at most one Prototype per rig" client- and server-side. Wire only the upgrades whose effects already exist in the engine; new mechanics are a separate plan.

**Architecture:** Add a `nature` string to every `WEAPON_UPGRADES` entry and expand each weapon's list from 2 to 3 (keep/rename/add/drop per the spec). The wizard already renders `WEAPON_UPGRADES[name]` — add a nature badge and grey-out the second Prototype. The server add-guard (`server/routes/game.js`) already resolves prebuilts; extend it to reject a two-Prototype loadout and unknown upgrade ids. Placeholder-safe upgrade ids for new-mechanic Prototypes are added here (data only) but their effects land in the mechanics plan.

**Tech Stack:** Node ESM (`shared/*.js`), React + TypeScript (`client/src`), Vitest (client) + `node --test` (shared/server). Work directly on `main` (see AGENTS.md).

**Reference:** [SPEC-natures-health-rounds.md](../../design/SPEC-natures-health-rounds.md) Phase 4 (the full keep/rename/add/drop table) and [AGENTS.md](../../../AGENTS.md) (nature definitions, max-one-Prototype rule).

---

## File Structure

- `shared/game-state.js` — `WEAPON_UPGRADES` gets `nature` on every entry + the new 3rd upgrades; add `NATURES` constant + `upgradeNature()` + `countPrototypes()` helpers.
- `shared/game-state.test.js` — data-shape tests (3 per weapon, one of each nature) + helper tests.
- `server/routes/game.js` — extend `enforcePrebuilt` (rename to `enforceAdd`) to reject double-Prototype loadouts and unknown upgrade ids.
- `server/prebuilts.test.js` — enforcement tests for the new rejections.
- `client/shared.d.ts` — type `nature` on `WEAPON_UPGRADES`, declare the new helpers.
- `client/src/components/wizards/UnitWizard.tsx` — nature badge per upgrade choice; disable the second Prototype.
- `client/src/components/wizards/RigWizard.test.tsx` — wizard behaviour test for the badge + Prototype lock.
- `rules.md` — document the nature system in the Weapon Upgrades section.

New upgrade ids introduced here (data only; effects in the mechanics plan). Existing effects reused where noted.

---

## Task 1: `NATURES` constant + `nature` on existing upgrades that keep their slot

**Files:**
- Modify: `shared/game-state.js` (the `WEAPON_UPGRADES` object + a new constant above it)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```javascript
import { NATURES, upgradeNature } from "./game-state.js"; // add to existing import block

test("NATURES lists the three upgrade natures in order", () => {
  assert.deepEqual(NATURES, ["field", "tuned", "prototype"]);
});

test("every WEAPON_UPGRADES entry declares a valid nature", () => {
  for (const [weapon, ups] of Object.entries(WEAPON_UPGRADES)) {
    for (const u of ups) {
      assert.ok(NATURES.includes(u.nature), `${weapon}/${u.id} nature=${u.nature}`);
    }
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `NATURES` is not exported / `u.nature` undefined.

- [ ] **Step 3: Add the constant + helper**

In `shared/game-state.js`, immediately above `export const WEAPON_UPGRADES = {`:

```javascript
// The three upgrade natures (AGENTS.md). Field = unconditional upside; Tuned =
// conditional upside; Prototype = systemic/tracked, may carry a downside, and a
// rig may run at most one. Order is display order.
export const NATURES = ["field", "tuned", "prototype"];

export function upgradeNature(weaponName, upgradeId) {
  const u = (WEAPON_UPGRADES[weaponName] || []).find((x) => x.id === upgradeId);
  return u?.nature || null;
}
```

- [ ] **Step 4: Add `nature` to every existing upgrade that keeps its slot**

Per the spec's keep/rename/add/drop table, add `nature: "..."` to each existing entry. Existing entries and their natures (do NOT change ids/effects, only add the `nature` key):

| id | nature |
|---|---|
| Mini Gun `suppressive-fire` | field |
| Mini Gun `extended-belt` | tuned |
| Double MG `gyro-mount` | field |
| Autocannon `ap-shells` | tuned |
| Autocannon `depleted-core` | field |
| Arc Gun `ion-burn` | field |
| Arc Gun `systems-overload` | tuned |
| Mortar `airburst-fuze` | tuned |
| Mortar `cluster-shells` | field |
| Sniper Cannon `marksman-optics` | field |
| Sword `duelist-balance` | field |
| Chainsaw `ripper-teeth` | field |
| Claw `vice-grip` | tuned |
| Claw `rending-talons` | field |
| Lance `couched-reach` | field |
| Wrecking Ball `haymaker` | field |
| Bulwark Shield `tower-shield` | field |
| Missile Barrage `swarm-warheads` | field |
| Missile Barrage `shaped-charges` | tuned |
| Flamethrower `sticky-fuel` | field |
| Circular Saw `tempered-teeth` | field |
| Circular Saw `sunder` | tuned |

Example (Autocannon block becomes):

```javascript
  "Autocannon": [
    { id: "ap-shells", nature: "tuned", name: "AP Shells", tag: "Gains Armour Piercing", effect: { perks: ["Armour Piercing"] } },
    { id: "depleted-core", nature: "field", name: "Depleted Core", tag: "+2 STR", effect: { str: 2 } },
  ],
```

Leave the soon-to-be-dropped/renamed entries (e.g. Sniper `match-barrel`, Sword `keen-edge`, Siege Maul `extended-barrel`, Bulwark `boss-spike`, etc.) in place for now — Task 2 handles them. They still need a `nature` to satisfy the test; give each a `nature: "tuned"` temporarily (they are removed in Task 2). To avoid a temporary-value smell, do Task 1 and Task 2 as one commit.

- [ ] **Step 5: Run to verify pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 6: Commit** (fold Task 2 in — see note above; commit after Task 2).

---

## Task 2: Reconcile each weapon to exactly 3 upgrades (one per nature)

**Files:**
- Modify: `shared/game-state.js` (`WEAPON_UPGRADES`)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
test("every weapon offers exactly one upgrade of each nature", () => {
  for (const [weapon, ups] of Object.entries(WEAPON_UPGRADES)) {
    assert.equal(ups.length, 3, `${weapon} has ${ups.length} upgrades`);
    const natures = ups.map((u) => u.nature).sort();
    assert.deepEqual(natures, ["field", "prototype", "tuned"], `${weapon} natures`);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — weapons have 2 entries, no `prototype`.

- [ ] **Step 3: Apply keep/rename/add/drop to each weapon**

Rewrite `WEAPON_UPGRADES` so each of the 16 weapons has exactly `[field, tuned, prototype]`. Drop the entries marked *(drop)*, rename where noted, and add the Prototype (and any missing Field/Tuned). **New-mechanic effects are placeholders here** — give each new upgrade `effect: {}` and a `TODO(mechanics)` comment; the mechanics plan fills them. Full target set:

```javascript
export const WEAPON_UPGRADES = {
  "Mini Gun": [
    { id: "suppressive-fire", nature: "field", name: "Suppressive Fire", tag: "Gains Shock", effect: { perks: ["Shock"] } },
    { id: "extended-belt", nature: "tuned", name: "Extended Belt", tag: "+2 ROF; dice showing 1 add heat", effect: { rof: 2, heatOnOnes: true } },
    { id: "suppression-lock", nature: "prototype", name: "Suppression Lock", tag: "Grind one target down turn by turn until it's pinned", effect: {} }, // TODO(mechanics)
  ],
  "Double MG": [
    { id: "gyro-mount", nature: "field", name: "Gyro Mount", tag: "Reroll one missed to-hit die", effect: { rerollMisses: 1 } },
    { id: "pinning-burst", nature: "tuned", name: "Pinning Burst", tag: "4+ hits: target loses 1 action next activation", effect: {} }, // TODO(mechanics)
    { id: "kneecapper", nature: "prototype", name: "Kneecapper", tag: "Rake legs/arms from any arc to cripple them; never hull/engine", effect: {} }, // TODO(mechanics)
  ],
  "Autocannon": [
    { id: "depleted-core", nature: "field", name: "Depleted Core", tag: "+2 STR", effect: { str: 2 } },
    { id: "ap-shells", nature: "tuned", name: "AP Shells", tag: "Gains Armour Piercing", effect: { perks: ["Armour Piercing"] } },
    { id: "penetrator-rounds", nature: "prototype", name: "Penetrator Rounds", tag: "Every 3rd volley ignores armour; belt cycles slow after", effect: {} }, // TODO(mechanics)
  ],
  "Arc Gun": [
    { id: "ion-burn", nature: "field", name: "Ion Burn", tag: "Gains Incendiary", effect: { perks: ["Incendiary"] } },
    { id: "systems-overload", nature: "tuned", name: "Systems Overload", tag: "On hit: target loses 1 action next activation", effect: { onHit: "systems-overload" } },
    { id: "ion-storm", nature: "prototype", name: "Ion Storm", tag: "EMP a rig's systems for a turn; overloads your own gun", effect: {} }, // TODO(mechanics)
  ],
  "Mortar": [
    { id: "cluster-shells", nature: "field", name: "Cluster Shells", tag: "On hit: 1 SP to a second random location", effect: { onHit: "cluster-shells" } },
    { id: "airburst-fuze", nature: "tuned", name: "Airburst Fuze", tag: "Ignores cover", effect: { ignoreCover: true } },
    { id: "barrage", nature: "prototype", name: "Barrage", tag: "Shell a zone for 2 rounds; mortar locked + hot (spatial)", effect: {} }, // TODO(mechanics, spatial)
  ],
  "Sniper Cannon": [
    { id: "marksman-optics", nature: "field", name: "Marksman Optics", tag: "Gains Precision", effect: { perks: ["Precision"] } },
    { id: "cold-bore", nature: "tuned", name: "Cold Bore", tag: "+3 STR vs undamaged targets", effect: {} }, // TODO(mechanics)
    { id: "enfilade", nature: "prototype", name: "Enfilade", tag: "Every 3rd aimed shot ricochets to a rig the target can see (spatial)", effect: {} }, // TODO(mechanics, spatial)
  ],
  "Siege Maul": [
    { id: "reinforced-head", nature: "field", name: "Reinforced Head", tag: "+2 STR", effect: { str: 2 } },
    { id: "breaching-round", nature: "tuned", name: "Breaching Round", tag: "Hull SP it strips can't be repaired until end of next round", effect: { onDamage: "breaching-round" } },
    { id: "piledriver-protocol", nature: "prototype", name: "Piledriver Protocol", tag: "Store Momentum by advancing; unload a guard-breaking smash (spatial shove)", effect: {} }, // TODO(mechanics, spatial)
  ],
  "Missile Barrage": [
    { id: "swarm-warheads", nature: "field", name: "Swarm Warheads", tag: "+2 ROF", effect: { rof: 2 } },
    { id: "shaped-charges", nature: "tuned", name: "Shaped Charges", tag: "Gains Armour Piercing", effect: { perks: ["Armour Piercing"] } },
    { id: "fire-control-lock", nature: "prototype", name: "Fire Control Lock", tag: "Lock a target for one unmissable armor-piercing volley", effect: {} }, // TODO(mechanics)
  ],
  "Sword": [
    { id: "duelist-balance", nature: "field", name: "Duelist's Balance", tag: "Gains Precision", effect: { perks: ["Precision"] } },
    { id: "opportunist", nature: "tuned", name: "Opportunist", tag: "+3 STR vs disrupted / overheated targets", effect: {} }, // TODO(mechanics)
    { id: "superconductor-edge", nature: "prototype", name: "Superconductor Edge", tag: "Run hot and dump your heat into them through the blade", effect: {} }, // TODO(mechanics)
  ],
  "Circular Saw": [
    { id: "tempered-teeth", nature: "field", name: "Tempered Teeth", tag: "Gains Armour Piercing", effect: { perks: ["Armour Piercing"] } },
    { id: "sunder", nature: "tuned", name: "Sunder", tag: "On damaging hit: -1 max SP to struck location", effect: { onDamage: "sunder" } },
    { id: "dismember", nature: "prototype", name: "Dismember", tag: "Saw a location in half to cripple it for good", effect: {} }, // TODO(mechanics)
  ],
  "Chainsaw": [
    { id: "ripper-teeth", nature: "field", name: "Ripper Teeth", tag: "Gains Rend", effect: { perks: ["Rend"] } },
    { id: "bloodletter", nature: "tuned", name: "Bloodletter", tag: "Extra hit vs damaged targets", effect: {} }, // TODO(mechanics)
    { id: "redline-governor", nature: "prototype", name: "Redline Governor", tag: "The hotter you run, the harder it bites", effect: {} }, // TODO(mechanics)
  ],
  "Claw": [
    { id: "rending-talons", nature: "field", name: "Rending Talons", tag: "Gains Rend", effect: { perks: ["Rend"] } },
    { id: "vice-grip", nature: "tuned", name: "Vice Grip", tag: "Gains Impale", effect: { perks: ["Impale"] } },
    { id: "breach-grip", nature: "prototype", name: "Breach Grip", tag: "Pry a location's armor open (+2 impact from anyone)", effect: {} }, // TODO(mechanics)
  ],
  "Lance": [
    { id: "couched-reach", nature: "field", name: "Couched Reach", tag: "Doubles melee reach to 4\"", effect: { range: 2 } },
    { id: "full-tilt", nature: "tuned", name: "Full Tilt", tag: "Charge in for +3 STR", effect: {} }, // TODO(mechanics)
    { id: "skewer", nature: "prototype", name: "Skewer", tag: "Impale a rig in the melee lock; leaving you costs it a free lance hit", effect: {} }, // TODO(mechanics)
  ],
  "Wrecking Ball": [
    { id: "haymaker", nature: "field", name: "Haymaker", tag: "+3 STR", effect: { str: 3 } },
    { id: "momentum-swing", nature: "tuned", name: "Momentum Swing", tag: "Charge in for +2 STR and a knockback (knockback spatial)", effect: { str: 2 } }, // TODO(mechanics: charge-gate + knockback)
    { id: "tow-chain", nature: "prototype", name: "Tow Chain", tag: "Yank a rig 4\" where you want it (spatial)", effect: {} }, // TODO(mechanics, spatial)
  ],
  "Bulwark Shield": [
    { id: "tower-shield", nature: "field", name: "Tower Shield", tag: "Raise Shield also negates side-arc attacks", effect: { shieldArc: "front-side" } },
    { id: "anvil-boss", nature: "tuned", name: "Anvil Boss", tag: "Counter the first melee attacker each round while braced", effect: {} }, // TODO(mechanics)
    { id: "emplacement", nature: "prototype", name: "Emplacement", tag: "Root into a permanent fortress shield; immobile, 2 actions, cooldown", effect: {} }, // TODO(mechanics)
  ],
  "Flamethrower": [
    { id: "sticky-fuel", nature: "field", name: "Sticky Fuel", tag: "Gains Rend", effect: { perks: ["Rend"] } },
    { id: "napalm", nature: "tuned", name: "Napalm", tag: "Hits set the target burning (1 SP/round until doused)", effect: {} }, // TODO(mechanics)
    { id: "conflagration", nature: "prototype", name: "Conflagration", tag: "Stack burns for escalating damage-over-time; runs you hot", effect: {} }, // TODO(mechanics)
  ],
};
```

Note: `couched-reach` effect changed `range: 1` → `range: 2` (spec Phase 4). Its glossary/wizard text now reads "Doubles melee reach to 4\"".

- [ ] **Step 4: Run to verify pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS (both the 3-per-weapon test and Task 1's nature-valid test).

- [ ] **Step 5: Check no dropped id is referenced elsewhere**

Run: `git grep -nE "match-barrel|keen-edge|extended-barrel|boss-spike|tracer-rounds|wrecking-momentum|high-rev-motor|pressurized-tank|spearpoint"`
Expected: only hits in `docs/` and old plans. If any live `shared/`, `client/`, or `server/` code/test references a dropped id, update it to the kept sibling (e.g. a test using `keen-edge` → `ripper-teeth`). Fix each hit.

- [ ] **Step 6: Run the whole suite**

Run: `node --test "shared/**/*.test.js" "server/**/*.test.js"` then `npx vitest run`
Expected: PASS. Fix any test that referenced a dropped upgrade id.

- [ ] **Step 7: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(upgrades): add nature (field/tuned/prototype) and a 3rd upgrade per weapon"
```

---

## Task 3: `countPrototypes` helper for a loadout

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { countPrototypes } from "./game-state.js"; // add to import block

test("countPrototypes counts prototype picks across a rig's two upgrades", () => {
  // Autocannon penetrator-rounds is prototype; depleted-core is field.
  assert.equal(countPrototypes({ longRange: "Autocannon", melee: "Claw" },
    { longRange: "penetrator-rounds", melee: "breach-grip" }), 2);
  assert.equal(countPrototypes({ longRange: "Autocannon", melee: "Claw" },
    { longRange: "penetrator-rounds", melee: "vice-grip" }), 1);
  assert.equal(countPrototypes({ longRange: "Autocannon", melee: "Claw" },
    { longRange: "depleted-core", melee: "vice-grip" }), 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `countPrototypes` not exported.

- [ ] **Step 3: Implement**

Add near `upgradeNature` in `shared/game-state.js`:

```javascript
// How many of a rig's two chosen weapon upgrades are Prototype nature. Used to
// enforce "at most one Prototype per rig" (AGENTS.md).
export function countPrototypes(weapons = {}, upgrades = {}) {
  let n = 0;
  if (upgradeNature(weapons.longRange, upgrades.longRange) === "prototype") n++;
  if (upgradeNature(weapons.melee, upgrades.melee) === "prototype") n++;
  return n;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(upgrades): countPrototypes helper for the one-prototype rule"
```

---

## Task 4: Server rejects a two-Prototype loadout and unknown upgrade ids

**Files:**
- Modify: `server/routes/game.js` (the `enforcePrebuilt` function)
- Test: `server/prebuilts.test.js`

- [ ] **Step 1: Write the failing test**

Add to `server/prebuilts.test.js`:

```javascript
test("enforcePrebuilt rejects a rig running two Prototype upgrades", () => {
  const out = enforcePrebuilt({ verb: "add", attrs: {
    name: "X", kind: "rig", prebuilt: "light-claw-autocannon",
    longRangeUpgrade: "penetrator-rounds", meleeUpgrade: "breach-grip",
  } });
  assert.ok(out.error);
  assert.equal(out.cmd, undefined);
});

test("enforcePrebuilt allows one Prototype", () => {
  const out = enforcePrebuilt({ verb: "add", attrs: {
    name: "X", kind: "rig", prebuilt: "light-claw-autocannon",
    longRangeUpgrade: "penetrator-rounds", meleeUpgrade: "vice-grip",
  } });
  assert.equal(out.error, undefined);
});

test("enforcePrebuilt rejects an upgrade id that isn't valid for the weapon", () => {
  const out = enforcePrebuilt({ verb: "add", attrs: {
    name: "X", kind: "rig", prebuilt: "light-claw-autocannon",
    longRangeUpgrade: "not-a-real-upgrade", meleeUpgrade: "vice-grip",
  } });
  assert.ok(out.error);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test server/prebuilts.test.js`
Expected: FAIL — no error returned yet.

- [ ] **Step 3: Extend `enforcePrebuilt`**

In `server/routes/game.js`, update the import and the guard. Import line becomes:

```javascript
import { claimSide, applyCommand, publicState, resolvePrebuilt, upgradeNature, countPrototypes } from "../../shared/game-state.js";
```

After the `resolvePrebuilt` resolution and before the `return`, add validation:

```javascript
  const lrUp = a.longRangeUpgrade || a.lrUpgrade;
  const meleeUp = a.meleeUpgrade;
  // Unknown upgrade id for the resolved weapon → reject (null nature means the id
  // isn't in that weapon's list; an omitted upgrade is allowed and defaults later).
  if (lrUp && !upgradeNature(pb.longRange, lrUp)) return { error: "unknown long-range upgrade" };
  if (meleeUp && !upgradeNature(pb.melee, meleeUp)) return { error: "unknown melee upgrade" };
  // At most one Prototype per rig (AGENTS.md).
  if (countPrototypes({ longRange: pb.longRange, melee: pb.melee }, { longRange: lrUp, melee: meleeUp }) > 1) {
    return { error: "a rig may run at most one Prototype upgrade" };
  }
```

(Keep the existing `return { cmd: { ...cmd, attrs: { ...a, class: pb.class, ... , sp: pb.sp } } };`.)

- [ ] **Step 4: Run to verify pass**

Run: `node --test server/prebuilts.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/game.js server/prebuilts.test.js
git commit -m "feat(server): reject double-Prototype loadouts and unknown upgrade ids on add"
```

---

## Task 5: Type the `nature` field + helpers for the client

**Files:**
- Modify: `client/shared.d.ts`

- [ ] **Step 1: Update the `WEAPON_UPGRADES` type and add helper decls**

In `client/shared.d.ts`, change the `WEAPON_UPGRADES` declaration and add three exports inside the `declare module "/shared/game-state.js"` block:

```typescript
  export const WEAPON_UPGRADES: Record<string, Array<{ id: string; nature: "field" | "tuned" | "prototype"; name: string; tag: string; [k: string]: unknown }>>;
  export const NATURES: ReadonlyArray<"field" | "tuned" | "prototype">;
  export function upgradeNature(weaponName: string, upgradeId?: string | null): "field" | "tuned" | "prototype" | null;
  export function countPrototypes(
    weapons: { longRange?: string; melee?: string },
    upgrades: { longRange?: string | null; melee?: string | null },
  ): number;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no NEW errors from `shared.d.ts`/`UnitWizard.tsx` (the pre-existing `CompRow.tsx` error is unrelated — ignore it).

- [ ] **Step 3: Commit**

```bash
git add client/shared.d.ts
git commit -m "chore(types): type upgrade nature + one-prototype helpers"
```

---

## Task 6: Wizard shows a nature badge on each upgrade choice

**Files:**
- Modify: `client/src/components/wizards/UnitWizard.tsx` (the `upgradeChoices` renderer)
- Test: `client/src/components/wizards/RigWizard.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `client/src/components/wizards/RigWizard.test.tsx` (uses the existing `advanceToWeapons` helper):

```tsx
test("weapons step badges each upgrade with its nature", async () => {
  const user = userEvent.setup();
  render(
    <UiProvider>
      <GlossaryTipProvider>
        <RigWizard onClose={() => {}} />
      </GlossaryTipProvider>
    </UiProvider>,
  );
  await advanceToWeapons(user);
  // Default prebuilt light-claw-autocannon: Autocannon has a Field (Depleted Core)
  // and a Prototype (Penetrator Rounds); their badges must render.
  expect(screen.getAllByText("Field").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Prototype").length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run client/src/components/wizards/RigWizard.test.tsx`
Expected: FAIL — no "Field"/"Prototype" badge text yet.

- [ ] **Step 3: Render the badge**

In `UnitWizard.tsx`, update the `upgradeChoices` renderer's button to include a nature badge. Replace the `<small>` line inside the button with a badge span + the tag:

```tsx
        <button
          key={u.id}
          type="button"
          className={"rw-upgrade-choice" + (u.id === selected ? " sel" : "")}
          title={u.tag}
          onClick={() => onSelect(u.id)}
        >
          <span>{u.name} <em className={"rw-nature rw-nature-" + u.nature}>{u.nature[0].toUpperCase() + u.nature.slice(1)}</em></span>
          <small>Upgrade · <GlossaryText text={u.tag} /></small>
        </button>
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run client/src/components/wizards/RigWizard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/wizards/UnitWizard.tsx client/src/components/wizards/RigWizard.test.tsx
git commit -m "feat(wizard): badge each weapon upgrade with its nature"
```

---

## Task 7: Wizard disables the second Prototype

**Files:**
- Modify: `client/src/components/wizards/UnitWizard.tsx`
- Test: `client/src/components/wizards/RigWizard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
test("selecting a Prototype on one weapon disables Prototype on the other", async () => {
  const user = userEvent.setup();
  render(
    <UiProvider>
      <GlossaryTipProvider>
        <RigWizard onClose={() => {}} />
      </GlossaryTipProvider>
    </UiProvider>,
  );
  await advanceToWeapons(user);
  // Pick the long-range Prototype (Penetrator Rounds).
  await user.click(screen.getByRole("button", { name: /Penetrator Rounds/ }));
  // The melee Prototype (Breach Grip) button must now be disabled.
  const breach = screen.getByRole("button", { name: /Breach Grip/ });
  expect(breach).toBeDisabled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run client/src/components/wizards/RigWizard.test.tsx`
Expected: FAIL — button not disabled.

- [ ] **Step 3: Implement the lock**

In `UnitWizard.tsx`, import `upgradeNature` and compute whether the *other* slot already holds a Prototype, then pass a `lockPrototype` flag into `upgradeChoices`. Update the helper signature and the button:

```tsx
// import
import { WEAPONS, EQUIPMENT, canAddRigForSide, WEAPON_UPGRADES, RIG_DEFAULTS, HEAT_CAPACITY, UNIT_WEAPONS, PREBUILT_RIGS, upgradeNature } from "/shared/game-state.js";

// helper signature + body
  const upgradeChoices = (
    name: string,
    selected: string | null,
    onSelect: (id: string) => void,
    otherIsPrototype: boolean,
  ) => (
    <div className="rw-upgrade-choices">
      {(WEAPON_UPGRADES[name] || []).map((u) => {
        const locked = u.nature === "prototype" && otherIsPrototype && u.id !== selected;
        return (
          <button
            key={u.id}
            type="button"
            disabled={locked}
            className={"rw-upgrade-choice" + (u.id === selected ? " sel" : "") + (locked ? " locked" : "")}
            title={locked ? "A rig may run at most one Prototype upgrade" : u.tag}
            onClick={() => !locked && onSelect(u.id)}
          >
            <span>{u.name} <em className={"rw-nature rw-nature-" + u.nature}>{u.nature[0].toUpperCase() + u.nature.slice(1)}</em></span>
            <small>Upgrade · <GlossaryText text={u.tag} /></small>
          </button>
        );
      })}
    </div>
  );
```

At the two call sites in the rig Weapons step, pass whether the *other* weapon's current pick is a Prototype:

```tsx
  {upgradeChoices(state.longRange, state.longRangeUpgrade, (id) => patch({ longRangeUpgrade: id }),
    upgradeNature(state.melee, state.meleeUpgrade) === "prototype")}
  ...
  {upgradeChoices(state.melee, state.meleeUpgrade, (id) => patch({ meleeUpgrade: id }),
    upgradeNature(state.longRange, state.longRangeUpgrade) === "prototype")}
```

- [ ] **Step 4: Guard prebuilt re-selection**

`selectPrebuilt` resets both upgrades to `firstUpgradeId(...)`. First upgrades are all `field` nature (verify against Task 2 — the first entry per weapon is Field), so no double-Prototype can arise from a prebuilt switch. Add a one-line comment noting this invariant above `selectPrebuilt`.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run client/src/components/wizards/RigWizard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full client suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/wizards/UnitWizard.tsx client/src/components/wizards/RigWizard.test.tsx
git commit -m "feat(wizard): enforce one Prototype per rig in the commission flow"
```

---

## Task 8: Minimal badge styling

**Files:**
- Modify: the stylesheet that defines `.rw-upgrade-choice` (find with `git grep -n "rw-upgrade-choice" client/src`)

- [ ] **Step 1: Add nature-badge CSS**

Next to the existing `.rw-upgrade-choice` rules, add:

```css
.rw-nature { font-style: normal; font-size: 0.7em; padding: 0 .35em; border-radius: 3px; margin-left: .35em; vertical-align: middle; }
.rw-nature-field { background: #24406b; color: #cfe0ff; }
.rw-nature-tuned { background: #6b4a1f; color: #ffe6bf; }
.rw-nature-prototype { background: #5a2340; color: #ffd0e6; }
.rw-upgrade-choice.locked { opacity: .45; cursor: not-allowed; }
```

- [ ] **Step 2: Verify in the browser**

Run the dev servers (`preview_start` name `oil-iron-server` + `vite-client`), join a room, open the commission wizard, reach the Weapons step. Confirm each upgrade shows a coloured nature badge and that picking a Prototype greys the other weapon's Prototype. Screenshot for the record.

- [ ] **Step 3: Commit**

```bash
git add <stylesheet>
git commit -m "style(wizard): colour the upgrade nature badges"
```

---

## Task 9: Document the nature system in rules.md

**Files:**
- Modify: `rules.md` (Weapon Upgrades section, near line 355 / §on upgrades)

- [ ] **Step 1: Add a nature paragraph**

After the existing "Perks are being reworked" note, add:

```markdown
> **Upgrade natures.** Every weapon now offers **three** upgrades, one of each nature, and you pick **one per weapon**:
> - **Field** — unconditional, always-on, reinforces the weapon's role. The safe default.
> - **Tuned** — conditional: a trigger (target state, timing, positioning) that out-pays Field when set up.
> - **Prototype** — systemic, tracked, high-payoff, and may carry a downside. **A rig may run at most one Prototype.**
```

- [ ] **Step 2: Commit**

```bash
git add rules.md
git commit -m "docs(rules): document the Field/Tuned/Prototype upgrade natures"
```

---

## Self-review checklist (run after implementing)

- **Coverage:** every SPEC Phase-4 requirement has a task — data model (T1–2), one-prototype helper (T3), server enforcement (T4), types (T5), wizard badge (T6) + lock (T7), styling (T8), docs (T9). ✅
- **Placeholders:** new-mechanic upgrades intentionally ship `effect: {}` + `TODO(mechanics)` — that's a scoping boundary, not a plan gap (effects land in the mechanics plan). The `✅`-effect upgrades carry real effects.
- **Type consistency:** `upgradeNature(weapon, id)`, `countPrototypes(weapons, upgrades)`, `nature: "field"|"tuned"|"prototype"` used identically in shared, server, `.d.ts`, and wizard.

## Handoff note

After this plan lands, every rig is fully playable: real Field on both weapons, correct natures, badges, and the one-Prototype rule enforced. The Tuned/Prototype upgrades that show `effect: {}` are inert until the **mechanics plan** ([2026-07-10-upgrade-mechanics.md](2026-07-10-upgrade-mechanics.md)) implements them.
