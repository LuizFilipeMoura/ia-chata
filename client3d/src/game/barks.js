// Pilot barks. The rigs are machines; the people talking are the pilots sealed
// inside them, on the radio. A pilot never says a callsign: their own machine is
// "she", "the old girl", "this crate"; an enemy is whatever the crew can see of
// it ("the torch", "the long gun", "the heavy"), like a tank crew in a war.
// Pure flavour; the rules never read these.
//
// Tokens: {it} / {It} = crew slang for the other machine (sentence-case with
// {It}); {part} = the part that got hit. A line with a token is only used when
// the moment has one.

// Every weapon belongs to exactly one chassis, so a pilot rides with the gun,
// even in a renamed rig.
const PILOTS = {
  "Missile Barrage": {
    name: "Ottilie", lines: {
      hit: ["Burn, baby.", "{It}'s smoking. Good.", "Got its {part}! Is that covered?", "Toasty.", "Warm enough for you?"],
      miss: ["Rockets went sightseeing.", "Wind. Always the wind.", "…that one's on the insurance.", "Missed. Pretend you didn't see."],
      kill: ["{It}'s a bonfire now.", "Roasted.", "Put it down as 'accidental'."],
      hurt: ["Hey! That's my job!", "Is that MY oil?", "She's on fire. Well, more than usual."],
      critical: ["Everything's on fire and for once it isn't me!", "Fuel line's gone. Might be my last barbecue."],
      heat: ["Is it supposed to smell like that?", "Pilot light's on. It's always on.", "Hot. Hot. Hot."],
      eject: ["Ejecting! Somebody call the adjuster!", "I'm out. Tell them it was the wiring."],
      move: ["Burn for mama.", "Moving. Mind the fuel line."],
    },
  },
  "Harpoon": {
    name: "Jonah", lines: {
      hit: ["Aye.", "Hooked.", "Got its {part}.", "{It} hauls like a drowned cow."],
      miss: ["Sea's in a mood.", "Slipped the line.", "Seen worse."],
      kill: ["Another fish.", "{It}'s done swimming.", "Aye. That'll do."],
      hurt: ["She's leaking. Like my old ship.", "Taking water.", "Easy, girl…"],
      critical: ["She's going under. Not yet, girl.", "Water to the gunwales. Hold."],
      heat: ["Boiler's bubbling.", "Warm below decks."],
      eject: ["Abandoning ship. Again.", "Just drop me in the harbour."],
      move: ["Easy, girl.", "Casting off."],
    },
  },
  "Arc Gun": {
    name: "Nell", lines: {
      hit: ["Live wire!", "Grounded it.", "{It}'s {part} is shorting. You're welcome.", "Twenty thousand volts."],
      miss: ["Arc jumped. Arcs do that.", "Come on, come on…", "Nobody insulated this thing."],
      kill: ["{It}'s off the grid.", "Lights out.", "Company never did pay overtime."],
      hurt: ["That's gonna need an electrician.", "Ow. Sparks.", "Who's paying for that?"],
      critical: ["Every light on the board is red.", "I can smell the wiring. Bad sign."],
      heat: ["Coils are glowing. That's new.", "She's humming. Not the good hum."],
      eject: ["Grounding myself. Permanently.", "I'm out. Unplug her."],
      move: ["Come on, girl.", "Mind the cable."],
    },
  },
  "Autocannon": {
    name: "Ferdinand", lines: {
      hit: ["Hit! I'll put it in the report.", "Got its {part}!", "Effective. Very effective.", "{It} isn't even branded."],
      miss: ["Missed. That's going on my record.", "Mother of—!", "Recalibrating. Please hold."],
      kill: ["Competitor eliminated.", "{It} is… discontinued.", "Quarterly target met!"],
      hurt: ["Please don't dent the company asset.", "Who signs off on this damage?", "Is this covered? Tell me this is covered."],
      critical: ["She's a write-off. Tell accounts I tried.", "Frame's cracked. That's the whole policy gone."],
      heat: ["The manual says red is 'aspirational'.", "Requesting permission to panic."],
      eject: ["Filing an incident report from the ditch!", "Ejecting. Per procedure. I think."],
      move: ["Advancing, per protocol.", "Moving up."],
    },
  },
  "Mini Gun": {
    name: "Marguerite", lines: {
      hit: ["Brrrt.", "How frightfully common, bleeding oil.", "{It}'s {part}. Ghastly.", "Do keep up."],
      miss: ["I'll have that sent back.", "The barrels are family silver. Melted down.", "Tedious."],
      kill: ["{It} is bolted together with nails. Was.", "Scrap. Send the bill to its mother.", "Dismissed."],
      hurt: ["Do you know who my grandfather was?!", "My paintwork!", "Unforgivable."],
      critical: ["Grandfather would weep.", "I refuse to die in this paint."],
      heat: ["It's positively tropical in here.", "Someone open a window."],
      eject: ["The family will sell the name.", "I'm leaving. This is beneath me."],
      move: ["Make way.", "Onward, I suppose."],
    },
  },
  "Double MG": {
    name: "Tommy", lines: {
      hit: ["BONK.", "Knock knock!", "{It}'s a condemned building with legs.", "Demolished its {part}. Time and a half."],
      miss: ["Ball's union. It takes breaks.", "Swing and a miss.", "Five minutes to lunch."],
      kill: ["TIMBER!", "{It}'s coming down.", "Job done. Clocking off."],
      hurt: ["That's a workplace injury, that is.", "Oi!", "HOT HOT HOT HOT."],
      critical: ["She's held together with spit, lads.", "One more and I'm walking home."],
      heat: ["Ball's a full ton. Engine's feeling it.", "Needs a tea break."],
      eject: ["Clocking out early!", "I want that in writing!"],
      move: ["Rolling in.", "Wide load coming through."],
    },
  },
  "Rivet Gun": {
    name: "Mags", lines: {
      hit: ["Pinned.", "Now THAT's a proper joint.", "{It}'s {part} was held on with tape. Was.", "Riveted."],
      miss: ["Jammed. Always jams.", "Tolerances. Nobody respects tolerances.", "…grinding again."],
      kill: ["Who welded {it}? A goose?", "Unbolted.", "{It} needed a mechanic. Or a priest."],
      hurt: ["Don't you DARE seize on me.", "That's not in the blueprint!", "I can hear her grinding."],
      critical: ["Every rivet's screaming.", "Frame's buckling. I built her better than this."],
      heat: ["Pressure's at one-forty.", "She's grinding. I can HEAR her grinding."],
      eject: ["I TOLD them about the gasket!", "Out. Someone fix her properly this time."],
      move: ["Easy on the knees, girl.", "Moving."],
    },
  },
  "Mortar": {
    name: "Harrow", lines: {
      hit: ["Splash. On target.", "Tube to crew: shell away. And landed.", "{It}'s {part}. Filing form 27-B.", "Direct hit."],
      miss: ["Splash. Adjust left two.", "Landed in a statistically acceptable area.", "Regulation is wrong."],
      kill: ["{It} neutralised. In triplicate.", "Target destroyed. Paperwork to follow.", "Confirmed."],
      hurt: ["Requesting a formal complaint.", "Most irregular.", "We're hit. Noted."],
      critical: ["Structural integrity: regrettable.", "Please record that I objected."],
      heat: ["Tube's overheating. Per the manual, pray.", "Boiler past regulation."],
      eject: ["Cause of ejection: paperwork.", "Abandoning the gun. Under protest."],
      move: ["Displacing the battery.", "Relocating the tube."],
    },
  },
  "Siege Maul": {
    name: "Ansel", lines: {
      hit: ["Mm.", "{It} kneels.", "Struck."],
      miss: ["…Mm.", "Patience."],
      kill: ["{It} rests.", "Forgiven. And broken.", "Amen."],
      hurt: ["Scratch.", "She holds.", "Mm."],
      critical: ["Plating's gone. Still standing.", "Hm. Close."],
      heat: ["Warm.", "Breathe, girl."],
      eject: ["Tell the shield it did good.", "…"],
      move: ["Onward.", "Slowly."],
    },
  },
  "Sniper Cannon": {
    name: "Vera", lines: {
      hit: ["Billed.", "{It}: itemised.", "{It}'s {part}. Invoiced."],
      miss: ["That one's pro bono.", "Wind.", "Repricing."],
      kill: ["Paid in full.", "{It}: closed account.", "Confirmed."],
      hurt: ["You'll be itemised for that.", "Noted.", "Tch."],
      critical: ["One more and they have me. They won't.", "Frame's gone. Hands aren't."],
      heat: ["Barrel's hot. Rates go up.", "Warm barrel. Clean conscience."],
      eject: ["Unpaid invoice.", "Out. Send the bill."],
      move: ["Relocating.", "New angle."],
    },
  },
  "Crossbow": {
    name: "Dee", lines: {
      hit: ["Darling, you've been PUNCTURED.", "{It} is wearing last season's plating.", "Got its {part}. Tragic."],
      miss: ["It's the lighting.", "Oh, pooh.", "That wasn't my good side."],
      kill: ["{It}'s out of fashion. Permanently.", "Ciao.", "Somebody sweep that up."],
      hurt: ["My finish!", "Oh no. Oh no no no.", "Don't you dare scratch the talon!"],
      critical: ["She's coming apart. Keep hunting.", "Oh no no no no. Stay together."],
      heat: ["I'm glowing, and not the flattering kind.", "Is it hot, or is it me?"],
      eject: ["Don't let them see me like this!", "I'm out. Send a car."],
      move: ["Swooping in.", "Coming through, darlings."],
    },
  },
};

