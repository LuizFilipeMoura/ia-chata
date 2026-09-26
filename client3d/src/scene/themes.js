// Battlefield aesthetics: five dieselpunk locales. A theme is pure dressing,
// sky, fog, light colours, the ground's paint job, which building variants the
// scatter becomes, the set-pieces beyond the table and the ambient drift in the
// air. Rules never read it. The pick is deterministic from the terrain layout,
// so both players (and a replay) see the same place; a settings override wins.

export const THEMES = {
  foundry: {
    id: "foundry", name: "Foundry Dusk",
    sky: ["#0c0a08", "#2b1c10", "#6e4220", "#a8662a", "#3a2614", "#140e09"],
    bg: 0x1a130c, fog: { color: 0x2a1d10, near: 95, far: 250 },
    hemi: { sky: 0xd8b88a, ground: 0x140d06, i: 0.5 }, sun: { color: 0xffe0b0, i: 8 },
    ground: { base: "#4a3c2b", blooms: ["rgba(120,60,25,0.22)", "rgba(10,8,6,0.25)"], speck: [90, 78, 60], rails: 1, plates: false, stripes: false, cracks: null },
    outer: 0x1b1d22, lamp: 0xffcf6b, banner: 0x8a2a1c, search: 0xfff0c8,
    buildings: ["factory", "factory", "tank"], backdrop: ["skyline", "zeppelin", "crane"], ambient: "soot",
  },
  refinery: {
    id: "refinery", name: "Refinery Night",
    sky: ["#04060c", "#0b1322", "#1c2a3a", "#6a3a1a", "#1a1410", "#07080a"],
    bg: 0x070a10, fog: { color: 0x10141c, near: 95, far: 250 },
    hemi: { sky: 0x8aa2c8, ground: 0x0a0806, i: 0.42 }, sun: { color: 0xcfe0ff, i: 6.5 },
    ground: { base: "#2f2e2c", blooms: ["rgba(10,10,12,0.35)", "rgba(90,70,40,0.18)"], speck: [70, 70, 72], rails: 0, plates: false, stripes: true, cracks: null },
    outer: 0x0e1014, lamp: 0xffb347, banner: 0xd8a21c, search: 0xffe6b0,
    buildings: ["tank", "tank", "factory"], backdrop: ["flares", "skyline", "crane"], ambient: "embers",
  },
  railyard: {
    id: "railyard", name: "Rail Yard",
    sky: ["#15181a", "#2c3230", "#4d5550", "#8a8a78", "#3a3c36", "#141615"],
    bg: 0x1a1d1c, fog: { color: 0x3a3e3a, near: 95, far: 250 },
    hemi: { sky: 0xc8d0c0, ground: 0x12110e, i: 0.5 }, sun: { color: 0xfff2dc, i: 7.5 },
    ground: { base: "#4b4841", blooms: ["rgba(30,28,24,0.3)", "rgba(110,80,50,0.15)"], speck: [95, 92, 84], rails: 4, plates: false, stripes: false, cracks: null },
    outer: 0x1c1e1c, lamp: 0xffd98a, banner: 0x2c4a6a, search: 0xf6f2e0,
    buildings: ["shed", "watertower", "factory"], backdrop: ["crane", "skyline", "zeppelin"], ambient: "steam",
  },
  skyport: {
    id: "skyport", name: "Skyport Docks",
    sky: ["#0b1216", "#1d3438", "#4a6a62", "#c89a52", "#5a4630", "#10100e"],
    bg: 0x14201f, fog: { color: 0x2a3834, near: 95, far: 250 },
    hemi: { sky: 0xcde0d0, ground: 0x14100a, i: 0.5 }, sun: { color: 0xffe6b8, i: 8 },
    ground: { base: "#5a4a34", blooms: ["rgba(40,30,20,0.25)", "rgba(150,110,60,0.15)"], speck: [110, 96, 72], rails: 0, plates: true, stripes: false, cracks: null },
    outer: 0x16201e, lamp: 0x9ff0dc, banner: 0x1f6a5a, search: 0xe8fff4,
    buildings: ["mast", "factory", "watertower"], backdrop: ["zeppelin", "zeppelin", "skyline"], ambient: "dust",
  },
  ashfields: {
    id: "ashfields", name: "Ashfields",
    sky: ["#080404", "#1c0806", "#4a120a", "#b0381a", "#2a0c08", "#0a0404"],
    bg: 0x120606, fog: { color: 0x2a0e08, near: 95, far: 250 },
    hemi: { sky: 0xe0a080, ground: 0x0a0404, i: 0.45 }, sun: { color: 0xffc8a0, i: 7.5 },
    ground: { base: "#2a2522", blooms: ["rgba(0,0,0,0.35)", "rgba(120,40,10,0.18)"], speck: [60, 54, 50], rails: 0, plates: false, stripes: false, cracks: "rgba(255,110,30,0.55)" },
    outer: 0x100a08, lamp: 0xff7a3a, banner: 0x3a3a3a, search: 0xffd0b0,
    buildings: ["cooling", "factory", "tank"], backdrop: ["cooling", "flares", "skyline"], ambient: "embers",
  },
};
export const THEME_IDS = Object.keys(THEMES);

// A small stable hash of the terrain layout: same table, same locale.
function layoutHash(field) {
  let h = 2166136261;
  const s = (field.terrain || []).map((t) => `${t.kind}${Math.round(t.x * 10)},${Math.round(t.y * 10)}`).join("|") + `${field.width}x${field.height}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// `override`: a settings value ("auto" or a theme id).
export function themeFor(field, override = "auto") {
  if (override && THEMES[override]) return THEMES[override];
  if (field?.theme && THEMES[field.theme]) return THEMES[field.theme];
  return THEMES[THEME_IDS[layoutHash(field || {}) % THEME_IDS.length]];
}

// A deterministic 0..1 stream for dressing (so a rebuild looks identical).
export function dressRandom(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export { layoutHash };
