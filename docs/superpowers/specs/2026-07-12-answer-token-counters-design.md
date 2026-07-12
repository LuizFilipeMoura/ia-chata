# Design — Answer-token counters & prep rework ("The Answer")

**Date:** 2026-07-12
**Status:** approved, ready for implementation plan

Make **Answer tokens** (§5) a signature second-player mechanic instead of a free reprint of
the Prepare action. Three parts:

1. **Global prep buffs** — Return Fire and Brace gain real agency (applies to *both* the
   Prepare action and Answer tokens). Evasive is untouched.
2. **Answer-exclusive counters** — three new conditional reactions an Answer token may place
   *instead of* a generic prep. Not available from the Prepare action — this is the second
   player's edge for having watched the enemy commit first.
3. **Rules + engine + V2 surfacing.**

## Problem

Today an Answer token places one of the same three preps (Evasive / Return Fire / Brace) the
Prepare action already offers — for free. No unique identity, no read, no decision beyond
"spend it." And two of the three generic preps are weak: Return Fire fires back into the
attacker's *front* arc (worst bonus) even when the attacker shot from your flank, and Brace
is pure passive −2 front Impact with no agency.

## Design spine

Everything keys off the second player's real edge — **acting after the enemy commits** — and
a shared verb: **face your attacker.** The generic preps get positional teeth; the
Answer-exclusive counters are conditional (so each hits harder than a generic prep) and read
*what the enemy just did*.

---

## Part 1 — Global prep buffs (Prepare + Answer)

### Return Fire — free pivot-to-face

Before the counter-shot resolves, the Rig **pivots for free to face its attacker**, then
fires the chosen weapon.

- **Why:** turning to face means the return shot no longer eats the attacker's front arc; if
  the attacker overran past you, your shot hits *their* exposed side/rear (arc bonus is large
  — ranged rear is **+4 STR**, [combat.js:225](../../shared/combat.js) `arcBonus`).
- The free pivot is **not a Move**, so a **pinned/engaged** Rig may still perform it.
- If several enemies attacked this round, faces the one whose attack **triggered the reveal**.

### Brace for Incoming Fire — immovable + retaliate

Keeps the current **−2 Impact on front-arc attacks**, and adds:

- **Immovable.** While braced, the Rig **cannot be pushed, pivoted, or staggered** by any
  weapon perk — Piledriver momentum, cleave-pivot, Kneecapper knockback, any positional
  rider. Damage still applies; only the *movement* rider is negated.
- **Retaliate.** A **melee** attacker that swings at the braced **front** and **fails to
  breach** (deals no damage) eats a **free flat-STR riposte** — reusing the Anvil Boss riposte
  resolver ([combat.js:153](../../shared/combat.js)). The wall hits back.

Distinct from the Answer-exclusive **Riposte** counter: Brace's retaliation is *conditional*
(front arc, must withstand the blow) and *defensive* (paired with immovability); the Riposte
counter is *unconditional* and *aggressive* (see Part 2). Generic wall vs premium punch.

### Evasive Manoeuvre — unchanged

Already has agency: move up to ½ Speed before the attack resolves; the attack can miss
entirely. No change.

---

## Part 2 — Answer-exclusive counters (augment the generic 3)

An Answer token places **either** a generic prep (as today) **or** one of the counters below.
Same cost (1 token, one facedown token, one per Rig, revealed on trigger). These are **not**
selectable from the Prepare action.

| Counter | Trigger | Payoff |
|---|---|---|
| **Riposte** | an enemy makes a **melee** attack against this Rig | after it resolves, this Rig makes **one free melee attack** back at that attacker — no action, no heat |
| **Sidestep the Shooter** | an enemy makes a **ranged** attack against this Rig | **before** it resolves, move up to **½ Speed** (attack fails if this breaks range/LoS, like Evasive) — **and** if the move reaches the shooter, you may **engage it for free** |
| **Exploit Opening** | an **overcommitted** enemy attacks this Rig | **pivot-to-face + free counter-shot** as an **Aimed Shot** (you pick the location) with **no −2 ACC penalty** |

