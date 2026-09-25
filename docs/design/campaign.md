# Campaign: Mercenary Contracts (single-player roguelite)

Status: in progress. Client: `client3d` only. Digital only (bot opponent). Quick runs (~45–60 min).

## Pitch

You run a mercenary outfit of three war rigs. A **run** is a chain of five
contracts ending in a **boss contract**. Damage carries between fights, salvage
pays for repairs and loot, and wrecked rigs can be bought back. Each run, won or
lost, earns **Renown**, the meta currency that permanently widens what you can
find and field in later runs. Winning a run also raises your **Notoriety**, the
difficulty ladder.

Design rule: in-run power is large (upgrades, equipment, relics, perk kits);
meta progression unlocks **content and options**, plus a few small workshop perks.
Flat permanent power stays small, so the bot never becomes a pushover; the
Notoriety ladder soaks it up anyway.

## Run loop

```
HQ (spend Renown, pick Notoriety) → Commission 3 rigs (bare) → Map
Map: 5 steps, each offers 2–3 nodes → pick one
  Contract → Briefing → Battle (3D) → Debrief (salvage, repairs, recovery) → Reward (pick 1 of 3)
  Depot    → Shop (repair cheap, recover cheap, buy, respec)
Step 6: Boss contract → Run summary → Renown → HQ
```

- **Nodes per step:** step 1 = 2 contracts; steps 2–5 = 3 nodes (a Depot is
  always one of the step-4 options; otherwise ~1 in 4 is a Depot); step 6 = Boss.
- **Strikes:** losing a contract gives a Strike and no payout. **2 Strikes, or
  losing the Boss, ends the run** (a loss, with partial Renown). Having no
  deployable rig at a contract also ends it.
- **Rounds:** campaign battles are shorter: 6 rounds (Assassination, Breakthrough, Boss: 8). The room carries
  `game.maxRounds`.

## Roster and carried state

Each roster rig: `{ uid, name, chassis, longRangeUpgrade, meleeUpgrade,
equipment, equipmentUpgrade, perkKits: { longRange, melee }, sp: {hull, arms, legs, engine}, wrecked }`.

- **Commission bare:** rigs start with **no upgrades, no equipment** (the engine
  already runs a rig with no picks). Everything is found.
- **SP carries.** After a battle each surviving rig keeps its SP. Heat resets.
- **Field crews:** between contracts every living rig heals **+1 SP per damaged
  location** for free, so a lucky run isn't strangled.
- **Wrecks:** a wrecked rig can't deploy. **Recover** it for salvage: it returns
  at **half SP** (rounded up) on every location. An unrecovered wreck stays in the
  roster as scrap and can be recovered later in the run.
- **Deploy:** you deploy every living rig (1–3). The enemy fields the same count
  (plus reinforcements in Last Stand), chassis distinct from yours (no mirrors).

## Economy ⚙ TUNING (placeholders, sim later)

| Item | Salvage |
|---|---|
| Starting salvage | 20 (+ workshop) |
| Contract payout | 12 + 4 × step (boss 40) |
| Kill bonus | +3 per enemy wreck |
| Salvage crate (Salvage Run) | +6 each |
| Repair after a battle | 2 per SP |
| Repair at Depot | 1 per SP |
| Recover a wreck (field / Depot) | 24 / 16 |
| Depot: Field / Tuned / Prototype upgrade | 10 / 16 / 24 |
| Depot: equipment | 14 |
| Depot: equipment upgrade (by nature) | 8 / 14 / 20 |
| Depot: relic | 26 |
| Depot: perk kit | 18 |
| Respec (swap an installed upgrade for another of its item) | 6 |
| Reroll reward cards (once per reward) | 5 |

## Contract types (no escort)

All digital. The player is side `a`, the enemy bot side `b`. Terrain is scattered
from the node's seed; deployment corners as usual.

