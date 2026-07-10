# Of Oil and Iron — Rules (Working Edition)

**Version:** wr-0.10 · **Base:** standalone working ruleset
**Scale:** distances are written for the models this ruleset uses — **Light on 60 mm bases, Medium on 75 mm bases**. Measure in inches, base-to-base (closest points).
**Dice:** six-sided (**D6**) and twelve-sided (**D12**).

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

A skirmish wargame of dieselpunk war machines (**Rigs**) piloted by **Ironclads**. Each player commands a **Squadron** of 3–5 Rigs on a **54"×36"** table. Players alternate activating Rigs; each Rig manages **heat** as it moves and fights, risking overheating. The game is won by controlling **salvage objectives** (§11).

Each Rig has four components — **Hull, Arms, Legs, Engine** — each with its own **Structure Points (SP)**. Reduce a component to 0 SP and it suffers **catastrophic damage**; destroy the key components and the Rig dies.

**You need:** 3–5 Rig models per side, D6 and D12 dice, a tape measure (inches), terrain, 3 objective markers, and tokens for preparations and catastrophic damage.

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
- **Aim** — base D6 target number to hit (modified by weapon ACC and cover).
- **Weapon slots** — how many weapons the Rig may carry. Colossal Rigs get an extra **Hull-mounted** slot.
- **Structure Points (SP)** — durability per component. At 0 SP → catastrophic damage (§8).

### Impact Tables (armour)

After a hit, the **Impact Roll** total (D6 + STR + arc modifiers) is compared to the target location's row. The total determines the severity:

**Light Rig**

| Location | Direct (−1 SP) | Severe (−2 SP) | Critical (−3 SP) |
|---|:--:|:--:|:--:|
| Hull | 10–13 | 14–15 | 16+ |
| Arms | 10–11 | 12–13 | 14+ |
| Legs | 10–12 | 13–14 | 15+ |
| Engine | 7–9 | 10–11 | 12+ |

**Medium Rig**

| Location | Direct | Severe | Critical |
|---|:--:|:--:|:--:|
| Hull | 11–13 | 14–16 | 17+ |
| Arms | 10–12 | 13–14 | 15+ |
| Legs | 11–12 | 13–14 | 15+ |
| Engine | 8–9 | 10–11 | 12+ |

**Heavy Rig**

| Location | Direct | Severe | Critical |
|---|:--:|:--:|:--:|
| Hull | 13–14 | 15–16 | 17+ |
| Arms | 12–13 | 14–15 | 16+ |
| Legs | 14–15 | 16 | 17+ |
| Engine | 8–10 | 11–12 | 13+ |

**Colossal Rig**

| Location | Direct | Severe | Critical |
|---|:--:|:--:|:--:|
| Hull | 13–15 | 16 | 17+ |
| Arms | 13 | 14–15 | 16+ |
| Legs | 13–15 | 16 | 17+ |
| Engine | 9–10 | 11–13 | 14+ |

An Impact Roll total **below** a location's Direct threshold does nothing (it glances off).

---

## 3. Building a Squadron

> **No Oil, no Iron, no engine types.** Squadrons are built from chassis, weapons, and one equipment slot per Rig (§15). Loadout is limited only by **weapon slots**.

1. **Squadron size** — agree on **3–5 Rigs** per side. Max **1 Colossal** per Squadron.
2. **Choose each Rig's weight class** (§2).
3. **Equip weapons** up to the Rig's slots. Weapons come in **two types — Long Range and Melee** (§12), and every Rig **must carry exactly one of each**:
   - Light / Medium / Heavy: **2 weapons — one Long Range and one Melee.**
   - Colossal: **one Long Range + one Melee, plus 1 Hull-mounted weapon** of either type (3 weapons total).
   - **Any weapon may be fitted to any Rig**, regardless of weight class or faction; its **STR then scales with the chassis** (Light −2 / Medium +0 / Heavy +2 / Colossal +4, §12).
   - Each equipped weapon has **two upgrade options**. Choose **one** upgrade for the Long Range weapon and **one** upgrade for the Melee weapon when the Rig is commissioned. A selected upgrade modifies only that weapon.

