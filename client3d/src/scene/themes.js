// Battlefield aesthetics: ten dieselpunk locales. A theme is pure dressing,
// sky, fog, light colours, the ground's paint job, which building variants the
// scatter becomes, the set-pieces beyond the table and the ambient drift in the
// air. Rules never read it. The pick is deterministic from the terrain layout,
// so both players (and a replay) see the same place; a settings override wins.
//
// Every theme carries the same keys (themes.test.js checks):
//   sky / bg / fog / hemi / sun / sunAt   the light and the air (sunAt: the
//                                         sun's offset from the table centre)
//   ground / outer                        the table's paint job, the floor round it
//   lamp / banner / search                warm light colours (never cold teal:
//                                         lamps are sodium and whale oil)
//   buildings / backdrop / scenery        what the scatter and the horizon become
//   ambient                               the drift in the air (world.ambient)
//   ambience                              the audio bed id (audio.js maps it)
//   grade                                 the post colour grade (post.js)
//   weather                               chance of rain per battle (weatherFor)
//   dress                                 facade dressing odds (facades.js)

// Grades: split-tone in display space. `shadows` / `highlights` tint the dark
// and light ends (0x808080 is neutral), `sat` and `contrast` near 1, `lift`
// raises the blacks toward the shadow tint, `amount` blends it all in. Gains
// never exceed 1, so a grade can't push a highlight into a bloom blob.
const GRIME = { shadows: 0x6a7278, highlights: 0x9a8058, sat: 0.86, contrast: 1.04, lift: 0.025, amount: 0.55 }; // whale-grey and ochre
const GILT = { shadows: 0x70665a, highlights: 0xa08650, sat: 0.95, contrast: 1.05, lift: 0.015, amount: 0.5 };   // gilded warm deco