| Type | Win | Lose | Engine |
|---|---|---|---|
| **Beacon Hold** | more VP at the round limit | fewer VP / annihilation | existing objectives game |
| **Skirmish** | annihilate the enemy, or more VP at the limit | the reverse | one centre beacon, kills score |
| **Assassination** | wreck the marked **Commander** | round limit passes / annihilation | Commander = elite enemy (+25% SP, meta build); win stamped the instant it wrecks |
| **Breakthrough** | extract **2 rigs** (or all living, if fewer) at the enemy corner | round limit / annihilation | new **Extract** action: a rig inside the 10" exit quarter-circle leaves the field |
| **Last Stand** | keep ≥1 rig alive to the round limit | annihilation | enemy **reinforcements** spawn at the enemy corner at the start of rounds 3 and 5; a relay beacon in front of your corner draws the attack |
| **Salvage Run** | more VP at the limit (crates are worth VP) | fewer VP | crates are one-shot beacons: a rig ending an activation within 2" claims it (+2 VP, +6 salvage); bots go for them too |
| **Boss** | wreck the faction **Warlord** | round limit / annihilation | Assassination with a Warlord: hard-tier build, +50% SP, the faction perk, +1 Answer token each round |

## Factions (finally with perks)

Each contract names an enemy faction. The enemy side gets its **perk** (a side
modifier, same engine hook as relics). Beating a faction's **Warlord** (boss)
unlocks that perk for your own squad in future runs (pick one at HQ).

| Faction | Perk | Modifier |
|---|---|---|
| Krim Corporation | **Overwhelming Fire**: +1 Penetration on ranged attacks | `pen.ranged +1` |
| Nox Industries | **Heavy Frames**: +2 max SP Hull, +1 max SP Legs | `sp.hull +2, sp.legs +1` |
| Arcus Technologies | **Arc Drives**: +1" Speed | `speed +1` |
| Triton Engineering | **Sea-Cooled**: +1 Heat Capacity | `heatCap +1` |
| Freegear Coalition | **Scrap Wizards**: Repair heals +1 SP; +1 Grit token at the start of each battle | `repair +1, grit +1` |

## Side modifiers (the engine hook for relics + faction perks)

A mission room carries `room.campaign.mods = { a: {...}, b: {...} }`. The mission
verb bakes SP bonuses into the built rigs; everything else is read live:

| Key | Effect | Read in |
|---|---|---|
| `sp: {loc: n}` | +n max SP (and current) | mission build |
| `heatCap` | +n Heat Capacity | `heatMeter` |
| `startHeat` | rigs start with n heat | mission build |
| `speed` | +n" Speed | speed resolver |
| `pen: {ranged, melee}` | +n Penetration | `effectiveWeaponProfile` |
| `acc` | +n accuracy on every attack | combat accuracy |
| `cool` | +n heat cooled each Recovery | `runRecovery` |
| `repair` | +n SP on Repair | repair action |
| `answer` | +n Answer tokens every round | `applyInitiative` |
| `grit` | +n Grit tokens at battle start | mission build |
| `actionsR1` | +n actions on each rig's round-1 activation | activation |

Economy-only relic keys (`salvagePerKill`, `repairDiscount`, …) never reach the
engine; the campaign layer reads them.

## Loot: reward cards

After a won contract: **pick 1 of 3** cards (boss: 1 of 3, all rare+, plus a
guaranteed relic). Cards only offer things that fit your roster and your unlocks.

| Card | What it does | Rarity weight |
|---|---|---|
| **Weapon upgrade** | installs an upgrade on one roster rig's weapon (replaces the current one) | Field 60 / Tuned 30 / Prototype 12 |
| **Equipment** | fills or replaces a rig's equipment slot (any of the 8) | 30 |
| **Equipment upgrade** | upgrade for a piece of equipment on your roster | by nature, as above |
| **Perk kit** | grafts a §13 perk onto one weapon | 10 |
| **Relic** | squad-wide passive for the run | 8 |
| **Salvage cache** | +15 salvage | 20 |

**Every equipment is in the pool** (all 8: Ablative Plating, Radiator Array,
Servo Actuators, Overclock Core, Field Repair Suite, Blast Furnace Core,
Targeting Computer, Reactive Plating) and **all 24 equipment upgrades**, gated
only by meta unlocks. The one-Prototype-per-rig cap holds: installing a second
Prototype on a rig asks which one to drop.

**Perk kits** (one per weapon; stacks with the weapon's own perks, duplicates
are not offered): Armour Piercing, Incendiary, Shock, Rend, Impale. (Staggering / Cleave stay out: their push and second target are still narrated.)
Engine: `rig.perkKits[slot]` merges into the weapon profile's perks.

