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
    title: "Flanking",
    rigs: [
      // The dummy faces you: its front is its best armour. Walk round it.
      { name: "Copper", owner: "a", chassis: ME, x: 14, y: 18, facing: 0 },
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