// What a crew calls an enemy machine: by what it carries, or its size.
const SLANG = {
  "Autocannon": "the pom-pom", "Claw": "the grabber",
  "Missile Barrage": "the rocket rack", "Flamethrower": "the torch",
  "Mini Gun": "the chatterbox", "Circular Saw": "the saw-arm",
  "Double MG": "the twin-gun", "Wrecking Ball": "the wrecker",
  "Arc Gun": "the sparker", "Sword": "the swordsman",
  "Harpoon": "the whaler", "Anchor": "the hook",
  "Rivet Gun": "the riveter", "Pressure Claw": "the pincher",
  "Mortar": "the tube", "Lance": "the lancer",
  "Siege Maul": "the hammer", "Bulwark Shield": "the wall",
  "Sniper Cannon": "the long gun", "Chainsaw": "the butcher",
  "Crossbow": "the bolt-thrower", "Talon": "the bird",
};
const PART = { hull: "hull", arms: "arm", legs: "legs", engine: "boiler" };
const GENERIC = { name: "Pilot", lines: { hit: ["Hit."], miss: ["Missed."], kill: ["Got it."], hurt: ["We're hit!"], critical: ["She's coming apart!"], heat: ["Running hot."], eject: ["Ejecting!"], move: ["Moving."] } };

