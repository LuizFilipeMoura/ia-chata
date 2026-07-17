# Post-rework cleanup — the debts the penetration rework left, in one place

**Date:** 2026-07-16
**Status:** proposed, not implemented. **Backlog spec — written for an engineer with no prior context.**
**Follows:** `2026-07-16-penetration-rework-design.md` (SHIPPED). This document collects
everything that plan deferred, filed as a follow-up, or created and could not close in scope.
**Related, do not touch:** `2026-07-15-str-overflow-design.md`, `2026-07-15-weapon-balance-findings.md`
— historical reasoning trail, already SUPERSEDED where relevant.

---

## Read this first: what this document is, and what it is not

The penetration rework compressed rig weapon Penetration to a 3–7 band, deleted Overmatch,
and paid the wasted Penetration back into Damage. It shipped and its falsifier passed
(`penetrator-rounds` −2.77 → −0.63, `ap-shells` −1.47 → +0.72). This document is the **backlog
it left behind** — three filed bugs, three deferred balance questions, and three doc-truth debts.

**It is a menu, not a mandate.** The balance items (§1) are the USER'S calls and are written as
open questions with measured evidence, not decisions — the same discipline the rework used for
the Zebra one-shot. The bug and doc items (§2, §3) are safe to just do.

**The one rule this whole area runs on**, learned fifteen times over on the rework branch —
every implementer there shipped exactly one confidently-written false claim in a diff whose
numbers were all correct:

> **Verifying the artifact is not the same as verifying the sentence describing it.**
> A claim is not narration; prose *feels* like narration, so it skips the verification the
> assertions get. **Execute every claim — including every number in this document — before you
> trust it.** The tells are universals ("only"/"every"/"no"), inferences ("X and Y, *so* Z"),
> and hand-copied duplicates of a source of truth. Both balance harnesses exist and are cheap.

Every number below was measured against the code at HEAD `1a0a7d6` on 2026-07-16. Re-measure
before acting — the catalog may have moved.

---

## 1. Balance — three open questions for the user, all created or exposed by the rework

### F3-A. `UNIT_WEAPONS` is out of band, and the rework made Tank Cannon the best gun in the game

The rework scoped itself to rig weapons (`WEAPONS`) and deliberately left `UNIT_WEAPONS`
untouched. Those weapons have `flatPick: true` and **no `WEAPON_UPGRADES` entries**, so base
Penetration is exactly what fights. Measured at HEAD:

| unit weapon | Pen | Damage | ROF | note |
|---|---|---|---|---|
| **Tank Cannon** | **10** | 5 | 1 | 100% pinned vs every rig location; > every rig gun's floor of 7 |
| **Ram Spike** | 9 | 4 | 1 | 100% pinned vs rigs (T≤5) |
| **Dozer Blade** | 8 | 4 | 1 | 69% pinned |
| **Rocket Pod** | 8 | 3 | 2 | 69% pinned |
| Autocannon Mount | 7 | 2 | 3 | in band |
| Coaxial MG | 4 | 1 | 6 | in band |
| Sidearm | 3 | 1 | 2 | in band |

**The problem the rework created by omission:** now that rig weapons cap at floor Pen 7, a
support unit's Tank Cannon at Pen 10 out-penetrates every rig in the game — a support unit
carrying the single most reliable gun, with no upgrade slot it had to pay from. Before the
rework it merely tied the top of a wide field; now it stands alone above it.

**Open question for the user.** Options, none costed yet — the sweep prices these in ~12 min:
1. **Bring `UNIT_WEAPONS` into the 3–7 band**, the same move the rework made for rig weapons
   (Tank Cannon 10 → 7, Ram Spike 9 → 7, Dozer Blade / Rocket Pod 8 → 7), paying the wasted
   Penetration back into Damage where the identity wants alpha.
2. **Leave it as the support units' identity** — a tank *should* out-gun a rig — and accept
   that "most reliable gun in the game has no upgrade cost" is the price.
3. **Something between** — e.g. Tank Cannon keeps Pen 10 as its whole identity but drops to a
   support-only availability that the parity gate already enforces.

**Do not pick silently.** This is a weapon-identity decision, not a safety patch.

### F3-B. The support-unit one-shot fix bought a 22.7% walker durability buff

Closing the Damage-8 one-shot windows (`c7f0a0e`) raised three vital pools to 8 —
the minimum that makes Damage 8 land exactly on zero rather than one point past it:

| pool | before | after | delta on the pool | delta on unit total SP |
|---|---|---|---|---|
| `tank/engine` | 6 | 8 | +33% | tank 27 → 29 (+7.4%) |
| `walker/hull` | 6 | 8 | +33% | — |
| `walker/engine` | 5 | 8 | +60% | walker 22 → 27 (**+22.7%**) |

