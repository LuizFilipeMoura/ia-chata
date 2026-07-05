# Activation, Recovery & Combat Resolution — Design

Date: 2026-07-05

## Goal

Turn the tracker from a manual state editor into a driven game loop. After the
battle starts (see the Ready/Bounty design), the app runs the rulebook round
structure (§4): Initiative → Activation → Recovery, over 5 rounds. Players
alternate activating one Rig at a time via an explicit **End Activation** button.
During an activation the app lists the legal actions with their action-budget
cost, adds each action's heat automatically, and fully resolves dice-driven
outcomes — attacks (§7), overheat checks (§6), catastrophic cascades (§8),
destruction (§9), repairs — either by rolling server-side (with on-screen dice
animation) or by taking manually entered dice, chosen by a pre-start toggle.
Every value-changing modifier is made obvious in the UI.

## Core principle: server resolves, client animates

All rules logic and randomness live server-side in `shared/game-state.js`,
alongside the existing `applyCommand`. This preserves a single source of truth,
keeps both players' screens in agreement through the existing poll/command flow,
and keeps everything unit-testable with an injectable `random` (the pattern
`maybeStartGame` already uses via `options.random`).

The client never decides an outcome. It:

- collects the physical facts the app cannot see (target, arc, cover, range
  band, fire-mode, which Rigs are within a blast),
- **auto mode:** posts those facts, the server rolls, returns the dice values,
  and the client animates dice landing on the values it was handed,
- **manual mode:** the app prompts the player to roll real dice and type the
  results; it posts those values and the server runs the same rules engine on
  them (counts hits, looks up tables, applies damage).

Every resolution is recorded as an entry in a capped `game.resolutions` log in
shared state, so the opponent sees the same dice and effect dialog on their next
poll — not only the acting player.

## State model

### `game` additions

| Field | Type | Meaning |
|---|---|---|
| `autoResolve` | boolean (default `true`) | Dice mode. Togglable pre-start; **locked once `started`**. |
| `phase` | `"setup"\|"initiative"\|"activation"\|"recovery"\|"finished"` | Current round phase. `setup` until start. |
| `round` | number `1..5` | Current round (existing `round` reused). |
| `deployOrder` | `[sideId, sideId]` | Capture of Ready order; `[0]` is the first-deployer. |
| `initiative` | `{ rolls:{a,b}, order:[first,second], second }` | Per-round initiative result. |
| `answerTokens` | `{ a:number, b:number }` | Free-preparation tokens for the second activator. |
| `turn` | `{ side, activeRigId, actionsUsed, actionsMax }` | Live activation state. |
| `resolutions` | array (capped, e.g. last 12) | Dice/effect log entries (see below). |

A resolution entry:

```js
{
  id,            // monotonic, client tracks lastSeen
  kind,          // "initiative" | "attack" | "overheat" | "repair" |
                 // "arms-crit" | "destruction" | "ram"
  actor,         // side id that triggered it
  rigId,         // primary Rig involved (may be null)
  rolls: [ { sides, value, label } ],  // each die, for animation
  summary,       // human-readable one-liner
  effects: [ ... ]                     // structured applied effects, for UI
}
```

### `rig` additions

| Field | Type | Meaning |
|---|---|---|
| `activated` | boolean | Has activated this round. Reset each Recovery. |
| `skipNextActivation` | boolean | Engine-0 penalty; consumed (and cleared) when its turn to activate comes. |
| `noCool` | boolean | Engine Failure / Catastrophic Failure — heat can never decrease again. |
| `speedHalvedNextRound` | boolean | Hydraulic Blowout / Shock; shown as a chip, cleared at Recovery. |
| `aimPenalty` | number | Accumulated Aim penalty (Hull-0 −1). Derived where possible, but surfaced. |
| `loaded` | `{ longRange:bool, melee:bool }` | Reload tracking; all true at activation start. |
| `preparation` | `{ type, source } \| null` | Facedown reaction (Evasive/Return Fire/Brace). |
| `weaponsDestroyed` | string[] | Weapons lost to Arms crits. |
| `immobilised` | boolean | Legs additional-damage clause. |

Existing `engine.heat` floor logic (`engineHeatFloor`, `recompute`) is reused;
`noCool` extends it by blocking the Recovery cooldown.

## Round loop & phases

### Initiative phase

- **Round 1:** no roll. `deployOrder[0]` (the first side to click Ready)
  activates **second** and receives 2 Answer tokens; the other side activates
  first. `turn.side` = first activator.
- **Rounds 2+:** each side rolls 1 D12 (auto animated / manual entry), reroll
  ties. Higher activates first; the second activator receives 2 Answer tokens.
- Logs an `initiative` resolution. Transitions `phase` to `activation`.

### Activation phase

- The active side picks one of its **un-activated, non-destroyed** Rigs →
  `activate`. `actionsMax` = 5 − (Hull at 0 SP ? 2 : 0). `actionsUsed` = 0.
  `loaded` reset to all-true.
