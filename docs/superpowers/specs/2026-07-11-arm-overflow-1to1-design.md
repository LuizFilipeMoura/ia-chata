# Dead-arm overflow: 3→1, no runaway (§8 Arms)

**Date:** 2026-07-11
**Status:** Approved

## Problem

When a weapon (Arms) part sits at 0 SP — "catastrophic" — every *additional*
hit to it spills **3 SP into the Hull**, and the code re-applies this on **every
future hit forever** (`catastrophicAdditional`, `shared/game-state.js`). Hull SP
is 11–16, so each stray arm hit erases ~20–25% of the Hull, unbounded. A dead
arm becomes a perpetual funnel that kills through the body.

The rules text (`rules.md` §8 Arms row) reads like a one-time second event
("3 damage to Hull; weapon gone for the game"), but the engine turned it into a
per-hit loop. It also contradicts §7's general overflow rule ("a hit on a 0-SP
location — the defender chooses another non-destroyed location to take *that*
damage", i.e. 1:1).

## Decision

Make dead-arm overflow **1:1 and conserved**: an additional hit to a 0-SP Arms
part deals **1 SP to Hull** instead of 3. Repeating is then harmless — it is
identical to having hit the Hull directly, pure damage conservation, no
amplification.

Everything else in the catastrophic chain is unchanged.

## Scope

### Changes

1. **`shared/game-state.js` — `catastrophicAdditional`, weapon branch.**
   The spill to the structural part drops from `3` to `1`:
   ```js
   else if (role === "weapon") {
     if (opts?.noSpill) return;                 // Kneecapper — unchanged
     const [structPart] = partsByRole(kind, "structural");
     if (structPart) applyDamage(room, rig, structPart, 1, opts);  // was 3
   }
   ```

2. **`rules.md` §8 Arms row — "additional damage" cell.**
   - Old: `Same weapon: **3 damage to Hull**; weapon gone for the game.`
   - New: `Same weapon: **1 damage to Hull** (overflow); weapon already gone.`

### Explicitly unchanged

- **First-hit cook-off** (weapon-destroy D12 + `1 Hull + 1 Engine`) stays as-is.
  The complaint was the spill magnitude and the perpetual multiplier, not the
  cook-off.
- **Kneecapper `opts.noSpill`** — limbs-only rake still never spills into the
  hull. Untouched.
- **Other roles' additional-damage clauses** — Hull/Engine → `destroyed`,
  Legs → `immobilised`. These are the §9 kill/immobilise tier, not numeric
  spill; out of scope.
- **§7 defender-choice overflow** stays uncoded. Overflow target remains a flat
  Hull, matching the cook-off target — the minimal, predictable change.

## Behavior after

- Weapon arm hits 0 the first time: weapon destroyed, 1 Hull + 1 Engine cook-off
  (unchanged).
- Each additional hit to the dead arm: 1 SP to Hull. No runaway; equivalent to
  a direct Hull hit.
- Kneecapper rake: weapon dies, zero spill (unchanged).

## Testing

- **New:** additional hit to a 0-SP Arms part deals exactly 1 SP to Hull (not 3),
  and a second additional hit deals 1 more (linear, not compounding).
- **Regression (keep passing):**
  - `applyDamage arms-to-0 destroys a weapon and spills to hull and engine`
    (first-hit cook-off, `game-state.test.js:1293`).
  - `weapon-role zero rolls the weapon-destroy D12 and cooks off 1+1`
    (`game-state.test.js:1313`).
  - `Kneecapper — a rake to 0 arms ... never spills into hull/engine`
    (`game-state.test.js:1397`).
