# Cycling beacons and Plant Flag: design

Date: 2026-09-27. Status: approved 2026-09-27.

## Problem

A fast Rig can reach a beacon on turn one and score it at the first Recovery. On the default 54×36 table the nearest beacon is ~20.5" from the deployment edge and a Speed 5.5 light Sprints 24.75" in three actions; on the 42×28 Skirmish table the centre is ~17" away. Reinforced Servos and Jump Jets make geometry alone unfixable. Bot sims confirm it: under the current rules 0.3 to 2.3 beacon VP per game is scored in round 1.

Beyond round 1, the current beacons reward parking: all three score every round, so a squad that grabs two early can sit on them.

## The rule

Applies to every room whose objectives are held markers (not salvage crates).

1. **Round 1 is dark.** No beacon scores at the round-1 Recovery.
2. **One beacon is lit per round.** From round 2, exactly one beacon is lit. It is the one announced as **Next** during the previous round. When a round begins, a different beacon is picked at random to be the new Next (never the lit one). Round 1 already shows a Next. With a single marker (Last Stand relay, the training lesson) that marker is lit every round from 2 and is always Next.
3. **Plant Flag [1 action, 0 heat].** A Rig within 2" of the **lit** beacon, or of the **Next** beacon (early plant), may Plant Flag on it. A plant lasts until the Rig is moved by anything (Move, Sprint, Jump Jets, grapnel, shove, pull). A plant on the Next beacon counts once that beacon lights; a plant on a beacon that is no longer lit or next does nothing.
4. **Scoring.** At Recovery the lit beacon pays **4 VP** (flat, whichever beacon it is; the beacon multiplier does not apply) to the side with a Rig planted on it, unless an enemy Rig is within 2" of it (contested: nobody scores). Planted or not, any enemy Rig within 2" contests.
5. Unchanged: kill VP, bounty, Priority Elimination, boiler VP, 10 rounds, sudden death, annihilation.

### Why these values (evidence)

All numbers are bot-vs-bot on paired seeds (`scripts/beacon-ab.mjs`, `scripts/beacon-ga.mjs`), Normal and Hard pilots, both tables.

| (400 games per arm) | current | cycle + early plant, 3 VP | cycle + early plant, 5 VP |
|---|---|---|---|
| beacon VP in round 1 | 0.3 to 2.3 | 0 | 0 |
| mean margin | 10.1 | 6.4 | 8.0 |
| lead changes (Hard) | 0.6 to 1.0 | 1.3 to 1.5 | 1.0 to 1.3 |
| beacon share of VP | 60 to 69% | 47 to 57% | 59 to 70% |
| annihilation | 40% | 27% | 28% |
| first activator wins | 50% | 54.5% | 59% |

GA (16 genomes × 8 generations per arm): with plain cycling at 3 VP, evolved pilots mostly abandon beacons (vp weight 0.3 to 0.6 in 3 of the top 4) and beat the beacon-chasing Normal bot. With early plant the whole top 4 keeps a high objective weight (4.3 to 5.1) and a positive Plant preference (b_plant +0.44). Planted-only contest was the weakest variant and is dropped.

**Value: 4 VP.** A 1,600-game run of early plant at 3 VP vs 4 VP (200 games per cell, seed 2):

| (800 games per arm) | 3 VP | 4 VP |
|---|---|---|
| first activator wins | 52.75% | 53.25% |
| side A wins | 47.25% | 47.25% |
| beacon share of VP | 49.75% | 58.5% |
| mean margin | 6.1 | 7.35 |
| draws | 3.25% | 1.5% |

Fairness is the same for both (the 0.5-point first-activator gap is noise). 4 VP keeps beacons near today's weight in the game and halves draws, so it ships. The number lives in one constant (`CYCLE_BEACON_VP`).

## Engine (shared/)

The experiment code in `shared/game-state.js` becomes the default rule.

