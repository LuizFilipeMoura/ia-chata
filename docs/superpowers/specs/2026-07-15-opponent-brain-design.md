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

### v1 scores HITS, not damage — the damage half is deferred

The full formula, validated by the balance sweep, is
`expectedDamage = ROF × P(hit) × P(wound) × D`.

**v1 uses only the left half:**

```
expectedHits = ROF × P(hit)
```

**Why.** The damage calculations keep moving. Everything on the right of `P(hit)` —
Penetration, wound TN, `Damage` — has been retuned twice since this was written: Overmatch
shipped (2026-07-15), then the **penetration rework** deleted it and compressed the
Penetration band to 3–7 (`2026-07-16-penetration-rework-design.md`, SHIPPED 2026-07-16).
`P(hit)` is not: it is accuracy, cover, and range-band maths, and nothing in the balance work
touches it. Scoring hits gets a bot playing today against numbers that are stable, and defers
the damage term until the arsenal settles.

> **`F2-B — price ROF in heat` is SHELVED, not the live next step.** This sentence cited it as
> live and reasoned from it. `2026-07-15-rof-heat-design.md` measured the tax as *worse than
> doing nothing* — weapon spread **3.0× → 3.9×** — and shelved it. ROF still multiplies both
> `P(wound)` and `Damage`, and that remains **unsolved**; the penetration rework only stopped
> making it worse. **Nothing scheduled will settle the arsenal on F2-B's account.**

**This costs less than it sounds, because the structural rules are exported separately from
the magnitudes being tuned.** The bot still sees:

| fact | via | stable under tuning? |
|---|---|---|
| accuracy, cover, range falloff | `computeModifiedAim` | yes |
| **Raking Fire cannot damage a front arc** | `arcBonus(profile, arc) === null` | yes — a veto, not a number |
| **Raise Shield negates an arc** | `shieldCoverage(rig)` | yes |
| heat cost | `rigEffects`, `ACTIONS` | yes |
| objectives, Priority Target | geometry | untouched by damage |
| rear/side **ordering** | sign of `arcBonus` | ordering yes — *magnitude no* (see Arc, below) |

The rake veto is free and exact. The rear/side *preference* is not — arc changes STR, not
accuracy, so v1 must shape it by hand. See "Arc: v1 needs an explicit factor" below; it is
v1's biggest compromise and the reason the damage term is deferred, not cancelled.

**What v1 is blind to — write these down, they are real:**

1. **The wound half.** Brace's −2, Reactive Plating's −1/−2, Harden, Reactive Armor, Breach
   Grip's crack, and `toughness` all live inside `rollWounds` and are invisible. The bot will
   not understand that a braced rig is a poor frontal target.
2. **Weapon quality.** It cannot tell a Wrecking Ball (Penetration 6, Damage 8, ROF 1) from a
   Rivet Gun (Penetration 3, Damage 1, ROF 6) — it prefers volume. That is **still correct**,
   by a narrower margin than before: at the field floor the Rivet Gun measures **3.64
   SP/attack** to the Wrecking Ball's **3.24** (`report-2026-07-16-penetration.txt`; it was
   3.64 to 3.01 pre-rework). **F2-B is what would have made it wrong, and it is shelved** —
   so prefer-volume stays right until the ROF economy is solved some other way.
3. **Three ROF bonuses.** `rollToHit` computes an *effective* ROF internally — `+2` Full Auto,
   `+Bloodletter` (vs a damaged target), `+Redline Governor` (attacker heat over cap) — and
   that logic sits inside the function. It cannot be read by calling it, because `rollToHit`
   also runs `applyDefensiveReactions`, which **mutates the target** (Point-Defense spend);
   evaluating a candidate must never do that. v1 therefore uses `profile.rof` and under-rates
   all three. The bias is small, one-directional, and only affects conditional upgrades.

### Deferred: the damage term (do this once tuning settles)

Adding damage means completing the formula:

- `woundTarget(effStr, toughness)` gives the wound TN on a D10, so `P(wound) = (11 − TN)/10`.
- `Damage` is the weapon's `dmg` **plus its per-wound riders: Rend** (+1, §13 — Chainsaw, Claw,
  Flamethrower) **and Evisceration** (+1 against an already-damaged location, §13 — Talon).
  That is the whole sum: `rollWounds` computes `sp = dmg + rend + evisc`.