- The Rig takes actions (see below). **End Activation** runs the overheat check
  for that Rig, marks it `activated`, then hands off:
  - if the other side has un-activated live Rigs → `turn.side` flips to it;
  - else the same side continues back-to-back (§4).
  - Rigs flagged `skipNextActivation` are auto-marked `activated` and skipped
    when their side would pick them (flag cleared, logged), never consuming a
    real activation.
- When every eligible Rig on both sides is `activated`, **Recovery fires
  automatically**.

### Recovery phase (auto)

In rulebook order (§4):

1. Each Rig reduces heat by 2 unless `noCool` (respecting the engine-0 floor).
2. Clear `activated`, `speedHalvedNextRound`, and expiring per-round flags.
3. Remove unspent preparations and Answer tokens.
4. **VP prompt:** each side is asked which markers it controls — centre (2 VP),
   each empty-corner marker (1 VP) — and the totals are added to `side.vp`
   (§11). A side may report none.
5. `round++`; return to Initiative.

After the Round 5 Recovery, `phase = "finished"`: compare VP; a tie triggers one
sudden-death round; still tied → draw.

### Annihilation

Checked after any damage application: if a side has zero live Rigs, the opponent
wins immediately → `phase = "finished"` (§11).

## Actions, budget & auto-heat

While a Rig is active, the UI lists the legal actions with heat cost and shows
**actions-left = actionsMax − actionsUsed**. Selecting an action immediately adds
its heat and spends a slot.

| Action | Heat | Resolution |
|---|:--:|---|
| Move / **Sprint** | 1 / **2** | Movement style (forward/backpedal/side-step/pivot) is positional and player-declared; Sprint is the heat-relevant choice. |
| Fire Weapon | 1 (**2** if Hot) + fire-mode | Pick weapon. A ranged weapon must be **Reloaded** before firing again in the same activation (`loaded`). Melee never reloads. Opens the attack wizard (§7). |
| Aimed Shot | 1 | Choose location; −2 ACC unless the weapon has Precision. |
| Ram | 1 | Both Rigs take one D6 + ram-STR hit; resolved for each. |
| Reload | 0 | Reloads all weapons. |
| Repair | 0 | Roll D12: 7+ repair 1 SP, 10+ repair 2 SP, at a chosen location. |
| Shut Down | 0 | Only if `actionsUsed === 0`; forfeits the activation, heat → 0. |
| Prepare | 1 | Place one facedown preparation (one per Rig). |

Fire-mode perks — Full Auto (+2 ROF), Charged Shot (+2 STR), Hot-push — add 1
heat per attack die that rolls a 1, applied after the attack resolves.

## Overheat auto-resolution (End Activation)

On End Activation, if `heat > capacity`, the server rolls
**D12 + min(10, 2 × (heat − capacity))** and consults the Heat Threshold Table
(§6). All seven bands are enforced:

| Result | Effect (all applied automatically) |
|:--:|---|
| 1–5 | Nothing. |
| 6–7 | System Stall — 1 damage to Engine. |
| 8–9 | Ammunition Detonation — 2 damage to Arms. |
| 10–11 | Hydraulic Blowout — 2 damage to Legs; `speedHalvedNextRound`. |
| 12–13 | Structural Buckling — 1 damage to each of Hull/Engine/Arms/Legs. |
| 14–16 | Engine Failure — 2 damage to Engine; `noCool = true`. |
| 17+ | Catastrophic Failure — all components to 0 SP (§8); `noCool = true`. |

Damage flows through the cascade pipeline below. Logs an `overheat` resolution;
client animates the D12 and shows the effect dialog.

## Catastrophic cascade (§8) & destruction (§9)

Damage is applied through a **cascade pipeline** because a location reaching 0 SP
can damage other locations. When a component first reaches 0 SP:

- **Legs:** move −3", pivots cost double, no backpedal (positional — shown as a
  chip). Additional damage → `immobilised`.
- **Hull:** −2 to `actionsMax`, −1 Aim (both enforced). Additional damage →
  total system failure (destroyed).
- **Arms:** roll D12 for which weapon is destroyed (Light/Medium: 1–6 left /
  7–12 right), add the weapon to `weaponsDestroyed`, and apply 1 damage to Hull
  and 1 to Engine (which may cascade). Additional damage → 3 damage to Hull,
  weapon gone for good.
- **Engine:** `skipNextActivation = true`; heat floor 3 (existing). Additional
  damage → total system failure (destroyed).

On destruction, roll 1 D12 → on 4+ the wreck erupts: every Rig within 12" takes a
D6 + STR 10 hit (the player marks which Rigs are within 12"; each affected Rig
rolls its own location/impact). Each sub-roll is logged and animated.

## Full attack resolution (§7)

A client **attack wizard** always gathers the facts the app cannot see, then the
server resolves and logs each step:

Wizard inputs: target Rig, arc (front/side/rear), range band (near/far/out —
out → the attack fails), cover (none / ≤25% −1 ACC / ≤50% −2 ACC), fire-mode
(Full Auto / Charged / Hot-push / Aimed location).

Server resolution:

1. Modified Aim = base Aim (4+) + weapon ACC (near/far) + cover + Aimed penalty
   (−2, waived by Precision) + Hull-0 (−1).