**Counter identities:**

- **Riposte** — the melee counter-punch. Meleeing a Rig sitting on an Answer token is now a
  gamble. Reuses the Anvil riposte resolver, but as a *full* free melee attack (chosen
  weapon, normal resolution), not a forced flat-STR poke.
- **Sidestep the Shooter** — the anti-kiter. Dodge-and-close: slip the shot *and* lock the
  shooter into melee, where next round it's pinned and fires at the −2 engaged-ranged penalty
  (§5). Distinct from generic Evasive, which only dodges.
- **Exploit Opening** — punishes greed. "Overcommitted" is evaluated **at the moment the enemy
  attacks**, and is true if that enemy has **spent its full action budget**
  (`turn.actionsUsed >= turn.actionsMax`) **or** is **overheated** (heat ≥ Heat Capacity).
  You set it facedown betting the enemy pushes hard before swinging at you; it **whiffs if
  they play cautious** (trigger not met → token spent for nothing, like any missed read).

*⚙ TUNING: still 1 Answer token per round; counters cost the same single token as a generic
prep. Exploit's payoff is Aimed + no-penalty (richer than a flat +2 Impact).*

---

## Part 3 — Scope & surfacing

### Rules (`rules.md` §5)

- Add the free pivot-to-face line to **Return Fire**.
- Rewrite **Brace** with immovable + retaliate.
- Add an **Answer counters** subsection under §5 listing the three counters and noting they
  are Answer-exclusive (Prepare offers only the generic three).

### Engine (`shared/`)

- **New prep types:** `riposte`, `sidestep`, `exploit` (alongside existing `evasive`,
  `return`, `brace`, `raise-shield`). Add to `prepName` / `prepEffectLine`
  ([game-state.js:1096](../../shared/game-state.js)) and the reaction reveal path.
- **Return Fire pivot & Exploit pivot:** set the reacting Rig's facing to the attacker before
  resolving the counter-shot; gate it as a non-Move so pinned Rigs qualify.
- **Brace immovable:** guard every positional rider in `combat.js` (Piledriver `piledriverSpend`,
  cleave-pivot, Kneecapper, generic push/pivot) with `target.preparation?.type === "brace"`.
- **Brace retaliate & Riposte:** reuse the Anvil riposte resolution; Brace fires it on a
  no-damage front melee, Riposte fires a full free melee attack on any melee.
- **Sidestep:** reuse the Evasive pre-resolve move path; add the optional free-engage when the
  move reaches the shooter.
- **Exploit trigger:** overcommit check (`actionsUsed >= actionsMax` OR heat ≥ cap) evaluated
  at attack time; on success, resolve as a pivot + Aimed counter-shot with the aim penalty
  suppressed.
- **Answer-only guard:** `eligibleForPrep` / the Answer flow may offer all six types; the
  Prepare action offers only the generic three.

### V2 client

- Reaction picker ([ReactionPicker.tsx](../../client/src/v2/overlays/ReactionPicker.tsx)) —
  surface the three counters when the choice originates from an Answer token; hide them for the
  Prepare action.
- Facedown token + reveal art/copy for the three new prep types (battle-view exposure in
  [battle-view.js](../../shared/battle-view.js), InfoTerm/glossary entries).

### Tests

- `game-state.test.js` — placement/reveal/trigger for each new prep type; Answer-vs-Prepare
  eligibility split; Exploit trigger true/false on the overcommit conditions.
- `combat.test.js` — Brace immovability negates each positional rider; Brace retaliate fires
  only on withstood front melee; Return Fire / Exploit pivot lands the shot in the attacker's
  exposed arc.
- Mirror existing prep tests for structure.

## Open / deferred

- **Bank / escalate** unspent tokens across rounds — considered, cut for now (YAGNI); revisit
  if the single-token cadence still feels flat after counters land.
- **Third-player / >1 token** sources — out of scope; count stays 1/round.
