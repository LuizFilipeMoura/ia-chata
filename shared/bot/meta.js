// The HARD bot's playbook — evolved by the genetic meta-search, not hand-tuned.
// Regenerate with `node scripts/evolve-meta.mjs` after a rules change; it rewrites
// this file with the champion weight vector and, per chassis, the upgrade +
// equipment picks that won most often. Pure data: imported by game-state.js (bot
// commissioning) and bot/score.js (weights), so it must not import either.
export const META = {
  "weights": {
    "vp": 5.97,
    "priority": 2.06,
    "damage": 0.43,
    "threat": 0.27,
    "heat": 0.54,
    "fragile": 0.24,
    "tactics": 0.7
  },
  "builds": {
    "medium-crossbow-talon": {
      "longRangeUpgrade": "pinning-bolt",
      "meleeUpgrade": "exploit-wound",
      "equipment": "servo-actuators",
      "equipmentUpgrade": "reinforced-servos",
      "score": 1.564
    },
    "light-harpoon-anchor": {
      "longRangeUpgrade": "taut-cable",
      "meleeUpgrade": "fluked-head",
      "equipment": "field-repair-suite",
      "equipmentUpgrade": "nanite-swarm",
      "score": 1.348
    },
    "light-missile-flamethrower": {
      "longRangeUpgrade": "swarm-warheads",
      "meleeUpgrade": "sticky-fuel",
      "equipment": "field-repair-suite",
      "equipmentUpgrade": "master-toolkit",
      "score": 1.679
    },
    "medium-lance-mortar": {
      "longRangeUpgrade": "cluster-shells",
      "meleeUpgrade": "skewer",
      "equipment": "field-repair-suite",
      "equipmentUpgrade": "battlefield-triage",
      "score": 1.638
    },
    "light-rivet-pressureclaw": {
      "longRangeUpgrade": "rapid-feed",
      "meleeUpgrade": "hardened-jaws",
      "equipment": "servo-actuators",
      "equipmentUpgrade": "grapnel-launcher",
      "score": 1.912
    },
    "medium-shield-siege": {
      "longRangeUpgrade": "breaching-round",
      "meleeUpgrade": "tower-shield",
      "equipment": "targeting-computer",
      "equipmentUpgrade": "fire-solution-lock",
      "score": 0.93
    },
    "light-saw-minigun": {
      "longRangeUpgrade": "suppression-lock",
      "meleeUpgrade": "sunder",
      "equipment": "reactive-plating",
      "equipmentUpgrade": "angled-plates",
      "score": 1.208
    },
    "light-claw-autocannon": {
      "longRangeUpgrade": "depleted-core",
      "meleeUpgrade": "breach-grip",
      "equipment": "targeting-computer",
      "equipmentUpgrade": "ballistic-processor",
      "score": 1.343
    },
    "light-sword-arc": {
      "longRangeUpgrade": "systems-overload",
      "meleeUpgrade": "duelist-balance",
      "equipment": "blast-furnace-core",
      "equipmentUpgrade": "meltdown-protocol",
      "score": 1.539
    },
    "light-wreckingball-double": {
      "longRangeUpgrade": "pinning-burst",
      "meleeUpgrade": "momentum-swing",
      "equipment": "reactive-plating",
      "equipmentUpgrade": "chaff-burst",
      "score": 1.585
    }
  },
  "chassisRank": [
    "medium-crossbow-talon",
    "light-missile-flamethrower",
    "light-harpoon-anchor",
    "light-rivet-pressureclaw",
    "medium-sniper-chainsaw",
    "medium-lance-mortar",
    "light-claw-autocannon",
    "light-wreckingball-double",
    "light-sword-arc",
    "light-saw-minigun",
    "medium-shield-siege"
  ],
  "generatedAt": "2026-09-24T17:34:09.763Z"
};