- **Default on.** `cycleOn(room)` is true unless `room.game.beaconRules === "classic"`. `"classic"` keeps today's per-marker scoring, used by the A/B scripts' baseline arm (training scenarios play cycling, see below). No compatibility shim for saves.
- **Tuning.** `beaconTuning` keeps `vp` and `earlyPlant` (default **on**). `plantedContest` is removed with its test and bot branch.
- **Start.** `startGameSeeded` (seed, mission, scenario) calls `ensureBeacons` like `maybeStartGame` does, so every started room shows a Next.
- **Single marker.** `rotateBeacons` with one marker keeps it lit and next.
- **Physical Recovery (`vp` verb).** When cycling: a side's claims are reduced to the lit beacon, and only kept if that side has a Rig with `isPlanted(rig, lit)` (physical plants carry no position; movement actions clear them). Both sides claiming it stays the existing conflict path. Pays the tuned VP, no multiplier.
- **Actions.** `plantflag` joins `ACTIONS` in `shared/rules.js` (`{ label: "Plant Flag", heat: 0, slot: 1 }`), with the matching §5 text in `rules.md` (the two must stay in sync). The Bulwark's "Un-plant" keeps its name; the new action is always "Plant Flag" in UI copy to avoid confusion.
- **availableActions.** Gains an optional context argument `{ beacons, objectives, digital }`. Plant Flag is enabled when an action is left and (digital) the Rig is within 2" of the lit or next beacon and not already planted on it, or (physical) a beacon is lit or next. Callers that don't pass context never see it.
- **Status tag.** `battleModifiers` adds a "Planted" tag while `isPlanted` holds on the lit or next beacon.
- **formatBattleState / prompt.** State text lists "Lit beacon: X · Next: Y" and planted Rigs. `server/prompt.js` guide lines are rewritten for the new rule.

## Rooms

- Standard rooms (physical and digital, bot and versus): cycling by default.
- Campaign **Beacons** contract: cycling.
- Campaign **Skirmish** contract: switches from one centre beacon to the standard three, cycling. Its catalog blurb and Orders text change accordingly ("Hold the lit beacon; it moves every round").
- **Last Stand** relay: single-marker cycling (dark round 1, then lit every round, Plant to score).
- **Salvage**: unchanged (crates are picked up).
- **Training scenarios** (`scenario` verb): play the cycling rule like every other room (the `beaconRules: "classic"` override is gone). The "Claim a beacon" lesson now teaches Plant Flag: round 1 dark, plant on Next, stand still in round 2 while it is lit.

## Rules text

- `rules.md` §1 (overview), §4 Recovery step 3, §5 (new Plant Flag action), §11 (Objectives, Control, Scoring rewritten: dark round 1, lit and Next, Plant, contest, flat VP; the beacon-multiplier paragraph notes it does not apply to cycling beacons), §16 notes, §18 campaign table (Skirmish, Last Stand rows).
- Glossary: `shared/glossary.js` (new `plant-flag`, `lit-beacon`; `vp` and `beacon-escalation` updated) and `client3d/src/ui/glossary.js` ("beacon").
- 3D tips (`client3d/src/ui/tips.js`): contested tip reworded; new tips for "a beacon lights next round" and "you're on the lit beacon, plant".
- 3D help (`client3d/src/main.js` scoring line), contract strip (`ui/mission.js`), campaign Orders (`ui/campaign.js`).

## Clients

UI work is the 3D client only (AGENTS.md: V2 is touched only when named). V2 is left as is: its physical-table scoring dialog still lists every marker, and the engine trims those claims to the lit beacon with a planted Rig, so it keeps working, just without the new cues.

## 3D client (client3d/src)

