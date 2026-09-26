# Walkers and drones in the 3D game

Two additions that bring non-rig units into digital (3D) battles.

## A. Enemy drones (campaign waves)

- New unit kind `drone` (`shared/unit-kinds.js`): parts Hull / Legs / Mount / Engine, soft toughness, vital pools on the §8 floor (6), 2 actions, Speed 5", 40 mm base, Integrity ratio 0.4 (~7).
- Three types (`DRONE_TYPES`, `shared/game-state.js`):
  - **Hunter**: Drone Carbine (ROF 3, Pen 5 / 1, 0–14").
  - **Sapper**: Demo Charge (melee, Pen 8 / 3). After the blow the charge `detonate`s: every other unit within 2.5" takes a Pen 6 / 2 hit and the Sapper is destroyed (`detonate()`).
  - **Spotter**: Sidearm + Recon (Paint).
- Drones score no kill VP, never erupt, and never keep a side alive (`holdsLine`). They're never a Priority Target.
- Waves ride the mission's reinforcement queue (`mission` attrs `drones: [{ round, type, count }]`); round-1 drones start on the table. The campaign (`droneWaves` in `shared/campaign/run.js`) gives the Warlord five waves, Last Stand two, and other contracts from step 2 a chance of one or two. Drone wrecks pay 1 salvage (a Sapper that went off leaves nothing).

## B. Support walker (player squad)

- Digital battles now accept walkers (tanks stay refused). Weld / Vent need 3" rim-to-rim reach, Paint needs sight within 24" (`supportInReach`, `PAINT_RANGE`).
- Skirmish vs bot: pick one walker template in the squad builder; the bot answers with a random walker (parity counts walkers by kind).
- Campaign: `walker:<template>` unlocks (Medic Walker free); pick one at the start of a run; it joins every contract fully repaired (`support` attrs) and is ignored by the debrief.
- A walker doesn't hold the line in a digital battle: lose every rig and you lose.

## Bot

Unit weapons map to the `unit` slot (`slotFor`); candidates cover unit guns / blades, Weld / Vent / Paint (one live mark per painter); the scorer pulls Repair / Coolant walkers toward allies that need them, prices support actions in `tacticalValue`, treats a detonating Sapper as unexposed, and values drone kills at half a kill. A refused bot command now ends the activation instead of spinning.

## 3D client

Walker (pod on stilts, module tool on the left arm) and drone (small scuttler with a red eye; the Sapper carries a blinking charge) models; compact drone roster lines; Weld / Vent / Paint targeting mode with reach rings; weld / vent / paint / detonate / drone-wave FX; walker crew barks and drone chirps; unit inspector; walker pick in the squad builder and the campaign commission; drone waves on contract cards. Helpers in `client3d/src/game/units.js`.

Tests: `shared/walkers.test.js`.