2. Roll ROF D6 (+ fire-mode ROF). Count hits: die ≥ modified Aim; a natural 6
   always hits. Full Auto / Charged dice showing 1 accrue heat.
3. Location: Aimed → chosen; otherwise defender rolls 1 D12 (§7 table).
4. For each hit: D6 + weight-adjusted STR (Light −2 / Medium +0, §12) + arc
   bonus. Ranged arc = +0 front / +2 side / +4 rear; **Raking Fire** overrides
   (front auto-fails, side +4, rear +8); melee gets no arc bonus. Add AP (+D3
   per impact roll of 6) and Rend (+D3 per 5–6). Compare to the target class's
   Impact Table row → Direct −1 / Severe −2 / Critical −3 / nothing.
5. Apply damage via the cascade pipeline, then perks: Incendiary (+1 target
   heat), Shock (`speedHalvedNextRound`), Cleave (extra target within 1.5"),
   Impale (D12 8+ immobilise), Staggering (D6 push/pivot — positional, shown as
   a reminder).

Damage overflow (a hit on a 0-SP location) and the Evasive preparation are
defender/positional choices. In **auto** mode they resolve with a documented
default — overflow moves to the defender's highest-SP live location — surfaced in
the dialog. In manual mode the acting player is prompted to record the
defender's choice.

## Answer tokens & preparations

The second activator receives 2 Answer tokens each round. A Prepare action or an
Answer token places a facedown `preparation` (Evasive Manoeuvre / Return Fire /
Brace for Incoming Fire), one per Rig. Mechanical effects are enforced during
resolution — **Brace** applies −2 to front-arc impact rolls; **Return Fire** and
**Evasive** surface as prompts when the enemy attacks. Unspent tokens and
preparations are cleared in Recovery.

## Dice mode toggle & animation UI

- A pre-start **Dice: Auto / Manual** toggle sits in the battle-setup section,
  visible to both players and locked once the battle starts. Either side may set
  it before start; the value is a room setting.
- A reusable roll-dialog overlay: dice tumble then land on their values (auto),
  or present input fields (manual), alongside a breakdown — each die, every
  modifier with its source, the outcome, and the effect text. It is driven off
  new entries in `game.resolutions`, so both players see it.

## Modifier visibility (explicit requirement)

Every active value-changing modifier is shown **on the Rig it applies to** — as
header chips and inline tags next to the affected stat:

- `Hull 0 · −2 actions −1 Aim`
- `Legs 0 · −3" move` / `Immobilised`
- `Engine 0 · skips next · heat ≥ 3`
- `No cooling`
- `Speed halved`
- `Braced` / `Evasive ready` / `Return fire ready`
- `Weapon destroyed: <name>`

During resolution, every Aim / STR / heat / action delta shows its source inline
so it is always clear *why* a number changed. The action budget renders as
`actions left N/M` with the reason when M is reduced.

## Commands added to `applyCommand`

All thread the injectable `random`, bump `room.version` only on change, and are
mirrored as `[[GAME ...]]` tags so Gemma can narrate them. Manual-mode commands
carry a `dice` payload the server validates and consumes instead of rolling.

| Verb | Purpose |
|---|---|
| `setdice` | Set `autoResolve` (pre-start only). |
| `initiative` | Resolve the round's initiative (auto or manual dice). |
| `activate` | Begin a Rig's activation. |
| `action` | Perform an action (`action` attr + per-action fields + optional `dice`). |
| `endactivation` | Run the overheat check, mark activated, hand off / trigger Recovery. |
| `recovery` | Cooldown + reset + token clear (auto-invoked; explicit for tests). |
| `vp` | Record a side's controlled-objective VP during Recovery. |
| `answer` | Spend an Answer token to place a preparation. |

## Assumptions (confirmed)

1. **Round-1 initiative** uses the Ready order as a deployment proxy: the first
   side to click Ready is the first-deployer and therefore activates second in
   Round 1 (and gets Answer tokens).
2. **0-SP overflow and Evasive** in auto mode resolve with a default (overflow →
   defender's highest-SP live location) rather than pausing for the off-device
   opponent.
3. **5 rounds** (rulebook default; matches the existing `/5` display).
4. **Arc / range / cover are always asked** by the attack wizard each attack,
   since the app cannot see the table.

## Testing

- Heavy `shared/game-state.test.js` with injected RNG and manual-dice payloads:
  initiative and alternation (including back-to-back and `skipNextActivation`),
  action heat and budget (Hull-0 reduction), all seven overheat bands,
  catastrophic cascades (Arms weapon roll + Hull/Engine spill, Structural
  Buckling, Catastrophic Failure), destruction explosion and annihilation,
  recovery cooldown / reset / `noCool`, Answer tokens and preparations, VP
  scoring, and attack resolution (hit counting vs modified Aim incl. natural 6,
  location table, every Impact Table row per class, arc bonuses, Raking Fire,
  AP/Rend, Incendiary/Shock/Cleave/Impale).
- Client DOM/static tests: action menu and budget rendering, modifier chips,
  the dice-mode toggle lock, and the roll-dialog overlay.
- Full `npm test` must pass before completion.
