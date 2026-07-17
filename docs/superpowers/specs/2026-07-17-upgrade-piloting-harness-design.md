# Spec — Upgrade-Piloting Harness (Sub-project A)

**Status: design, not built.** First of two sub-projects. A ships a measurement tool;
[sub-project B](#relationship-to-b-the-rebalance) (the risk power-band rebalance) consumes it and stays a stub until A lands.

## Why this exists

The goal that started this work: **risky upgrade tiers should out-reward the safe one.**
Today the safe **Field** tier is the strongest pick because the guaranteed value beats a
**Prototype** whose catch (heat / cooldown / charge-up / doubled overheat) nets it *below*
the floor. We want to buff the risky tiers (Tuned, Prototype) so eating the catch pays off —
Field stays where it is, power creeps up.

Proving the buff worked requires a re-runnable gate: *the Prototype pick beats the Field pick,
net of catch, in the harness.* The existing duel harness cannot supply that gate for most of
the risky roster:

- **Decision-piloted upgrades read artificially low.** `scripts/balance/policy.mjs`
  (`greedySafe`) "MAKES NO CHOICES — never moves, targets, prepares, locks, or triggers an
  active." So Fire Control Lock, Enfilade, Barrage, Fire Solution Lock and every spatial
  effect read `0.00` = **unmeasured, not weak**. Retuning them up to beat a fake floor would
  massively over-buff them.
- **Equipment upgrades have zero coverage.** `scripts/balance/duel-sim.mjs` iterates
  `WEAPONS.longRange × WEAPON_UPGRADES` only. All 8 equipment modules — Ablative Cascade,
  Cryo Reservoir, Reactor Overdrive, etc. — are never swapped in, so half the "both catalogs"
  scope can't hit the gate at all.

The bot (`shared/bot/`) was the intended "step 2" for this, but its `candidatesFor` enumerates
`fire/aimed/prepare/repair/reload/move` and does **not** reach the exotic active/prototype
triggers either; its presets are untuned; it runs ~4s/game. Adopting it would also confound the
measurement with the scorer's preferences (it answers "who wins a game," not "is this tier worth
more than Field for this weapon"). **Rejected** — see [Alternatives](#alternatives-considered).

## Goal

Extend the duel harness so every decision-piloted weapon upgrade **and** every equipment upgrade
is measured at its **piloted benefit**, producing a re-runnable per-tier report where
`benefit(Prototype) ≥ benefit(Field)` is an honest comparison. That report is the acceptance gate
for sub-project B.

### Non-goals

- No rebalance here. A changes **no** upgrade numbers — that is B, gated on this tool.
- No general game-playing AI. Hooks pilot *one upgrade's mechanic*, not "play well."
- No new balance verdict is asserted from A alone; A makes the measurement possible, B reads it.

## Architecture

Three additions to the existing duel harness, all in `scripts/balance/`. The engine
(`shared/game-state.js`, `shared/combat.js`) is **not** touched — the harness borrows the real
command path exactly as `duel-sim.mjs` already does.

### 1. Hook layer over `greedySafe`

`greedySafe` stays the floor: fire / reload / vent, unchanged and unbiased across weapons. On top
of it sits a **piloting-hook registry** keyed by upgrade id:

```
hook(room, rig, enemy, { intensity }) => command | null
```

A hook returns the *activating* command when its trigger is ripe (an Aimed shot for Enfilade, the
paint action for Fire Control Lock, `harden`/charge-spend for Ablative Cascade), else `null` →
fall through to `greedySafe`. The driver consults the hook for the upgrade under test **before**
`greedySafe`; a `null` means "nothing to pilot this instant," not "pass."

Only **decision-dependent** upgrades get a hook. Passive / cadence / DoT tiers (Cold Bore, Redline
Governor, Penetrator Rounds, Napalm, Suppression Lock…) already register through plain repeated
firing and keep measuring exactly as they do now — no hook, no behavior change, no calibration
drift. The hook set is therefore bounded and enumerable: the ~10–15 upgrades the harness's own
`KNOWN_BIASES` and the duel-harness notes flag as reading `0.00` for lack of a decision.

Each hook is **upgrade-specific and biased toward activation on purpose** — that bias *is* the
measurement (benefit under competent piloting, not the floor). Every hook's activation predicate is
documented in an exported `PILOTING_BIASES` string, mirroring `policy.mjs`'s `KNOWN_BIASES`, so the
report prints the assumptions next to the numbers they qualify. A caveat the report re-types is a
caveat that drifts from the numbers.

### 2. Equipment-upgrade axis

`runDuel` gains `{ equipmentA, equipmentUpgradeA }`. When present they are stamped onto A1
(`a1.equipment` / `a1.equipmentUpgrade` — the same fields `makeRig` sets) and asserted with the
existing "is the tier we asked for the tier we got" check, extended to equipment via
`equipmentUpgradeNature`. As with `upgradeA`, a `null` upgrade id must throw, never silently resolve
to the Field tier (`firstEquipmentUpgradeId` is the equipment analogue of the weapon-tier trap).

Defensive / heat / repair prototypes don't show in A1's `spDealt`, so the equipment axis measures a
richer signal per module family:

- **Defensive** (Armor, Countermeasures — Ablative Cascade, angled/chaff/point-defense tiers):
  A1's `spTaken` and survival. The control must reliably attack A1, so the equipment axis runs the
  control with a fixed, known-hitting offensive profile (a documented constant, like today's
  `CHASSIS_B`), and A1 keeps firing back so heat and action-budget pressure are real.
- **Heat / cooling** (Cooling, Thermal, Power — Cryo Reservoir, Reactor Overdrive, Meltdown
  Protocol): A1's **firing uptime** — shots landed without being forced to vent — surfaced as
  `spDealt` against the fixed control. Heat prototypes buy more trigger-pulls; measure the pulls.
- **Repair / utility** (Utility — Nanite Swarm, Battlefield Triage): A1's **net SP** over the duel
  (damage repaired vs taken), reported as survival + `spTaken` net of heals.

The equipment axis is a second sweep loop in the CLI (`EQUIPMENT × EQUIPMENT_UPGRADES`), reusing
`runDuel`, `mulberry32` seed-pairing, and the censoring modes unchanged.

### 3. Dual-intensity measurement

Every hook carries **two predicates**, selected by the `intensity` argument:

- **`ceiling`** — activate whenever the mechanic is legal. Best-case piloting; the upper bound of
  what the upgrade can do.
- **`conservative`** — activate only under a documented "a competent player would bother here"
  predicate (paint only vs a stationary, in-band target; spend a charge only when an incoming hit is
  likely; hold still to charge only when already in the sweet-spot band). The realistic floor of
  competent play.

Each cell is run at **both** intensities (same seed streams, so the two are paired). The report
prints `benefit_conservative` and `benefit_ceiling` per tier. The spread between them **is the
skill-reward of the risky pick** — the risk×reward slider made numeric. Sub-project B targets the
band: `benefit_conservative(Prototype) ≥ benefit(Field)` is the hard floor it must clear, while
`benefit_ceiling` shows the reward for piloting it well.

Passive tiers have no hook, so their two intensities are identical by construction (both fall
straight through to `greedySafe`) — the report collapses them to one column.

## Components

| File | Change |
|---|---|
| `scripts/balance/piloting.mjs` | **New.** The hook registry: `PILOTING_HOOKS[upgradeId]`, each `{ ceiling, conservative }`; `PILOTING_BIASES` string; `pilotFor(upgradeId)` returning the hook or a no-op. |
| `scripts/balance/duel-sim.mjs` | `runDuel` accepts `{ equipmentA, equipmentUpgradeA, intensity }`; stamps + asserts equipment tier; consults `pilotFor(upgradeA ‖ equipmentUpgradeA)` before `greedySafe` in the decision branch; second CLI loop over the equipment axis. |
| `scripts/balance/policy.mjs` | Unchanged in behavior. `greedySafe` remains the floor the hooks fall through to. |
| `scripts/balance/duel-report.mjs` | Add `benefit_conservative` / `benefit_ceiling` columns; print `PILOTING_BIASES` alongside `KNOWN_BIASES`; group weapon vs equipment axes. |
| `scripts/balance/piloting.test.mjs` | **New.** Structural tests (below). |

Data flow is unchanged from today: CLI builds cells → `runDuel` drives `applyCommand` for
`MAX_ROUNDS` → records SP deltas / survival → report aggregates seed-paired means. The hook layer
and equipment axis are the only new inputs; the loop, censoring, and determinism are borrowed intact.

## Testing — structural only, never value-pinned

Per the standing rule (numbers are retuned constantly; tests assert **ordering and firing**, never
magnitudes):

1. **Each hook fires.** For every registered `upgradeId`, a duel with that upgrade equipped issues
   the hook's activating command at least once and the mechanic's state changes (charge spent,
   lock set, aimed cadence advanced). Asserts *measurable, not `0.00`* — the whole point — without
   asserting how much.
2. **Conservative ⊆ ceiling.** Any instant the conservative predicate fires, the ceiling predicate
   also fires (conservative is a strict subset). A hook that violates this is misdocumented.
3. **Equipment axis completes.** A duel with an equipment Prototype runs to `MAX_ROUNDS` (or a
   wreck) and the module's effect registered (e.g. ablative charges spent > 0).
4. **No calibration drift.** Passive-tier cells (no hook) produce identical results with the hook
   layer present vs a `greedySafe`-only run — the hook layer changes only piloted upgrades.
5. **Determinism preserved.** Same seed → identical duel at each intensity.
6. **Tier-assertion still bites.** A `null` equipment upgrade id throws; a mismatched stamped tier
   throws — the equipment analogue of the existing weapon-tier guard.

The gate itself (`benefit(Prototype) ≥ benefit(Field)`) is **not** a unit test — it is a report the
tuner re-runs. Baking a magnitude into CI would pin exactly the values B exists to move.

## Risks & caveats

- **Piloting bias is a value judgment, and that's the design.** Conservative predicates encode "when
  a competent player bothers." A wrong predicate mis-measures an upgrade. Mitigation: every predicate
  is one documented line in `PILOTING_BIASES`, printed with the numbers; the dual report exposes the
  ceiling so an over-tight conservative predicate is visible as an unusually wide spread.
- **Comment/claim drift — the known trap.** On the last rework, *every* implementer shipped a false
  code comment atop correct numbers. A hook's doc-line claiming a predicate the code doesn't run is
  this exact failure and is invisible to a passing test. Reviewer rule: **read each hook's predicate
  against its `PILOTING_BIASES` line**, not the gist.
- **Spatial / zone prototypes need a placement input.** Barrage, Tow Chain, Piledriver shove, Momentum
  Swing knockback resolve on the board via a narrated instruction; the engine tracks only the sim side.
  The harness can pilot the engine side (issue the lock, run the countdown) but the board payoff (SP to
  whoever is in the zone) needs the control to *be* there. The fixed-distance duel makes control
  position a **measurement input**: run zone effects as an explicit `inZone` / `outOfZone` pair rather
  than pretending a single number captures them. Flagged per-hook, not averaged away.
- **`enfilade` and any LOS-behind effect** still need a third body in line — the seed roster's
  bystanders can serve as the "rig behind the target," but the geometry must be set deliberately, not
  inherited from the weapon sweep's defaults.
- **Perf.** Hooks are cheap; the equipment axis roughly doubles cell count and dual-intensity doubles
  it again (~4× today's ~4-min, 500-trial run). Acceptable and re-runnable; not the ~4s/game bot.

## Alternatives considered

- **Adopt the opponent bot as the duel policy.** Confounds the measurement with the scorer's
  preferences, is untuned, ~4s/game, and *still* needs the candidate work to reach the actives.
  Answers "who wins a game," not B's per-tier question. Rejected.
- **Scripted per-upgrade duels.** 15 bespoke drivers drift from the engine and from each other, with
  no shared floor — the exact trap the duel harness was built to kill. Rejected.

## Relationship to B (the rebalance)

B is brainstormed separately once A lands. Sketch, so the seam is clear:

- Codify Field / Tuned / Prototype target power bands.
- Retune all ~48 risky entries (both catalogs) to hit their band — the only place numbers change.
- Validate against A's gate: `benefit_conservative(risky tier) ≥ benefit(Field)`, seed-paired, with
  `benefit_ceiling` showing the skill-reward spread.
- Tests assert **ordering** (risky ≥ field), never magnitudes.

A is done when the gate is real and honest for every entry B will touch; B is done when every entry
clears it.

## Deferred to a follow-up (harness-blind tiers)

Recorded here so B does not read a `0.00` or a missing row as "weak" — these tiers are unmeasured,
not measured-and-bad.

1. **Spatial / narrated payoffs** — Barrage (zone), Tow Chain (fling), Piledriver shove, Momentum
   Swing knockback. Their board effect needs the control to be placed in or out of the effect, so
   they need an explicit `inZone` / `outOfZone` measurement-input pair rather than a single number
   (see [Risks & caveats](#risks--caveats) above, where this was already flagged going in). Not
   piloted this pass.

2. **`meltdown-protocol` (Thermal prototype)** — banking requires being strictly OVER Heat Capacity
   (`shared/game-state.js` ~2189-2195: `if (m.over > 0) { ... meltdownProtocol ... }`). `greedySafe`
   deliberately fires under cap, and — per `policy.mjs`'s own `KNOWN_BIASES` — only overshoots cap
   RARELY, by unlucky weapon-heat dice. It does *not* never bank; it can and does bank occasionally
   by luck. There is simply no command that DELIBERATELY redlines to bank a charge, so it cannot be
   reliably piloted in the current duel without a harness change that forces overheat. Deferred.

3. **Melee weapon upgrades are entirely unmeasured by the current sweep.** The Task 8 sweep iterates
   `WEAPONS.longRange` only, and `runDuel`'s axes are longRange `weaponA`/`upgradeA` plus
   `equipmentA`/`equipmentUpgradeA` — there is no `meleeUpgradeA` axis. So every melee weapon upgrade
   (`emplacement`, plus Redline Governor, Dismember, Skewer, Superconductor Edge, Bloodletter, etc.)
   is not in any report cell. `emplacement`'s hook IS implemented and unit-tested against a real rig
   (`scripts/balance/piloting.test.mjs`, direct hook-level check via `makeRig`, not a `runDuel` round
   trip — see the comment at line ~128 there), but it is registered-but-inert until a `meleeUpgradeA`
   axis and a melee sweep loop are added to `duel-sim.mjs`. That axis is the follow-up.

4. **Passive / auto-reactive (no hook by design — these are classifications, not gaps):**
   `ablative-cascade` and `point-defense-system` auto-spend on being hit (`shared/combat.js`);
   `fire-solution-lock` accrues on Fire and resets on Move (`shared/game-state.js`) and `greedySafe`
   never moves. These measure through the equipment axis / plain repeated firing without a hook,
   exactly like the other passive tiers described in [Architecture](#1-hook-layer-over-greedysafe).

**For sub-project B:** treat (1)-(3) as harness-blind. Tune them on rubric + feel, flagged as such
in whatever B produces, until the follow-up axis/inputs above land — do not use their absence from
A's report as evidence they are weak.
