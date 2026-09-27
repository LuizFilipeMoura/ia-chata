// One recipe per chassis codename: which parts from parts.js make its body,
// its trim metal and proportion knobs. Within a weight class no two chassis
// share a torso, head or backpack, and every leg + foot combo is unique, so
// each mini reads apart on the table (rig.test.js holds these rules).
//
// proportions: torso [x (depth), y (height), z (width)] multipliers on the
// class torso box, hunch = forward lean (radians), head = head scale.
export const RECIPES = {
  // ---- Light ----
  Gold: { role: "raptor", torso: "bomberNose", head: "none", backpack: "ammoDrum", legs: "digitigrade", feet: "claw", shoulders: "rivetCap", signature: "beltFeed", trim: "brass", proportions: { torso: [1.15, 0.95, 0.9], hunch: -0.12 } },
  Blue: { role: "firebug", torso: "gondola", head: "gasMask", backpack: "gasTanks", legs: "pistonStilt", feet: "plate", shoulders: "hoseFed", signature: "pilotLight", trim: "steel", proportions: { torso: [1.1, 0.9, 0.95] } },
  Purple: { role: "buzzsaw", torso: "tractorBlock", head: "visorBucket", backpack: "dynamo", legs: "chickenWalker", feet: "tracked", shoulders: "exhaust", signature: "flywheel", trim: "gunmetal", proportions: { torso: [0.95, 1.0, 0.95], hunch: -0.08 } },
  Pumpkin: { role: "locomotive", torso: "boilerDrum", head: "locoCab", backpack: "twinStacks", legs: "digitigrade", feet: "plate", shoulders: "slab", signature: "cowcatcher", trim: "brass", proportions: { torso: [1.1, 1.0, 1.0] } },
  Zebra: { role: "duelist", torso: "rivetWedge", head: "knightHelm", backpack: "radiatorFins", legs: "pistonStilt", feet: "spur", shoulders: "slab", signature: "scabbard", trim: "steel", proportions: { torso: [0.95, 0.88, 0.85], head: 0.95 } },
  Turquoise: { role: "diver", torso: "divingBell", head: "divingHelm", backpack: "bellows", legs: "chickenWalker", feet: "drumPad", shoulders: "rivetCap", signature: "chainWinch", trim: "brass", proportions: { torso: [1, 0.96, 1.0] } },
  Green: { role: "shipwright", torso: "armoredCab", head: "weldMask", backpack: "compressor", legs: "digitigrade", feet: "tracked", shoulders: "hoseFed", signature: "rivetHoppers", trim: "gunmetal", proportions: { torso: [1, 1.0, 1.0] } },
  // ---- Medium ----
  Copper: { role: "artillery", torso: "tractorBlock", head: "periscope", backpack: "shellRack", legs: "elephantDrum", feet: "drumPad", shoulders: "slab", signature: "aimingQuadrant", trim: "brass", proportions: { torso: [1, 0.9, 1.0] } },
  Black: { role: "bulwark", torso: "rivetWedge", head: "pillbox", backpack: "sparkChimney", legs: "pillar", feet: "plate", shoulders: "slab", signature: "armorSkirts", trim: "gunmetal", proportions: { torso: [1.05, 1.0, 1.05] } },
  Red: { role: "marksman", torso: "armoredCab", head: "stereoRange", backpack: "radiatorFins", legs: "crabKnee", feet: "spur", shoulders: "rivetCap", signature: "fuelCan", trim: "steel", proportions: { torso: [0.95, 0.95, 0.95] } },
  Silver: { role: "shrike", torso: "bomberNose", head: "searchlight", backpack: "boltQuiver", legs: "crabKnee", feet: "claw", shoulders: "exhaust", signature: "talonSpurs", trim: "steel", proportions: { torso: [1.1, 0.9, 0.9], hunch: -0.1 } },
  Brass: { role: "steamworks", torso: "verticalBoiler", head: "none", backpack: "twinStacks", legs: "pillar", feet: "tracked", shoulders: "hoseFed", signature: "whistle", trim: "brass", proportions: { torso: [1, 0.88, 1.05] }, tallStacks: true },
  Ivory: { role: "signaller", torso: "gondola", head: "bubble", backpack: "flareRack", legs: "elephantDrum", feet: "plate", shoulders: "rivetCap", signature: "signalMast", trim: "brass", proportions: { torso: [1.1, 0.95, 0.95] } },
  Jade: { role: "electrician", torso: "divingBell", head: "coilCrown", backpack: "dynamo", legs: "crabKnee", feet: "drumPad", shoulders: "exhaust", signature: "insulators", trim: "steel", proportions: { torso: [1, 0.9, 1.0] } },
};

// Unknown codenames (campaign specials, renamed rigs) fall back per class.
export const FALLBACK = {
  light: { role: "stalker", torso: "armoredCab", head: "visorBucket", backpack: "twinStacks", legs: "digitigrade", feet: "plate", shoulders: "rivetCap", signature: null, trim: "steel", proportions: {} },
  medium: { role: "trooper", torso: "armoredCab", head: "visorBucket", backpack: "twinStacks", legs: "pillar", feet: "plate", shoulders: "rivetCap", signature: null, trim: "steel", proportions: {} },
};

export function recipeFor(codename, cls) {
  return RECIPES[codename] ?? FALLBACK[cls] ?? FALLBACK.light;
}
