// Stat icons: small engraved-brass drawings so a stat reads at a glance, not
// only as a word. stroke = currentColor, so each takes its context's colour.
import { el } from "./dom.js";

const P = {
  // A bolt punching through an armour plate.
  pen: `<rect x="30" y="8" width="8" height="48" rx="2"/><path d="M4 32 H44"/><path d="M44 32 L36 26 M44 32 L36 38"/><path d="M40 32 L56 32" stroke-dasharray="3 3"/><path d="M46 26 L52 22 M46 38 L52 42" opacity=".7"/>`,
  // A cracked burst.
  dmg: `<path d="M32 6 L37 22 L54 16 L43 30 L58 38 L40 40 L44 58 L32 45 L20 58 L24 40 L6 38 L21 30 L10 16 L27 22 Z"/><path d="M32 26 L29 34 L35 38" />`,
  // Riveted armour plate.
  tough: `<path d="M32 6 L54 14 V30 C54 44 44 54 32 58 C20 54 10 44 10 30 V14 Z"/><circle cx="20" cy="20" r="2" fill="currentColor"/><circle cx="44" cy="20" r="2" fill="currentColor"/><circle cx="32" cy="46" r="2" fill="currentColor"/><path d="M18 30 H46" opacity=".6"/>`,
  // A row of shells.
  shots: `<path d="M10 50 V26 C10 18 18 14 18 14 C18 14 26 18 26 26 V50 Z"/><path d="M38 50 V26 C38 18 46 14 46 14 C46 14 54 18 54 26 V50 Z"/><path d="M10 42 H26 M38 42 H54" opacity=".6"/>`,
  aim: `<circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="4" fill="currentColor"/><path d="M32 4 V16 M32 48 V60 M4 32 H16 M48 32 H60"/>`,
  heat: `<path d="M32 58 C18 58 12 48 14 38 C16 28 26 24 26 12 C34 18 36 24 34 30 C40 26 42 20 42 16 C50 24 52 34 50 42 C48 52 42 58 32 58 Z"/><path d="M32 52 C26 52 24 46 26 42 C28 38 32 36 32 32 C38 38 40 46 32 52 Z" opacity=".7"/>`,
  sp: `<circle cx="32" cy="32" r="10"/><path d="M32 6 V14 M32 50 V58 M6 32 H14 M50 32 H58 M13 13 L19 19 M45 45 L51 51 M51 13 L45 19 M19 45 L13 51"/>`,
  range: `<path d="M6 40 H58 V50 H6 Z"/><path d="M14 40 V45 M22 40 V47 M30 40 V45 M38 40 V47 M46 40 V45 M54 40 V47"/><path d="M10 26 H54 M10 26 L16 21 M10 26 L16 31 M54 26 L48 21 M54 26 L48 31"/>`,
  // Rig parts.
  hull: `<path d="M16 14 H48 L54 26 V46 L46 56 H18 L10 46 V26 Z"/><path d="M22 26 H42 M22 36 H42" opacity=".6"/><circle cx="16" cy="20" r="1.5" fill="currentColor"/><circle cx="48" cy="20" r="1.5" fill="currentColor"/>`,
  arms: `<path d="M12 12 L26 26 L30 44"/><circle cx="26" cy="26" r="4"/><path d="M30 44 L22 56 M30 44 L40 54 M30 44 L42 42"/><path d="M40 10 L54 24" opacity=".6"/>`,
  legs: `<path d="M22 8 V28 L16 44 L20 58 M42 8 V28 L48 44 L44 58"/><circle cx="22" cy="28" r="3.5"/><circle cx="42" cy="28" r="3.5"/><path d="M12 58 H26 M38 58 H52"/>`,
  engine: `<rect x="14" y="20" width="36" height="34" rx="6"/><path d="M24 20 V10 H40 V20"/><path d="M20 32 H44 M20 42 H44" opacity=".6"/><path d="M50 30 H58 M50 44 H58" /><circle cx="32" cy="10" r="2" fill="currentColor"/>`,
  // Actions.
  move: `<path d="M20 52 C20 40 26 34 34 30 L44 26"/><path d="M38 20 L46 26 L38 32"/><circle cx="16" cy="54" r="4"/><path d="M28 54 H36 M42 54 H50" stroke-dasharray="3 4" opacity=".6"/>`,
  sprint: `<path d="M22 50 C24 38 32 30 46 26"/><path d="M40 18 L50 26 L40 34"/><path d="M6 30 H18 M4 40 H16 M8 20 H20" opacity=".7"/>`,
  fire: `<path d="M8 38 H34 V28 H8 Z"/><path d="M34 33 H40"/><path d="M44 33 H60" stroke-dasharray="4 3"/><path d="M50 22 L58 16 M50 44 L58 50" opacity=".7"/><path d="M14 38 V50 H22 V38"/>`,
  aimed: `<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="12" stroke-dasharray="4 3"/><circle cx="32" cy="32" r="3" fill="currentColor"/><path d="M32 4 V14 M32 50 V60 M4 32 H14 M50 32 H60"/>`,
  prepare: `<path d="M32 6 L54 14 V30 C54 44 44 54 32 58 C20 54 10 44 10 30 V14 Z"/><path d="M26 30 L32 36 L42 24"/>`,
  repair: `<path d="M40 8 A12 12 0 0 0 30 24 L8 46 L18 56 L40 34 A12 12 0 0 0 56 24 L48 28 L40 20 L44 12 Z"/>`,
  shutdown: `<path d="M22 14 A22 22 0 1 0 42 14"/><path d="M32 6 V30"/>`,
  disengage: `<path d="M44 16 A18 18 0 1 0 50 40"/><path d="M50 28 L50 42 L36 42"/><path d="M8 32 H18" opacity=".6"/>`,
  douse: `<path d="M24 20 H40 V56 H24 Z"/><path d="M28 20 V12 H44 L50 18"/><path d="M52 22 C54 28 56 30 56 34 M58 18 C60 24 62 26 62 30" opacity=".7"/>`,
  reload: `<path d="M48 22 A18 18 0 1 0 50 40"/><path d="M50 12 V24 H38"/><path d="M26 30 V40 H34 V30 C34 26 30 24 30 24 C30 24 26 26 26 30 Z"/>`,
  lock: `<path d="M12 44 A28 28 0 0 1 52 44"/><path d="M20 44 A16 16 0 0 1 44 44"/><circle cx="32" cy="44" r="4" fill="currentColor"/><path d="M32 40 L46 14"/>`,
  anchor: `<circle cx="32" cy="12" r="5"/><path d="M32 17 V56 M20 26 H44"/><path d="M10 40 C12 52 22 56 32 56 C42 56 52 52 54 40"/><path d="M10 40 L6 46 M54 40 L58 46"/>`,
  barrage: `<circle cx="20" cy="42" r="8"/><circle cx="44" cy="36" r="10"/><path d="M20 26 L24 10 M44 18 L40 6 M32 22 L32 8" opacity=".7"/><path d="M4 56 H60"/>`,
  harden: `<path d="M8 20 H56 V50 H8 Z"/><path d="M8 35 H56 M24 20 V35 M40 35 V50 M16 35 V50 M48 20 V35"/>`,
  purge: `<path d="M20 54 C14 44 26 38 20 26 C16 18 22 10 22 10"/><path d="M34 54 C28 44 40 38 34 26 C30 18 36 10 36 10"/><path d="M48 54 C42 44 54 38 48 26 C44 18 50 10 50 10"/>`,
  jumpjets: `<path d="M32 6 L42 20 V38 H22 V20 Z"/><path d="M22 38 L16 46 M42 38 L48 46"/><path d="M26 44 L24 58 M32 44 V60 M38 44 L40 58" opacity=".7"/>`,
  overclock: `<path d="M36 4 L14 36 H30 L26 60 L50 26 H34 Z"/>`,
  patch: `<rect x="10" y="22" width="44" height="20" rx="10" transform="rotate(-35 32 32)"/><path d="M28 28 L36 36 M36 28 L28 36"/>`,
  smoke: `<circle cx="22" cy="36" r="12"/><circle cx="40" cy="30" r="14"/><circle cx="34" cy="46" r="10"/>`,
  cryo: `<path d="M32 6 V58 M9 19 L55 45 M9 45 L55 19"/><path d="M26 10 L32 16 L38 10 M26 54 L32 48 L38 54" opacity=".7"/>`,
  // Nanite Swarm: a honeycomb of hex cells with a repair cross.
  nanite: `<path d="M22 10 L32 16 V28 L22 34 L12 28 V16 Z"/><path d="M42 10 L52 16 V28 L42 34 L32 28 V16 Z" opacity=".7"/><path d="M32 30 L42 36 V48 L32 54 L22 48 V36 Z"/><path d="M32 38 V46 M28 42 H36"/>`,
  // Meltdown: a core with radiating heat wedges.
  meltdown: `<circle cx="32" cy="32" r="8"/><path d="M32 22 L24 8 H40 Z M40.7 37 L56.5 42 L48.5 55.8 Z M23.3 37 L15.5 55.8 L7.5 42 Z"/><circle cx="32" cy="32" r="26" stroke-dasharray="4 5" opacity=".6"/>`,
  // Grapnel: a three-prong hook on a cable.
  grapnel: `<path d="M32 6 V40"/><path d="M32 40 C32 52 20 54 16 44 M32 40 C32 52 44 54 48 44 M32 40 V56"/><path d="M16 44 L12 40 M48 44 L52 40"/><circle cx="32" cy="8" r="3"/>`,
  // Grapnel yank: hook lifting the rig clear.
  yank: `<path d="M32 30 V58"/><path d="M32 30 C32 20 22 18 20 26 M32 30 C32 20 42 18 44 26"/><path d="M22 14 L32 4 L42 14"/><path d="M10 58 H54" opacity=".6"/>`,
  // Grapnel reel: hook dragging something in.
  reel: `<circle cx="14" cy="32" r="8"/><path d="M22 32 H44" stroke-dasharray="4 3"/><path d="M44 32 C54 32 56 22 48 20 M44 32 C54 32 56 42 48 44"/><path d="M30 24 L22 32 L30 40"/>`,
  // Heat Purge Wave: concentric shock rings from a core.
  wave: `<circle cx="32" cy="32" r="6" fill="currentColor"/><circle cx="32" cy="32" r="15"/><circle cx="32" cy="32" r="25" stroke-dasharray="6 4" opacity=".7"/>`,
  // Chaff: a scatter of foil diamonds.
  chaff: `<path d="M14 14 L18 20 L14 26 L10 20 Z M40 8 L44 14 L40 20 L36 14 Z M50 34 L54 40 L50 46 L46 40 Z M24 38 L28 44 L24 50 L20 44 Z"/><path d="M30 26 L34 30 M44 54 L48 58 M8 44 L10 48" opacity=".7"/>`,
  // Point-defense / intercept: a shield with a burst on its face.
  intercept: `<path d="M32 6 L54 14 V30 C54 44 44 54 32 58 C20 54 10 44 10 30 V14 Z"/><path d="M32 20 L35 28 L43 28 L37 33 L39 41 L32 36 L25 41 L27 33 L21 28 L29 28 Z"/>`,
  advisor: `<path d="M22 40 C14 34 14 18 26 12 C36 8 48 14 48 26 C48 32 44 36 42 40 V46 H22 Z"/><path d="M24 52 H40 M26 58 H38"/>`,
  // Tags.
  star: `<path d="M32 6 L39 24 L58 24 L43 36 L49 56 L32 44 L15 56 L21 36 L6 24 L25 24 Z"/>`,
  hidden: `<path d="M32 6 L54 14 V30 C54 44 44 54 32 58 C20 54 10 44 10 30 V14 Z"/><path d="M26 24 C26 18 38 18 38 25 C38 30 32 31 32 36"/><circle cx="32" cy="44" r="2" fill="currentColor"/>`,
  // Lessons.
  beacon: `<path d="M32 58 V30"/><circle cx="32" cy="24" r="6"/><path d="M20 12 A16 16 0 0 0 20 36 M44 12 A16 16 0 0 1 44 36 M12 6 A26 26 0 0 0 12 42 M52 6 A26 26 0 0 1 52 42" opacity=".7"/><path d="M20 58 H44"/>`,
  dice: `<rect x="8" y="16" width="30" height="30" rx="5"/><circle cx="16" cy="24" r="2" fill="currentColor"/><circle cx="30" cy="38" r="2" fill="currentColor"/><circle cx="23" cy="31" r="2" fill="currentColor"/><path d="M44 10 L58 22 L52 40 L36 40 L30 22 Z"/>`,
  arc: `<path d="M32 32 L14 8 A30 30 0 0 1 50 8 Z"/><circle cx="32" cy="32" r="6"/><path d="M32 38 V58" stroke-dasharray="3 3"/><path d="M44 48 L54 58 M54 48 L44 58" opacity=".7"/>`,
  cover: `<path d="M6 54 H58"/><path d="M26 54 V26 H40 V54"/><path d="M26 34 H40 M26 44 H40" opacity=".6"/><circle cx="12" cy="40" r="5"/><path d="M48 30 L58 20" stroke-dasharray="3 3"/>`,
  melee: `<path d="M14 50 L44 20 M44 20 L52 12 M38 16 L48 26"/><path d="M50 50 L20 20 M20 20 L12 12 M26 16 L16 26"/>`,
  reach: `<path d="M12 52 L40 24 M40 24 L50 14 M34 20 L44 30"/><path d="M50 50 A20 20 0 0 0 30 30" stroke-dasharray="3 3" opacity=".7"/>`,
  // A brass horn speaker, with sound waves / struck through.
  sound: `<path d="M8 24 H20 L34 12 V52 L20 40 H8 Z"/><path d="M42 24 C46 28 46 36 42 40 M48 18 C56 26 56 38 48 46"/>`,
  mute: `<path d="M8 24 H20 L34 12 V52 L20 40 H8 Z"/><path d="M42 24 L56 40 M56 24 L42 40"/>`,
  check: `<path d="M12 34 L26 48 L52 16"/>`,
  active: `<path d="M18 12 L50 32 L18 52 Z"/>`,
  book: `<path d="M32 16 C24 10 14 10 8 12 V52 C14 50 24 50 32 56 C40 50 50 50 56 52 V12 C50 10 40 10 32 16 Z"/><path d="M32 16 V56"/>`,
  // Enemy fire zones: a wedge with a warning eye.
  threat: `<path d="M32 56 L10 16 A40 40 0 0 1 54 16 Z"/><circle cx="32" cy="28" r="6"/><path d="M22 28 C26 22 38 22 42 28 C38 34 26 34 22 28 Z"/>`,
  // Grit: a clenched gauntlet (knuckles over a cuff).
  grit: `<path d="M16 30 V20 C16 16 22 16 22 20 V28 M22 20 V16 C22 12 28 12 28 16 V28 M28 17 C28 13 34 13 34 17 V28 M34 19 C34 15 40 15 40 19 V32"/><path d="M16 28 C12 30 12 38 18 42 L24 48 H40 L44 40 V30 C44 26 40 26 40 30"/><path d="M22 48 V56 H42 V48"/>`,
  // Stagger: a ringing plate with shock lines.
  stagger: `<circle cx="32" cy="34" r="14"/><path d="M32 6 V14 M12 14 L18 20 M52 14 L46 20 M6 34 H12 M52 34 H58"/><path d="M28 30 L34 36 L30 40" />`,
};

