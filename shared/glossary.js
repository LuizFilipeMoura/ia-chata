// Global glossary of reserved rules terms (Of Oil and Iron). Shared between
// the server (future use) and the client, which highlights every `match`
// string it finds in assistant answers and pops the `def` up on tap/click.
// `match` entries are matched case-sensitively and longest-first, so a
// multi-word phrase (e.g. "Heat Capacity") always wins over a shorter one
// that it contains (e.g. "Heat").
export const GLOSSARY = [
  {
    id: "rig", term: "Rig", match: ["Rig", "Rigs"],
    def: "A dieselpunk war machine piloted by an Ironclad. Every Rig has four components — Hull, Arms, Legs, Engine — each with its own Structure Points (§2).",
  },
  {
    id: "ironclad", term: "Ironclad", match: ["Ironclad", "Ironclads"],
    def: "The pilot commanding a Rig.",
  },
  {
    id: "squadron", term: "Squadron", match: ["Squadron"],
    def: "A player's force of 3–5 Rigs, built purely from chassis and weapons (§3).",
  },
  {
    id: "weight-class", term: "Weight class", match: ["Weight class", "Weight classes"],
    def: "A Rig's chassis size — Light or Medium — which sets its base Structure Points, Speed, and Heat Capacity (§2).",
  },
  {
    id: "sp", term: "Structure Points", match: ["Structure Points", "SP"],
    def: "Durability tracked per component (Hull, Arms, Legs, Engine). A component at 0 SP suffers catastrophic damage (§2, §8).",
  },
  {
    id: "hull", term: "Hull", match: ["Hull"],
    def: "One of a Rig's four components. At 0 SP: −2 max actions and −1 Aim; further damage destroys the Rig (§8).",
  },
  {
    id: "arms", term: "Arms", match: ["Arms"],
    def: "One of a Rig's four components. At 0 SP a random weapon is destroyed and its munitions explode (§8).",
  },
  {
    id: "legs", term: "Legs", match: ["Legs"],
    def: "One of a Rig's four components. At 0 SP: Move −3\", pivots cost double, no backpedal; further damage immobilises the Rig (§8).",
  },
  {
    id: "engine", term: "Engine", match: ["Engine"],
    def: "One of a Rig's four components; also where heat is tracked. At 0 SP the Rig loses its next activation and heat can't drop below 3 (§8).",
  },
  {
    id: "aim", term: "Aim", match: ["Aim"],
    def: "A Rig's base D6 target number to hit, modified by weapon Accuracy and cover (§2, §7).",
  },
  {
    id: "speed", term: "Speed", match: ["Speed"],
    def: "A Rig's maximum Move distance in inches (§2).",
  },
  {
    id: "heat", term: "Heat", match: ["Heat"],
    def: "A resource that climbs as a Rig acts. Past its Heat Capacity at the end of an activation, the Rig risks an overheat misfire (§6).",
  },
  {
    id: "heat-capacity", term: "Heat Capacity", match: ["Heat Capacity"],
    def: "The heat a Rig can carry safely before an overheat check is required — 6/5/4/3 for Light/Medium/Heavy/Colossal (§6).",
  },
  {
    id: "accuracy", term: "Accuracy", match: ["Accuracy", "ACC"],
    def: "A weapon's accuracy modifier, applied to the Rig's Aim when rolling to hit (§7, §12).",
  },
  {
    id: "rof", term: "ROF", match: ["ROF"],
    def: "Rate of Fire — the number of D6 a weapon rolls when firing (§12).",
  },
  {
    id: "penetration", term: "Penetration", match: ["Penetration", "STR"],
    def: "A weapon's strength, subtracted from the Wound Roll's target — each point makes wounding 10% likelier (§7.5, §12).",
  },
  {
    id: "rng", term: "RNG", match: ["RNG"],
    def: "A weapon's sweet-spot distance (peak accuracy) and usable min–max range in inches. Accuracy falls off the farther the target is from the sweet spot; outside min–max the attack fails (§12).",
  },
  {
    id: "wound-roll", term: "Wound Roll", match: ["Wound Roll", "Wound Rolls"],
    def: "One D10 per landed hit, needing 6 + the location's Toughness − your effective Penetration (§7.5). Each wound deals the weapon's Damage. A natural 10 always wounds, so no target is ever immune.",
  },
  {
    id: "toughness", term: "Toughness", match: ["Toughness"],
    def: "How hard a location is to wound, set per component — a Medium Rig's Hull is T5, its Engine T3. Raises the Wound Roll target one-for-one (§2, §7.5).",
  },
  {
    id: "damage", term: "Damage", match: ["Damage"],
    def: "A weapon's Structure Point loss per wound — every wound it lands deals this much, however the roll passed (§7.5, §12).",
  },
  {
    id: "catastrophic-damage", term: "catastrophic damage", match: ["catastrophic damage"],
    def: "The special effect a component suffers when reduced to 0 Structure Points (§8).",
  },
  {
    id: "move", term: "Move", match: ["Move"],
    def: "Action [1 heat]: reposition up to the Rig's full Speed — forward, backpedal, side-step, or pivot (§5).",
  },
  {
    id: "sprint", term: "Sprint", match: ["Sprint", "Sprinting"],
    def: "Extending a Move up to 1½× Speed, for 2 heat instead of 1 (§5, §6).",
  },
  {
    id: "fire-weapon", term: "Fire Weapon", match: ["Fire Weapon"],
    def: "Action [1 heat, 2 if Hot]: attack with one equipped weapon. Ranged weapons need Reload before firing again (§5, §7).",
  },
  {
    id: "aimed-shot", term: "Aimed Shot", match: ["Aimed Shot"],
    def: "A Fire Weapon action where you choose the hit location instead of rolling for it, at −2 Accuracy (Precision removes the penalty) (§5, §13).",
  },
  {
    id: "reload", term: "Reload", match: ["Reload"],
    def: "Action: reloads all of the Rig's weapons (§5).",
  },
  {
    id: "repair", term: "Repair", match: ["Repair"],
    def: "Action [0 heat]: roll 1 D6 — 1-2 repairs 1 SP to one location, 3-4 repairs 2 SP, 5-6 repairs 3 SP (§5).",
  },
  {
    id: "shut-down", term: "Shut Down", match: ["Shut Down"],
    def: "Action [0 heat], declared before any other action: forfeit the rest of the activation to set heat to 0 (§5).",
  },
  {
    id: "prepare", term: "Prepare", match: ["Prepare"],
    def: "Action [1 heat]: place a facedown preparation (Evasive Manoeuvre, Return Fire, or Brace for Incoming Fire) that triggers before this Rig's next activation (§5).",
  },
  {
    id: "answer-tokens", term: "Answer tokens", match: ["Answer tokens", "Answer token"],
    def: "Free preparations granted each round to the player who activates second — no action or heat cost (§4, §5).",
  },
  {
    id: "activation", term: "activation", match: ["activation", "activations"],
    def: "A Rig's full turn: it takes up to 5 actions before the next Rig activates (§4).",
  },
  {
    id: "initiative", term: "Initiative", match: ["Initiative"],
    def: "A D12 roll each round (except round 1) that decides who activates first (§4, §10).",
  },
  {
    id: "long-range", term: "Long Range", match: ["Long Range"],
    def: "One of the two weapon types — fires at range and must be reloaded between shots in the same activation (§12).",
  },
  {
    id: "melee", term: "Melee", match: ["Melee"],
    def: "The other weapon type — usable only within 1.5\", and never needs reloading (§12).",
  },
  {
    id: "full-auto", term: "Full Auto", match: ["Full Auto"],
    def: "Weapon perk / optional fire-mode: +2 ROF, but each attack die that rolls a 1 adds 1 heat (§13).",
  },
  {
    id: "charged-shot", term: "Charged Shot", match: ["Charged Shot"],
    def: "Weapon perk / optional fire-mode: +2 Penetration, but each attack die that rolls a 1 adds 1 heat (§13).",
  },
  {
    id: "hot", term: "Hot", match: ["Hot"],
    def: "Weapon perk: firing generates 2 heat instead of 1 (§13).",
  },
  {
    id: "raking-fire", term: "Raking Fire", match: ["Raking Fire"],
    def: "Machine-gun perk: deals no damage to a target's front arc, but gains +3 Penetration on the side arc and +6 Penetration on the rear arc, replacing the usual arc bonuses (§13).",
  },
  {
    id: "armour-piercing", term: "Armour Piercing", match: ["Armour Piercing"],
    def: "Weapon perk: reroll each failed Wound Roll — it lands more wounds rather than deeper ones (§13).",
  },
  {
    id: "precision", term: "Precision", match: ["Precision"],
    def: "Weapon perk: may make an Aimed Shot without the usual −2 Accuracy penalty (§13).",
  },
  {
    id: "cleave", term: "Cleave", match: ["Cleave"],
    def: "Weapon perk: on a successful hit, one other enemy Rig within 1.5\" of the target also suffers a hit (§13).",
  },
  {
    id: "rend", term: "Rend", match: ["Rend"],
    def: "Weapon perk: each wound deals +1 Damage — it wounds deeper rather than more often (§13).",
  },
  {
    id: "shock", term: "Shock", match: ["Shock"],
    def: "Weapon perk: on a successful hit, the target's movement is halved (round down) during its next activation (§13).",
  },
  {
    id: "impale", term: "Impale", match: ["Impale"],
    def: "Weapon perk: on a successful hit, roll 1 D12 — on 8+ the target is immobilised until this Rig's next activation (§13).",
  },
  {
    id: "incendiary", term: "Incendiary", match: ["Incendiary"],
    def: "Weapon perk: a successful hit increases the target's heat by 1, needing only to hit (§13).",
  },
  {
    id: "staggering", term: "Staggering", match: ["Staggering"],
    def: "Weapon perk: on a successful hit, roll 1 D6 to pivot the target 90° either way or push it back 3\" (§13).",
  },
  {
    id: "front-arc", term: "front arc", match: ["front arc"],
    def: "The 90° zone a Rig faces; attacks must be declared against a target inside it (§7).",
  },
  {
    id: "side-arc", term: "side arc", match: ["side arc"],
    def: "A facing zone to a Rig's flank — attacks gain +2 Penetration here (+3 with Raking Fire) (§7, §13).",
  },
  {
    id: "rear-arc", term: "rear arc", match: ["rear arc"],
    def: "The facing zone behind a Rig — attacks gain +3 Penetration here (+6 with Raking Fire). Melee climbs the same ladder as ranged (§7, §13).",
  },
  {
    id: "salvage", term: "Salvage", match: ["Salvage"],
    def: "The victory system: control objective markers to score Victory Points over 10 rounds (§11).",
  },
  {
    id: "vp", term: "Victory Points", match: ["Victory Points", "VP"],
    def: "Points scored each Recovery Phase for controlling objective markers; most VP after 10 rounds wins (§11).",
  },
  {
    id: "ironclad-bounty", term: "Ironclad Bounty", match: ["Ironclad Bounty"],
    def: "Optional rule: each player secretly names one enemy Rig as their Priority Target — destroying it is worth +2 VP (§11).",
  },
  {
    id: "riposte", term: "Riposte", match: ["Riposte"],
    def: "Answer counter (§5): when an enemy melees this Rig, it makes one free melee attack back — no action, no heat. Answer-token only.",
  },
  {
    id: "sidestep", term: "Sidestep the Shooter", match: ["Sidestep the Shooter", "Sidestep"],
    def: "Answer counter (§5): when an enemy shoots this Rig, slip up to ½ Speed before the shot resolves; if the move reaches the shooter you may engage it. Answer-token only.",
  },
  {
    id: "exploit", term: "Exploit Opening", match: ["Exploit Opening", "Exploit"],
    def: "Answer counter (§5): when an overcommitted enemy (final action spent, or overheated) attacks this Rig, pivot and land a free Aimed counter-shot with no aim penalty. Answer-token only.",
  },
  // ── Runtime states (rig terminal mod chips; id-only lookup) ────────────────
  { id: "immobilised", term: "Immobilised", match: [],
    def: "Can't move at all until freed — from destroyed Legs or an Impale result. No repositioning or pivots (§8, §13)." },
  { id: "pinned", term: "Pinned", match: [],
    def: "Suppressing fire has pinned the Rig — it can't move this activation, though it isn't permanently immobilised." },
  { id: "emplaced", term: "Emplaced", match: [],
    def: "Dug into a fixed firing position — trades mobility for a steadier platform." },
  { id: "barrage", term: "Barrage", match: [],
    def: "A sustained barrage is in flight; the number is how many more activations of fire it keeps up." },
  { id: "engaged", term: "Engaged", match: [],
    def: "Locked in melee with an enemy Rig. It must Disengage before it can Move (§5, §12)." },
  { id: "burning", term: "Burning", match: [],
    def: "On fire — takes damage each activation until the flames go out; the number is rounds of burning left." },
  { id: "no-cooling", term: "No cooling", match: [],
    def: "Cooling systems are offline — the Rig can't shed Heat this activation." },
  { id: "speed-halved", term: "Speed halved", match: [],
    def: "Movement is halved (round down) next activation — usually from a Shock hit (§13)." },
  { id: "skip-activation", term: "Skips next activation", match: [],
    def: "Loses its next activation entirely — commonly from a wrecked Engine (§8)." },
  { id: "momentum", term: "Momentum", match: [],
    def: "Built-up charge from a prototype upgrade; the number is the momentum stacks available to spend." },
  { id: "missiles-locked", term: "Missiles locked", match: [],
    def: "A missile lock is held on a target — the next salvo fires with the lock's bonus." },
  { id: "action-penalty", term: "Action penalty", match: [],
    def: "Starts its next activation short N actions — a lingering penalty from an enemy effect." },
  { id: "no-prepare", term: "No Prepare next", match: [],
    def: "Can't place a Prepare reaction on its next activation (§5)." },
  { id: "anchored", term: "Anchored", match: [],
    def: "Held in place — Disengaging next activation costs a free hit, or is barred outright." },
  { id: "no-actives", term: "No actives next", match: [],
    def: "Can't use active equipment abilities on its next activation." },
  { id: "arc-locked", term: "Arc Gun locked", match: [],
    def: "The Arc Gun is locked out next activation and can't fire." },
  { id: "arms-suppressed", term: "Arms suppressed", match: [],
    def: "Arms are suppressed — weapons fire at half ROF (round down)." },
  { id: "belt-cycling", term: "Belt cycling", match: [],
    def: "The autocannon belt is still cycling — half ROF on the next shot." },
  { id: "cracked", term: "Cracked", match: [],
    def: "A component's armour is cracked — it takes extra damage there until repaired." },
  { id: "riveted", term: "Riveted", match: [],
    def: "A component is rivet-seized — it can't be repaired until the seize is cleared." },
  { id: "no-repair", term: "No repair", match: [],
    def: "A component can't be repaired for now — damage there is locked in." },
  { id: "reaction-set", term: "Reaction set", match: [],
    def: "A facedown Prepare reaction is armed and triggers before this Rig's next activation (§5)." },
  { id: "braced", term: "Braced", match: [],
    def: "Braced for Incoming Fire — an armed reaction that cuts incoming damage before the next activation (§5)." },
  { id: "evasive", term: "Evasive ready", match: [],
    def: "Evasive Manoeuvre — an armed reaction that dodges before the next activation (§5)." },
  { id: "return-fire", term: "Return fire ready", match: [],
    def: "Return Fire — an armed reaction that shoots back before the next activation (§5)." },
  { id: "weapon-lost", term: "Weapon lost", match: [],
    def: "A weapon was destroyed (Arms at 0 SP) and can no longer be fired (§8)." },
  { id: "ranged-unloaded", term: "Ranged unloaded", match: [],
    def: "The Long Range weapon is spent and must Reload before firing again (§5, §12)." },
  { id: "painted", term: "Painted", match: [],
    def: "Marked by a Recon Paint — allied ranged attacks ignore its cover and gain +1 Aim (Support Units)." },
  // ── Status-chip states (id-only lookup) ────────────────────────────────────
  { id: "destroyed", term: "Destroyed", match: [],
    def: "The Rig is wrecked and out of the battle." },
  { id: "heavy-damage", term: "Heavy damage", match: [],
    def: "A component is at a third of its structure or less — still operational but near catastrophic." },
  { id: "damaged", term: "Damaged", match: [],
    def: "At least one component has taken damage; the Rig is still fully operational." },
  { id: "nominal", term: "All systems nominal", match: [],
    def: "Every component is at full structure — no damage." },
  // ── Non-rig parts (Tank / Walker) ──────────────────────────────────────────
  { id: "tracks", term: "Tracks", match: [],
    def: "A Tank's mobility component. At 0 SP its movement is crippled." },
  { id: "turret", term: "Turret", match: [],
    def: "A Tank's weapon component, housing its main gun. At 0 SP a weapon is lost." },
  { id: "mount", term: "Mount", match: [],
    def: "A Walker's weapon component. At 0 SP a weapon is lost." },
  // ── Support-unit modules ───────────────────────────────────────────────────
  { id: "module-damage", term: "Damage module", match: [],
    def: "Arms a support unit with a real gun from the weapon catalogue (Support Units)." },
  { id: "module-repair", term: "Repair module", match: [],
    def: "Grants the Field Weld action to repair an allied unit (Support Units)." },
  { id: "module-coolant", term: "Coolant module", match: [],
    def: "Grants the Vent action to shed an ally's Heat (Support Units)." },
  { id: "module-recon", term: "Recon module", match: [],
    def: "Grants the Paint action to mark an enemy for the whole squadron (Support Units)." },
];
