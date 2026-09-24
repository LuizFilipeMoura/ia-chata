// Pilot barks: each chassis has a voice. Short lines popped in a speech bubble
// over the mech on big moments, a hit, a whiff, a kill, a cook-off, its own
// death. Pure flavour; the rules never read these.
const VOICES = {
  Gold:      { hit: ["Shiny new dent for you!", "Gold standard, baby.", "Grab and grind!"], miss: ["Tarnished it.", "Rust in my sights."], kill: ["Melted down for scrap. Beautiful."], hurt: ["Hey! Mind the plating!"], heat: ["I'm sweating gold here!"], die: ["Worth... every... bolt..."], move: ["Gleaming forward."] },
  Blue:      { hit: ["Fire in the hole, and the hull!", "Toasty!"], miss: ["Wind took 'em. Always the wind."], kill: ["Roasted. Next!"], hurt: ["That's MY job, burning things!"], heat: ["Is it hot or is it me? It's me."], die: ["Blue... screen..."], move: ["Blue skies ahead!"] },
  Purple:    { hit: ["Brrrrrrrrt!", "Slice and dice!"], miss: ["Spray and pray, mostly pray."], kill: ["Sawed clean in half. Magic trick!"], hurt: ["Ow, my regal chassis!"], heat: ["Barrels glowing purple. Wait, that's bad."], die: ["Royalty... never... rusts..."], move: ["Make way for Purple!"] },
  Pumpkin:   { hit: ["BONK!", "Knock knock!"], miss: ["Swing and a miss. Classic Pumpkin."], kill: ["Smashed like October!"], hurt: ["Not the gourd!"], heat: ["Spice level: overheat."], die: ["Pie... tonight..."], move: ["Rolling in!"] },
  Zebra:     { hit: ["Stripes and strikes!", "En garde!"], miss: ["A feint! That was a feint."], kill: ["Black, white, and dead all over."], hurt: ["You scuffed the pattern!"], heat: ["Sparks in my stripes!"], die: ["Fading... to grey..."], move: ["Dazzle them!"] },
  Turquoise: { hit: ["Reel 'em in!", "Hooked!"], miss: ["The one that got away..."], kill: ["Sunk like an anchor."], hurt: ["Taking on water!"], heat: ["Boiler's bubbling!"], die: ["Down... to the deep..."], move: ["Casting off!"] },
  Green:     { hit: ["Riveting!", "Pinned you like a sheet of tin!"], miss: ["Needs another coat of rivets."], kill: ["Welded shut. Permanently."], hurt: ["That's not in the blueprint!"], heat: ["Pressure's in the red!"], die: ["Unbolted..."], move: ["Green light, go!"] },
  Copper:    { hit: ["Shell's away, and landed!", "Lance in, lads!"], miss: ["Recalibrating... blame the wind."], kill: ["Copper-plated victory."], hurt: ["I'm a conductor, not a punching bag!"], heat: ["Copper conducts heat. Too well."], die: ["Oxidising... gracefully..."], move: ["Artillery on the move."] },
  Black:     { hit: ["The wall hits back.", "Crushed."], miss: ["Hm."], kill: ["Nothing gets past Black."], hurt: ["Barely a scratch. Barely."], heat: ["Holding. Holding..."], die: ["The wall... falls..."], move: ["Advancing. Slowly. Inevitably."] },
  Red:       { hit: ["One shot. One scrap pile.", "Headshot."], miss: ["...I'll deny that happened."], kill: ["Confirmed."], hurt: ["You'll regret finding me."], heat: ["Barrel's seeing red."], die: ["Red... ran out..."], move: ["Relocating."] },
  Silver:    { hit: ["Bolt through the joints!", "Silver lining: YOU'RE hit."], miss: ["Bolt went for a walk."], kill: ["Talon'd and done."], hurt: ["Tarnish on my silver!"], heat: ["Running a tad warm, darling."], die: ["Every cloud... has a..."], move: ["Swooping in."] },
};
const GENERIC = { hit: ["Direct hit!"], miss: ["Missed!"], kill: ["Scrap it!"], hurt: ["Hull breach!"], heat: ["Overheating!"], die: ["Going down!"], move: ["Moving!"] };

// Chance a bark fires, per event, kills and deaths always talk.
const CHANCE = { hit: 0.45, miss: 0.35, kill: 1, hurt: 0.4, heat: 0.8, die: 1, move: 0.08 };

export function barkFor(name, event) {
  if (Math.random() > (CHANCE[event] ?? 0.3)) return null;
  const lines = VOICES[name]?.[event] || GENERIC[event];
  return lines?.[Math.floor(Math.random() * lines.length)] ?? null;
}