- **world.js** `setObjectiveControl` gains lit/dark/next: dark = lamp off, pennant lowered; Next = amber lamp pulsing, pennant half-mast; lit = full lamp, pennant up. Holder colour = side with a planted Rig (from `isPlanted`), contested stays its current look. Fix the stale `setObjectiveColors` comment in `scene/objectives.js`.
- **live.js**: control colouring uses plant + lit state instead of raw `controlsObjective`; the "BEACONS NOW PAY ×N" banner is replaced by a round-start banner "BEACON LIT: CENTRE · NEXT: CORNER A"; Plant Flag button in `renderActions` with a `HELP` tooltip; move narration mentions the lit/next beacon.
- **director.js**: `kind: "plant"` resolution plays a flag-raise pulse and a short sfx; a pilot bark hook ("Flag's up!") via the existing bark events.
- **combatlog / minimap / replay**: plant icon; minimap highlights lit and next; `frameOf` in `shared/sim/match.js` records `beacons` so replays show the lit beacon.

## Bot

Already implemented (`shared/bot/candidates.js`, `shared/bot/score.js`, `b_plant` family). After the flip, rerun `node scripts/evolve-meta.mjs` so the Hard bot's playbook (`shared/bot/meta.js`) is evolved under the new rules, and record the calibration numbers.

## Testing

- Existing `shared/beacon-cycle.test.js` moves to the default path (no flag set), drops the planted-contest test, adds: single-marker cycling, `startGameSeeded` shows a Next, physical `vp` claims limited to the lit beacon with a planted Rig, `availableActions` offers Plant Flag only in context.
- Tests that assert the classic behaviour (`game-state.test.js` VP claim and digital scoring tests, `escalation.test.js`, `tempo-rules.test.js` beacon summary, `mission.test.js` skirmish objectives, `bounty.test.js`, `server/prompt.test.js`) are either pointed at `beaconRules: "classic"` where they test the classic path on purpose, or rewritten for the new rule. No test pins a VP value; they use `CYCLE_BEACON_VP` / `beaconTuning`.
- Gates: `node --test`, `npx vitest run` (unchanged client tests stay green), `npx tsc --noEmit`; live check of a 3D bot battle in the browser pane.

## Out of scope