> **There is no Penetration term in Damage — do not add one back.** This bullet used to read
> *"plus `strOvermatchD(effStr, toughness)`"*. **That function no longer exists.** Overmatch
> was deleted by `2026-07-16-penetration-rework-design.md` (SHIPPED 2026-07-16) precisely
> because feeding Penetration into Damage hands the benefit to high-ROF weapons — ROF
> multiplies Damage. Penetration now buys `P(wound)` and nothing else; the clamp wastes the
> excess, by design, and the band was compressed to 3–7 so the waste is rare.

**The blocker.** `effStr` is not obtainable today. `strBreakdown` is exported but covers only
the *attacker's* STR. The **defender's** ten modifiers are computed inline inside
`rollWounds`, interleaved with the dice:

`arcBonus` · Kneecapper's limb exception · **Brace** (−2 front) · **Harden** (−1/−2 by
upgrade) · **Reactive Armor** (−2 on a re-hardened location) · **Reactive Plating** (−1/−2
side/rear) · **Raise Shield** (negate, or −3) · **Breach Grip** crack (+2) · `toughnessOf` ·
Piledriver's guard-break

A scorer built from `computeModifiedAim` + `woundTarget` alone would be blind to Brace,
shields, and every plating upgrade — mis-scoring exactly the situations that decide games.

So: **extract a pure `effectiveStrAgainst(attacker, target, profile, location, opts)` out of
`rollWounds`**, and have both `rollWounds` and the bot call it. One source of truth, no
drift. This modifies `shared/combat.js` — the file the digital-battlefield spec held at a
zero diff. That property was a *means, not an end*: it proved the derivation seam sat in the
right place, and it did its job. `combat.test.js`'s 2178 lines are the net for this refactor.

**Why not sample instead.** `resolveAttack` can already be driven with a stub room
(`{ game: { round: 1 } }`) and a `ctx` whose `applyDamage` taps SP — `weapon-sweep.mjs` does
exactly this at ~45k attacks/sec, so sampling is fast enough. It is rejected because it is
**noisy**: at 20 trials the error (≈±0.22 SP) exceeds the gap between competing candidates,
so the argmax would flip on noise and break the `seed + preset ⇒ identical log` guarantee.
Pushing noise under the ranking threshold needs ~200 trials per candidate — roughly an hour
for a 200-game tuning run.

**Sampling becomes the TEST instead.** Using the same `ctx` tap, sample ~5000 attacks and
assert the analytic EV matches the empirical mean within the sweep's noise band. If
`ROF × P(hit) × P(wound) × D` disagrees with the real engine, one of them is wrong. The
instrument exists; copy the pattern from `weapon-sweep.mjs`.

**The seam holds either way.** `score.js` has one `w.damage` weight consuming one number
from `evaluate.js`. v1 feeds it `expectedHits`; the deferred work feeds it `expectedDamage`.
Nothing else in the scorer changes — which is the point of splitting `evaluate.js` out.

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
      + w.damage    × offence                 // v1: expectedHits. later: expectedDamage
      - w.threat    × exposure                // same metric, every enemy's best against me
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

The defensive half is symmetric: `exposure` is computed at the candidate spot with the
candidate facing. That is what makes the bot seek cover and refuse to show its rear.

**Offence and exposure are the same metric, pointed in opposite directions.** Both come from
`evaluate.js`, so swapping v1's `expectedHits` for `expectedDamage` later upgrades attack and
defence together — the bot can never end up valuing its own shots by one yardstick and the
enemy's by another.

**Threat assumes static enemies.** `exposure` sums each living enemy's best EV
against the candidate spot **from where that enemy stands right now**, with its current
facing and weapon state. It does NOT model the enemy moving to a better firing position
first. That is a deliberate simplification, and it is the bot's main blind spot: it will
happily stop just outside a Speed-5 rig's current reach, not realising that rig can close
and shoot in one activation. Modelling enemy movement means a second ply and roughly squares
the candidate space. If the bot proves too easy to bait, this is the first thing to revisit —
and the cheap partial fix is to inflate each enemy's threat range by its `moveBudget` rather
than to search.

### Arc: v1 needs an explicit factor, and this is the honest part

**With the damage term, the game's incentives need no encoding** — Raking Fire's front-arc
veto, rear's +4 STR, and Brace's −2 all live in the wound step, so an EV built on
`effectiveStrAgainst` values them automatically. That is the main argument for using the
engine's own functions rather than approximating.

**v1 does not get that for free, and this is its biggest compromise.** `expectedHits` is
`ROF × P(hit)`, and **arc does not affect accuracy — it affects STR**. So a hits-only score is
*identical* front, side, and rear. Left alone, the v1 bot would have **no reason to flank at
all**, which deletes the single most important behaviour we want.

