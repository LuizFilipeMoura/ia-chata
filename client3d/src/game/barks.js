// Pilot barks. The rigs are machines; the people talking are the pilots sealed
// inside them, on the radio. A pilot never says a callsign: their own machine is
// "she", "the old girl", "this crate"; an enemy is whatever the crew can see of
// it ("the torch", "the long gun", "the heavy"), like a tank crew in a war.
// Pure flavour; the rules never read these.
//
// Class temperament: lights are scouts, fast, first in and calling contacts;
// mediums are protective and bossy, giving orders and covering a light in trouble.
//
// Replies: after a pilot talks, a squadmate may answer (re_kill / re_hurt /
// re_eject / re_miss, else re). Silence ("…") is a line too.
//
// Tokens: {it} / {It} = crew slang for the other machine (sentence-case with
// {It}); {part} = the part that got hit. A line with a token is only used when
// the moment has one.

// Every weapon belongs to exactly one chassis, so a pilot rides with the gun,
// even in a renamed rig.
const PILOTS = {
  "Missile Barrage": {
    name: "Ottilie", lines: {
      hit: ["Burn, baby.", "{It}'s smoking. Good.", "Got its {part}! Is that covered?", "Toasty.", "Warm enough for you?", "Whoosh. Boom. Lovely.", "Rack's singing!", "{It}'s wearing my rockets.", "There goes its {part}. Bye!", "Smell that? That's progress.", "Oh, it CAUGHT."],
      miss: ["Rockets went sightseeing.", "Wind. Always the wind.", "…that one's on the insurance.", "Missed. Pretend you didn't see.", "Where'd they go?", "Rockets have opinions.", "Hm. Unscheduled fireworks.", "I'll say I was aiming at the crate."],
      kill: ["{It}'s a bonfire now.", "Roasted.", "Put it down as 'accidental'.", "Crispy.", "{It}'s kindling.", "I'd call that a controlled burn.", "Ohhh, that's a big one."],
      hurt: ["Hey! That's my job!", "Is that MY oil?", "She's on fire. Well, more than usual.", "Rude!", "Did {it} just singe me?", "That's the good fuel tank, you animal!"],
      critical: ["Everything's on fire and for once it isn't me!", "Fuel line's gone. Might be my last barbecue."],
      heat: ["Is it supposed to smell like that?", "Pilot light's on. It's always on.", "Hot. Hot. Hot.", "Toasty in here. Toastier.", "Old girl's sweating kerosene.", "I've got hair left, right?"],
      eject: ["Ejecting! Somebody call the adjuster!", "I'm out. Tell them it was the wiring."],
      move: ["Burn for mama.", "Moving. Mind the fuel line.", "Keep the rack pointed away from me, darling.", "Off we pop.", "Eyes on {it}. It's ugly.", "Going wide! Try to keep up!", "Scouting ahead. Bringing matches."],
      re: ["Can we keep it down? Some of us are on fire.", "Mm-hm.", "*static*", "Yes, yes, I'm going.", "Can't catch me, can't boss me."],
      re_kill: ["Show-off.", "Ooh, can I set it on fire anyway?", "Nice! Is that covered by anyone?"],
      re_hurt: ["That's going to leave a mark.", "You all right in there?", "Want me to burn whoever did that?"],
      re_eject: ["Grab their insurance papers!", "Somebody tell me that's covered!"],
      re_miss: ["Wind, right? It's always the wind.", "I'd have set it on fire."],
    },
  },
  "Harpoon": {
    name: "Jonah", lines: {
      hit: ["Aye.", "Hooked.", "Got its {part}.", "{It} hauls like a drowned cow.", "Line's taut.", "Hook's set.", "Reel it.", "{It} felt that one.", "Harpoon's home."],
      miss: ["Sea's in a mood.", "Slipped the line.", "Seen worse.", "Hm.", "Line's slack.", "Current took it.", "Patience. Fish don't hurry.", "…"],
      kill: ["Another fish.", "{It}'s done swimming.", "Aye. That'll do.", "Landed.", "{It} won't float.", "Bring the gaff.", "Quiet now."],
      hurt: ["She's leaking. Like my old ship.", "Taking water.", "Easy, girl…", "Hull's weeping.", "{It} bites.", "Hold together, girl."],
      critical: ["She's going under. Not yet, girl.", "Water to the gunwales. Hold."],
      heat: ["Boiler's bubbling.", "Warm below decks.", "Boiler's singing sea shanties.", "Needs a cold wave over the bow."],
      eject: ["Abandoning ship. Again.", "Just drop me in the harbour.", "Swim for it, Jonah."],
      move: ["Easy, girl.", "Casting off.", "Steady as she goes.", "Heading in.", "Mind the anchor chain.", "{It}'s off the port side.", "Scouting the shallows.", "I'll run ahead. Old legs still work."],
      re: ["Aye.", "…", "Mm. Seen it before.", "Aye, aye.", "Heard you the first time."],
      re_kill: ["Good catch.", "Aye. Nice work.", "That'll feed the village."],
      re_hurt: ["Bail, lad. Keep bailing.", "Hold together.", "She'll float. Probably."],
      re_eject: ["Man overboard.", "…Rest easy."],
      re_miss: ["Sea's in a mood today.", "Next cast."],
    },
  },
  "Arc Gun": {
    name: "Nell", lines: {
      hit: ["Live wire!", "Grounded it.", "{It}'s {part} is shorting. You're welcome.", "Twenty thousand volts.", "Zap.", "Crackle.", "Ha! Lit it up.", "{It}'s {part} is humming now.", "Current's flowing. Just not to me."],
      miss: ["Arc jumped. Arcs do that.", "Come on, come on…", "Nobody insulated this thing.", "Fuse blew.", "Of course it arced into the dirt.", "Who wired this, a committee?", "Zzt. Nothing."],
      kill: ["{It}'s off the grid.", "Lights out.", "Company never did pay overtime.", "Short-circuited.", "{It}'s dead wire.", "Pull the breaker on that one.", "Power's out on the whole street."],
      hurt: ["That's gonna need an electrician.", "Ow. Sparks.", "Who's paying for that?", "Hey! Live equipment!", "I felt that in my fillings.", "{It} knows where to hit. Figures."],
      critical: ["Every light on the board is red.", "I can smell the wiring. Bad sign."],
      heat: ["Coils are glowing. That's new.", "She's humming. Not the good hum.", "Smell that? Ozone.", "Insulation's melting. Again.", "Twenty years on the lines and never this hot."],
      eject: ["Grounding myself. Permanently.", "I'm out. Unplug her."],
      move: ["Come on, girl.", "Mind the cable.", "Keep the grip dry, keep the grip dry…", "Moving. Don't touch anything metal.", "Spotted {it}. Marking it.", "Running the line ahead.", "Fast and quiet. Mostly quiet."],
      re: ["Copy.", "Channel's noisy. Somebody's shorting.", "*click*", "On it.", "Going. Don't wait up."],
      re_kill: ["Lights out. Nice.", "Pulled its plug for it. Good."],
      re_hurt: ["You're sparking. Want me to look at that? No? Fine.", "Keep your hands off the metal."],
      re_eject: ["Another one off the grid.", "Grounded. Poor sod."],
      re_miss: ["Recalibrate. Or pray.", "Arc would've found it."],
    },
  },
  "Autocannon": {
    name: "Ferdinand", lines: {
      hit: ["Hit! I'll put it in the report.", "Got its {part}!", "Effective. Very effective.", "{It} isn't even branded.", "Yes!", "Target… reduced!", "Noting that for the review.", "{It}'s {part}! That's billable, right?"],
      miss: ["Missed. That's going on my record.", "Mother of—!", "Recalibrating. Please hold.", "Was that… close?", "The sights are off. Not my fault. Write that down.", "Oh dear."],
      kill: ["Competitor eliminated.", "{It} is… discontinued.", "Quarterly target met!", "Is that a promotion? That feels like a promotion.", "{It}, terminated. With cause.", "I'll need a witness for that one!"],
      hurt: ["Please don't dent the company asset.", "Who signs off on this damage?", "Is this covered? Tell me this is covered.", "That's coming out of my pay, isn't it.", "Ow! Ow. Sorry. Ow."],
      critical: ["She's a write-off. Tell accounts I tried.", "Frame's cracked. That's the whole policy gone."],
      heat: ["The manual says red is 'aspirational'.", "Requesting permission to panic.", "Is the temperature gauge supposed to spin?", "I don't remember this in training."],
      eject: ["Filing an incident report from the ditch!", "Ejecting. Per procedure. I think."],
      move: ["Advancing, per protocol.", "Moving up.", "Proceeding. Cautiously.", "Advancing on schedule. Roughly.", "Reconnaissance! That's me! {It} spotted!", "Scouting as instructed!", "I'll report back. With a report."],
      re: ["Noted!", "Should I be writing this down?", "Copy. I think.", "Yes sir! Right away sir!", "Understood! Mostly!"],
      re_kill: ["Excellent work! Very… lethal!", "I'll mention you in my report!"],
      re_hurt: ["Is that covered?", "Oh dear. Oh dear oh dear."],
      re_eject: ["We've lost an asset! Who fills in the form?", "Oh no. Paperwork."],
      re_miss: ["That's… fine. Totally fine.", "I didn't see that. Officially."],
    },
  },
  "Mini Gun": {
    name: "Marguerite", lines: {
      hit: ["Brrrt.", "How frightfully common, bleeding oil.", "{It}'s {part}. Ghastly.", "Do keep up.", "Rat-a-tat, darling.", "Perforated.", "{It} looks like lace now.", "How vulgar of it to stand there."],
      miss: ["I'll have that sent back.", "The barrels are family silver. Melted down.", "Tedious.", "The barrels disagree with me.", "Hm.", "One doesn't aim. One sprays.", "*sigh*"],
      kill: ["{It} is bolted together with nails. Was.", "Scrap. Send the bill to its mother.", "Dismissed.", "Tidied.", "{It} has been excused from the evening.", "Pity."],
      hurt: ["Do you know who my grandfather was?!", "My paintwork!", "Unforgivable.", "How dare you.", "This chassis is older than your company!"],
      critical: ["Grandfather would weep.", "I refuse to die in this paint."],
      heat: ["It's positively tropical in here.", "Someone open a window.", "Barrels are glowing. How gauche.", "Fetch me ice. And gin."],
      eject: ["The family will sell the name.", "I'm leaving. This is beneath me."],
      move: ["Make way.", "Onward, I suppose.", "Don't dawdle.", "Let's not linger.", "I'll go first. Someone must.", "There's {it}. Hideous.", "Do try to keep pace."],
      re: ["Must you?", "Fascinating. Truly.", "…", "I'm not taking orders from a tractor.", "Fine. FINE."],
      re_kill: ["Adequate.", "Well. Someone's trying."],
      re_hurt: ["Do try not to bleed on the gravel.", "Dreadful. Carry on."],
      re_eject: ["How undignified.", "One fewer at dinner."],
      re_miss: ["Oh, bravo.", "Charming aim."],
    },
  },
  "Double MG": {
    name: "Tommy", lines: {
      hit: ["BONK.", "Knock knock!", "{It}'s a condemned building with legs.", "Demolished its {part}. Time and a half.", "WHAM.", "Rattle rattle!", "Wall's down! Wait, that was {it}.", "Right in the {part}, lads!", "Another one for the skip."],
      miss: ["Ball's union. It takes breaks.", "Swing and a miss.", "Five minutes to lunch.", "Bloody ball.", "Missed the building, hit the dirt.", "Guns jammed. Tea's cold. Great day.", "Oops."],
      kill: ["TIMBER!", "{It}'s coming down.", "Job done. Clocking off.", "Knocked flat.", "Clear the site!", "{It}'s rubble. Next job."],
      hurt: ["That's a workplace injury, that is.", "Oi!", "HOT HOT HOT HOT.", "Hard hats on!", "That's a fine, that is.", "{It}'s got a swing on it."],
      critical: ["She's held together with spit, lads.", "One more and I'm walking home."],
      heat: ["Ball's a full ton. Engine's feeling it.", "Needs a tea break.", "Engine's steaming like my kettle.", "Somebody check the pressure. Not me."],
      eject: ["Clocking out early!", "I want that in writing!", "I'm off! Somebody finish the job!"],
      move: ["Rolling in.", "Wide load coming through.", "Mind your backs!", "Heavy load, clear the lane!", "Heads up, {it}'s on the far side!", "Running ahead, save me a sandwich.", "Scouting the site!"],
      re: ["Oi, tea break soon?", "Righto.", "Heard.", "Yes, boss.", "Righto, guv."],
      re_kill: ["Nice one, that's a bonus!", "Down it goes! Lovely!"],
      re_hurt: ["Walk it off!", "Put it on the injury board!"],
      re_eject: ["Somebody clock them out!", "Man down! Finish the job!"],
      re_miss: ["Swing and a miss!", "Ball would've got it."],
    },
  },
  "Rivet Gun": {
    name: "Mags", lines: {
      hit: ["Pinned.", "Now THAT's a proper joint.", "{It}'s {part} was held on with tape. Was.", "Riveted.", "Click-bang.", "Fastened.", "Nailed its {part} shut.", "See? Precision.", "{It}'s tolerances are awful. Were."],
      miss: ["Jammed. Always jams.", "Tolerances. Nobody respects tolerances.", "…grinding again.", "Misfeed.", "Why do I bother?", "Rivet in the dirt. Waste.", "Hopper's sticking. Knew it would."],
      kill: ["Who welded {it}? A goose?", "Unbolted.", "{It} needed a mechanic. Or a priest.", "Scrapped.", "{It}'s parts now. Decent parts, some of them.", "Should've maintained it."],
      hurt: ["Don't you DARE seize on me.", "That's not in the blueprint!", "I can hear her grinding.", "Mind the pistons!", "That's a whole weekend of repairs.", "Ow. Also, rude.", "*grinding noise*"],
      critical: ["Every rivet's screaming.", "Frame's buckling. I built her better than this."],
      heat: ["Pressure's at one-forty.", "She's grinding. I can HEAR her grinding.", "Gauges are lying. They're always lying.", "Seals won't take much more."],
      eject: ["I TOLD them about the gasket!", "Out. Someone fix her properly this time."],
      move: ["Easy on the knees, girl.", "Moving.", "Knees are clicking again.", "Gently, gently.", "{It} spotted. Its knees are shot, look at it.", "Out front. Again.", "Fast is easy. Fast AND intact is hard."],
      re: ["Sure.", "…", "Wonderful. More noise.", "Yeah, yeah.", "Going. Don't touch anything."],
      re_kill: ["Clean work. For once.", "At least somebody's precise."],
      re_hurt: ["I'm not fixing that for free.", "What did you DO?"],
      re_eject: ["That rig was fine last week. FINE.", "Salvage it. Please."],
      re_miss: ["Calibrate your sights. I told you.", "Tolerances!"],
    },
  },
  "Mortar": {
    name: "Harrow", lines: {
      hit: ["Splash. On target.", "Tube to crew: shell away. And landed.", "{It}'s {part}. Filing form 27-B.", "Direct hit.", "Good splash.", "On the mark.", "Shell impacted. Acceptable.", "{It}'s {part}. As plotted."],
      miss: ["Splash. Adjust left two.", "Landed in a statistically acceptable area.", "Regulation is wrong.", "Long. Drop fifty.", "Short. Add fifty.", "Somebody moved the map."],
      kill: ["{It} neutralised. In triplicate.", "Target destroyed. Paperwork to follow.", "Confirmed.", "Target destroyed. Log it.", "{It} is no longer a factor."],
      hurt: ["Requesting a formal complaint.", "Most irregular.", "We're hit. Noted.", "Counter-battery fire. Tedious.", "Damage report to follow."],
      critical: ["Structural integrity: regrettable.", "Please record that I objected."],
      heat: ["Tube's overheating. Per the manual, pray.", "Boiler past regulation.", "Barrel's glowing. Most unregulated."],
      eject: ["Cause of ejection: paperwork.", "Abandoning the gun. Under protest."],
      move: ["Displacing the battery.", "Relocating the tube.", "Battery displacing. Stay in formation.", "Lights, screen the flank. Move.", "Form on me.", "Scouts forward, report contact."],
      re: ["Acknowledged.", "Copy, over.", "Maintain radio discipline.", "Stay in formation.", "That's an order."],
      re_kill: ["Confirmed. Well done.", "Logged."],
      re_hurt: ["Report your status.", "Hold the line.", "Fall back behind me. Now.", "I've got you covered. Withdraw."],
      re_eject: ["Casualty noted.", "Crew out. Mark the position."],
      re_miss: ["Adjust and refire.", "Correction required.", "Again. Properly this time."],
    },
  },
  "Siege Maul": {
    name: "Ansel", lines: {
      hit: ["Mm.", "{It} kneels.", "Struck.", "Down.", "Hm."],
      miss: ["…Mm.", "Patience."],
      kill: ["{It} rests.", "Forgiven. And broken.", "Amen.", "Peace.", "Sleep."],
      hurt: ["Scratch.", "She holds.", "Mm.", "Still here.", "…"],
      critical: ["Plating's gone. Still standing.", "Hm. Close."],
      heat: ["Warm.", "Breathe, girl.", "…"],
      eject: ["Tell the shield it did good.", "…"],
      move: ["Onward.", "Slowly.", "Step.", "Behind me.", "Stay close."],
      re: ["…", "Mm.", "*mic click*", "Behind me."],
      re_kill: ["Mm.", "Good."],
      re_hurt: ["Hold.", "…", "Behind me. Now.", "I've got you."],
      re_eject: ["…", "Go with grace.", "Not on my watch. Again."],
      re_miss: ["…"],
    },
  },
  "Sniper Cannon": {
    name: "Vera", lines: {
      hit: ["Billed.", "{It}: itemised.", "{It}'s {part}. Invoiced.", "Clean.", "{It}: charged."],
      miss: ["That one's pro bono.", "Wind.", "Repricing.", "Irrelevant."],
      kill: ["Paid in full.", "{It}: closed account.", "Confirmed.", "Settled."],
      hurt: ["You'll be itemised for that.", "Noted.", "Tch.", "…"],
      critical: ["One more and they have me. They won't.", "Frame's gone. Hands aren't."],
      heat: ["Barrel's hot. Rates go up.", "Warm barrel. Clean conscience.", "Tolerable."],
      eject: ["Unpaid invoice.", "Out. Send the bill."],
      move: ["Relocating.", "New angle.", "…", "Stay off my line.", "Lights, flush it out. I'll do the rest."],
      re: ["…", "Irrelevant.", "Stop talking. Start moving."],
      re_kill: ["Sloppy. But paid.", "Fine."],
      re_hurt: ["Get to cover.", "Pull back. I've got it covered.", "Get out of there. I'll handle it."],
      re_eject: ["One less split."],
      re_miss: ["Amateur.", "…", "Get closer. Then miss less."],
    },
  },
  "Crossbow": {
    name: "Dee", lines: {
      hit: ["Darling, you've been PUNCTURED.", "{It} is wearing last season's plating.", "Got its {part}. Tragic.", "Thwip! Adorable.", "Pinned like a butterfly.", "{It}'s {part}, darling. Ruined."],
      miss: ["It's the lighting.", "Oh, pooh.", "That wasn't my good side.", "Oh, bother.", "My bolt went to powder its nose."],
      kill: ["{It}'s out of fashion. Permanently.", "Ciao.", "Somebody sweep that up.", "{It}'s simply finished.", "Kisses!"],
      hurt: ["My finish!", "Oh no. Oh no no no.", "Don't you dare scratch the talon!", "I JUST had her polished!", "Rude, rude, RUDE."],
      critical: ["She's coming apart. Keep hunting.", "Oh no no no no. Stay together."],
      heat: ["I'm glowing, and not the flattering kind.", "Is it hot, or is it me?", "I'm melting, darlings."],
      eject: ["Don't let them see me like this!", "I'm out. Send a car."],
      move: ["Swooping in.", "Coming through, darlings.", "Fashionably late, as always.", "Darlings, formation, please.", "Lights in front, I'm not scuffing my finish.", "Go on, sweeties. Find me something to shoot."],
      re: ["Oh, darling.", "Gossip later?", "Mm, tell me more.", "Chop chop, darlings.", "Less chatter, more scouting."],
      re_kill: ["Divine!", "Oh, bravo, darling!"],
      re_hurt: ["Oh no, your FINISH.", "Poor thing!", "Get behind me, sweetie. I've got you.", "Who did that? I'll take care of it."],
      re_eject: ["Somebody send them flowers.", "Oh, how dreadful. Anyway."],
      re_miss: ["It's the lighting, darling.", "Happens to the best of us. Not me, but."],
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

// Campaign enemies. Faction operators are extras: a few dry company lines,
// and they talk less than your pilots. The Warlord is the one enemy star.
const OPERATORS = {
  krim: { name: "Krim Operator", lines: {
    hit: ["Asset depreciated.", "Hit. Logged."], miss: ["Variance noted."], kill: ["Hostile {it} written off."],
    hurt: ["Damage within budget.", "Filing a claim."], eject: ["Operator exiting. Unit is a write-off."], heat: ["Thermal overrun."], move: ["Repositioning asset."] } },
  nox: { name: "Nox Operator", lines: {
    hit: ["Output: adequate.", "Hit."], miss: ["Quota missed."], kill: ["{It} removed. Quota met."],
    hurt: ["Hull breach. Continuing shift."], eject: ["Shift over."], heat: ["Furnace hot."], move: ["Advancing."] } },
  arcus: { name: "Arcus Pilot", lines: {
    hit: ["Beta test: successful.", "Nice."], miss: ["Known issue."], kill: ["{It} deprecated.", "Please rate your defeat."],
    hurt: ["That's… not in the roadmap."], eject: ["Rolling back!"], heat: ["Thermals trending up."], move: ["Iterating."] } },
  triton: { name: "Triton Crewman", lines: {
    hit: ["Hull integrity is a privilege.", "Struck."], miss: ["Heavy seas."], kill: ["{It} scuttled."],
    hurt: ["Resistance voids your warranty!"], eject: ["Man overboard!"], heat: ["Coolant low."], move: ["Making way."] } },
  freegear: { name: "Freegear Cutter", lines: {
    hit: ["Solidarity!", "Got a piece!"], miss: ["Scrap sights. Figures."], kill: ["{It}'s salvage now, comrade."],
    hurt: ["Ow! Union rules!"], eject: ["I'm out! Somebody grab my spanner!"], heat: ["She's cooking."], move: ["Onward, comrades."] } },
};
const WARLORDS = { krim: "Chairman Voss", nox: "Foreman-General Brandt", arcus: "Visionary Kess", triton: "Admiral Oyel", freegear: "Boss Mo Cutter" };
const WARLORD_LINES = {
  hit: ["Kneel.", "{It}'s {part}. A souvenir for my trophy wall.", "Is this the best your paymasters could afford?"],
  miss: ["I MEANT that.", "Guards, adjust my aim.", "Beneath me."],
  kill: ["{It} is scrap. As are you all.", "Next.", "Mount its {part} on my wall."],
  hurt: ["You dare scratch MY paint?", "Insolence!", "You'll pay for that. Literally.", "Guards! Hold my coat."],
  heat: ["My engine runs hot with RAGE.", "Vent the boiler. And the help."],
  eject: ["This isn't over! It's merely… postponed!", "Retreat is a strategy! A very expensive one!"],
  move: ["Make way for your better.", "I am coming for you."],
};

// Chance a bark fires per event: kills and ejections always talk.
const CHANCE = { hit: 0.45, miss: 0.35, kill: 1, hurt: 0.4, critical: 1, heat: 0.8, eject: 1, die: 1, move: 0.08 };

export function pilotOf(mech) { return PILOTS[mech?.longRange] || GENERIC; }

// Who's in this seat. `campaign` = the room's campaign block (null outside one):
// its enemy side is faction operators, and a boss contract's commander is the Warlord.
export function voiceOf(mech, campaign) {
  if (!campaign || mech.owner !== "b") return { ...pilotOf(mech), chance: 1 };
  const fac = campaign.faction;
  if (campaign.type === "boss" && mech.id === campaign.commanderId) return { name: WARLORDS[fac] || "The Warlord", lines: WARLORD_LINES, chance: 1.6, warlord: true };
  return { ...(OPERATORS[fac] || { name: "Enemy pilot", lines: GENERIC.lines }), chance: 0.45 };
}

// The crew's name for `mech`, fixed per machine for the battle.
export function slangFor(mech) {
  const opts = [SLANG[mech.longRange], SLANG[mech.melee], mech.weightClass === "medium" ? "the heavy" : "the little one"].filter(Boolean);
  return opts[(mech.id ?? 0) % opts.length];
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// `used` (a Set) keeps a battle from repeating a line. Returns { pilot, line } or null.
export function barkFor(mech, event, { other = null, part = null, used = null, campaign = null } = {}) {
  if (event === "die") event = "eject";
  const pilot = voiceOf(mech, campaign);
  if (!event.startsWith("re") && Math.random() > (CHANCE[event] ?? 0.3) * pilot.chance) return null;
  const it = other ? slangFor(other) : null;
  const reply = event.startsWith("re");
  const pool = (pilot.lines[event] || (reply ? pilot.lines.re : null) || (reply ? [] : GENERIC.lines[event]) || []).filter((l) =>
    (it || !/\{it\}/i.test(l)) && (part || !l.includes("{part}")) && (!used?.has(l) || l.length <= 4 || l.startsWith("*")));
  if (!pool.length) return null;
  const raw = pool[Math.floor(Math.random() * pool.length)];
  used?.add(raw);
  const line = raw.replaceAll("{It}", it ? cap(it) : "").replaceAll("{it}", it || "").replaceAll("{part}", PART[part] || part || "");
  return { pilot: pilot.name, line, warlord: !!pilot.warlord };
}
