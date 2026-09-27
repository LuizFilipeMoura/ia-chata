// The HARD bot's playbook, evolved by the genetic meta-search, not hand-tuned.
// Regenerate with `node scripts/evolve-meta.mjs` after a rules change; it rewrites
// this file with the champion weight vector and, per chassis, the upgrade +
// equipment picks that won most often. Pure data: imported by game-state.js (bot
// commissioning) and bot/score.js (weights), so it must not import either.
export const META = {
  "weights": {
    "vp": 9.89,
    "priority": 1.86,
    "damage": 0.25,
    "threat": 0.32,
    "heat": 0.5,
    "fragile": 0.34,
    "tactics": 0.83,
    "b_move": 0.25,
    "b_sprint": 0.02,
    "b_fire": 0.26,
    "b_aimed": -0.23,
    "b_prepare": -0.28,
    "b_repair": 0.22,
    "b_shutdown": -0.12,
    "b_special": 0.23,
    "b_plant": 0.01
  },
  "builds": {
    "medium-shield-siege": {
      "longRangeUpgrade": "reinforced-head",
      "meleeUpgrade": "tower-shield",
      "equipment": "targeting-computer",
      "equipmentUpgrade": "predictive-tracking",
      "score": 2.078
    },
    "medium-sniper-chainsaw": {
      "longRangeUpgrade": "enfilade",
      "meleeUpgrade": "bloodletter",
      "equipment": "radiator-array",
      "equipmentUpgrade": "twin-radiators",
      "score": 2.036
    },
    "light-missile-flamethrower": {
      "longRangeUpgrade": "shaped-charges",
      "meleeUpgrade": "conflagration",
      "equipment": "ablative-plating",
      "equipmentUpgrade": "reinforced-plating",
      "score": 2.055
    },
    "light-harpoon-anchor": {
      "longRangeUpgrade": "barbed-head",
      "meleeUpgrade": "ground-anchor",
      "equipment": "servo-actuators",
      "equipmentUpgrade": "reinforced-servos",
      "score": 2.061
    },
    "medium-steam-piston": {
      "longRangeUpgrade": "high-pressure-valve",
      "meleeUpgrade": "follow-through",
      "equipment": "targeting-computer",
      "equipmentUpgrade": "predictive-tracking",
      "score": 2.104
    },
    "medium-flare-bayonet": {
      "longRangeUpgrade": "stripping-flare",
      "meleeUpgrade": "fixed-bayonet",
      "equipment": "ablative-plating",
      "equipmentUpgrade": "ablative-cascade",
      "score": 0.5
    },
    "medium-lance-mortar": {
      "longRangeUpgrade": "cluster-shells",
      "meleeUpgrade": "couched-reach",
      "equipment": "servo-actuators",
      "equipmentUpgrade": "grapnel-launcher",
      "score": 0.768
    },
    "medium-crossbow-talon": {
      "longRangeUpgrade": "steady-aim",
      "meleeUpgrade": "honed-talons",
      "equipment": "servo-actuators",
      "equipmentUpgrade": "kickstart-pistons",
      "score": 0.5
    },
    "light-wreckingball-double": {
      "longRangeUpgrade": "gyro-mount",
      "meleeUpgrade": "haymaker",
      "equipment": "radiator-array",
      "equipmentUpgrade": "twin-radiators",
      "score": 0.958
    }
  },
  "chassisRank": [
    "medium-sniper-chainsaw",
    "medium-shield-siege",
    "light-missile-flamethrower",
    "medium-steam-piston",
    "medium-tesla-shockglove",
    "light-harpoon-anchor",
    "light-claw-autocannon",
    "light-sword-arc",
    "light-rivet-pressureclaw",
    "light-saw-minigun",
    "medium-lance-mortar",
    "light-wreckingball-double",
    "medium-flare-bayonet",
    "medium-crossbow-talon"
  ],
  "generatedAt": "2026-09-27T15:04:01.455Z",
  "rulesHash": "1988cebcad92"
};