So v1 multiplies offence by an explicit arc factor, read from the exported `arcBonus`:

```js
// arcBonus is the wound step's arc modifier. v1 cannot use it as STR (no wound
// term), so it reads it as a PREFERENCE instead: null is a hard veto, and a
// bigger bonus means a better angle. This is a heuristic bridge, not the real
// maths — it preserves the ORDERING (rear > side > front, rake-front = never)
// while the magnitudes are still being tuned. The damage term replaces it
// wholesale; delete this when it lands.
function arcFactor(profile, arc) {
  const bonus = arcBonus(profile, arc);
  if (bonus == null) return 0;        // earned zero: a rake cannot hurt a front arc
  return 1 + bonus / 4;               // ordering only; the /4 is a knob, not a law
}
```

Being explicit about what this is: `arcBonus` returning `null` is a genuine structural veto
and will always be right. The `1 + bonus/4` shaping is a **guess** — it preserves the ordering
(which is what makes the bot flank) but not the true value. It is the one place in v1 where
the bot's numbers are invented rather than derived, and it is the first thing the damage term
deletes.

**Still free in v1**, because they are exported and structural:
- **Raise Shield** negates an arc → `shieldCoverage(rig)`, a hard zero like the rake veto.
- Range falloff, cover, accuracy modifiers → `computeModifiedAim`.

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
- **EV validation** — assert the analytic `expectedDamage` matches a ~5000-sample empirical
  mean from the real `resolveAttack`, within the sweep's noise band. Copy the stub-room +
  `ctx`-tap pattern from `scripts/balance/weapon-sweep.mjs`. This is the acceptance test for
  `evaluate.js`; without it the scorer is asserted, not verified.
- **Bot vs bot** — full games headless. Assert they terminate, VP accrues, nothing desyncs.
  Then run 200 games of `aggressive` vs `cagey` and read the win rate.

### Fixture trap — inherited, has already burned real work

`normalizeWeaponUpgrade` returns `upgrades[0].id` (the **Field** upgrade) for a null or
unknown id, so `makeRig` **cannot build an un-upgraded weapon**. Every legal rig carries its
field upgrade; a bare-weapon fixture is testing a loadout that cannot be commissioned. This
silently made the balance sweep measure Field twice, then invalidated two test fixtures and
every base-STR worked example in the Overmatch spec. `weapon-sweep.mjs` now asserts its own
tier ladder on startup to catch it. Bot fixtures must build rigs through `makeRig`, never by
hand-assembling a weapon.

### This harness answers what the balance sweep structurally cannot

`weapon-sweep.mjs` is **positional-agnostic** — arc and distance are *inputs*, not outcomes —
so by its own notes it "cannot answer what speed is worth; that needs a positional sim."
Bot-vs-bot **is** that positional sim: arc, distance, and cover become consequences of
decisions. The two are complementary. The sweep prices a weapon in the abstract; this prices
it in a game. Neither replaces the other, and nobody should build a third.
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

## Live coupling to the balance work

The scorer reads the real weapon maths, so **any rebalance moves every bot decision.** Expected
damage is `ROF × P(hit) × P(wound) × Damage`, and ROF *multiplies* — so a rivet gun
(Penetration 3, Damage 1, ROF 6) still out-damages a wrecking ball (Penetration 6, Damage 8,
ROF 1) at the field floor, **3.64 to 3.24** (`report-2026-07-16-penetration.txt`). **The bot
will rationally prefer high-ROF weapons — and it will be right to.**

**`F2-B (price ROF in heat)` is shelved, not pending — do not wait for it.** The balance
findings named it the live next step and this paragraph reasoned from it as though the
preference were temporary. It is not: `2026-07-15-rof-heat-design.md` measured the tax as
*worse than doing nothing* (spread **3.0× → 3.9×**) and shelved it. The penetration rework
narrowed the gap — the wrecking ball climbed **3.01 → 3.24** on the Damage payback — without
closing it, and no scheduled work will.

This is an argument for the analytic EV rather than hand-tuned weapon preferences: it tracks
the rebalance automatically. But do not tune the bot's weight presets against an arsenal
that is mid-rebalance; the presets would encode a snapshot.

## The main risk

The weights are the difference between "competent" and "twitchy", and no amount of design
gets them right on paper.

**The bot-vs-bot harness is not a nice-to-have.** It is the only instrument that says whether
this works. Without it we are tuning six numbers by vibes.