### Balancing without points
- **Balanced game (recommended):** both sides field the **same number of Rigs in each weight class** (mirror the composition).
- **Cinematic game:** bring whatever you like.

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
  - *Sprint:* you may extend a Move to up to **1½ × Speed**; a Sprinting Move generates **2 heat** instead of 1 (§6).

- **Disengage [1]** — break a melee **engagement** (see below). Frees **both** Rigs from the lock; after Disengaging, the Rig may Move/Sprint later in the same activation. No effect (and costs nothing) if the Rig isn't engaged.

- **Fire Weapon [1]** — attack with one equipped weapon (§7). A ranged weapon is spent after firing: to fire it **again** in the same activation you must **Reload** first (a separate 1-action step) — a spent weapon cannot be fired. Each fire costs 1 action, but the **second (and later) ranged shot** of an activation runs the barrel hot for **+1 heat**. So Fire · Reload · Fire uses 3 actions and 1 + 1 + 2 = 4 heat. **Melee** weapons never need reloading.

- **Aimed Shot [1]** — a Fire Weapon action where you **choose the hit location** instead of rolling for it, at **−2 ACC**.

- **Reload [1]** — reloads **all** weapons.

- **Repair [1]** — roll 1 D12: on **7+** repair 1 SP to any one location; on **10+** repair 2 SP. *⚙ TUNING: now generates 1 heat.*

- **Shut Down [0]** — end the activation and vent heat. May be declared **at any point** in the activation; cooling is **proportional** to how much of the activation is spent shutting down — declared first (no actions used) it vents all heat to the floor, and the more slots already spent, the less it sheds. *⚙ TUNING: was first-action-only + full vent.*

- **Prepare [1]** — generate 1 heat and place a facedown preparation token by the Rig, choosing one reaction below. It lasts until this Rig's next activation; reveal it when its trigger occurs. A Rig may hold **only one** preparation at a time.
  - *Evasive Manoeuvre* — when targeted by an attack on an enemy's turn, **before** the attack resolves, move up to **half Speed** in any direction. If this puts the Rig out of range or line of sight, the attack fails.
  - *Return Fire* — after an enemy Rig attacks this Rig, choose 1 weapon and make an attack against that enemy.
  - *Brace for Incoming Fire* — attacks against this Rig's **front arc** suffer **−2 to their Impact Rolls** until the next round.

- **Answer Tokens (for the player going second).** At the start of each round, the player who activates **second** gains **1 Answer token**. An Answer token may be spent at any time to place one of the preparations above on one of their Rigs **for free** — no action, no heat — otherwise following all normal preparation rules (facedown, revealed on trigger, one per Rig). Unspent Answer tokens are removed in the Recovery Phase. *⚙ TUNING: 1 per round.*

### Engagement (melee lock)

Closing to melee **locks two Rigs together** — this is what stops an enemy from simply kiting you with ranged fire. *⚙ TUNING: new mechanic to make melee matter.*

- **Getting engaged.** A Rig becomes **engaged** with an enemy either by **making a melee attack** against it (in reach) or by **Moving into base contact** and declaring the engagement. The lock is **mutual** (both Rigs are engaged) and **one-to-one** (a Rig already engaged can't be pulled into a second lock; you may still melee an already-engaged enemy, you just don't lock to it).
- **Pinned.** While engaged, a Rig **cannot Move, Sprint, or Jump Jets** — it must **Disengage** first (a 1-action, 1-heat step, §5). Non-movement equipment (Harden, Purge, Overclock, Emergency Patch) still works.
- **Ranged penalty.** An engaged Rig firing a **ranged** weapon does so at **−2 ACC** (point-blank scramble). **Melee** attacks are unaffected — so while locked, your melee weapon is the better answer.
- **Breaking the lock.** Engagement ends when: a Rig spends **Disengage** (frees both), the engaged partner is **destroyed** or **immobilised** (legs gone), or a Rig **Disengages and moves away**. Engagement **persists across rounds** — it is *not* cleared in Recovery.