export const THEMES = {
  foundry: {
    id: "foundry", name: "Foundry Dusk",
    sky: ["#0c0a08", "#2b1c10", "#6e4220", "#a8662a", "#3a2614", "#140e09"],
    bg: 0x1a130c, fog: { color: 0x2a1d10, near: 95, far: 250 },
    hemi: { sky: 0xd8b88a, ground: 0x140d06, i: 0.5 }, sun: { color: 0xffe0b0, i: 8 }, sunAt: [-30, 60, -20],
    ground: { base: "#4a3c2b", blooms: ["rgba(120,60,25,0.22)", "rgba(10,8,6,0.25)"], speck: [90, 78, 60], rails: 1, plates: false, stripes: false, cracks: null },
    outer: 0x1b1d22, lamp: 0xffcf6b, banner: 0x8a2a1c, search: 0xfff0c8,
    buildings: ["factory", "tank", "pumphouse", "sawtooth", "furnace", "tenement"], backdrop: ["skyline", "zeppelin", "crane", "arcpylons"], ambient: "soot", scenery: null,
    ambience: "foundry", grade: GRIME, weather: 0.3,
    dress: { posters: 0.7, neon: 0, oilRacks: 0.5, layered: false },
  },
  refinery: {
    id: "refinery", name: "Refinery Night",
    sky: ["#04060c", "#0b1322", "#1c2a3a", "#6a3a1a", "#1a1410", "#07080a"],
    bg: 0x070a10, fog: { color: 0x10141c, near: 95, far: 250 },
    hemi: { sky: 0x8aa2c8, ground: 0x0a0806, i: 0.42 }, sun: { color: 0xcfe0ff, i: 6.5 }, sunAt: [-30, 60, -20],
    ground: { base: "#2f2e2c", blooms: ["rgba(10,10,12,0.35)", "rgba(90,70,40,0.18)"], speck: [70, 70, 72], rails: 0, plates: false, stripes: true, cracks: null },
    outer: 0x0e1014, lamp: 0xffb347, banner: 0xd8a21c, search: 0xffe6b0,
    buildings: ["tank", "factory", "gasholder", "derrick", "furnace", "pumphouse"], backdrop: ["flares", "skyline", "crane", "ferriss"], ambient: "embers", scenery: null,
    ambience: "refinery", grade: { ...GRIME, shadows: 0x646c7a, amount: 0.45 }, weather: 0.35,
    dress: { posters: 0.5, neon: 0.2, oilRacks: 0.6, layered: false },
  },
  railyard: {
    id: "railyard", name: "Rail Yard",
    sky: ["#15181a", "#2c3230", "#4d5550", "#8a8a78", "#3a3c36", "#141615"],
    bg: 0x1a1d1c, fog: { color: 0x3a3e3a, near: 95, far: 250 },
    hemi: { sky: 0xc8d0c0, ground: 0x12110e, i: 0.5 }, sun: { color: 0xfff2dc, i: 7.5 }, sunAt: [-30, 60, -20],
    ground: { base: "#4b4841", blooms: ["rgba(30,28,24,0.3)", "rgba(110,80,50,0.15)"], speck: [95, 92, 84], rails: 4, plates: false, stripes: false, cracks: null },
    outer: 0x1c1e1c, lamp: 0xffd98a, banner: 0x2c4a6a, search: 0xf6f2e0,
    buildings: ["shed", "watertower", "signalbox", "depot", "sawtooth", "tenement"], backdrop: ["crane", "skyline", "zeppelin", "walloflight"], ambient: "steam", scenery: null,
    ambience: "railyard", grade: GRIME, weather: 0.45,
    dress: { posters: 0.7, neon: 0, oilRacks: 0.5, layered: false },
  },
  skyport: {
    id: "skyport", name: "Skyport Docks",
    sky: ["#0b1216", "#1d3438", "#4a6a62", "#c89a52", "#5a4630", "#10100e"],
    bg: 0x14201f, fog: { color: 0x2a3834, near: 95, far: 250 },
    hemi: { sky: 0xdcd6c0, ground: 0x14100a, i: 0.5 }, sun: { color: 0xffe6b8, i: 8 }, sunAt: [-30, 60, -20],
    ground: { base: "#5a4a34", blooms: ["rgba(40,30,20,0.25)", "rgba(150,110,60,0.15)"], speck: [110, 96, 72], rails: 0, plates: true, stripes: false, cracks: null },
    // Sodium and whale-oil amber, not teal: every lamp in the port burns oil.
    outer: 0x16201e, lamp: 0xffbf6a, banner: 0x1f6a5a, search: 0xffe2a8,
    buildings: ["mast", "factory", "watertower", "pylon", "depot", "gasholder"], backdrop: ["zeppelin", "zeppelin", "skyline", "ferriss"], ambient: "dust", scenery: null,
    ambience: "skyport", grade: GILT, weather: 0.25,
    dress: { posters: 0.6, neon: 0.5, oilRacks: 0.4, layered: true },
  },
  ashfields: {
    id: "ashfields", name: "Ashfields",
    sky: ["#080404", "#1c0806", "#4a120a", "#b0381a", "#2a0c08", "#0a0404"],
    bg: 0x120606, fog: { color: 0x2a0e08, near: 95, far: 250 },
    hemi: { sky: 0xe0a080, ground: 0x0a0404, i: 0.45 }, sun: { color: 0xffc8a0, i: 7.5 }, sunAt: [-30, 60, -20],
    ground: { base: "#2a2522", blooms: ["rgba(0,0,0,0.35)", "rgba(120,40,10,0.18)"], speck: [60, 54, 50], rails: 0, plates: false, stripes: false, cracks: "rgba(255,110,30,0.55)" },
    outer: 0x100a08, lamp: 0xff7a3a, banner: 0x3a3a3a, search: 0xffd0b0,
    buildings: ["cooling", "factory", "tank", "pillbox", "derrick", "furnace"], backdrop: ["cooling", "flares", "skyline", "arcpylons"], ambient: "embers", scenery: null,
    ambience: "ashfields", grade: { ...GRIME, highlights: 0x9a6e4c, amount: 0.4 }, weather: 0,
    dress: { posters: 0.5, neon: 0, oilRacks: 0.3, layered: false },
  },
  // 1920+ Poland: rolling fields, haystacks, birches, a windmill and a church
  // on the rise, a low sun behind the rigs so they stand as silhouettes.
  rozalski: {
    id: "rozalski", name: "Rozalski Fields",
    sky: ["#3a4450", "#6a7078", "#b89a70", "#e0b070", "#8a7050", "#3a3020"],
    bg: 0x6a6a62, fog: { color: 0x8a7e66, near: 90, far: 260 },
    hemi: { sky: 0xe8d8b0, ground: 0x2a2414, i: 0.55 }, sun: { color: 0xffd49a, i: 7 }, sunAt: [-70, 20, -25],
    ground: { base: "#5e5a36", blooms: ["rgba(120,110,50,0.25)", "rgba(40,50,20,0.25)"], speck: [110, 104, 66], rails: 0, plates: false, stripes: false, cracks: null },
    outer: 0x4a4a2a, lamp: 0xffc070, banner: 0x8a2a1c, search: 0xffe6b8,
    buildings: ["barn", "watertower", "shed", "pumphouse", "barn", "signalbox"], backdrop: ["fields", "windmill", "church", "zeppelin"], ambient: "dust",
    scenery: { rock: ["classic", "boiler", "scrap"], ruin: ["brickwalls", "chimney", "foundation"], wood: ["scrub", "marsh"], crater: ["shell", "classic", "bomb"] },
    ambience: "fields", grade: { shadows: 0x68707a, highlights: 0xa88a58, sat: 0.9, contrast: 1.05, lift: 0.02, amount: 0.5 }, weather: 0.2,
    dress: { posters: 0.3, neon: 0, oilRacks: 0, layered: false },
  },
  // Karnaca: sun-bleached whitewash, terracotta roofs, shutters, harbour cranes.
  karnaca: {
    id: "karnaca", name: "Karnaca Port",
    sky: ["#3c5a70", "#6a8898", "#c8b898", "#e8c890", "#b08a60", "#4a3a28"],
    bg: 0x8a8070, fog: { color: 0xb0a080, near: 100, far: 280 },
    hemi: { sky: 0xf0e0c0, ground: 0x3a2a1a, i: 0.6 }, sun: { color: 0xffe4b4, i: 7 }, sunAt: [-25, 55, 30],
    ground: { base: "#8a7658", blooms: ["rgba(200,170,120,0.2)", "rgba(80,60,40,0.2)"], speck: [150, 132, 104], rails: 0, plates: false, stripes: false, cracks: null },
    outer: 0x6a5a44, lamp: 0xffc47a, banner: 0xb0482a, search: 0xffe8c0,
    buildings: ["villa", "villa", "watertower", "depot", "tenement", "mast"], backdrop: ["harbour", "seaplanes", "villas", "crane"], ambient: "dust", scenery: null,
    ambience: "harbour", grade: { ...GILT, highlights: 0xa8906a, sat: 0.9, amount: 0.4 }, weather: 0,
    dress: { posters: 0.5, neon: 0.2, oilRacks: 0.3, layered: false },
  },
  // Rapture: art deco under the sea, gold and verdigris, warm neon, dark water.
  sunken: {
    id: "sunken", name: "Sunken Deco",
    sky: ["#02080a", "#06161a", "#0c2a2c", "#1a3a36", "#0a1a1a", "#040808"],
    bg: 0x061214, fog: { color: 0x0c1c1c, near: 80, far: 220 },
    hemi: { sky: 0x6a8c86, ground: 0x0a0806, i: 0.45 }, sun: { color: 0xffd8a0, i: 5 }, sunAt: [-20, 60, -15],
    ground: { base: "#2c302c", blooms: ["rgba(20,40,38,0.3)", "rgba(120,90,40,0.15)"], speck: [70, 76, 70], rails: 0, plates: true, stripes: false, cracks: null },
    outer: 0x0c1414, lamp: 0xffb45a, banner: 0x2a5a4a, search: 0xffdca0,
    buildings: ["decotower", "decotower", "tank", "pumphouse", "gasholder", "tenement"], backdrop: ["bulkheads", "decotowers", "decotowers"], ambient: "steam", scenery: null,
    ambience: "undersea", grade: { ...GILT, shadows: 0x5e706c, amount: 0.5 }, weather: 0,
    dress: { posters: 0.4, neon: 0.8, oilRacks: 0.2, layered: true },
  },
  // Trenches: mud, wire, craters, duckboards, a grey-green gas sky.
  nomansland: {
    id: "nomansland", name: "No-Man's-Land",
    sky: ["#15180f", "#2e3426", "#4e5640", "#7a7c5e", "#34362a", "#121410"],
    bg: 0x2a2e24, fog: { color: 0x3a4032, near: 85, far: 230 },
    hemi: { sky: 0xc0c0a0, ground: 0x12100a, i: 0.5 }, sun: { color: 0xe8dcc0, i: 6 }, sunAt: [-30, 50, -20],
    ground: { base: "#3e3426", blooms: ["rgba(20,16,10,0.35)", "rgba(70,70,40,0.2)"], speck: [80, 70, 54], rails: 0, plates: false, stripes: false, cracks: null },
    outer: 0x241e16, lamp: 0xffb060, banner: 0x4a4a30, search: 0xffe0b0,
    buildings: ["blockhouse", "pillbox", "blockhouse", "shed", "pylon", "signalbox"], backdrop: ["trenchline", "deadwood", "deadwood", "starshells"], ambient: "soot",
    scenery: { rock: ["concrete", "scrap", "boiler"], ruin: ["brickwalls", "foundation", "chimney"], wood: ["wire", "scrub", "marsh"], crater: ["shell", "flooded", "bomb"] },
    ambience: "trenches", grade: { ...GRIME, shadows: 0x6a7266, highlights: 0x8e8660, sat: 0.78, amount: 0.55 }, weather: 0.5,
    dress: { posters: 0.4, neon: 0, oilRacks: 0, layered: false },
  },
  // Hugh Ferriss: monolith setback towers in the fog, searchlights raking it.
  ferriss: {
    id: "ferriss", name: "Ferriss City",
    sky: ["#060606", "#121212", "#262420", "#5a4a34", "#1e1a16", "#0a0908"],
    bg: 0x0e0d0c, fog: { color: 0x1e1b17, near: 80, far: 220 },
    hemi: { sky: 0xc8b89a, ground: 0x0a0806, i: 0.42 }, sun: { color: 0xffe0b8, i: 5.5 }, sunAt: [-25, 65, -15],
    ground: { base: "#34322e", blooms: ["rgba(10,10,10,0.35)", "rgba(110,90,50,0.15)"], speck: [74, 70, 64], rails: 0, plates: false, stripes: true, cracks: null },
    outer: 0x121212, lamp: 0xffc070, banner: 0x6a1a14, search: 0xffe6b8,
    buildings: ["setback", "setback", "tenement", "factory", "pylon", "watertower"], backdrop: ["ferriss", "ferriss", "walloflight", "zeppelin"], ambient: "steam", scenery: null,
    ambience: "metropolis", grade: GILT, weather: 0.4,
    dress: { posters: 0.6, neon: 0.5, oilRacks: 0.4, layered: true },
  },
};
export const THEME_IDS = Object.keys(THEMES);

