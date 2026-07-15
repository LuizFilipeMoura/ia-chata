# The Opponent Brain — Design

**Date:** 2026-07-15
**Status:** Approved, not yet planned
**Sub-project:** 2 of 2. Spec 1 is the digital battlefield
(`2026-07-14-digital-battlefield-design.md`), Tasks 1–10 done.

## Problem

The digital battlefield gives the engine positions and lets it derive distance, arc, and
cover. Nothing plays the other side.

The original idea was to have the local Gemma be the opponent. It shouldn't be — at least
not the part that decides.

The opponent's job is geometry: is this shot in range, does that path expose my flank, is
the rear arc reachable this turn, will this action overheat me. That is the weakest thing a
small quantised model does. Gemma 12B Q4 will fire out of range, walk into kill zones, and
explain confidently why it was right. Those aren't bugs you fix; they're bugs you reprompt
at, forever.

Meanwhile the engine is *already* good at exactly this. `sightCorridor` gives cover and LOS.
`arcOf` gives the flank. `findPath` gives reachability within Speed. `availableActions`
gives the legal action menu with heat costs. `computeModifiedAim` and `woundTarget` give
the real to-hit and wound numbers. The hard half is built.

So: **a deterministic scored engine plays the game.** Gemma's actual talent — language — gets
its own spec later, narrating decisions it didn't make.

## Competence target

**A competent sparring partner.** It flanks, uses cover, focuses a wounded rig, manages
heat, and contests objectives it can hold. It loses to a good human and punishes a careless
one. Greedy per activation, with a scoring function that encodes the rules' real incentives.

Not attempted: search ("if I move here, what's their best reply?"). The game has dice,
hidden preparations, and Answer tokens, so a search needs a fast rollout simulator — a
genuinely large project. The design keeps it *possible*: the scorer is exactly the leaf
evaluator a search would need.

## Architecture

**The bot never mutates state.** One pure entry point:

```js
chooseAction(room, rig, weights) -> { verb: "action", attrs: {...} } | null
```

`null` means "end this activation". **Passing is a legitimate move**: `chooseAction` returns
`null` when the best candidate scores **≤ 0**, so a rig whose only options would overheat it
or walk it into a kill zone stands still. A bot that must always act is a bot that hurts
itself.

A small driver loops: `chooseAction` → `applyCommand` → repeat. The bot therefore goes
through the same validation, rejection, and resolution path a human does. It **cannot cheat
and cannot desync**, and every bot turn is a replayable command log.

Deciding one command at a time (rather than planning a whole activation upfront) means it
always scores against **real** post-action state — real heat, real position, real spent
weapon — never its own prediction of them.

### Files

All under `shared/bot/`, all pure, all node-testable:

| file | responsibility |
|---|---|
| `candidates.js` | expand the legal action menu into concrete parameterised candidates |
| `evaluate.js` | analytic expected damage — no dice, no simulation |
| `score.js` | score one candidate; `PRESETS` weight vectors |
| `index.js` | `chooseAction` — generate, score, pick argmax |

Split this way because `score.js` is where the tuning churn lives and `evaluate.js` is where
the maths lives. They change for entirely different reasons.

### Expected damage is closed-form

This is what makes the design tractable, and it is worth stating plainly: the bot scores a
shot with **the same maths that resolves it**.

- `computeModifiedAim(attacker, profile, opts)` gives the to-hit target, so
  `P(hit) = (7 − aim) / 6` per ROF die, floored at `1/6` (a natural 6 always hits).
- `woundTarget(str, toughness)` gives the wound TN on a D10, so `P(wound) = (11 − TN) / 10`.
- Chain across ROF, fold in `strOvermatchD` for Overmatch (§7.5).

No dice, no rollout, no heuristic. The damage term is exact.

## Candidate generation

Start from `availableActions(rig, turn, round)` — it is already the legality gate — and
expand each **enabled** action:

| action | expands to |
|---|---|
| `fire` | × each enemy with LOS, inside the weapon's range band, in the front 90° arc; × `longRange` \| `melee` (melee needs rim gap ≤ 2") |
| `aimed` | × enemy × location (`hull`/`arms`/`legs`/`engine`) |
| `move` / `sprint` | × destination × facing |
| `prepare` | × prep type (Brace / Evasive / Raise Shield) |
| `repair` | × damaged location |
| `disengage`, `douse`, `shutdown`, `reload` | parameterless |

### Destinations — anchors ∪ lattice

Move destinations are **continuous**: a Speed 6 rig has infinitely many legal spots, not a
handful of tiles. So the bot generates a shortlist, filtered to
`findPath(...).length ≤ moveBudget(rig, act)`:

**Anchors** (semantic — each carries a reason string, which the future narration spec gets
for free):
- toward each objective — the nearest point that would *control* it (rim gap ≤ 2")
- into cover from the biggest threat (a spot where `sightCorridor` from it reads 1–2)
- into each enemy's **rear arc**, at a range its weapon actually wants
- into melee reach of each enemy
- out of LOS entirely (retreat)
- stand still, pivot to face the biggest threat (a 0" Move is legal and often right)

**Lattice**: reachable cells sampled every ~1.5". Catches what the anchors didn't think of.

Anchors alone would limit the bot to spots we imagined. A lattice alone would find good
spots but explain nothing. The union gives both.

### Facings

Not 360°. Only the ones that matter — toward each enemy, toward the objective — clamped to
the **±90° pivot cap** a Move allows. Typically 3–5 per destination.

## Scoring

One weighted sum (`score.js`):

```
score = w.vp        × objectiveVpDelta        // does this spot take / hold / contest a marker
      + w.priority  × priorityTargetProgress  // the game's ONLY kill-VP: +2
      + w.damage    × expectedDamageDealt     // analytic, exact
      - w.threat    × expectedDamageTaken     // every enemy's EV against me AT this spot/facing
      - w.heat      × overheatRisk            // P(misfire) given heat vs capacity
      - w.fragile   × exposureOfWeakLocation
```

### Why VP leads

The game is not won by killing things. Objectives score **every Recovery Phase** (2 VP
centre, 1 VP each flank). Priority Elimination is the **only** kill-VP: +2 for killing your
assigned Priority Target, re-rolled each round. Everything else you destroy is worth zero VP
directly — it's worth something *instrumentally* (a dead rig stops contesting markers) and
the `damage` term captures that, but a bot that hunts kills while the human sits on the
centre loses 3 VP a round and never understands why.

### The 1-ply lookahead is the whole ballgame

A Move candidate is scored as `positionValue + bestShotFromThere` — the best `fire`/`aimed`
EV available *after* arriving. Without it, the bot cannot understand why a flank is worth
walking to. With it, "move to the rear arc, then shoot" **emerges from the maths** instead of
being special-cased.

The defensive half is symmetric: `expectedDamageTaken` is computed at the candidate spot
with the candidate facing. That is what makes the bot seek cover and refuse to show its rear.

**Threat assumes static enemies.** `expectedDamageTaken` sums each living enemy's best EV
against the candidate spot **from where that enemy stands right now**, with its current
facing and weapon state. It does NOT model the enemy moving to a better firing position
first. That is a deliberate simplification, and it is the bot's main blind spot: it will
happily stop just outside a Speed-5 rig's current reach, not realising that rig can close
and shoot in one activation. Modelling enemy movement means a second ply and roughly squares
the candidate space. If the bot proves too easy to bait, this is the first thing to revisit —
and the cheap partial fix is to inflate each enemy's threat range by its `moveBudget` rather
than to search.

### The rules' sharp edges score themselves

Because the scorer uses the real combat maths, the game's own incentives need no encoding:

- **Raking Fire** cannot damage a front arc → the scorer routes a machine gun to a flank on
  its own.
- **Rear is +4 STR** → rear shots outscore frontal ones. No "prefer flanking" rule exists.
- **Brace** is −2 on Wound Rolls into the front → `expectedDamageTaken` values it correctly.

This is the main argument for computing EV with the engine's own functions rather than
approximating: every weapon perk and upgrade we already shipped is *already* in the scorer.

### Presets

`PRESETS` are named weight vectors — `aggressive` (damage-heavy), `cagey` (vp + threat-heavy),
`balanced`. The weight vector is both the **difficulty dial and the personality dial**. When
narration arrives, "aggressive Gemma" is a weight vector, not a prompt.

## Driver and wiring

```js
export function runBotActivation(room, rig, options) {
  const weights = PRESETS[sideBotOf(room, rig.owner)] ?? PRESETS.balanced;
  const log = [];
  for (let guard = 0; guard < 12; guard++) {   // never trust a loop over live state
    const cmd = chooseAction(room, rig, weights);
    if (!cmd) break;
    applyCommand(room, cmd, {}, options);
    log.push(cmd);
  }
  applyCommand(room, { verb: "endactivation", attrs: { name: rig.name } }, {}, options);
  return log;
}
```

The guard is deliberate: `chooseAction` reads live state, so a scoring bug that kept
returning a rejected command would spin forever. 12 is more actions than any rig can take.

`room.game.sides[i].bot = "aggressive" | "cagey" | "balanced" | null`, set at lobby time.
Digital rooms only — the bot needs positions. `options.random` threads through, so a whole
game is reproducible from a single seed.

## Testing

This is where the design earns out, and it is why the brain ships before the map — none of
it needs a UI.

- **Unit** — hand-place a board, assert one decision. *"Given an enemy with its back turned
  at 8", the bot takes the rear shot over the frontal one."* Possible only because the bot is
  deterministic.
- **Invariant** — the bot never emits a command `checkCommand` rejects. Fuzz over hundreds of
  seeded boards. If the bot cannot produce an illegal move, the entire class is gone.
- **Bot vs bot** — full games headless. Assert they terminate, VP accrues, nothing desyncs.
  Then run 200 games of `aggressive` vs `cagey` and read the win rate.
- **Regression** — seed + preset ⇒ identical command log. Any scoring change that shifts a
  decision shows up as a diff.

## Out of scope

- **Gemma narration** — spec 3. The engine decides; Gemma describes. A bad sentence is
  cosmetic and can never be an illegal move.
- **Gemma picking among top-N** — deliberately deferred. It buys unpredictability, but it
  destroys the ability to unit-test the opponent. Revisit once the deterministic version
  exists and is tuned.
- **Search beyond 1 ply** — the scorer is the leaf evaluator a future search would need.
- **Reactions** — the bot won't spend Answer tokens or trigger Prepares. Blocked anyway by
  Task 10b of spec 1: three reaction paths (Return Fire, Riposte, Exploit) still take
  client-declared geometry.
- **Deployment choices** — `autoDeploy` already places everyone.

## The main risk

The weights are the difference between "competent" and "twitchy", and no amount of design
gets them right on paper.

**The bot-vs-bot harness is not a nice-to-have.** It is the only instrument that says whether
this works. Without it we are tuning six numbers by vibes.