---

## 6. Heat & Overheating

Actions and some weapon perks generate **heat**, tracked upward on the Rig. At the **end of the Rig's activation**, if heat has climbed past the Rig's **Heat Capacity**, the engine may misfire — and the hotter it runs, the worse the misfire. (The Engine is still a body component; Rigs no longer choose an engine *type*.)

### Heat generation

| Action | Heat |
|---|:--:|
| Move (up to Speed) | 1 |
| Move — **Sprint** (up to 1½× Speed) | 2 |
| Fire Weapon | 1 (**2** if the weapon is **Hot**) |
| Aimed Shot / Prepare | 1 |
| Reload / Repair | 1 |
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
   - Up to **25% obscured** → **−1 ACC**.
   - Up to **50% obscured** → **−2 ACC**.
4. **Roll to hit.** Roll **ROF** D6. Apply ACC modifiers (weapon + cover) to the Rig's **Aim**; each die that **meets or beats** the modified Aim is a hit. A natural **6 always hits**. A ranged weapon's **ACC depends on the measured distance** — see the **sweet-spot** rule below.

**Sweet spot (ranged ACC by distance).** A ranged weapon fires most accurately at its **sweet spot** (an optimal distance in inches), where it delivers its **peak ACC**. The farther the measured distance is from the sweet spot — **closer *or* farther** — the more accuracy bleeds off: subtract the weapon's **falloff** (ACC lost per inch) times the number of inches away from the sweet spot. So a long-range gun is sloppy in your face *and* at extreme range, sharpest in its band. **Melee** weapons ignore this — they carry a single fixed ACC at their **2" reach**. *⚙ TUNING: replaced the old flat near/far ACC bands with a continuous sweet-spot falloff.*
5. **Apply weapon perks** (§13).
6. **Determine impact location.** Unless it was an **Aimed Shot**, the *defender* rolls 1 D12:

   | D12 | Location |
   |:--:|---|
   | 1–4 | Hull |
   | 5–7 | Arms |
   | 8–10 | Legs |
   | 11–12 | Engine |

7. **Impact Roll.** For **each hit**, roll 1 D6 and add the weapon's **STR** (adjusted for the firing Rig's weight class, §12). For a **ranged** attack, add **+2 STR** into the target's **side arc** or **+4 STR** into its **rear arc**. **Melee attacks gain no arc bonus** — a melee weapon strikes just as hard from any facing, and being in contact is deadly enough. *(Raking Fire machine guns override the ranged side/rear values — §13.)* Compare each total to the location's row in the Impact Table (§2).
8. **Apply damage.** Direct = **−1 SP**, Severe = **−2 SP**, Critical = **−3 SP**.

**Damage overflow.** If a hit strikes a location already at 0 SP, the **defender** chooses another non-destroyed location to take that damage.

A Rig is **destroyed** when all four components are at 0 SP, or by the Hull/Engine rules in §8.

---

## 8. Catastrophic Damage

When a location hits **0 SP**, apply its effect. Further damage to that same location applies the "additional damage" clause.

| Location | At 0 SP | Additional damage |
|---|---|---|
| **Legs** | Move −3"; pivots cost double movement; cannot backpedal. | Rig is **immobilised** for the game (may still pivot). |
| **Hull** | −2 to maximum actions per activation; −1 Aim. | Rig suffers **total system failure — destroyed**. |
| **Arms** | Roll D12 for which weapon is destroyed (see below); its munitions explode: **1 damage to Hull and 1 to Engine**. | Same weapon: **3 damage to Hull**; weapon gone for the game. |
| **Engine** | Rig **loses its next activation**; heat cannot drop below 3 (raise to 3 if lower). | Rig suffers **total system failure — destroyed**. |

