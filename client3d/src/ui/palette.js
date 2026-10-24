// Side colours for code that paints outside CSS (canvas, inline SVG, three.js).
// Mirrors the --side-a / --side-b tokens in styles.css: side A burns whale-oil
// amber, side B is oxblood. `hi` is the lifted shade for text and small marks
// on near-black, where the base shade is too dark to read.
export const SIDE = {
  a: { base: "#d9a441", hi: "#f2c46b", rgb: "217,164,65", hex: 0xd9a441 },
  b: { base: "#9e2b25", hi: "#e06a5c", rgb: "158,43,37", hex: 0x9e2b25 },
};

// "You" marks in the attack diagrams: bone white, so they never read as a
// warning amber or a side colour.
export const SELF_MARK = "#f4ead0";

export const sideColor = (owner, shade = "hi") => (SIDE[owner] || SIDE.a)[shade];