// A small stable hash of the terrain layout: same table, same locale.
// A field's dressing hash: its layout, plus its dressSeed when it has one (a
// room id, a replay id), so the same layout can look different battle to battle.
function layoutHash(field) {
  let h = 2166136261;
  const s = (field.terrain || []).map((t) => `${t.kind}${Math.round(t.x * 10)},${Math.round(t.y * 10)}`).join("|") + `${field.width}x${field.height}` + (field.dressSeed != null ? `#${field.dressSeed}` : "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// `override`: a settings value ("auto" or a theme id). A field with
// `lockTheme` (the title screen's Rozalski backdrop) keeps its own theme.
export function themeFor(field, override = "auto") {
  if (field?.lockTheme && THEMES[field.theme]) return THEMES[field.theme];
  if (override && THEMES[override]) return THEMES[override];
  if (field?.theme && THEMES[field.theme]) return THEMES[field.theme];
  return THEMES[THEME_IDS[layoutHash(field || {}) % THEME_IDS.length]];
}

// Weather for a battle: "clear" or "rain". A settings override ("auto",
// "clear", "rain") wins; otherwise the theme's rain chance against the
// battle's dressing seed, so both players get the same sky.
export const WEATHERS = ["clear", "rain"];
export function weatherFor(theme, seed, override = "auto") {
  if (WEATHERS.includes(override)) return override;
  const h = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) % 1000 < (theme?.weather || 0) * 1000 ? "rain" : "clear";
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

// The dressing pick: one of `list` for a piece, from the field's dressing hash,
// the piece's position and a tag. Same seed and layout, same pick.
export function dressPick(seed, tag, t, list) {
  let h = (seed >>> 0) ^ 2166136261;
  const s = `${tag}|${Math.round((t.x || 0) * 10)},${Math.round((t.y || 0) * 10)}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return list[(h >>> 0) % list.length];
}