export const STAT_ICON = { Penetration: "pen", Pen: "pen", Damage: "dmg", Dmg: "dmg", Toughness: "tough", Shots: "shots", Aim: "aim", Heat: "heat", heat: "heat", SP: "sp", "Structure Points": "sp", Range: "range", Reach: "reach" };

export function icon(name, cls = "") {
  const d = el("span", { class: `si si-${name} fam-${FAMILY_OF[name] || "info"} ${cls}` });
  d.innerHTML = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${P[name] || ""}</svg>`;
  return d;
}

// Colour families: the same colour means the same kind of thing everywhere.
const FAMILY = {
  pierce: ["pen"],
  attack: ["fire", "aimed", "dmg", "shots", "aim", "melee", "barrage", "lock", "threat", "stagger"],
  move: ["move", "sprint", "disengage", "jumpjets", "grapnel", "yank", "reel", "legs", "range", "reach", "arc"],
  defence: ["prepare", "harden", "smoke", "chaff", "intercept", "tough", "hull", "cover", "anchor", "hidden"],
  heat: ["heat", "engine", "overclock", "meltdown", "wave"],
  cool: ["shutdown", "purge", "douse", "cryo"],
  repair: ["repair", "patch", "sp", "nanite"],
  info: ["advisor", "beacon", "dice", "arms", "star", "grit", "sound", "mute", "check", "active", "book"],
};
export const FAMILY_OF = Object.fromEntries(Object.entries(FAMILY).flatMap(([f, ns]) => ns.map((n) => [n, f])));