**This was forced** — 8 is the floor that closes the window, and there is no room below it to
express fragility — but it is a real balance change, not a no-op. Two textures flattened:

- The walker's engine is now its **joint-largest** SP pool (8, tied with hull) while remaining
  its **softest** location (T3). `unit-kinds.js`'s own comment describes a location as fragile
  "twice over" — soft T *and* small SP. That second axis is gone for the walker engine; its
  fragility now rides entirely on Toughness.
- `tank/hull` (8) now equals `walker/hull` (8), so the tank/walker hull gap is Toughness-only
  (T6 vs T5).

**Open question for the user.** Is the +22.7% acceptable, or should support-unit durability be
re-tuned elsewhere (e.g. lower a non-vital pool to hold total SP roughly constant) now that the
vital pools are pinned at 8? A durability change of this size, if support units were tuned
against the old numbers, has moved their whole balance — worth a deliberate look, not a shrug.

### F3-C. F2-C stays open for two weapons, F2-B stays shelved — status confirmation only

Not a new decision, recorded so the backlog is complete:

- **F2-C.** Crossbow (`ROF × Damage` **4**) and Bulwark Shield (**3**) sit below the 6–8 band
  and are **not pinned** — deliberate low-alpha utility weapons (Precision / pin / shield).
  The rework closed F2-C only for the six heavies. Leaving these two is a decision already
  taken; reopening it is out of scope unless the user wants it.
- **F2-B, the ROF economy.** Shelved and unsolved. `ROF` multiplies both `P(wound)` and Damage,
  so a high-ROF weapon compounds the Damage payback. `2026-07-15-rof-heat-design.md` measured
  taxing ROF in heat as *worse* than nothing (spread 3.0× → 3.9×). The rework did not fix this;
  it only stopped feeding it. **This is the largest open balance problem in the game** and it
  has no proposed solution — flag, not task.

---

## 2. Bugs — three filed, safe to fix directly

Each was spun off as a background task during the rework. Task ids are not durable across app
restarts; re-locate by symptom if the chip is gone.

### F3-D. `rules.md` §17 disagrees with the engine on every unit-weapon row

`rules.md` is a **runtime input**, baked verbatim into the rules bot's system prompt as "the
single source of truth" (`server/config.js` → `server/prompt.js`); the bot is told to refuse
rather than guess. Its §17 unit-weapon table is wrong on **every** row (measured vs `UNIT_WEAPONS`):

| §17 says | engine says |
|---|---|
| Tank Cannon Pen 12 | **pen 10, dmg 5** |
| Autocannon Mount Pen 8 | **pen 7, dmg 2** |
| Coaxial MG Pen 5 | **pen 4, dmg 1** |
| Rocket Pod Pen 10 | **pen 8, dmg 3** |
| Dozer Blade Pen 10 | **pen 8, dmg 4** |
| Ram Spike Pen 11 | **pen 9, dmg 4** |
| Sidearm Pen 4 | **pen 3, dmg 1** |

It also omits the Damage column entirely and uses an obsolete near/far Accuracy shape. This
predates the rework (`UNIT_WEAPONS` was never in its scope) — long-standing rot, not a regression.

**Fix:** correct all seven rows and add the Damage column, **then add a derived guard** to
`shared/rulebook.test.js` following the §12/§13 pattern the rework added — parse §17, diff every
cell against `UNIT_WEAPONS`, mutation-test it (revert a row, confirm red). A hand-copied table
with no guard is exactly what let this rot for months. Note `UNIT_WEAPONS` is `flatPick` with no
upgrades, so base IS the floor — no field-modifier column, unlike §12/§13. Consider stating in
§17 that unit weapons sit **outside** the 3–7 band by design, so the bot need not reconcile the
apparent contradiction with §7. **This is downstream of F3-A** — if the user chooses to reband
`UNIT_WEAPONS`, do that first and §17 follows the new numbers.

### F3-E. The CRIT tone marks only one die when a volley both tears open and kills

`resolveAttack` tracks a single `critWound` variable, assigned on two tiers — "torn open" (a
wound zeroes a location from full) and "gutted" (a point past 0 kills the unit) — and promotes
that die to `tone: "crit"`. It is **last-write-wins**: when one volley does both, only the later
(kill) die is marked, and the die that tore the location open reads `"ok"` while an `effects`
line explicitly narrates that it tore the location open.

Reachable in ordinary play with a **stock catalog loadout and zero fixture pokes**: Claw (ROF 2,
Damage 3) + `rending-talons` (grants Rend → `sp = 4`) against an untouched light rig engine
(`max 4`). Wound 1 zeroes the engine from full (tear-open); wound 2 spends 4 past 0 (kill).
`critWound` is overwritten; the tear-open die shows no CRIT.