**Arms — which weapon?**

- Light / Medium / Heavy: **1–6 Left**, **7–12 Right**.
- Colossal: **1–4 Left**, **5–8 Hull**, **9–12 Right**.

---

## 9. Rig Destruction

When a Rig is destroyed, roll 1 D12: on **4+** its fuel and munitions erupt. All Rigs within **12"** suffer a **D6 + STR 10** hit — the destroyed Rig's controller rolls the damage; each affected Rig's controller rolls its own hit location.

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

### Optional — Ironclad Bounty
Each player secretly notes one enemy Rig as their **Priority Target**. Destroying it is worth **+2 VP** — a light combat incentive that fits a 3-Rig brawl, where every machine matters.

---

## 12. Weapon Profiles

Every weapon is one of **two types**, and every Rig equips **one of each** (§3):

- **Long Range** — any weapon **without** the Melee perk. Fires at range; once spent it must be **reloaded** between shots in the same activation. The second such shot in an activation costs **+1 heat** (§5).
- **Melee** — any weapon with the **Melee** perk (RNG 2"). Usable only within 2" and never needs reloading.

Any weapon may be fitted to a Rig of **any weight class** and **any faction**. Ranged weapons use the **sweet-spot** model (§7): **Sweet** is the optimal distance (inches), **Peak** is the ACC at that distance, **Falloff** is the ACC lost per inch away from the sweet spot (in either direction), and **Range** is the min–max band the weapon can fire within. **Melee** weapons instead carry a single fixed ACC at a **2" reach**.

**Weight-class STR.** The **STR** listed below is the **Medium** baseline. A weapon's STR shifts with the chassis carrying it — heavier Rigs drive it harder, lighter Rigs can't. Everything else (ROF, ACC, RNG, perks) is unchanged:

| Chassis | Light | Medium | Heavy | Colossal |
|---|:--:|:--:|:--:|:--:|
| **STR modifier** | −2 | +0 | +2 | +4 |

Apply this modifier to the weapon's STR every time you make an Impact Roll (§7). *Example: a Sniper Cannon (STR 12) reads STR 10 on a Light Rig, 12 on a Medium, 14 on a Heavy, 16 on a Colossal.*

> **Perks are being reworked.** Base weapons now carry **stats only** — every *signature* perk is delivered by the weapon's chosen **upgrade** (see *Weapon Upgrades* below). The perk mechanics in §13 still apply; how each weapon earns its signature perks is a redesign that is **still open**, so the tables below list no base perks. **Exception:** the two **Machine Guns** (Mini Gun, Double MG) carry **Raking Fire** innately (§13) — it defines the weapon type (no frontal damage; +4 side / +8 rear), not a signature upgrade. *Melee* is likewise a weapon **type** (the Melee Weapons section), not a perk.

> **Upgrade natures.** Every weapon now offers **three** upgrades, one of each nature, and you pick **one per weapon**:
> - **Field** — unconditional, always-on, reinforces the weapon's role. The safe default.
> - **Tuned** — conditional: a trigger (target state, timing, positioning) that out-pays Field when set up.
> - **Prototype** — systemic, tracked, high-payoff, and may carry a downside. **A rig may run at most one Prototype.**

### Long Range Weapons

**Machine Guns** — fast-firing, low-STR flanking specialists.

| Weapon | ROF | STR | Sweet | Peak | Falloff/in | Range |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Mini Gun | 8 | 4 | 7" | +2 | −0.35 | 0–18" |
| Double MG | 8 | 6 | 9" | +1 | −0.25 | 0–20" |

**Cannons & Artillery** — front-capable firepower.

| Weapon | ROF | STR | Sweet | Peak | Falloff/in | Range |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Autocannon | 4 | 8 | 12" | +1 | −0.22 | 0–26" |
| Arc Gun | 2 | 10 | 20" | +1 | −0.18 | 0–32" |
| Mortar | 3 | 9 | 18" | +1 | −0.15 | 6–34" |
| Sniper Cannon | 1 | 12 | 22" | +2 | −0.15 | 0–28" |
| Siege Maul | 1 | 13 | 8" | +1 | −0.30 | 0–16" |
| Missile Barrage | 4 | 9 | 20" | +1 | −0.15 | 6–34" |

> The **Missile Barrage** is a long-reach, high-volume salvo launcher with loose ACC up close.

> The **Siege Maul** is a close-in demolition gun: the highest STR on the board, but the shortest range of any ranged weapon.

### Melee Weapons

| Weapon | ROF | STR | ACC | RNG |
|---|:--:|:--:|:--:|:--:|
| Sword | 2 | 6 | – | 2 |
| Circular Saw | 3 | 6 | – | 2 |
| Chainsaw | 3 | 8 | – | 2 |
| Claw | 2 | 8 | +1 | 2 |
| Lance | 1 | 11 | +1 | 2 |
| Wrecking Ball | 1 | 12 | – | 2 |
| Bulwark Shield | 1 | 6 | – | 2 |
| Flamethrower | 4 | 7 | +1 | 2 |

### Weapon Upgrades

Each weapon has **two upgrade options**. When a Rig is commissioned, choose **one** upgrade for each equipped weapon. The selected upgrade changes only that weapon.

| Weapon | Upgrade Option A | Upgrade Option B |
|---|---|---|
| Mini Gun | **Extended Belt:** +2 ROF; attack dice showing 1 add 1 heat | **Suppressive Fire:** gains Shock |
| Double MG | **Tracer Rounds:** gains Incendiary | **Gyro Mount:** reroll one missed to-hit die |
| Autocannon | **AP Shells:** gains Armour Piercing | **Depleted Core:** +2 STR |
| Arc Gun | **Systems Overload:** on hit, target loses 1 action on its next activation | **Ion Burn:** gains Incendiary |
| Mortar | **Airburst Fuze:** ignores cover | **Cluster Shells:** on hit, deal 1 SP to a second random location on the target |
| Sniper Cannon | **Match Barrel:** no far-range ACC penalty | **Marksman Optics:** gains Precision |
| Sword | **Duelist's Balance:** gains Precision | **Keen Edge:** gains Rend |
| Circular Saw | **Tempered Teeth:** gains Armour Piercing | **Sunder:** once per damaging attack, the struck location's max SP is reduced by 1, to a minimum of 1 |
| Chainsaw | **High-Rev Motor:** +2 STR; attacking adds +1 heat | **Ripper Teeth:** gains Rend |
| Claw | **Vice Grip:** gains Impale | **Rending Talons:** gains Rend |
| Lance | **Couched Reach:** melee range increases by 1" | **Spearpoint:** gains Impale |
| Wrecking Ball | **Haymaker:** +3 STR | **Wrecking Momentum:** gains Staggering |
| Siege Maul | **Breaching Round:** Hull SP this weapon strips cannot be repaired until the end of the next round | **Extended Barrel:** +4" to both range bands (12 / 20) |
| Bulwark Shield | **Tower Shield:** while Raise Shield is active, front *and side* attacks are negated (rear at −4) | **Boss Spike:** gains Staggering |
| Missile Barrage | **Swarm Warheads:** +2 ROF | **Shaped Charges:** gains Armour Piercing |
| Flamethrower | **Pressurized Tank:** +2 STR; attacking adds +1 heat | **Sticky Fuel:** gains Rend |

#### Tuned / Prototype Upgrade Mechanics

The table above predates the Field/Tuned/Prototype natures and lists only the original two options; each weapon now offers a third, conditional **Tuned** (and a fourth, systemic **Prototype**) upgrade (see *Upgrade natures* above). Mechanics are implemented incrementally — each line below is live in the engine:

- **Cold Bore** (Sniper Cannon, Tuned) — +3 STR when the target's every location (Hull/Arms/Legs/Engine) is at max SP.
- **Full Tilt** (Lance, Tuned) — +3 STR if the Rig moved (Move or Sprint) at any point this activation before striking.
- **Momentum Swing** (Wrecking Ball, Tuned) — +2 STR under the same "moved this activation" trigger as Full Tilt; the 3" knockback is deferred pending a positional model (§ Group G).
- **Bloodletter** (Chainsaw, Tuned) — +1 ROF (an extra to-hit die) vs a target missing SP anywhere.
- **Opportunist** (Sword, Tuned) — +3 STR vs a target that is overheated (heat over its class's Heat Capacity) or is carrying an action penalty into its next activation.
- **Pinning Burst** (Double MG, Tuned) — landing 4+ hits in one attack pins the target: it loses 1 action on its next activation.
- **Redline Governor** (Chainsaw, Prototype) — the attacker's own heat over its class's Heat Capacity adds +1 STR and +1 to-hit die each, capped at +3/+3.
- **Superconductor Edge** (Sword, Prototype) — while the attacker's heat is over half its class's Heat Capacity, the blade gets +2 STR, and once per attack (not per hit) 1 heat is drawn from the attacker into the target.
- **Burning** (status) — a rig on fire takes `burning` SP to its Hull at the start of each of its activations, then keeps burning until doused. The **Douse** action (1 slot, 0 heat) removes one Burning stack.
- **Napalm** (Flamethrower, Tuned) — a landed hit sets the target Burning at 1; it never stacks past 1, so one Douse clears it.
- **Conflagration** (Flamethrower, Prototype) — each landed hit adds +1 Burning to the target (stacks with no cap) and runs the attacker +1 heat as its downside; each stack needs its own Douse.

---

## 13. Weapon Perks

- **Armour Piercing** — for each Impact Roll of 6, add a D3 to the result.
- **Bulwark** — the Rig may arm a fourth preparation, **Raise Shield** (Prepare [1 heat], §5), placed facedown like any preparation. When this Rig is attacked while Raise Shield is active, reveal it: a **front-arc** attack is **negated** (every Impact Roll automatically fails); a **side- or rear-arc** attack has every Impact Roll at **−4**. It protects regardless of the attacker's range (it is not the 2" bash). An Answer token (§5) may place Raise Shield only on a Rig carrying a Bulwark Shield.
- **Charged Shot** — optional fire-mode: **+2 STR**, but each attack die that rolls a 1 adds 1 heat.
- **Cleave** — the spinning blade carries through: on a successful hit, one other enemy Rig within **2"** of the target also suffers 1 hit (roll its hit location and Impact Roll normally).
- **Full Auto** — optional fire-mode: **+2 ROF**, but each attack die that rolls a 1 adds 1 heat.
- **Hot** — firing generates **2 heat** instead of 1. If written as **(Hot)** before a perk, the weapon is not Hot by default, but the Ironclad may push the engine to gain that perk for the attack at the cost of being Hot.
- **Hull** — a Hull-mounted weapon (Colossal only, in this edition). May be equipped only once per Rig.
- **Impale** — on a successful hit, roll 1 D12; on **8+** the target is impaled — immobilised until this Rig's next activation (it may still pivot).
- **Incendiary** — a successful hit increases the target's heat by 1 (needs only to hit).
- **Melee** — usable only within **2"**; never needs reloading.
- **Precision** — may make an Aimed Shot **without** the −2 ACC penalty.
- **Raking Fire** — this weapon **cannot damage a target's front arc**: resolve the attack normally, but every Impact Roll against a front-arc target automatically fails. Against the **side arc** the weapon gains **+4 STR**, and against the **rear arc +8 STR** — these **replace** the standard +2 / +4 side/rear bonuses (§7). Machine guns rip apart exposed flanks but glance off frontal armour.
- **Rend** — the chain grinds deeper: for each Impact Roll of **5 or 6**, add a **D3** to the result.
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
| **Armor** | **Ablative Plating** | +1 max SP to Hull | **Harden** (+1 heat): until this Rig's next activation, all impact rolls against it are at −1 |
| **Cooling** | **Radiator Array** | Cools **2** heat in Recovery instead of 1 | **Purge** (−2 heat): vent on demand |
| **Mobility** | **Servo Actuators** | Sprint costs 1 heat instead of 2 | **Jump Jets** (+2 heat): move up to **base Speed**, ignoring terrain, enemy Rigs, and all leg-damage / Speed-halved penalties |
| **Power** | **Overclock Core** | The first time this Rig's Engine reaches 0 SP, it does **not** skip its next activation | **Overclock** (+3 heat): +2 actions this activation (net +1 after the slot) |
| **Utility** | **Field Repair Suite** | The **Repair action** restores +1 additional SP | **Emergency Patch** (+2 heat): guaranteed repair 2 SP to one location, no D12 roll |

---

## 17. Units

The game fields three unit **kinds**. Every kind is one **slot** = one **count** = one **activation** (§3 balance rules unchanged). Balance is matched composition only — both sides mirror kinds.

### Rig

Four components (Hull / Arms / Legs / Engine). Heat and overheat (§6). Two weapon slots (long-range + melee) with fixed upgrades (§12). Weight-class STR scaling (§12). Equipment slot (§15). May Prepare (§5). **3 actions** per activation. Structural (Hull) 0 SP → −2 actions −1 Aim; power (Engine) 0 SP → skip next activation; weapon (Arms) 0 SP → destroy one weapon + 1 SP to Hull + 1 SP to Engine; mobility (Legs) 0 SP → move penalty.

### Tank

Four components (Hull / Tracks / Turret / Engine). **Cold** — no heat, no overheat rolls, no Shut Down. **One weapon** from the shared unit-weapon list (flat STR, no weight-class scaling). No equipment, no Prepare. **2 actions** per activation. Speed **3"** ⚙.

Hit table (D12): 1–4 Hull · 5–7 Tracks · 8–10 Turret · 11–12 Engine.
Strawman armour ⚙ (Direct / Severe / Critical): Hull 13-14 / 15-16 / 17+; Tracks 14-15 / 16 / 17+; Turret 12-13 / 14-15 / 16+; Engine 8-10 / 11-12 / 13+.

At 0 SP on Turret: the Tank's single gun is destroyed — a Tank armed only with a ranged weapon has no attack until repaired (a melee-armed Tank can still strike). Cascade at 0 on any part follows §8 by role: structural / power / mobility / weapon effects match the Rig set.

### Walker

Four components (Hull / Legs / Mount / Engine). Cold like a Tank, faster and lighter. **One weapon** from the shared unit-weapon list. No equipment, no Prepare. **3 actions** per activation. Speed **4"** ⚙.

Hit table (D12): 1–4 Hull · 5–7 Legs · 8–10 Mount · 11–12 Engine. Armour ≈ Medium-Rig grade ⚙.

### Shared unit weapons (Tanks + Walkers only) ⚙

| Weapon | Type | ROF | STR | ACC (near/far) | RNG (near/far) |
|---|---|:--:|:--:|:--:|:--:|
| Tank Cannon | ranged | 1 | 12 | 0 / −1 | 12" / 24" |
| Autocannon Mount | ranged | 3 | 8 | 0 / −1 | 12" / 24" |
| Coaxial MG | ranged | 6 | 5 | +1 / −1 | 9" / 18" |
| Rocket Pod | ranged | 2 | 10 | 0 / 0 | 15" / 30" |
| Dozer Blade | melee | 1 | 10 | 0 | 2" |
| Ram Spike | melee | 1 | 11 | +1 | 2" |

STR is **flat** — no weight-class modifier applies. Close combat requires a **melee** weapon (Dozer Blade or Ram Spike); a Tank / Walker fielding only a ranged weapon cannot fight in melee.

### Notes

All numeric values on Tanks and Walkers above (SP, armour rows, ROF/STR, speeds) are strawman — subject to tuning in playtest.

---

## 16. Design Notes & Open Items

**Removed from the Alpha:** the Oil points currency, Iron / Iron Cap weight limits, and **engine types** (Crude Oil / Diesel / Arc). Equipment returned in a redesigned form as the single-slot system in §15. Squadrons balance by matching composition (§3); heat tolerance is set by weight class (§6).

**Distance scale:** distances suit the models this ruleset uses on a **54"×36"** table — **Light 60 mm**, **Medium 75 mm** bases (Heavy 90, Colossal 120).

**Contradictions resolved (from the source):**
- Recovery Phase heat cooldown → **1**. *⚙ TUNING.*
- Repair → **7+ / 10+**.
- Brace for Incoming Fire → **−2 to Impact Rolls** on front-arc attacks.
- Initiative → **roll every round**.
- Heavy Legs Impact Table → **14–15 / 16 / 17+** (removed overlap).

**House rules added:**
- **Ram removed** (§5) — the Ram action is gone; **melee** weapons cover close combat. Removes a redundant second close-combat system.
- **Multiple moves** (§5) — a Rig may Move (or Sprint) more than once per activation; each spends an action and generates its heat, bounded only by the 3-action budget.
- **Shut Down anywhere** (§5) — Shut Down may be declared at any point in the activation; heat vented scales with how much of the activation is spent shutting down (first-action = full vent, later = proportionally less).
- **Whole-inch speeds** (§2) — base Speed 5 / 4 / 3 / 2 by weight class; all distances round to whole inches.
- **Sprint** (§5/§6) — normal Move is 1 heat at any distance up to Speed; a Sprint (up to 1½× Speed) costs 2 heat. Replaces the old "half-Speed = 1, more = 2" tax that made every advance run hot.
- **Sweet-spot ranged ACC** (§7) — ranged weapons peak at a sweet-spot distance and lose ACC per inch away in either direction, within a min–max band. Replaces the flat near/far ACC bands so positioning matters at range.
- **Engagement / melee lock** (§5) — a melee attack (or moving into contact) locks two Rigs; an engaged Rig can't Move/Sprint/Jump-Jets (must Disengage) and fires ranged at −2 ACC. Makes melee a real threat instead of pure attrition.
- **Raking Fire** (§13) — machine guns do no frontal damage but hit far harder (+4 side / +8 rear).
- **Answer tokens** (§5) — the player going second each round gets 1 free preparation.
- **Weight-based heat** (§6) — Heat Capacity 6 / 5 / 4 / 3 by weight class; overheat roll adds 2 × (heat over Capacity), capped +10.
- **Victory — Salvage** (§11) — weighted centre objective (2 VP), annihilation auto-win.

**Open questions / TBD:**
- Weapon profiles are **universal** (one shared list of 7 Long Range + 7 Melee) with a **weight-class STR modifier** (Light −2 / Heavy +2 / Colossal +4 vs the Medium baseline, §12); all four classes are playable. Playtest the ±2-per-step spread — it may need widening/narrowing per weapon later.
- Faction perks — not yet written (§14).
- Machine-gun STR/arc values under Raking Fire — watch that they're "strong not silly" on the flanks.
- Alpha-strike swing at 3v3 — high-STR crits can gut a Rig in one activation; see if crits need softening.
- Whether composition-matching is enough balance, or a lightweight cost system is needed.