// Chance a bark fires per event: kills and ejections always talk.
const CHANCE = { hit: 0.45, miss: 0.35, kill: 1, hurt: 0.4, critical: 1, heat: 0.8, eject: 1, die: 1, move: 0.08 };

export function pilotOf(mech) { return PILOTS[mech?.longRange] || GENERIC; }

// The crew's name for `mech`, fixed per machine for the battle.
export function slangFor(mech) {
  const opts = [SLANG[mech.longRange], SLANG[mech.melee], mech.weightClass === "medium" ? "the heavy" : "the little one"].filter(Boolean);
  return opts[(mech.id ?? 0) % opts.length];
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// `used` (a Set) keeps a battle from repeating a line. Returns { pilot, line } or null.
export function barkFor(mech, event, { other = null, part = null, used = null } = {}) {
  if (event === "die") event = "eject";
  if (Math.random() > (CHANCE[event] ?? 0.3)) return null;
  const pilot = pilotOf(mech);
  const it = other ? slangFor(other) : null;
  const pool = (pilot.lines[event] || GENERIC.lines[event] || []).filter((l) =>
    (it || !/\{it\}/i.test(l)) && (part || !l.includes("{part}")) && !used?.has(l));
  if (!pool.length) return null;
  const raw = pool[Math.floor(Math.random() * pool.length)];
  used?.add(raw);
  const line = raw.replaceAll("{It}", it ? cap(it) : "").replaceAll("{it}", it || "").replaceAll("{part}", PART[part] || part || "");
  return { pilot: pilot.name, line };
}