Two gutters of the *same* tier cannot stack (once torn open `wasFull` is false; once destroyed
`wasAlive` is false), so tear-open → kill is the only overwrite path.

**This is a design question, not obviously a bug.** The kill is arguably the die that "did it".
But the roll console's stated purpose is that the player sees *which* die did it, and here two
dice each did something the `effects` lines narrate while only one is marked. Options:
1. **Ship as-is**, document the precedence.
2. **Promote every decisive die** — `critWound` becomes a collection; two CRITs on one volley.
3. **Explicit precedence rule** — keep one, but make the choice a tested decision rather than an
   accident of assignment order.

Whichever, **pin it with a test** — the current behaviour is an accident of a `let` being
reassigned, and nothing covers the two-gutter volley. Tests belong in `game-state.test.js`
driving `applyCommand` (the `combat.test.js` `makeCtx` stubs `applyDamage` as a no-op).

### F3-F. Dead "impact die" model comments in two test files

`shared/game-state.test.js:3539` and `shared/combat.test.js:472` carry comments describing an
"impact die / severity / total" combat model the engine **replaced** (it now does the
`clamp(2, 10, 6 + T − effPen)` wound roll; `rules.js` explicitly calls the old one "the
impact-total model this replaces"). `:3539` also states a wrong number — Sword Pen "6" when it
is 5. Both predate the rework and were left alone as out of scope.

**Fix:** rewrite both against the model that exists, verifying every number by execution. Comments
only, no assertion changes. While there, sweep both files for other numeric Penetration claims —
the tell is that the weapon name and the number often sit on **different lines**, so a same-line
grep misses them.

---

## 3. Doc-truth debts — the deeper problem the rework kept hitting

### F3-G. `opponent-brain-design.md` still speaks the pre-rename vocabulary throughout

The stat rename (`STR` → `Penetration`, `D` → `Damage`) and the rework both landed, but
`2026-07-15-opponent-brain-design.md` still uses `STR` / `effStr` in ~9 places, including the
wound-roll signature `woundTarget(effStr, toughness)` — the real signature is `(pen, toughness)`.
Task 11 fixed only the dead `strOvermatchD` reference and the stale F2-B citations; a full rename
pass was out of scope. This doc points **forward** at unbuilt work (the local-Gemma opponent), so
whoever implements the bot will read a signature that does not exist.

**Fix:** a mechanical rename pass over that one doc — but mechanical is dangerous here (a partial
rename is worse than none, and `STR` appears in prose where it may mean something else). Do it as
its own reviewed change, not folded into anything.

### F3-H. `docs/` is unguarded — nothing binds a spec's claims to the code

**This is the root cause of the entire rework's dominant defect.** Every false claim that session
started in a document: the spec's "exactly one chassis" (three windows), its "ROF ≤ 3" rationale
(Autocannon is ROF 4), the plan's "same floor they had" (they dropped 9 → 7 and 8 → 6). `rules.md`
is now test-bound (§12/§13/§17 guards) and the glossary is guarded, but the specs and plans under
`docs/` are pure prose with no test — the exact substrate the defect lives in.

**Proposed fix, and it is a real one, not a comment:** extend the derived-guard pattern to specs.
A spec that states a number the code owns (a weapon's floor, a chassis's engine SP, a pinned-%)
can carry that number in a machine-readable block that a test diffs against the engine — the same
move `rulebook.test.js` makes for `rules.md`. Not every claim is bindable (prose reasoning is not),
but the *numeric* claims are, and those are the ones that went false.

**Open question for the user:** is this worth building? It is a larger fix than the rest of this
document combined, and it changes how specs are written (numbers move into a guarded block). The
alternative is discipline — "execute every claim" — which this session proved humans and agents
both fail at at a rate of one-per-diff. The guard is the structural answer; the discipline is the
cheap one. **The user should decide whether the game's design docs are worth binding to the code,
or whether that is over-engineering a reasoning trail nobody runs.**

---

## Suggested order

1. **F3-D** (§17 + guard) and **F3-F** (dead comments) — safe, mechanical, no decision needed.
2. **F3-A** (UNIT_WEAPONS band) — the user's call; blocks F3-D's final numbers if rebanded.
3. **F3-B** (walker durability) — the user's call; independent of the rest.
4. **F3-E** (CRIT precedence) — small, one design pick.
5. **F3-G** (opponent-brain rename) — its own reviewed pass.
6. **F3-H** (spec guards) — the big one; only if the user wants specs bound to code.

## Out of scope

- Re-opening F2-C (Crossbow, Bulwark Shield) — a taken decision.
- Solving F2-B (the ROF economy) — unsolved and unowned; needs its own spec.
- The rework itself — SHIPPED, measured, do not re-litigate.