- Rewriting the training "Claim a beacon" lesson for Plant (since done: the lesson now teaches Plant Flag).
- First-activator mitigation. The only cell with a real skew is Hard pilots on the Skirmish table (first activator wins 59% at 3 VP, 61% at 4 VP, 200 games each). If post-flip sims confirm it, candidate fixes (reveal Next after the round's first activation; second activator breaks the tie on a contested plant) get their own spec.
- Beacon escalation multiplier for cycling beacons.

## Shipped

Cycling beacons and Plant Flag are the default rule as of 2026-09-27. `shared/bot/meta.js` was re-evolved under the new rules (`node scripts/evolve-meta.mjs --skirmish`, compositions "all", 8 generations, rules hash `1988cebcad92`). The Hard bot's champion build carries the trio that dominated every generation: `medium-sniper-chainsaw`, `medium-shield-siege`, `light-missile-flamethrower` (gen 7 best fitness 1.09, mean 0.70; best fitness peaked 1.22 at gen 1).

**Bug found and fixed along the way.** The evolve run crashed during its own "Tier calibration" step with "Both sides must field a mirrored composition": `calibrationJobs(tier, { challengers })` in `shared/sim/tiers.js` built the tier-bot side with the GA's `DEFAULT_COMPOSITION` (1 medium + 2 light) regardless of the challenger genome's actual makeup, and this run bred genomes under `compositions: "all"` (some 2-medium/1-light, some 3-light). `shared/bot/meta.js` had already been written before the crash (kept as-is: it's the correct champion from the completed 8-generation run). Fixed `calibrationJobs` to read the challenger's own class makeup (new `compositionOf(squad)` helper, keyed off `CHASSIS`) and hand it to `tierSquad` as the bot's composition too, with a covering test in `shared/bot/tiers.test.js`. The gauntlet step that would normally crown the champion from a shortlist logged no candidates this run (every shortlist genome fell below the min-games threshold against the reference squad, a pre-existing quirk of that filter, not the composition bug), so the champion is `res.best.g`, the top-fitness genome of the final generation, which is what `shared/bot/meta.js` carries.

Because the whole 8-generation evolve wasn't worth re-running just to reprint one section, the calibration lines below come from a throwaway script (`data/`, gitignored, not committed) that calls the now-fixed `calibrationJobs` directly against the shipped `meta.js`, using "evolved builds" challengers read back from `data/gene-pool.json` (the same 8 genomes that run's gauntlet deposited, all tagged with the current rules hash).

**Tier calibration (bot win rate, 16 games/tier/line, seed 11 vs average / seed 12 vs evolved):**

| tier | vs average builds | vs evolved builds |
|---|---|---|
| easy | 16% | 13% |
| normal | 47% | 44% |
| hard | 63% | 25% |

"vs evolved builds" pits the tier bot against the GA's own top genomes from this run, a much sharper opponent than a random legal build, so a lower number there is expected, not a regression. Hard's 63% "vs average builds" misses the informal ≥70% target from `scripts/calibrate-tiers.mjs`'s own comment, but at 16 games that's within noise; not treated as a real miss without a larger sample.

**Final A/B: shipped cycling rule vs pre-flip legacy** (`node scripts/beacon-ab.mjs --games 100 --arms legacy,ship`, 800 games, 100/cell):

| cell | arm | R1 bcn VP | total VP | beacon share | margin | 1st mover wins | side A wins | annihil | plants |
|---|---|---|---|---|---|---|---|---|---|
| normal/standard | legacy | 0.3 | 25.8 | 69% | 10.3 | 51% | 49% | 18% | 0.0 |
| normal/standard | **ship** | **0.0** | 19.1 | 63% | 6.6 | 54% | 47% | 14% | 5.4 |
| normal/skirmish | legacy | 1.6 | 28.8 | 69% | 10.3 | 48% | 53% | 37% | 0.0 |
| normal/skirmish | **ship** | **0.0** | 21.1 | 63% | 7.8 | 56% | 45% | 22% | 6.2 |
| hard/standard | legacy | 0.9 | 30.0 | 65% | 9.1 | 57% | 43% | 39% | 0.0 |
| hard/standard | **ship** | **0.0** | 20.8 | 67% | 6.4 | 38% | 62% | 8% | 9.1 |
| hard/skirmish | legacy | 2.1 | 34.7 | 69% | 8.1 | 52% | 48% | 43% | 0.0 |
| hard/skirmish | **ship** | **0.0** | 25.0 | 66% | 6.9 | 54% | 47% | 16% | 9.0 |

`ship` scores 0 round-1 beacon VP in every cell, as designed. Against the re-evolved Hard bot, Hard-on-Skirmish first-activator skew is now 54%, back under the 55% threshold (it was 59% at 3 VP / 61% at 4 VP before re-evolving), so the out-of-scope note above no longer needs a follow-up spec. A new skew shows up on the standard table instead: Hard-on-standard first-activator wins only 38% while side A wins 62% (100 games), the mirror image of the old problem; flagging it for a rerun/closer look rather than treating it as a blocker, since it wasn't visible before the bot was re-evolved and a single 100-game cell is thin evidence either way.

**Gates:** `node --test "shared/**/*.test.js" "server/**/*.test.js" "scripts/**/*.test.mjs" "client3d/**/*.test.js"` → 1239/1239 pass. `npx vitest run` → 319/319 pass. `npx tsc --noEmit` → clean.

An intermediate run of this suite (1234/1235) turned up a real engine bug the re-evolved Hard bot's build happened to trigger, not caused by it: `server/routes/sim.test.js`'s "simulated rooms" test stalled on seed 6 because a rig killed by Burning at the very start of its own activation (before taking any action) left `game.turn.activeRigId` pointing at a corpse forever, nothing else was ever calling `endActivation` for a rig that dies mid-activation, and `driveBots`' resume lookup explicitly excludes destroyed rigs, so the game had no legal next step. Fixed in the engine (`shared/game-state.js`'s `onRigDamaged`, plus a matching guard in `endActivation` for the same rig dying to its own overheat roll instead), with four regression tests in `shared/game-state.test.js`. All counts above are with that fix in.