### Relics ⚙

| Relic | Effect |
|---|---|
| Salvaged Coolant Lines | +1 Heat Capacity |
| Reinforced Chassis | +1 max SP Legs and Arms |
| Hardened Bulkheads | +2 max SP Hull |
| Veteran Crews | +1 Answer token each round |
| Grit and Gears | +1 Grit token at battle start |
| Tuned Pistons | +1" Speed |
| Hot Loads | +1 Penetration on ranged attacks, rigs start with 1 heat |
| Serrated Edges | +1 Penetration in melee |
| Gyro Stabilisers | +1 accuracy on every attack |
| Heat Sinks | cool +1 extra each Recovery |
| Field Welders | Repair heals +1 SP |
| Cracked Reactor | +1 action on round 1, rigs start with 2 heat |
| Scrapper's Contract | +2 salvage per kill |
| Union Mechanics | repairs cost 1 salvage less per SP (min 1) |
| Recovery Winch | wreck recovery costs half |
| Lucky Charm | reward rerolls are free |

## Meta progression (HQ)

Persistent profile, server-side (`data/campaign.json`, single player).

**Renown** is earned by every run, won or lost (**partial success counts**):

| Source | Renown |
|---|---|
| Each contract won | 2 |
| Each Depot visited | 0 |
| Reaching the boss | 3 |
| Beating the boss (run won) | 6 + Notoriety level |

**Spend Renown at HQ** on unlocks (content first, small perks second):

| Unlock | Cost | Start state |
|---|---|---|
| Chassis (each of 7 locked) | 4 | 4 unlocked: Claw/Autocannon, Harpoon/Anchor, Lance/Mortar, Shield/Siege |
| Tuned upgrades enter the pool | 6 | Field only |
| Prototype upgrades enter the pool | 10 | (needs Tuned) |
| Equipment (each of 4 locked) | 3 | 4 unlocked: Ablative, Radiator, Servo, Repair Suite |
| Perk kits enter the pool | 6 | off |
| Relic pack (4 relics each, 3 packs) | 5 | 4 relics unlocked |
| Workshop: +10 starting salvage (×3) | 4 | |
| Workshop: 4 reward cards instead of 3 | 8 | |
| Workshop: one free wreck recovery per run | 6 | |
| Workshop: start the run with a Field upgrade on each rig | 5 | |

**Faction perks** unlock by beating that faction's Warlord (free). At run start
you may take **one** unlocked faction perk as your squad's banner.

**Notoriety** (the ladder, 0–5). Winning a run at level N unlocks N+1. You pick
the level at run start.

| Level | Enemy |
|---|---|
| 0 | easy pilot, bare rigs, Field upgrades from step 3 |
| 1 | normal pilot, primary equipment, Field upgrades |
| 2 | normal pilot, Tuned from step 3, faction perk on every contract |
| 3 | hard pilot, meta builds from step 3 |
| 4 | hard pilot, meta builds, enemy +1 SP on every location |
| 5 | hard pilot, meta builds, enemy +1 SP, one enemy relic |

## Engine work

1. **`shared/campaign/`** (pure, seeded, TDD): `catalog.js` (factions, relics,
   perk kits, prices, unlock table), `run.js` (new run, map offers, contract
   generation, enemy squads, debrief, rewards, depot, recovery, strikes, end-of-run
   Renown), `meta.js` (profile, unlock purchases, Notoriety).
2. **`mission` verb** in `shared/game-state.js`: like `scenario`, but builds both
   squads from attrs (roster SP carried, upgrades, equipment, perk kits),
   validates one-Prototype, scatters terrain + auto-deploys, applies side mods,
   sets the mission type, `maxRounds`, enemy bot preset, commander / crates / exit
   band / reinforcement schedule, and starts at once.
3. **Win conditions:** `room.campaign.type` checked in `onRigDamaged` (commander
   wrecked), in `advanceRound` (round limit → Last Stand survives, Assassination
   fails, Breakthrough fails), and after Extract (goal met).
4. **Extract action** (Breakthrough only): a rig wholly inside the exit band
   spends 1 action to leave the field. It's removed from play, not wrecked.
5. **Reinforcements:** at the start of scheduled rounds, spawn a new enemy rig at
   the enemy deployment corner (distinct chassis).
