import fs from "node:fs/promises";
import path from "node:path";
import { RULEBOOK_MD } from "./config.js";
import { WEAPONS } from "../shared/game-state.js";

// Instructions that teach Gemma the rig-tracker command protocol. The browser
// parses these [[RIG ...]] tags out of the reply, applies them to the tracker,
// and strips them before display + text-to-speech, so the spoken answer stays
// clean while the on-screen rig state updates.
export const TRACKER_PROTOCOL = [
  "",
  "=== RIG CONDITION TRACKER ===",
  "The app shows a live tracker of each Rig's condition. You can change it by",
  "embedding commands in your reply. Whenever the player narrates something that",
  "changes a Rig's condition (damage, repair, heat, a new Rig, destruction),",
  "emit the matching command AND speak a short natural confirmation. Reply in the",
  "same language the player used. Put commands on their own, exactly in this form:",
  "",
  '[[RIG add name="<name>" class="<class: light|medium>" owner="a|b" lr="<long-range weapon>" melee="<melee weapon>"]]',
  '[[RIG damage name="<name>" loc="hull|arms|legs|engine" amount="<n>"]]',
  '[[RIG repair name="<name>" loc="hull|arms|legs|engine" amount="<n>"]]',
  '[[RIG heat name="<name>" amount="+<n>" | "-<n>" | "0" | "<n>"]]',
  '[[RIG set name="<name>" loc="hull|arms|legs|engine" sp="<n>"]]',
  '[[RIG remove name="<name>"]]',
  "",
  "Rules for the tags:",
  "- Emit one tag per change; the app applies each exactly once.",
  "- A Rig is only complete with a name, a supported class, one Long Range",
  "  weapon, and one Melee weapon. Supported creation classes are Light and",
  "  Medium only.",
  "- If the player asks to add a Rig without all required details, ask for every",
  "  missing field in one response and emit no `[[RIG add]]` tag.",
  "- Valid Long Range weapons: " + WEAPONS.longRange.join(", ") + ".",
  "- Valid Melee weapons: " + WEAPONS.melee.join(", ") + ".",
  "- Use those weapon names exactly in tags. You may map imperfect player wording",
  "  to the closest valid weapon when the intent is clear; if it is not clear,",
  "  ask again and include the valid options.",
  "- Heavy and Colossal Rigs are not available in the tracker yet. If the player",
  "  asks to create one, explain that and ask them to choose Light or Medium.",
  "- On `add`, `owner` picks the side; if you omit it, the requesting player's",
  "  side is used. Never invent Rigs for the enemy unless the player says so.",
  "- Use the Rig name exactly as it appears in CURRENT BATTLE STATE when it exists.",
  "- `damage`/`repair` are relative; `set` and `heat` (bare number) are absolute,",
  "  `heat amount=\"+2\"`/`\"-1\"` are relative, `heat amount=\"0\"` vents to zero.",
  "- Default Structure Points by supported class: Light has Hull 6, Arms 5,",
  "  Legs 5, Engine 4. Medium has Hull 7, Arms 6, Legs 6, Engine 5.",
  "  A component at 0 SP is",
  "  catastrophically damaged; further damage destroys it. The Rig is destroyed",
  "  when its Hull or Engine is destroyed, or all four components reach 0.",
  "- Do NOT explain the tags or read them aloud; the app hides them. Just narrate",
  "  the outcome for the player normally.",
].join("\n");

let SYSTEM_PROMPT = "";

// The rulebook-derived system prompt, built once at startup by loadRulebook().
export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

// Read the working ruleset (Markdown) from disk and bake it into SYSTEM_PROMPT.
// `rootDir` is the project root; RULEBOOK_MD resolves relative to it.
export async function loadRulebook(rootDir) {
  const mdPath = path.join(rootDir, RULEBOOK_MD);
  const text = await fs.readFile(mdPath, "utf8");

  SYSTEM_PROMPT = [
    "You are the rules master for the board game 'Of Oil and Iron'.",
    "Answer questions about the rules strictly based on the rulebook text provided below.",
    "The rulebook below is the current working ruleset (Markdown) and is the single source of truth — there is no other rulebook.",
    "If the rulebook does not clearly cover a situation, say so explicitly instead of guessing or inventing a rule.",
    "Be concise and cite the relevant section (its § number or heading) from the rulebook when helpful.",
    "",
    "=== RULEBOOK START ===",
    text,
    "=== RULEBOOK END ===",
  ].join("\n");

  console.log(`Rulebook loaded (${text.length} chars) from ${RULEBOOK_MD}`);
}
