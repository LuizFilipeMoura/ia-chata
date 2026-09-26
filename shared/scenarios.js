// Training Grounds: small, hand-built situations, one per mechanic. Each one is
// a real digital room (the server still enforces every rule), with fixed
// positions, headings, heat and beacons so the lesson plays out the same way
// every time. The enemy is usually a "dummy" bot: a practice target that stands
// still and ends its turn at once. The scripted text lives in the 3D client.

// Field is the default 54" x 36". Facing is degrees, 0 = +x (east).
const ME = "light-claw-autocannon";      // Autocannon (sweet 12") + Claw
const TARGET = "medium-lance-mortar";    // no shield, no tricks

export const SCENARIOS = {
  move: {
    title: "Move and Sprint",
    rigs: [
      { name: "Copper", owner: "a", chassis: ME, x: 8, y: 18, facing: 0 },
      { name: "Dummy", owner: "b", chassis: TARGET, x: 48, y: 32, facing: 180 },
    ],
    objectives: [{ x: 27, y: 18, vp: 2 }],
  },
  beacon: {
    title: "Claim a beacon",
    rigs: [
      { name: "Copper", owner: "a", chassis: ME, x: 22, y: 18, facing: 0 },
      { name: "Dummy", owner: "b", chassis: TARGET, x: 50, y: 33, facing: 180 },
    ],
    objectives: [{ x: 27, y: 18, vp: 2 }],
  },
  anatomy: {
    title: "Rig anatomy",
    rigs: [
      { name: "Copper", owner: "a", chassis: ME, x: 12, y: 18, facing: 0 },
      // Engine on 2 SP: one Autocannon wound (2 damage) breaks it exactly.
      // More wounds spill past 0, and a broken Engine hit again is destroyed.
      { name: "Dummy", owner: "b", chassis: TARGET, x: 22, y: 18, facing: 180, sp: { engine: 2 } },
      // Parked far away so wrecking the dummy doesn't end the game (annihilation).
      { name: "Spare", owner: "b", chassis: "light-harpoon-anchor", x: 50, y: 33, facing: 180 },
    ],
    objectives: [],
  },
  // Worked examples for "How an attack works": a weak gun (Rivet Gun, Pen 3)
  // into a medium's front armour, so misses, bounces and lucky 10s all happen.
  attackdemo: {
    title: "How an attack works",
    rigs: [
      { name: "Copper", owner: "a", chassis: "light-rivet-pressureclaw", x: 14, y: 18, facing: 0 },
      { name: "Dummy", owner: "b", chassis: TARGET, x: 20, y: 18, facing: 180 },
    ],
    objectives: [],
  },
  fire: {
    title: "Open fire",
    rigs: [
      { name: "Copper", owner: "a", chassis: ME, x: 12, y: 18, facing: 0 },
      // Facing away: you are behind it, so the shot lands on its rear.
      { name: "Dummy", owner: "b", chassis: TARGET, x: 24, y: 18, facing: 0 },
    ],
    objectives: [],
  },
  arcs: {
    title: "Arcs and flanking",
    rigs: [
      // The dummy faces you, but you look away (south): it sits outside your
      // front arc, so you can't shoot until you turn. Close and a little north
      // of its nose, so ONE move reaches its side and a ≤90° turn faces it.
      { name: "Copper", owner: "a", chassis: ME, x: 20, y: 15, facing: 90 },
      { name: "Dummy", owner: "b", chassis: TARGET, x: 24, y: 18, facing: 180 },
    ],
    objectives: [],
  },
  cover: {
    title: "Cover and line of sight",
    rigs: [
      { name: "Copper", owner: "a", chassis: ME, x: 10, y: 18, facing: 0 },
      { name: "Dummy", owner: "b", chassis: TARGET, x: 22, y: 18, facing: 180 },
    ],
    // A low barricade across the line of fire (cover), and a building up north
    // that walls off a whole approach (no line of sight at all).
    terrain: [
      { kind: "barricade", shape: "rect", x: 16, y: 18, w: 1, h: 2.4, rot: 0 },
      { kind: "building", shape: "rect", x: 16, y: 9, w: 5, h: 6, rot: 0 },
    ],
    objectives: [],
  },
  // Weapon keywords: a Mini Gun (Raking Fire; Field upgrade Suppressive Fire
  // gives Shock) staring at the dummy's FRONT, where Raking Fire can't wound.
  keywords: {
    title: "Weapon keywords",
    rigs: [
      // In its front arc but off its nose: one Sprint reaches its side.
      { name: "Copper", owner: "a", chassis: "light-saw-minigun", lrUp: "suppressive-fire", x: 19, y: 20, facing: -22 },
      { name: "Dummy", owner: "b", chassis: TARGET, x: 24, y: 18, facing: 180 },
    ],
    objectives: [],
  },
  // Upgrades: the Autocannon's Prototype, Penetrator Rounds (every 3rd volley
  // skips the wound roll; the belt then cycles slow).
  prototype: {
    title: "Upgrades: Field, Tuned, Prototype",
    rigs: [
      // Two volleys already down the belt: the next one is the 3rd.
      { name: "Copper", owner: "a", chassis: ME, lrUp: "penetrator-rounds", x: 12, y: 18, facing: 0, set: { autocannonShots: 2 } },
      { name: "Dummy", owner: "b", chassis: TARGET, x: 24, y: 18, facing: 180 },
    ],
    objectives: [],
  },
  melee: {
    title: "Melee and engagement",
    rigs: [
      { name: "Copper", owner: "a", chassis: ME, x: 20, y: 18, facing: 0 },
      { name: "Dummy", owner: "b", chassis: TARGET, x: 23.2, y: 18, facing: 180 },
    ],
    objectives: [],
  },
  heat: {
    title: "Heat and Shut Down",
    rigs: [
      { name: "Copper", owner: "a", chassis: ME, x: 12, y: 18, facing: 0, heat: 5 },
      { name: "Dummy", owner: "b", chassis: TARGET, x: 24, y: 18, facing: 180 },
    ],
    objectives: [],
  },
  equipment: {
    title: "Equipment",
    rigs: [
      { name: "Copper", owner: "a", chassis: "medium-sniper-chainsaw", equipment: "targeting-computer", x: 8, y: 18, facing: 0 },
      { name: "Dummy", owner: "b", chassis: TARGET, x: 30, y: 18, facing: 180 },
    ],
    objectives: [],
  },
  reactions: {
    title: "Reactions and the Answer token",
    // The enemy goes first and means it: you hold the round's Answer token.
    first: "b",
    enemyBot: "aggressive",
    rigs: [
      { name: "Copper", owner: "a", chassis: "light-sword-arc", x: 14, y: 18, facing: 0 },
      { name: "Raider", owner: "b", chassis: ME, x: 26, y: 18, facing: 180 },
    ],
    objectives: [],
  },
};

export const SCENARIO_IDS = Object.keys(SCENARIOS);