6. **Crates:** objectives with `crate: true`; claimed on activation end within 2";
   not scored in Recovery.
7. **Perk kits:** `rig.perkKits` merged in `effectiveWeaponProfile`.
8. **Side mods:** the keys above.
9. **`/api/campaign` router** + `data/campaign.json` store: `GET /` (profile +
   run), `POST /unlock`, `POST /run` (start), `POST /run/node` (pick a node →
   room code for contracts), `POST /run/resolve` (server reads the finished room,
   computes the debrief), `POST /run/repair`, `POST /run/recover`, `POST /run/reward`
   (pick card + target), `POST /run/depot/buy`, `POST /run/respec`, `POST /run/abandon`.
   The server is authoritative; the client never reports results.

## Client (client3d) work

- Title menu: **"🗺 Campaign"**.
- **HQ screen:** Renown, Notoriety picker, unlock tree (chassis / equipment /
  natures / relics / workshop), faction banners, run history.
- **Commission:** pick 3 of your unlocked chassis (bare), optional faction banner.
- **Contract map:** column of steps with node cards (type icon, faction crest,
  payout, threat pips); lines drawn between steps; the current step pulses.
- **Briefing:** objective text, enemy faction + perk, enemy chassis list,
  your roster's SP bars, Deploy button.
- **Battle:** the live 3D battle with a **mission HUD** (objective + progress:
  "Commander: alive", "Extracted 1/2", "Survive: round 4/6", "Crates 2"), the exit
  band drawn on the table, crates as props, the commander/warlord with a crown
  marker, a reinforcement banner + drop-in animation, an **Extract** button.
- **Debrief:** win/loss stamp, salvage tally counting up line by line, per-rig SP
  bars with repair buttons (+1 / full), wreck cards with Recover.
- **Reward:** three cards flip in; pick one, then pick the target rig/weapon.
- **Depot:** shop shelves + repair bay + respec.
- **Run end:** summary, Renown counting into the HQ bar, unlock toasts.
- **Equipment in the 3D battle:** every equipment active and every tracked
  upgrade resource has a button, a chip, and an FX (see the equipment audit below).

## Every equipment, fully digital (prerequisite)

The engine implements all 8 equipment pieces and all 24 upgrades, but several
still *narrate* their spatial part (a physical-table habit). A digital room has
no hand to move minis, so these become simulated in `room.mode === "digital"`
(physical rooms keep the narration):

| Equipment / upgrade | Digital behaviour | Attrs |
|---|---|---|
| **Jump Jets** (Servo) | straight-line hop up to base Speed, ignoring terrain and rigs on the way; the landing spot must be clear; any facing | `{action:"jumpjets", dest:{x,y}, facing}` |
| **Grapnel Launcher** (Servo Prototype) | *yank*: hop up to 4" like Jump Jets, breaking any lock. *reel*: an enemy within 8" in LOS and front arc is dragged into base contact and engaged | `{action:"jumpjets", mode:"yank", dest, facing}` / `{action:"jumpjets", mode:"reel", target}` |
| **Heat Purge Wave** (Blast Furnace) | every enemy rig within 3" (rim) takes +2 heat and one Penetration 4 (+Backdraft) / 1 damage hit to a rolled location | `{action:"heatpurgewave"}` |
| **Meltdown burst** (Blast Furnace Prototype) | every enemy rig within 4" (rim) takes +N heat | `{action:"meltdown", n, mode:"burst"}` |
| **Chaff Burst** (Reactive Tuned) | when a smoked rig is fired on, the engine side-steps it half Speed perpendicular to the shot (first clear side); if the step breaks LOS or the attacker's arc, the shot is lost | automatic |
| **Nanite Swarm** (Repair Prototype) | the host must be self or an ally within 3" (rim) | `{action:"nanite", target?, loc}` |

Client (3D) for equipment:

- Buttons for every active and every spend: **Cryo** (spend N), **Meltdown** (N + Pen/Burst), **Nanite** (pick ally + location), **Grapnel** (Yank = move ghost, Reel = target pick; enabled while engaged).
- Jump Jets / Grapnel yank use a straight-line hop ghost that ignores terrain.
- **Equipment chips** on rig cards and the inspector: cryo banked, meltdown charge, nanite stacks, ablative charges, fire-solution stacks, grapnel cooldown, hardened, smoke, overclocked.
- **FX per active:** Harden (plate shimmer + clank), Purge (steam jets), Jump Jets / Grapnel (thruster arc + dust landing; grapnel cable), Overclock (red pulse + sparks), Emergency Patch / Nanite (green welding sparks), Heat Purge Wave (expanding heat ring + scald text on victims), Meltdown (orange ring), Lock Sight (reticle), Pop Smoke (smoke cloud), Chaff (sidestep + chaff glitter), Cryo (frost puff), Point Defense / Ablative Cascade (intercept sparks).

## Mission verb (engine contract)

```js
applyCommand(room, { verb: "mission", attrs: {
  type: "beacons" | "skirmish" | "assassinate" | "breakthrough" | "laststand" | "salvage" | "boss",
  seed,                       // terrain + deployment
  width, height,              // table (default 42×28)
  maxRounds,                  // 6 (boss 7)
  enemyBot: "easy" | "normal" | "hard",
  squads: { a: [unit], b: [unit] },   // unit: { name, chassis, longRangeUpgrade, meleeUpgrade,
                                      //   equipment, equipmentUpgrade, perkKits:{longRange,melee},
                                      //   sp:{hull,arms,legs,engine}?, commander?:true, spMult? }
  mods: { a: {...}, b: {...} },       // side modifiers (table above)
  reinforcements: [{ round, unit }],  // laststand
  crates: n,                          // salvage
  extractGoal: n,                     // breakthrough
}})
```

The room gets `room.campaign = { type, mods, commanderId, extractGoal, extracted: {a:[]}, crates:{a,b}, reinforcements, ended }` and
`room.game.maxRounds`. `game.outcome.reason` gains `"commander"`, `"extraction"`, `"survived"`, `"timeout"`.

## Campaign API (server authoritative)

All under `/api/campaign`, one profile (single player):

| Method + path | Body | Returns |
|---|---|---|
| `GET /` | | `{ profile, run }` |
| `POST /unlock` | `{ id }` | `{ profile }` |
| `POST /run` | `{ chassis:[3 ids], notoriety, banner? }` | `{ run }` |
| `POST /run/node` | `{ nodeId }` | `{ run, room? }` (contract → a started mission room code; depot → run.status "depot") |
| `POST /run/resolve` | | `{ run, debrief }` (reads the finished room) |
| `POST /run/repair` | `{ uid, loc?|"all" }` | `{ run }` |
| `POST /run/recover` | `{ uid }` | `{ run }` |
| `POST /run/reward` | `{ index, target:{uid, slot?} }` or `{ skip:true }` or `{ reroll:true }` | `{ run }` |
| `POST /run/buy` | `{ index, target }` | `{ run }` |
| `POST /run/respec` | `{ uid, slot, upgrade }` | `{ run }` |
| `POST /run/continue` | | `{ run }` (leave debrief/depot → map) |
| `POST /run/abandon` | | `{ profile, run:null, summary }` |

Run `status`: `"map" | "battle" | "debrief" | "reward" | "depot" | "over"`.

## Decisions made while building

- A **boss win** ends the run at once (no reward screen). A **lost contract** pays nothing, kills included.
- **Repairs / recovery** work on the map, debrief and reward screens at field prices, at the Depot at Depot prices. **Respec** is Depot-only.
- **No deployable rig** ends the run only if you can't afford (or have no free) recovery.
- Enemy **faction perk**: Notoriety 0–1 only on the Warlord; 2+ on every contract. The Warlord also gets +1 Answer token each round.
- **Enemy upgrades by Notoriety:** L0 bare (Field from step 3); L1 primary equipment + Field; L2 Tuned from step 3; L3 meta builds from step 3; L4–5 meta builds everywhere, +1 SP per location; L5 also one enemy relic.
- **Depots:** step 4 always offers one; steps 2, 3, 5 have a 25% chance per node (max one).
- Carried SP is clamped to the chassis max: bonus SP from mods or Ablative Plating doesn't carry between fights.
- The player always activates first in a contract.

## Out of scope (for now)

Escort contracts. Tanks/Walkers/support units in campaign fights (digital is
rigs-only; bots can't fire unit weapons yet). Story text beyond one-line
contract flavour.
