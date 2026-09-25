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
  reach: `<path d="M12 52 L40 24 M40 24 L50 14 M34 20 L44 30"/><path d="M50 50 A20 20 0 0 0 30 30" stroke-dasharray="3 3" opacity=".7"/>`,
};

export const STAT_ICON = { Penetration: "pen", Pen: "pen", Damage: "dmg", Dmg: "dmg", Toughness: "tough", Shots: "shots", Aim: "aim", Heat: "heat", heat: "heat", SP: "sp", "Structure Points": "sp", Range: "range", Reach: "reach" };

export function icon(name, cls = "") {
  const d = el("span", { class: `si si-${name} ${cls}` });
  d.innerHTML = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${P[name] || ""}</svg>`;
  return d;
}
