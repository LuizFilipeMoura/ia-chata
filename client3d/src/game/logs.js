// Pilot audio diaries: one reel-tape log per chassis, found in the cockpit.
// Spoken by the rig's pilot voice (barks.js) through the radio chain, shown as
// a typewriter transcript (ui/reel.js). Rigs are named by their paint
// nickname or their weapons, never by an old colour name.
import { CHASSIS } from "../../../shared/game-state.js";
import { pilotOf } from "./barks.js";

export const LOGS = {
  "light-claw-autocannon": {
    reel: "Reel 14", title: "Gold, the can opener",
    text: "Foundry shift ended at six. Mine starts at seven, in a cockpit that smells of cordite and somebody else's sweat. The claw finds the seam and the pom-pom does the rest. Heavier rigs think steel keeps them safe; I'm paid to prove otherwise.",
  },
  "light-missile-flamethrower": {
    reel: "Reel 3", title: "Cobalt, the bonfire",
    text: "They painted her cobalt so nobody would call her a torch. Doesn't matter. Everything she touches ends up the same colour: black, then orange, then gone. I sleep fine. The fuel tanks hum me to sleep.",
  },
  "light-saw-minigun": {
    reel: "Reel 22", title: "Tyrian, the grinder",
    text: "The saw doesn't care who's inside. That's the thing I keep telling myself. The minigun holds them still, the blade takes them apart a plate at a time, and nothing I cut ever welds back right. The union says they'll look into the noise complaints.",
  },
  "light-wreckingball-double": {
    reel: "Reel 9", title: "Rust, the demolition man",
    text: "Ma wanted me in the choir. Instead I swing a two-tonne ball at other people's livelihoods and hose the flank with twin guns. Rust's the right name for her: loud, orange, and she eats everything eventually.",
  },
  "light-sword-arc": {
    reel: "Reel 31", title: "Dazzle, the fencer",
    text: "The coil sings before it bites. I've learned to hear it through the helmet, a thin bright whine, like a kettle in another room. Cook the boiler, jam the servos, then the sword. Father fenced at the academy. He'd hate this.",
  },
  "light-harpoon-anchor": {
    reel: "Reel 5", title: "Turquoise, the tether",
    text: "Once the barb's in, it stays in. I pick one, and I reel, and I chain it to the cobbles while the others do their work. Some nights I dream the line runs the other way. I don't record those.",
  },
  "light-rivet-pressureclaw": {
    reel: "Reel 17", title: "Verdigris, the fitter",
    text: "Twelve years riveting hulls at the yard, and now I rivet the other kind. Same gun, give or take. Pin the plate, crack it with the claw, move to the next. The green is from the rain. Nobody pays to repaint a working rig.",
  },
  "medium-lance-mortar": {
    reel: "Reel 2", title: "Copper, the siege cavalry",
    text: "Lob the shells long, count to four, listen for the bloom. When they come for me, and they always come, I couch the lance like my grandfather did at the charge. He had a horse. I have six tonnes of copper and a bad knee.",
  },
  "medium-shield-siege": {
    reel: "Reel 40", title: "Black, the wall",
    text: "I plant on the beacon and I do not move. Rounds ring the shield like rain on a church roof. Anything that gets close meets the maul. The others call me stubborn. The others are still alive.",
  },
  "medium-sniper-chainsaw": {
    reel: "Reel 12", title: "Red, the patient one",
    text: "First shot's a courtesy: clean, from far away, before they know I'm there. After that it's the chainsaw, and there's nothing courteous about the chainsaw. I keep the scope polished and the teeth sharp. It's all bookkeeping, really.",
  },
  "medium-crossbow-talon": {
    reel: "Reel 27", title: "Silver, the butcher-bird",
    text: "Mark the weak joint with a bolt. Wait for the band. Then drop on it with the talon and open the same wound wider. The shrike does it with thorns. I do it with a winch and a union card.",
  },
  "medium-steam-piston": {
    reel: "Reel 8", title: "Brass, the foreman",
    text: "Stand in front of your own, blow everyone else off their spot. That's the whole job. The steam cannon's just a boiler with an opinion, and the piston settles arguments. Keep the gauges out of the red, girls, and mind the rivets when she vents.",
  },
  "medium-flare-bayonet": {
    reel: "Reel 19", title: "Ivory, the spotter",
    text: "My flares barely scratch the paint. That's fine. Once I light a rig up, it has nowhere to hide, and the rest of the squad does the ugly part. Somebody has to call the shots. Might as well be the one with clean hands.",
  },
  "medium-tesla-shockglove": {
    reel: "Reel 33", title: "Jade, the substation",
    text: "Pack them close and the arc does the arithmetic. Grab one with the glove and pour the heat in until its own boiler finishes the sentence. My hair hasn't lain flat since spring. The doctor says that's the least of it.",
  },
};

// The log for a chassis id, with its pilot's name and voice. null if none.
export function logFor(chassisId) {
  const log = LOGS[chassisId];
  if (!log) return null;
  const ch = CHASSIS.find((c) => c.id === chassisId);
  const pilot = pilotOf({ kind: "rig", longRange: ch?.longRange });
  return { ...log, id: chassisId, pilot: pilot.name, voice: pilot.voice };
}

// Split a log into the sentences the tape plays one after another.
export function sentences(text) {
  return (String(text).match(/[^.!?]+[.!?]+/g) || [String(text)]).map((s) => s.trim()).filter(Boolean);
}
