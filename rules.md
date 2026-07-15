# Of Oil and Iron — Rules (Working Edition)

**Version:** wr-0.10 · **Base:** standalone working ruleset
**Scale:** distances are written for the models this ruleset uses — **Light on 60 mm bases, Medium on 75 mm bases**. Measure in inches, base-to-base (closest points).
**Dice:** six-sided (**D6**), ten-sided (**D10**), and twelve-sided (**D12**).

> This is the single source of truth. It does **not** reference the old PDF — everything needed to play is here.
> Changes marked **⚙ TUNING** are house decisions or invented baselines that will change during playtesting. See **Design Notes** at the end for the full list.
> Version history is tracked in [`CHANGELOG.md`](CHANGELOG.md).

---

## Contents

1. [Overview](#1-overview)
2. [Rig Statistics](#2-rig-statistics)
3. [Building a Squadron](#3-building-a-squadron)
4. [The Round](#4-the-round)
5. [Actions](#5-actions)
6. [Heat & Overheating](#6-heat--overheating)
7. [Attacking & Damage](#7-attacking--damage)
8. [Catastrophic Damage](#8-catastrophic-damage)
9. [Rig Destruction](#9-rig-destruction)
10. [Deployment](#10-deployment)
11. [Victory — Salvage](#11-victory--salvage)
12. [Weapon Profiles](#12-weapon-profiles)
13. [Weapon Perks](#13-weapon-perks)
14. [Factions](#14-factions)
15. [Equipment](#15-equipment)
16. [Design Notes & Open Items](#16-design-notes--open-items)

---

## 1. Overview

A skirmish wargame of dieselpunk war machines (**Rigs**) piloted by **Ironclads**. Each player commands a **Squadron** of war machines on a **54"×36"** table, both sides fielding a mirrored composition (§3). Players alternate activating Rigs; each Rig manages **heat** as it moves and fights, risking overheating. The game is won by controlling **salvage objectives** (§11).

Each Rig has four components — **Hull, Arms, Legs, Engine** — each with its own **Structure Points (SP)**. Reduce a component to 0 SP and it suffers **catastrophic damage**; destroy the key components and the Rig dies.

**You need:** a matched force per side (see §3 — both sides field the same composition), D6 and D12 dice, a tape measure (inches), terrain, 3 objective markers, and tokens for preparations and catastrophic damage.

> Only **Light** and **Medium** Rigs are currently playable — Heavy and Colossal weapon profiles are not yet written (§12).

---

## 2. Rig Statistics

Every Rig starts from a **weight class**, which sets its base profile.

| Stat | Light | Medium | Heavy | Colossal |
|---|:--:|:--:|:--:|:--:|
| Base size | 60mm | 75mm | 90mm | 120mm |
| Hull SP | 6 | 7 | 8 | 9 |
| Arms SP | 5 | 6 | 7 | 8 |
| Legs SP | 5 | 6 | 7 | 8 |
| Engine SP | 4 | 5 | 6 | 7 |
| Aim | 4+ | 4+ | 3+ | 3+ |
| Speed | 5" | 4" | 3" | 2" |
| Weapon slots | 2 | 2 | 2 | 2 (+1 Hull) |

- **Speed** — max move distance in inches. *⚙ TUNING: whole-inch speeds (5/4/3/2); Mediums bumped back up from an earlier over-nerf.*
- **Aim** — base D6 target number to hit (modified by weapon Accuracy and cover).
- **Weapon slots** — how many weapons the Rig may carry. Colossal Rigs get an extra **Hull-mounted** slot.
- **Structure Points (SP)** — durability per component. At 0 SP → catastrophic damage (§8).

### Toughness (armour)

Armour is a single per-location stat: **Toughness (T)**. It is what the **Wound Roll** (§7.5) tests against — the tougher the location, the higher the D10 you need. There is no lookup table; T feeds straight into one formula.

| Location | Light | Medium | Heavy | Colossal |
|---|:--:|:--:|:--:|:--:|
| Hull | 4 | 5 | 6 | 7 |
| Arms | 3 | 4 | 5 | 6 |
| Legs | 3 | 4 | 5 | 6 |
| Engine | 3 | 3 | 4 | 5 |

Toughness varies **by location, not just by chassis** — a Medium Rig's Hull is **T5** but its Engine is only **T3**. That is why the hit location is rolled *before* the Wound Roll (§7): the location supplies the T you roll against.

*⚙ TUNING: replaced the old per-chassis Impact Tables (four severity grids) with a single Toughness stat. The tables left 69 weapon/target combinations that could never deal damage at any roll; the Wound Roll's clamp (§7.5) makes every matchup live.*

---

## 3. Building a Squadron

> **No Oil, no Iron, no engine types.** Squadrons are built from chassis, weapons, and one equipment slot per Rig (§15). Loadout is limited only by **weapon slots**.

1. **Squadron size** — both sides field the **same composition**: the same number of Rigs in each weight class, the same number of Tanks, and the same number of Walkers. Any size (at least one unit per side); the two forces must mirror each other.
2. **Choose each Rig's weight class** (§2).
3. **Equip weapons** up to the Rig's slots. Weapons come in **two types — Long Range and Melee** (§12), and every Rig **must carry exactly one of each**:
   - Light / Medium / Heavy: **2 weapons — one Long Range and one Melee.**
   - Colossal: **one Long Range + one Melee, plus 1 Hull-mounted weapon** of either type (3 weapons total).
   - **Any weapon may be fitted to any Rig**, regardless of weight class or faction; its **Penetration then scales with the chassis** (Light −1 / Medium +0 / Heavy +1 / Colossal +2, §12).
   - Each equipped weapon has **three upgrade options — one of each nature (Field / Tuned / Prototype)** (§12), and the Rig's equipment offers the same three-nature choice (§15). Choose **one** upgrade for the Long Range weapon, **one** for the Melee weapon, and **one** for the equipment when the Rig is commissioned; a Rig may run **at most one Prototype across its two weapons and its equipment**. A selected upgrade modifies only the item it's chosen for.

### Balancing without points
- **Mirror composition (required):** neither side may deploy until both forces match unit-for-unit by kind — and, for Rigs, by weight class. Readiness is locked until parity is met.
- **Cinematic game:** an off-tracker house variant — bring whatever you like, parity not enforced.

---

## 4. The Round

A game lasts **10 rounds** (§11). Each round has three phases.

**Initiative Phase.** Both players roll 1 D12; highest activates first this round (reroll ties). The player who activates **second** this round gains free **Answer tokens** (§5). *(Round 1 is the exception — initiative there is set by deployment order, not rolled: §10.)*

**Activation Phase.** Players alternate activating **one Rig at a time**, following initiative order. A Rig completes all its actions before the next Rig activates. If one player has no Rigs left to activate, the other player activates their remaining Rigs back-to-back.

**Recovery Phase.** In this order:
1. Each Rig reduces its heat by **1** (unless an effect forbids cooling). *⚙ TUNING: cut to 1 so heat lingers between rounds.*
2. Remove all unspent preparation and Answer tokens.
3. **Score objectives** (§11).
4. Resolve any other end-of-round effects.

The game then returns to the Initiative Phase of the next round, unless a player has already won.

---

## 5. Actions

Each Rig may take **up to 3 actions** per activation. The number in **[brackets]** is the base heat it generates (see §6 for **Sprint** and **Hot** modifiers). You need not use all 3 — pushing hard risks overheating (§6). *⚙ TUNING: action budget cut from 5 to 3 to tighten each activation.*

- **Move [1]** — reposition up to the Rig's full Speed. **May be taken more than once per activation**, each spending 1 action and generating heat. *⚙ TUNING: multiple moves allowed; heat scales with distance covered.*
  - *Forward:* up to full Speed, straight ahead.
  - *Backpedal:* straight back at **half** Speed.
  - *Side-step:* directly left or right without changing facing, at **half** Speed.
  - *Pivot:* up to **90° free** at any point(s) during the Move. A pivot of **more than 90°** consumes the Rig's entire movement for that action.
  - *Sprint:* you may extend a Move to up to **1½ × Speed** (**2 × Speed** with Reinforced Servos); a Sprinting Move generates **2 heat** instead of 1 (§6). Sprint is **never free** — its heat floors at 1 no matter the loadout.

- **Disengage [1]** — break a melee **engagement** (see below). Frees **both** Rigs from the lock; after Disengaging, the Rig may Move/Sprint later in the same activation. No effect (and costs nothing) if the Rig isn't engaged.

- **Fire Weapon [1]** — attack with one equipped weapon (§7). A ranged weapon is spent after firing: to fire it **again** in the same activation you must **Reload** first — for a Rig this costs **no action**, paid in heat instead (§5) — a spent weapon cannot be fired. Each fire costs 1 action, but the **second (and later) ranged shot** of an activation runs the barrel hot for **+1 heat**. So Fire · Reload · Fire uses 2 actions (two shots) and 1 + (1–2) + 2 = 4–5 heat. **Melee** weapons never need reloading.

- **Aimed Shot [1]** — a Fire Weapon action where you **choose the hit location** instead of rolling for it, at **−2 Accuracy**.

- **Reload** — Reloading a spent ranged weapon no longer costs an action. Instead a Rig rolls
  a d6 for heat when it reloads: **1-3 → +2 heat, 4-6 → +1 heat**. Cold units
  (Tank / Walker) have no heat track, so they reload for **1 action** instead. A
  reloaded shot is still the activation's second ranged shot, so it also runs
  **+1 heat** hot.

- **Repair [1]** — roll 1 D6 and repair that many SP to any one location: **1-2 → 1 SP**, **3-4 → 2 SP**, **5-6 → 3 SP**. A Repair never whiffs. *⚙ TUNING: now generates 1 heat; was a D12 that failed below 7.*

- **Shut Down [0]** — end the activation and vent heat. May be declared **at any point** in the activation; cooling is **proportional** to how much of the activation is spent shutting down — declared first (no actions used) it vents all heat to the floor, and the more slots already spent, the less it sheds. *⚙ TUNING: was first-action-only + full vent.*

- **Prepare [1]** — generate 1 heat and place a facedown preparation token by the Rig, choosing one reaction below. It lasts until this Rig's next activation; reveal it when its trigger occurs. A Rig may hold **only one** preparation at a time.
  - *Evasive Manoeuvre* — when targeted by an attack on an enemy's turn, **before** the attack resolves, move up to **half Speed** in any direction. If this puts the Rig out of range or line of sight, the attack fails.
  - *Return Fire* — after an enemy Rig attacks this Rig, **pivot for free to face that enemy** (this is not a Move — a pinned Rig may still do it), then choose 1 weapon and make an attack against it.
  - *Brace for Incoming Fire* — attacks against this Rig's **front arc** suffer **−2 Penetration on their Wound Rolls** until the next round. While braced the Rig is **immovable** — it cannot be pushed, shoved, or staggered by weapon perks — and a **melee** attacker that swings at its front and **fails to breach** (deals no SP) eats a **free Penetration 6 melee counter** (once per round). *⚙ TUNING: counter Penetration 6.*

- **Answer Tokens (for the player going second).** At the start of each round, the player who activates **second** gains **1 Answer token**. An Answer token may be spent at any time to place one of the preparations above on one of their Rigs **for free** — no action, no heat — otherwise following all normal preparation rules (facedown, revealed on trigger, one per Rig). Unspent Answer tokens are removed in the Recovery Phase. *⚙ TUNING: 1 per round.*

- **Answer Counters (Answer-token only).** Instead of a generic preparation, an Answer token may place one of three **counters** — reactions the Prepare action cannot buy, the reward for activating second and watching the enemy commit. Each is facedown, revealed on its trigger, one per Rig, and fires only when its condition is met (otherwise it stays down for a later attack):
  - *Riposte* — when an enemy makes a **melee** attack against this Rig, after it resolves this Rig makes **one free melee attack** back at that attacker (no action, no heat).
  - *Sidestep the Shooter* — when an enemy makes a **ranged** attack against this Rig, **before** it resolves move up to **½ Speed** (the attack fails if this breaks range or line of sight); if the move reaches the shooter you may **engage it for free**.
  - *Exploit Opening* — when an **overcommitted** enemy attacks this Rig (it spent its **final action** on the attack, or is **overheated**), **pivot to face** it and make a **free Aimed counter-shot** at the location you choose, with **no aim penalty**.

### Engagement (melee lock)

Closing to melee **locks two Rigs together** — this is what stops an enemy from simply kiting you with ranged fire. *⚙ TUNING: new mechanic to make melee matter.*

- **Getting engaged.** A Rig becomes **engaged** with an enemy either by **making a melee attack** against it (in reach) or by **Moving into base contact** and declaring the engagement. The lock is **mutual** (both Rigs are engaged) and **one-to-one** (a Rig already engaged can't be pulled into a second lock; you may still melee an already-engaged enemy, you just don't lock to it).
- **Pinned.** While engaged, a Rig **cannot Move, Sprint, or Jump Jets** — it must **Disengage** first (a 1-action, 1-heat step, §5). Non-movement equipment (Harden, Purge, Overclock, Emergency Patch) still works.
- **Ranged penalty.** An engaged Rig firing a **ranged** weapon does so at **−2 Accuracy** (point-blank scramble). **Melee** attacks are unaffected — so while locked, your melee weapon is the better answer.
- **Breaking the lock.** Engagement ends when: a Rig spends **Disengage** (frees both), the engaged partner is **destroyed** or **immobilised** (legs gone), or a Rig **Disengages and moves away**. Engagement **persists across rounds** — it is *not* cleared in Recovery.

---

## 6. Heat & Overheating

Actions and some weapon perks generate **heat**, tracked upward on the Rig. At the **end of the Rig's activation**, if heat has climbed past the Rig's **Heat Capacity**, the engine may misfire — and the hotter it runs, the worse the misfire. (The Engine is still a body component; Rigs no longer choose an engine *type*.)

### Heat generation

| Action | Heat |
|---|:--:|
| Move (up to Speed) | 1 |
| Move — **Sprint** (up to 1½× Speed; 2× with Reinforced Servos) | 2 |
| Fire Weapon | 1 (**2** if the weapon is **Hot**) |
| Aimed Shot / Prepare | 1 |
| Reload (Rig) | +1–2 (d6) |
| Repair | 1 |
| Disengage | 1 |
| Shut Down | 0 |

- **Full Auto** and **Charged Shot** fire-modes: each attack **die** that rolls a **1** adds 1 heat.

### Heat Capacity (by weight class)

Heavier Rigs run hotter — their mass works the engine harder. A Rig is safe up to its Heat Capacity; beyond it, it risks a misfire. (Heat Capacity is a heat value, not a distance — it is **not** affected by the distance scale.)

| Weight class | Heat Capacity |
|---|:--:|
| Light | 6 |
| Medium | 5 |
| Heavy | 4 |
| Colossal | 3 |

### Overheat check

At the end of an activation, compare the Rig's current heat to its Heat Capacity:
- **Heat ≤ Capacity** → safe, no roll.
- **Heat > Capacity** → roll **1 D12 + [2 × (heat − Capacity)]** (this bonus is capped at **+10**) and consult the **Heat Threshold Table**.

*Example: a Colossal (Capacity 3) ending its activation on heat 6 rolls D12 + 6.*

Heat is reduced by **1** each Recovery Phase (§4); the **Shut Down** action (§5) sets it to 0.

**Heat Threshold Table** (D12 + overheat bonus)

| Result | Effect |
|:--:|---|
| 1–5 | Nothing happens. |
| 6–7 | **System Stall** — 1 damage to the Engine. |
| 8–9 | **Ammunition Detonation** — 2 damage to the Arms. |
| 10–11 | **Hydraulic Blowout** — 2 damage to the Legs; halve Speed next turn (round down). |
| 12–13 | **Structural Buckling** — 1 damage to each component (Hull, Engine, Arms, Legs). |
| 14–16 | **Engine Failure** — 2 damage to the Engine; heat can no longer be decreased for the rest of the game. |
| 17+ | **Catastrophic Failure** — catastrophic damage to all components (§8); heat can no longer be decreased. |

---

## 7. Attacking & Damage

1. **Declare attacker & target.** The target must be in the attacker's **front 90° arc**. Declare before measuring.
2. **Check range.** Measure base-to-base; the distance must fall within the weapon's **min–max range band**. Out of range → the attack fails. (Do not pre-measure before declaring.)
3. **Verify line of sight.** At least **50%** of the target must be visible.
   - Up to **25% obscured** → **−1 Accuracy**.
   - Up to **50% obscured** → **−2 Accuracy**.
4. **Roll to hit.** Roll **ROF** D6. Apply Accuracy modifiers (weapon + cover) to the Rig's **Aim**; each die that **meets or beats** the modified Aim is a hit. A natural **6 always hits**. A ranged weapon's **Accuracy depends on the measured distance** — see the **sweet-spot** rule below.

**Sweet spot (ranged Accuracy by distance).** A ranged weapon fires most accurately at its **sweet spot** (an optimal distance in inches), where it delivers its **peak Accuracy**. The farther the measured distance is from the sweet spot — **closer *or* farther** — the more accuracy bleeds off: subtract the weapon's **falloff** (Accuracy lost per inch) times the number of inches away from the sweet spot. So a long-range gun is sloppy in your face *and* at extreme range, sharpest in its band. **Melee** weapons ignore this — they carry a single fixed Accuracy at their **2" reach**. *⚙ TUNING: replaced the old flat near/far Accuracy bands with a continuous sweet-spot falloff.*
5. **Apply weapon perks** (§13).
6. **Determine impact location.** Unless it was an **Aimed Shot**, the *defender* rolls 1 D12:

   | D12 | Location |
   |:--:|---|
   | 1–4 | Hull |
   | 5–7 | Arms |
   | 8–10 | Legs |
   | 11–12 | Engine |

7. **Wound Roll.** For **each hit**, roll 1 **D10** against the struck location's **Toughness** (§2). The hit wounds on:

   > **D10 ≥ 6 + Toughness − effective Penetration**

   Your **effective Penetration** is the weapon's Penetration (adjusted for the firing Rig's weight class, §12), plus its **arc bonus** below, plus any perk or equipment modifiers. Each point of Penetration is worth exactly **10%** — no lookup needed.

   **Arc bonus.** Add **+2 Penetration** into the target's **side arc** and **+3 Penetration** into its **rear arc**; the front arc gives nothing. **Melee climbs the same ladder as ranged** — a melee weapon flanking a target gains the bonus exactly as a gun does. *(Raking Fire machine guns replace these values — §13.)* *⚙ TUNING: melee used to gain no arc bonus at all, which capped its damage and was the root cause of the old model's dead matchups.*

   **The target number clamps to 2–10.** A natural **10 always wounds** and a natural **1 never does**, whatever the numbers say. No target is ever immune. *⚙ TUNING: the clamp is deliberate — it is what retired the old Impact Tables' 69 dead matchups. Do not remove it to "make armour matter".*

   **Overmatch.** Once your effective Penetration reaches the location's **Toughness + 4**, the target number is sitting on its floor of 2 and any further Penetration would be thrown away. Spend it on depth instead: every **3** full points beyond **Toughness + 4** add **+1 Damage** to each wound, to a maximum of **+2**. So against T4 arms you need effective Penetration 11 for +1 D and 14 for +2 — and Penetration past that adds nothing. *⚙ TUNING: new. Without it the arc bonus, the weight-class Penetration mod and every +Penetration upgrade measured as literally zero on a saturated weapon, since they only ever pushed a target number that was already clamped.*
8. **Apply damage.** Each wound costs the location the weapon's **Damage (D)** stat in SP (§12) — plus any per-wound riders such as **Overmatch** (step 7) or **Rend** (§13). A hit that fails to wound does nothing.

**Damage overflow.** If a hit strikes a location already at 0 SP, the **defender** chooses another non-destroyed location to take that damage. *(Engine note: the digital tracker auto-routes overflow to the Hull, or the next location with SP remaining if the Hull is already at 0.)*

A Rig is **destroyed** when all four components are at 0 SP, or by the Hull/Engine rules in §8.

---

## 8. Catastrophic Damage

When a location hits **0 SP**, apply its effect. Further damage to that same location applies the "additional damage" clause.

| Location | At 0 SP | Additional damage |
|---|---|---|
| **Legs** | Move −3"; pivots cost double movement; cannot backpedal. | Rig is **immobilised** for the game (may still pivot); **1 damage spills to Hull** (overflow). |
| **Hull** | −2 to maximum actions per activation; −1 Aim. | Rig suffers **total system failure — destroyed**. |
| **Arms** | Roll D12 for which weapon is destroyed (see below); its munitions explode: **1 damage to Hull and 1 to Engine**. | Same weapon: **1 damage to Hull** (overflow); weapon already gone. |
| **Engine** | Rig **loses its next activation**; heat cannot drop below 3 (raise to 3 if lower). | Rig suffers **total system failure — destroyed**. |

**Arms — which weapon?**

- Light / Medium / Heavy: **1–6 Left**, **7–12 Right**.
- Colossal: **1–4 Left**, **5–8 Hull**, **9–12 Right**.

---

## 9. Rig Destruction

When a Rig is destroyed, roll 1 D12: on **4+** its fuel and munitions erupt. All Rigs within **4"** suffer a flat **Penetration 8 / D2** hit, wounding on a D10 like any other attack (§7.5) — the destroyed Rig's controller rolls the wound; each affected Rig's controller rolls its own hit location.

---

## 10. Deployment

**Table:** 54"×36" (137×91 cm). The armies set up in **opposite corners** and advance across the diagonal — an angled clash that keeps flanks exposed and rewards the facing/melee game.

1. **Terrain.** Roll off (1 D12 each, highest wins). Starting with the winner, alternate placing **one terrain piece at a time** — aim for **4–6 pieces**. Leave line-of-sight blockers and lanes in the middle; the flanking game needs cover to move around.

2. **Sides.** A **dividing line runs from one corner to the opposite corner**, splitting the table into two triangular halves. The **terrain roll-off winner** chooses which of the two diagonals is used and which half is theirs; the opponent takes the opposite corner.

3. **Objectives.** Place **3 markers**: one at the **table centre** (**2 VP**), and one **18" from centre toward each of the two empty corners** (the corners no one deploys in) — **1 VP** each. All three sit in the contested ground between the armies. If a marker lands on impassable terrain, shift it the shortest distance to clear ground.

4. **Order.** The player who took the **opposite corner** (the roll-off loser) chooses **who deploys first**. Players then alternate placing **one Rig at a time**, starting with the first-deployer.
   - Each Rig must be deployed **fully within 8"** of your **deployment corner** — a quarter-circle staging zone, measured from the corner to the nearest edge of the base. Squadrons start clustered in their corner and advance across the diagonal into the contested centre.
   - **Declare facing** as each Rig is placed.

5. **Round 1 initiative (unified with deployment).** There is **no initiative roll in Round 1**: the player who **deployed first activates second** — and so gains Round 1's **Answer tokens** (§5), the payoff for committing first. From **Round 2** on, roll initiative normally (§4).

### Optional variants
- **Pitched (opposite edges)** — the classic head-on clash: 9"-deep zones on the two opposite long edges, 18" apart. Slower, more of a straight firefight.
- **Ambush** — the first-deployer may hold **up to 1 Rig in reserve**, bringing it on from any edge of their own half on a later round by spending its activation to enter (move up to half Speed from that edge).

---

## 11. Victory — Salvage

The battle is fought over scrap scattered across the wastes. Tuned for small games (**3 Rigs a side**); scales fine up to 5.

### Objectives
- **3 markers**, placed during deployment (§10): the **table centre** (**2 VP**) and one toward each **empty corner** (**1 VP** each).
- The valuable centre pulls both squadrons together instead of camping their own corner.

### Control
- A Rig **controls** a marker if it is **within 2"** and **no enemy Rig** is also within 2".
- If both sides have a Rig within 2", the marker is **contested** — nobody scores it.
- A destroyed Rig's wreck does **not** hold objectives (remove it from control).

### Scoring & winning
- During each **Recovery Phase**, each player scores the VP value of every marker they control.
- **Annihilation:** if a player has **no Rigs left** at any point, their opponent **wins immediately**.
- **On points:** after **10 rounds**, **most VP wins**. Tie → one **sudden-death** round; still tied → **draw**.

### Priority Elimination
At the start of every round each squadron is assigned a single **Priority Target** — one random enemy Rig, known only to the hunting side. Destroy **your** Priority Target and you score **+2 VP**; wrecking any other enemy Rig scores nothing. The target is re-rolled each round, so the pressure moves from machine to machine. This is the game's only kill reward — it pays to hunt the mark, not just trade blows.

---

## 12. Weapon Profiles

Every weapon is one of **two types**, and every Rig equips **one of each** (§3):

- **Long Range** — any weapon **without** the Melee perk. Fires at range; once spent it must be **reloaded** between shots in the same activation. The second such shot in an activation costs **+1 heat** (§5).
- **Melee** — any weapon with the **Melee** perk (RNG 2"). Usable only within 2" and never needs reloading.

Any weapon may be fitted to a Rig of **any weight class** and **any faction**. Ranged weapons use the **sweet-spot** model (§7): **Sweet** is the optimal distance (inches), **Peak** is the Accuracy at that distance, **Falloff** is the Accuracy lost per inch away from the sweet spot (in either direction), and **Range** is the min–max band the weapon can fire within. **Melee** weapons instead carry a single fixed Accuracy at a **2" reach**.

**Weight-class Penetration.** The **Penetration** listed below is the **Medium** baseline. A weapon's Penetration shifts with the chassis carrying it — heavier Rigs drive it harder, lighter Rigs can't. Everything else (ROF, Accuracy, RNG, perks) is unchanged:

| Chassis | Light | Medium | Heavy | Colossal |
|---|:--:|:--:|:--:|:--:|
| **Penetration modifier** | −1 | +0 | +1 | +2 |

Apply this modifier to the weapon's Penetration every time you make a Wound Roll (§7). *Example: a Sniper Cannon (Penetration 10) reads Penetration 9 on a Light Rig, 10 on a Medium, 11 on a Heavy, 12 on a Colossal.* *⚙ TUNING: the ladder was halved from ±2/±4 when Penetration was rescaled for the Wound Roll — each point is now worth a flat 10%, so it buys twice as much as it used to.*

> **Perks are being reworked.** Base weapons now carry **stats only** — every *signature* perk is delivered by the weapon's chosen **upgrade** (see *Weapon Upgrades* below). The perk mechanics in §13 still apply; how each weapon earns its signature perks is a redesign that is **still open**, so the tables below list no base perks. **Exception:** the two **Machine Guns** (Mini Gun, Double MG) carry **Raking Fire** innately (§13) — it defines the weapon type (no frontal damage; +3 side / +6 rear), not a signature upgrade. *Melee* is likewise a weapon **type** (the Melee Weapons section), not a perk.

> **Upgrade natures.** Every weapon now offers **three** upgrades, one of each nature, and you pick **one per weapon**:
> - **Field** — unconditional, always-on, reinforces the weapon's role. The safe default.
> - **Tuned** — conditional: a trigger (target state, timing, positioning) that out-pays Field when set up.
> - **Prototype** — systemic, tracked, high-payoff, and may carry a downside. **A rig may run at most one Prototype.**

### Long Range Weapons

**Machine Guns** — fast-firing, low-Penetration flanking specialists.

| Weapon | ROF | Pen | Dmg | Sweet | Peak | Falloff/in | Range |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Mini Gun | 8 | 3 | 1 | 7" | +2 | −0.35 | 0–18" |
| Double MG | 8 | 5 | 1 | 9" | +1 | −0.25 | 0–20" |

**Cannons & Artillery** — front-capable firepower.

| Weapon | ROF | Pen | Dmg | Sweet | Peak | Falloff/in | Range |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Autocannon | 4 | 7 | 2 | 12" | +1 | −0.22 | 0–26" |
| Arc Gun | 2 | 8 | 3 | 20" | +1 | −0.18 | 0–32" |
| Mortar | 3 | 7 | 2 | 18" | +1 | −0.15 | 6–34" |
| Sniper Cannon | 1 | 10 | 4 | 22" | +2 | −0.15 | 0–28" |
| Siege Maul | 1 | 11 | 5 | 8" | +1 | −0.30 | 0–16" |
| Missile Barrage | 4 | 7 | 2 | 20" | +1 | −0.15 | 6–34" |
| Harpoon | 1 | 10 | 3 | 14" | +2 | −0.28 | 0–22" |
| Rivet Gun | 6 | 3 | 1 | 6" | +2 | −0.40 | 0–14" |
| Crossbow | 1 | 8 | 4 | 18" | +3 | −0.25 | 0–24" |

> The **Missile Barrage** is a long-reach, high-volume salvo launcher with loose Accuracy up close.

> The **Siege Maul** is a close-in demolition gun: the highest Penetration on the board, but the shortest range of any ranged weapon.

> The **Harpoon** is a heavy line-thrower — a Sniper Cannon–grade Penetration punch with a shorter, closer sweet spot. The **Rivet Gun** is a rapid, low-Penetration fastener gun with the shortest max range of any weapon in the table — volume, not punch.

### Melee Weapons

| Weapon | ROF | Pen | Dmg | Acc | RNG |
|---|:--:|:--:|:--:|:--:|:--:|
| Sword | 2 | 5 | 3 | – | 2 |
| Circular Saw | 3 | 5 | 2 | – | 2 |
| Chainsaw | 3 | 7 | 2 | – | 2 |
| Claw | 2 | 7 | 3 | +1 | 2 |
| Lance | 1 | 9 | 4 | +1 | 2 |
| Wrecking Ball | 1 | 10 | 5 | – | 2 |
| Bulwark Shield | 1 | 5 | 3 | – | 2 |
| Flamethrower | 4 | 6 | 2 | +1 | 2 |
| Anchor | 1 | 10 | 4 | – | 2 |
| Pressure Claw | 2 | 7 | 3 | +1 | 2 |
| Talon | 2 | 6 | 3 | +1 | 2 |

### Weapon Upgrades

Each weapon offers **three upgrades, one of each nature** (see *Upgrade natures* above). When a Rig is commissioned, choose **one** upgrade for each equipped weapon; a Rig may run **at most one Prototype** across its two weapons. Full Tuned/Prototype mechanics are detailed below the table.

| Weapon | Field | Tuned | Prototype |
|---|---|---|---|
| Mini Gun | Suppressive Fire (Shock) | Extended Belt (+2 ROF; 1s add heat) | Suppression Lock |
| Double MG | Gyro Mount (reroll a miss) | Pinning Burst (4+ hits → −1 action) | Kneecapper |
| Autocannon | Depleted Core (+2 Penetration) | AP Shells (Armour Piercing) | Penetrator Rounds |
| Arc Gun | Ion Burn (Incendiary) | Systems Overload (−1 action) | Ion Storm |
| Mortar | Cluster Shells (2nd location) | Airburst Fuze (ignores cover) | Barrage |
| Sniper Cannon | Marksman Optics (Precision) | Cold Bore (+3 Penetration vs undamaged) | Enfilade |
| Siege Maul | Reinforced Head (+2 Penetration) | Breaching Round (Hull no-repair) | Piledriver Protocol |
| Missile Barrage | Swarm Warheads (+1 ROF) | Shaped Charges (Armour Piercing) | Fire Control Lock |
| Sword | Duelist's Balance (Precision) | Opportunist (+3 Penetration vs disrupted) | Superconductor Edge |
| Circular Saw | Tempered Teeth (Armour Piercing) | Sunder (−1 max SP struck) | Dismember |
| Chainsaw | Ripper Teeth (Rend) | Bloodletter (+1 ROF vs damaged) | Redline Governor |
| Claw | Rending Talons (Rend) | Vice Grip (Impale) | Breach Grip |
| Lance | Couched Reach (+2" reach) | Full Tilt (+3 Penetration charge) | Skewer |
| Wrecking Ball | Haymaker (+3 Penetration) | Momentum Swing (+2 Penetration charge) | Tow Chain |
| Bulwark Shield | Tower Shield (front+side) | Anvil Boss (riposte) | Emplacement |
| Flamethrower | Sticky Fuel (Rend) | Napalm (Burning) | Conflagration |
| Harpoon | Barbed Head (Impale) | Taut Cable (+3 Penetration vs pinned/engaged) | Harpoon Winch |
| Rivet Gun | Rapid Feed (+2 ROF) | Staple Burst (4+ hits → −1 action) | Rivet Lock |
| Anchor | Fluked Head (+3 Penetration) | Dead Weight (no Disengage next) | Ground Anchor |
| Pressure Claw | Hardened Jaws (Armour Piercing) | Crush Grip (−1 max SP) | Hydraulic Vice |
| Crossbow | Fletched Bolts (Precision) | Steady Aim (+3 Penetration in sweet band) | Pinning Bolt |
| Talon | Honed Talons (+2 Penetration) | Exploit Wound (+3 Penetration vs damaged location) | Evisceration |

#### Tuned / Prototype Upgrade Mechanics

The table above predates the Field/Tuned/Prototype natures and lists only the original two options; each weapon now offers a third, conditional **Tuned** (and a fourth, systemic **Prototype**) upgrade (see *Upgrade natures* above). Mechanics are implemented incrementally — each line below is live in the engine:

- **Cold Bore** (Sniper Cannon, Tuned) — +3 Penetration when the target's every location (Hull/Arms/Legs/Engine) is at max SP.
- **Full Tilt** (Lance, Tuned) — +3 Penetration if the Rig moved (Move or Sprint) at any point this activation before striking.
- **Momentum Swing** (Wrecking Ball, Tuned) — +2 Penetration under the same "moved this activation" trigger as Full Tilt. When such a charging swing lands ≥1 damaging hit, the engine emits a player instruction — *"Momentum Swing — knock &lt;target&gt; back 3" (move the mini)."* — for the players to resolve on the board (no coordinates are simulated).
- **Bloodletter** (Chainsaw, Tuned) — +1 ROF (an extra to-hit die) vs a target missing SP anywhere.
- **Opportunist** (Sword, Tuned) — +3 Penetration vs a target that is overheated (heat over its class's Heat Capacity) or is carrying an action penalty into its next activation.
- **Pinning Burst** (Double MG, Tuned) — landing 4+ hits in one attack pins the target: it loses 1 action on its next activation.
- **Anvil Boss** (Bulwark Shield, Tuned) — while Raise Shield is up, the *first* enemy to hit this Rig with a **melee** attack each round eats a free Penetration-6 melee counter-hit from the shield-bearer. Melee only (ranged attacks provoke nothing), once per round.
- **Redline Governor** (Chainsaw, Prototype) — the attacker's own heat over its class's Heat Capacity adds +1 Penetration and +1 to-hit die each, capped at +3/+3.
- **Superconductor Edge** (Sword, Prototype) — while the attacker's heat is over half its class's Heat Capacity, the blade gets +2 Penetration, and once per attack (not per hit) 1 heat is drawn from the attacker into the target.
- **Burning** (status) — a rig on fire takes `burning` SP to its Hull at the start of each of its activations, then keeps burning until doused. The **Douse** action (1 slot, 0 heat) removes one Burning stack.
- **Napalm** (Flamethrower, Tuned) — a landed hit sets the target Burning at 1; it never stacks past 1, so one Douse clears it.
- **Conflagration** (Flamethrower, Prototype) — each landed hit adds +1 Burning to the target (stacks with no cap) and runs the attacker +1 heat as its downside; each stack needs its own Douse.
- **Penetrator Rounds** (Autocannon, Prototype) — every 3rd Autocannon volley (per-rig belt counter) **skips the Wound Roll entirely**: every landed hit wounds automatically, regardless of location or Toughness. The belt then cycles slow for exactly the attack right after — that attack's ROF is halved.
- **Suppression Lock** (Mini Gun, Prototype) — consecutive hits on the *same* target ramp a pin: 1 stack halves its Speed next round, 2 stacks also docks it 1 action on its next activation, 3 stacks pins it in place (can't Move, Sprint, or Jump Jets) and blocks its next Prepare entirely. The pin and the Prepare-block are temporary — the pin clears in Recovery (one round) and must be re-applied by continued fire; it never uses the permanent leg-destruction immobilise. Firing on a different target resets the count to 1 stack. The attacker runs +1 heat every attack while the lock is active. Stacks cap at 3 and don't decay on their own.
- **Ion Storm** (Arc Gun, Prototype) — a landed Arc Gun hit EMPs the target: it loses 1 action, can't Prepare, and can't fire an equipment active on its next activation, plus takes a 2-heat spike. The discharge overloads the attacker: +3 self-heat and its own Arc Gun can't fire until its next attempt (which is refused and clears the overload).
- **Fire Control Lock** (Missile Barrage, Prototype) — the **Lock Target** action (1 slot, 1 heat) paints one target. The next Missile Barrage volley aimed at that exact rig, this round or the next, can't miss (every shot hits) and gains Armour Piercing; the paint is then consumed. An unused lock goes stale after its expiry round and does nothing.
- **Skewer** (Lance, Prototype) — a damaging Lance blow (≥1 hit dealing SP) that leaves the target locked to the skewerer impales it. While impaled, if that target **Disengages** from the skewerer it first eats a free Penetration-11 Lance strike as it tears free, then the lock breaks as normal. The impale clears with the lock (a destroyed skewerer strikes nothing).
- **Breach Grip** (Claw, Prototype) — a damaging Claw blow (≥1 hit dealing SP) pries the struck location's armour open. That location is **cracked** for a two-round window — the round it lands (N) and the next (N+1), gone by N+2: while the crack is live, **every** Wound Roll against it — from any attacker with any weapon — gets **+2 Penetration**. The crack expires automatically in Recovery once its round passes.
- **Dismember** (Circular Saw, Prototype) — the escalation of Sunder: a damaging Saw hit reduces the struck location's max SP by 1 **and** checks for a cripple. Once that max is ground to **≤ half** the location's commissioned original, the location is **permanently crippled** (once): legs → the rig is immobilised for good; an arm/weapon location → a weapon is destroyed; hull/engine → that location can never be repaired again.
- **Emplacement** (Bulwark Shield, Prototype) — the **Emplace** action (1 slot, 0 heat) roots the Rig into a fortress stance: its Raise Shield becomes permanent (auto-raised free at each activation start — no Prepare action, no Answer token), its action budget drops from 3 to 2, and it can no longer Move, Sprint, or Jump Jets. The **Un-plant** action (1 slot) lifts the stance and costs +2 heat. Emplacing is on a 3-round cooldown measured from when it was entered (re-enter no earlier than the round you emplaced + 3).
- **Piledriver Protocol** (Siege Maul, Prototype) — a **Momentum** system. The Rig gains **+1 Momentum** for any activation it **advanced** (Moved or Sprinted), capped at 3; Momentum persists between activations. A Siege Maul shot spends **all** stored Momentum: the hit ignores the target's **Brace** (no −2) and **cover**, and gains **+1 Penetration per Momentum** spent (Momentum then resets to 0 whether or not the shot connected). **Downside:** while storing Momentum (> 0) the Rig **cannot Raise Shield** — a requested Raise Shield downgrades to Brace (all-in on the charge, no guard). When a Momentum-spending smash lands ≥1 damaging hit, the engine emits a player instruction — *"Piledriver — shove &lt;target&gt; back 3" (move the mini)."* — for the players to resolve on the board (no coordinates are simulated).
- **Enfilade** (Sniper Cannon, Prototype) — a spatial ricochet, narrated rather than simulated. Only **aimed** Sniper Cannon shots feed a per-rig counter; on every **3rd** aimed shot the engine emits a player instruction — *"Enfilade — ricochet! Resolve a +2 Penetration hit on the next rig in line of sight behind &lt;target&gt; (player's choice)."* The player picks the rig behind the target (they know line of sight) and applies the +2 Penetration hit via the normal attack/damage controls. Only the aimed-shot cadence is tracked in state.
- **Steady Aim** (Crossbow, Tuned) — +3 Penetration when the measured firing distance is within 2" of the Crossbow's sweet spot (16–20").
- **Exploit Wound** (Talon, Tuned) — +3 Penetration against a struck location already below its max SP.
- **Evisceration** (Talon, Prototype) — a **wound** on a location at or below half its max SP deals **+1 Damage**; downside: −1 Penetration against a fully-undamaged struck location.
- **Pinning Bolt** (Crossbow, Prototype) — a damaging bolt immobilises the target until the firer's next activation (guaranteed, no roll, may still pivot); the firer runs +2 heat.
- **Barrage** (Mortar, Prototype) — the **Barrage** action (1 slot) commits the Mortar to a shelled zone. The engine emits a player instruction — *"Barrage — place a shelled-zone marker within 6–34" of this Rig; it shells a 3" zone for 2 rounds. Each round, apply 1 SP to every rig in the zone (players adjudicate who's inside)."* — and sets `barrageRoundsLeft = 2`. While a barrage is active the Mortar is **locked** (it can't fire a direct shot; melee is unaffected), and each **Recovery** the Rig takes **+1 heat** (upkeep) and emits the per-round apply-SP prompt before counting down. After 2 Recoveries the barrage ends and the Mortar unlocks. A Rig can't start a new Barrage while one is still running, and only a Mortar carrying this upgrade can Barrage.
- **Tow Chain** (Wrecking Ball, Prototype) — a spatial fling, narrated rather than simulated. On a damaging Wrecking Ball hit, if the chain is charged (`round ≥ towChainCooldownUntil`), the engine emits a player instruction — *"Tow Chain — fling &lt;target&gt; up to 4" in a direction you choose (move the mini). You are rooted until end of activation; +2 heat."* The attacker takes **+2 heat**, is **rooted for the rest of this activation** (no Move/Sprint after the tow), and the fling goes on a **3-round cooldown** (`towChainCooldownUntil = round + 3`). While recharging, the Wrecking Ball hits normally with no fling.
- **Kneecapper** (Double MG, Prototype) — this Double MG only ever strikes limbs (Arms or Legs — whatever the hit location resolves to is remapped onto one if it isn't already): Hull and Engine can **never** be damaged by it, on any arc — not even the §8 cook-off/cascade from a limb hitting 0 SP spills into them (it *cripples, never kills*). Against limbs it also bypasses its own Raking Fire front-arc auto-fail, at the standard side-arc value (+2 Penetration); side/rear keep their normal Raking Fire bonuses. A limb a Kneecapper has raked to **≤ half** max SP is progressively crippled: a raked Leg keeps re-flagging Speed halved next round for as long as it stays at or below half, and a raked Arm halves that Rig's own ROF (**all** weapons) until repaired back above half. Only limbs a Kneecapper actually hit ramp — ordinary weapons impose no half-limb debuff — and a raked limb repaired above half is re-armable, so **switching limbs resets the ramp**.
- **Taut Cable** (Harpoon, Tuned) — +3 Penetration against a target already pinned down: immobilised, or held in a melee lock (engaged).
- **Harpoon Winch** (Harpoon, Prototype) — a spatial reel, narrated rather than simulated. On a damaging Harpoon hit, if charged (`round ≥ harpoonWinchCooldownUntil`), the engine emits a player instruction to reel the target up to 4" toward the attacker. The attacker takes +2 heat, is rooted for the rest of this activation, and the reel goes on a 3-round cooldown. While recharging, the harpoon fires normally with no reel.
- **Dead Weight** (Anchor, Tuned) — a damaging Anchor blow pins the struck target under the anchor: it cannot Disengage on its next activation (scoped to that one activation).
- **Ground Anchor** (Anchor, Prototype) — a damaging Anchor blow that leaves the target locked to the anchorer drives the anchor in. If that target Disengages, it first eats a free Anchor strike (the Anchor's natural Penetration) as it tears free, then the lock breaks. The mark clears with the lock.
- **Rivet Lock** (Rivet Gun, Prototype) — consecutive damaging volleys on the *same* location stack rivets; switching target or location resets to 1. At 3 rivets the location seizes: its SP can't be repaired, and a weapon-role location (a rig's Arms) jams the rig's long-range weapon for a round. Seizes expire in Recovery (round N and N+1). The attacker runs +1 heat every rivet volley while stacking. Fully non-spatial.

---

## 13. Weapon Perks

- **Armour Piercing** — reroll each **failed** Wound Roll. It buys *frequency*, not depth: more wounds land, each still deals the weapon's Damage.
- **Bulwark** — the Rig may arm a fourth preparation, **Raise Shield** (Prepare [1 heat], §5), placed facedown like any preparation. When this Rig is attacked while Raise Shield is active, reveal it: a **front-arc** attack is **negated** (every Wound Roll automatically fails); a **side- or rear-arc** attack has every Wound Roll at **−3 Penetration**. It protects regardless of the attacker's range (it is not the 2" bash). An Answer token (§5) may place Raise Shield only on a Rig carrying a Bulwark Shield.
- **Charged Shot** — optional fire-mode: **+2 Penetration**, but each attack die that rolls a 1 adds 1 heat.
- **Cleave** — the spinning blade carries through: on a successful hit, one other enemy Rig within **2"** of the target also suffers 1 hit (roll its hit location and Wound Roll normally).
- **Full Auto** — optional fire-mode: **+2 ROF**, but each attack die that rolls a 1 adds 1 heat.
- **Hot** — firing generates **2 heat** instead of 1. If written as **(Hot)** before a perk, the weapon is not Hot by default, but the Ironclad may push the engine to gain that perk for the attack at the cost of being Hot.
- **Hull** — a Hull-mounted weapon (Colossal only, in this edition). May be equipped only once per Rig.
- **Impale** — on a successful hit, roll 1 D12; on **8+** the target is impaled — immobilised until this Rig's next activation (it may still pivot).
- **Incendiary** — a successful hit increases the target's heat by 1 (needs only to hit).
- **Melee** — usable only within **2"**; never needs reloading.
- **Precision** — may make an Aimed Shot **without** the −2 Accuracy penalty.
- **Raking Fire** — this weapon **cannot damage a target's front arc**: resolve the attack normally, but every Wound Roll against a front-arc target automatically fails. Against the **side arc** the weapon gains **+3 Penetration**, and against the **rear arc +6 Penetration** — these **replace** the standard +2 / +3 side/rear bonuses (§7). Machine guns rip apart exposed flanks but glance off frontal armour.
- **Rend** — the chain grinds deeper: each wound deals **+1 Damage**. It buys *depth*, not frequency (cf. Armour Piercing above).
- **Shock** — on a successful hit, the target's movement is halved (round down) during its next activation.
- **Staggering** — on a successful hit, roll 1 D6: **1–2** target pivots 90° left; **3–4** target is pushed back 3"; **5–6** target pivots 90° right.

---

## 14. Factions

Factions are **narrative flavour** — every weapon in §12 is available to every faction. A Squadron typically comes from one faction, but mixed/mercenary forces are allowed for narrative play.

- **The Krim Corporation** — ruthless militarists; overwhelming firepower and endurance.
- **Nox Industries** — industrial giants; durable, brute-force machines.
- **Arcus Technologies** — arc-tech pioneers; fast, precise, advanced Rigs.
- **Triton Engineering** — maritime survivors; sturdy, utilitarian, harpoon-and-anchor tools of war.
- **Freegear Coalition** — scrap-built rebels; adaptable, resourceful machines.

> **Faction perks are TBD** — the concept exists (spend a resource to pick corporation perks) but no perks were ever listed. Deferred until the economy is redesigned.

---

## 15. Equipment

Every Rig has **one** equipment slot, chosen at commission. Each piece is a **passive** (always on) plus a **1-slot active** — the active costs one of the Rig's 3 action-slots per activation (−2 if Hull is at 0) plus the listed heat, with no charges or cooldowns; the action budget and the overheat table are the only limiters.

| Family | Equipment | Passive (always on) | Active — *costs 1 slot* |
|---|---|---|---|
| **Armor** | **Ablative Plating** | +1 max SP to Hull | **Harden** (+1 heat): until this Rig's next activation, all Wound Rolls against it are at −1 Penetration |
| **Cooling** | **Radiator Array** | Cools **2** heat in Recovery instead of 1 | **Purge** (−2 heat): vent on demand |
| **Mobility** | **Servo Actuators** | Sprint costs 1 heat instead of 2 | **Jump Jets** (+2 heat): move up to **base Speed**, ignoring terrain, enemy Rigs, and all leg-damage / Speed-halved penalties |
| **Power** | **Overclock Core** | The first time this Rig's Engine reaches 0 SP, it does **not** skip its next activation | **Overclock** (+3 heat): +2 actions this activation (net +1 after the slot) |
| **Utility** | **Field Repair Suite** | The **Repair action** restores +1 additional SP | **Emergency Patch** (+2 heat): guaranteed repair 4 SP to one location, no D6 roll |
| **Thermal** | **Blast Furnace Core** | Safe up to **+1** over Heat Capacity before the overheat roll | **Heat Purge Wave** (0 heat): dump banked heat — vent to Heat Capacity and scald every enemy within 3" (players adjudicate the AoE) |
| **Fire Control** | **Targeting Computer** | The first **Fire** each activation ignores its cover and engaged accuracy penalties | **Lock Sight** (+1 heat): your next shot this activation rerolls all its missed to-hit dice |
| **Countermeasures** | **Reactive Plating** | Side/rear-arc attacks against this Rig take **−1 Penetration** | **Pop Smoke** (0 heat): until this Rig's next activation, every attacker is at **−2 accuracy** against it (and any missile Lock on it is broken) |

### Equipment Upgrades

Each piece of equipment offers **three upgrades, one of each nature** (see *Upgrade natures*, §12). When a Rig is commissioned, choose **one** upgrade for its equipment, of one nature; this counts toward the Rig's **one-Prototype cap** alongside its two weapons (§3).

| Equipment | Field | Tuned | Prototype |
|---|---|---|---|
| Ablative Plating | Reinforced Plating (Harden −2 impact, not −1) | Reactive Armor (first hit each round hardens that location) | Ablative Cascade (spend ablative charges to soften hits; each costs heat) |
| Radiator Array | Twin Radiators (Purge vents −3) | Coolant Injection (−2 heat before the overheat roll when over Capacity) | Cryo Reservoir (bank cold; spend for instant cooling + a Penetration spike) |
| Servo Actuators | Reinforced Servos (Sprint reaches 2× Speed, not 1½×) | Kickstart Pistons (charge into contact → first melee after +2 Penetration) | Grapnel Launcher (yank free of a lock or reel an enemy in; heat + cooldown) |
| Overclock Core | Redundant Capacitors (Overclock costs +2 heat) | Adrenaline Surge (below half SP, Overclock grants +3 actions) | Reactor Overdrive (Overclock also +2 Penetration; overheat bonus doubles) |
| Field Repair Suite | Master Toolkit (Repair heals +2 SP) | Battlefield Triage (Emergency Patch heals 5 SP on a destroyed location) | Nanite Swarm (seed nanites that heal each Recovery; −1 Heat Capacity while active) |
| Blast Furnace Core | Insulated Core (safe up to +2 over Capacity) | Backdraft (Heat Purge Wave +1 Penetration per 2 heat over Capacity) | Meltdown Protocol (bank overheat as charge; spend for Penetration or a burst) |
| Targeting Computer | Ballistic Processor (+1 accuracy vs a target in your sweet-spot band) | Predictive Tracking (vs a static/pinned target: +2 accuracy, ignore cover) | Fire Solution Lock (hold still, stack a solution → an auto-hit AP volley) |
| Reactive Plating | Angled Plates (side/rear attacks −2 Penetration) | Chaff Burst (under smoke, free half-Speed side-step when targeted) | Point-Defense System (intercept incoming fire, force rerolls; heat cost) |

#### Tuned / Prototype Upgrade Mechanics

As with weapons (§12), equipment Tuned/Prototype mechanics are implemented incrementally: the **Field** effects above, and the three new families' base **passives/actives** (Blast Furnace Core, Targeting Computer, Reactive Plating), are live in the engine now; the Tuned and Prototype effects for all eight equipment lines land over follow-on updates.

---

## 17. Units

The game fields three unit **kinds**. Every kind is one **slot** = one **count** = one **activation** (§3 balance rules unchanged). Balance is matched composition only — both sides mirror kinds.

### Rig

Four components (Hull / Arms / Legs / Engine). Heat and overheat (§6). Two weapon slots (long-range + melee) with fixed upgrades (§12). Weight-class Penetration scaling (§12). Equipment slot (§15). May Prepare (§5). **3 actions** per activation. Structural (Hull) 0 SP → −2 actions −1 Aim; power (Engine) 0 SP → skip next activation; weapon (Arms) 0 SP → destroy one weapon + 1 SP to Hull + 1 SP to Engine; mobility (Legs) 0 SP → move penalty.

### Tank

Four components (Hull / Tracks / Turret / Engine). **Cold** — no heat, no overheat rolls, no Shut Down, **no Sprint** (Move only — Sprint spends heat a cold kind hasn't got). **One weapon** from the shared unit-weapon list (flat Penetration, no weight-class scaling). No equipment, no Prepare. **2 actions** per activation. Speed **3"** ⚙.

Hit table (D12): 1–4 Hull · 5–7 Tracks · 8–10 Turret · 11–12 Engine.
Toughness ⚙: Hull **T6** · Tracks **T5** · Turret **T5** · Engine **T4**.

At 0 SP on Turret: the Tank's single gun is destroyed — a Tank armed only with a ranged weapon has no attack until repaired (a melee-armed Tank can still strike). Cascade at 0 on any part follows §8 by role: structural / power / mobility / weapon effects match the Rig set.

### Walker

Four components (Hull / Legs / Mount / Engine). Cold like a Tank, faster and lighter. **One weapon** from the shared unit-weapon list. No equipment, no Prepare. **3 actions** per activation. Speed **4"** ⚙.

Hit table (D12): 1–4 Hull · 5–7 Legs · 8–10 Mount · 11–12 Engine. Toughness ⚙ (Medium-Rig grade): Hull **T5** · Legs **T4** · Mount **T4** · Engine **T3**.

### Shared unit weapons (Tanks + Walkers only) ⚙

| Weapon | Type | ROF | Pen | Acc (near/far) | RNG (near/far) |
|---|---|:--:|:--:|:--:|:--:|
| Tank Cannon | ranged | 1 | 12 | 0 / −1 | 12" / 24" |
| Autocannon Mount | ranged | 3 | 8 | 0 / −1 | 12" / 24" |
| Coaxial MG | ranged | 6 | 5 | +1 / −1 | 9" / 18" |
| Rocket Pod | ranged | 2 | 10 | 0 / 0 | 15" / 30" |
| Dozer Blade | melee | 1 | 10 | 0 | 2" |
| Ram Spike | melee | 1 | 11 | +1 | 2" |

Penetration is **flat** — no weight-class modifier applies. Close combat requires a **melee** weapon (Dozer Blade or Ram Spike); a Tank / Walker fielding only a ranged weapon cannot fight in melee.

### Notes

All numeric values on Tanks and Walkers above (SP, armour rows, ROF/Penetration, speeds) are strawman — subject to tuning in playtest.

### Support Units

A **support unit** is a Tank or Walker that swaps its single weapon for a **light Sidearm + 2 role modules**. At commission, pick exactly **2 distinct** modules from:

| Module | Grants |
|---|---|
| **Damage** | Fits a real gun from the shared unit-weapon list above, replacing the Sidearm |
| **Repair** | **Field Weld** action |
| **Coolant** | **Vent** action |
| **Recon** | **Paint** action |

Without a Damage module, the unit keeps the Sidearm.

**Sidearm** ⚙ — a weak plinker, flat Penetration like the rest of the unit-weapon list:

| Weapon | Type | ROF | Pen | Acc (near/far) | RNG (near/far) |
|---|---|:--:|:--:|:--:|:--:|
| Sidearm | ranged | 2 | 4 | 0 / 0 | 6" / 12" |

Module actions — each costs **1 action**; cold, no heat:

- **Field Weld** (Repair) — heal a friendly unit (self or ally) within reach: roll D6, 1-2 = 1 SP, 3-4 = 2 SP, 5-6 = 3 SP, to a chosen location. Like the Repair action, it never whiffs.
- **Vent** (Coolant) — reduce a friendly **Rig's** heat by 2 (Rigs only carry heat).
- **Paint** (Recon) — mark an enemy in line of sight; allied **ranged** attacks against it ignore cover and gain +1 Accuracy until the painter's next activation. A Recon unit holds one mark at a time.

Module actions run off the unit's systems, not its gun: losing the Turret (Tank) or Mount (Walker) — the weapon component — destroys only the gun, not Field Weld / Vent / Paint. ⚙

Four shipped exemplars ⚙ (strawman):

| Unit | Kind | Modules | Weapon |
|---|---|---|---|
| Marksman Tank | Tank | Damage + Recon | Tank Cannon |
| Radiator Walker | Walker | Damage + Coolant | Coaxial MG |
| Field Welder | Walker | Repair + Recon | Sidearm |
| Depot Tank | Tank | Repair + Coolant | Sidearm |

Balance unchanged — a support unit is still one slot / one count / one activation (§3).

---

## 16. Design Notes & Open Items

**Removed from the Alpha:** the Oil points currency, Iron / Iron Cap weight limits, and **engine types** (Crude Oil / Diesel / Arc). Equipment returned in a redesigned form as the single-slot system in §15. Squadrons are balanced by enforced mirror composition (§3); heat tolerance is set by weight class (§6).

**Distance scale:** distances suit the models this ruleset uses on a **54"×36"** table — **Light 60 mm**, **Medium 75 mm** bases (Heavy 90, Colossal 120).

**Contradictions resolved (from the source):**
- Recovery Phase heat cooldown → **1**. *⚙ TUNING.*
- Repair → **7+ / 10+**.
- Brace for Incoming Fire → **−2 Penetration** against front-arc attacks (§5 now also makes a braced Rig immovable and gives it a free Penetration 6 melee counter against a front melee that fails to breach).
- Initiative → **roll every round**.

**House rules added:**
- **Ram removed** (§5) — the Ram action is gone; **melee** weapons cover close combat. Removes a redundant second close-combat system.
- **Multiple moves** (§5) — a Rig may Move (or Sprint) more than once per activation; each spends an action and generates its heat, bounded only by the 3-action budget.
- **Shut Down anywhere** (§5) — Shut Down may be declared at any point in the activation; heat vented scales with how much of the activation is spent shutting down (first-action = full vent, later = proportionally less).
- **Whole-inch speeds** (§2) — base Speed 5 / 4 / 3 / 2 by weight class; all distances round to whole inches.
- **Sprint** (§5/§6) — normal Move is 1 heat at any distance up to Speed; a Sprint (up to 1½× Speed) costs 2 heat. Replaces the old "half-Speed = 1, more = 2" tax that made every advance run hot. ⚙ TUNING: Sprint heat now **floors at 1** — Reinforced Servos used to zero it, which made repositioning free and turned Sprint into a strictly-better Move. The upgrade now grants **2× Speed reach** instead.
- **Sweet-spot ranged Accuracy** (§7) — ranged weapons peak at a sweet-spot distance and lose Accuracy per inch away in either direction, within a min–max band. Replaces the flat near/far Accuracy bands so positioning matters at range.
- **Engagement / melee lock** (§5) — a melee attack (or moving into contact) locks two Rigs; an engaged Rig can't Move/Sprint/Jump-Jets (must Disengage) and fires ranged at −2 Accuracy. Makes melee a real threat instead of pure attrition.
- **Raking Fire** (§13) — machine guns do no frontal damage but hit far harder (+3 side / +6 rear).
- **Answer tokens** (§5) — the player going second each round gets 1 free preparation — or one of three Answer-only counters (Riposte / Sidestep the Shooter / Exploit Opening) instead.
- **Weight-based heat** (§6) — Heat Capacity 6 / 5 / 4 / 3 by weight class; overheat roll adds 2 × (heat over Capacity), capped +10.
- **Victory — Salvage** (§11) — weighted centre objective (2 VP), annihilation auto-win.

**Open questions / TBD:**
- Weapon profiles are **universal** (one shared list of 7 Long Range + 7 Melee) with a **weight-class Penetration modifier** (Light −1 / Heavy +1 / Colossal +2 vs the Medium baseline, §12); all four classes are playable. Playtest the ±1-per-step spread — it may need widening/narrowing per weapon later.
- Faction perks — not yet written (§14).
- Machine-gun Penetration/arc values under Raking Fire — watch that they're "strong not silly" on the flanks.
- Alpha-strike swing at 3v3 — high-Penetration crits can gut a Rig in one activation; see if crits need softening.
- Whether composition-matching is enough balance, or a lightweight cost system is needed.
