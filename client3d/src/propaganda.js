// Faction propaganda: the slogans, palettes and poster art every surface shares
// (lobby/loading/victory screens, poster slams, in-world billboards, graffiti).
// Pure flavour: rules never read it. drawPoster paints onto any 2D canvas
// context, so the DOM and THREE.CanvasTexture use the same art.

// Style axis: "deco" is the gleaming corp look (sunburst, gold), "trench" the
// patched-up stencil-on-tarp look, "bloc" the constructivist red/black diagonal.
export const PROPAGANDA = {
  krim: {
    style: "bloc", ink: "#1a1412", paper: "#e8dcc0", accent: "#b3261e",
    slogans: ["MORE SHELLS. MORE TOMORROW.", "KRIM FEEDS THE GUNS", "EVERY FURNACE A FRONT"],
    tag: "KRIM BLEEDS",
  },
  nox: {
    style: "deco", ink: "#e6dcc4", paper: "#1e1a22", accent: "#8a7a9e",
    slogans: ["IRON OUTLASTS", "WEIGHT IS VIRTUE", "NOX: BUILT TO BE BURIED IN"],
    tag: "NOX RUSTS",
  },
  arcus: {
    style: "deco", ink: "#1b2438", paper: "#efe3c4", accent: "#c9a14a",
    slogans: ["THE FUTURE IS ALREADY WIRED", "ARCUS LIGHTS THE WAY", "PROGRESS NEVER SLEEPS"],
    tag: "LIGHTS OUT, ARCUS",
  },
  triton: {
    style: "bloc", ink: "#e8dcc0", paper: "#1c2a3a", accent: "#c9a14a",
    slogans: ["THE SEA KEEPS US COOL", "STEADY AS THE TIDE", "DEEP WATER, COLD STEEL"],
    tag: "TRITON SINKS",
  },
  freegear: {
    style: "trench", ink: "#2a2118", paper: "#9a8a66", accent: "#8a3a1c",
    slogans: ["NO BOSS. NO MASTER. JUST GEARS.", "SCRAP IS FREEDOM", "WE BUILD WHAT THEY THROW AWAY"],
    tag: "FREEGEAR WAS HERE",
  },
};
export const PROPAGANDA_IDS = Object.keys(PROPAGANDA);
export const FACTION_SHORT = { krim: "KRIM", nox: "NOX", arcus: "ARCUS", triton: "TRITON", freegear: "FREEGEAR" };

// Generic defacement for when the other side scores over your poster.
export const GRAFFITI = ["LIES", "NOT FOR LONG", "WE SAW", "ASK THE WIDOWS", "OIL IS BLOOD"];

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Deterministic pick so both players and a replay see the same wall.
export function pickPoster(seed) {
  const r = rng(seed);
  const id = PROPAGANDA_IDS[Math.floor(r() * PROPAGANDA_IDS.length)];
  const p = PROPAGANDA[id];
  return { id, slogan: p.slogans[Math.floor(r() * p.slogans.length)] };
}

function wrap(ctx, text, maxW) {
  const words = text.split(" "); const lines = []; let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

// Paint a poster into (0,0,w,h). opts: { slogan, seed, graffiti: string|null, aged: 0..1 }
export function drawPoster(ctx, id, w, h, opts = {}) {
  const p = PROPAGANDA[id] || PROPAGANDA.krim;
  const r = rng(opts.seed ?? 7);
  const slogan = opts.slogan || p.slogans[0];
  ctx.save();
  ctx.fillStyle = p.paper; ctx.fillRect(0, 0, w, h);

  if (p.style === "deco") {
    // Sunburst from the bottom centre, stepped frame.
    ctx.save(); ctx.translate(w / 2, h * 0.62); ctx.fillStyle = p.accent; ctx.globalAlpha = 0.35;
    for (let i = 0; i < 18; i++) {
      ctx.rotate(Math.PI / 9); ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(-w * 0.05, -h); ctx.lineTo(w * 0.05, -h); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = p.accent; ctx.lineWidth = Math.max(2, w * 0.012);
    for (let i = 0; i < 3; i++) { const m = w * (0.03 + i * 0.022); ctx.strokeRect(m, m, w - 2 * m, h - 2 * m); }
  } else if (p.style === "bloc") {
    // Constructivist wedge: a heroic diagonal and a solid disc.
    ctx.fillStyle = p.accent; ctx.beginPath();
    ctx.moveTo(0, h * 0.75); ctx.lineTo(w, h * 0.2); ctx.lineTo(w, h * 0.42); ctx.lineTo(0, h * 0.97); ctx.closePath(); ctx.fill();
    ctx.fillStyle = p.ink; ctx.beginPath(); ctx.arc(w * 0.72, h * 0.3, w * 0.16, 0, Math.PI * 2); ctx.fill();
  } else {
    // Trench: stencil on tarp, tape corners, drips.
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let i = 0; i < 40; i++) ctx.fillRect(r() * w, r() * h, r() * w * 0.2, 1 + r() * 2);
    ctx.fillStyle = "rgba(230,220,190,0.55)";
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-w * 0.1, -h * 0.02, w * 0.2, h * 0.04); ctx.restore(); }
    ctx.fillStyle = p.accent;
    for (let i = 0; i < 6; i++) { const x = w * (0.15 + r() * 0.7); ctx.fillRect(x, h * 0.58, 2, h * (0.05 + r() * 0.15)); }
  }

  // Faction name, then the slogan.
  ctx.fillStyle = p.ink; ctx.textAlign = "center"; ctx.textBaseline = "top";
  const big = Math.round(h * 0.13);
  ctx.font = `900 ${big}px "Big Shoulders Stencil Display", Oswald, Impact, sans-serif`;
  ctx.fillText(FACTION_SHORT[id] || id.toUpperCase(), w / 2, h * 0.07);
  const small = Math.round(h * 0.075);
  ctx.font = `700 ${small}px Oswald, "Arial Narrow", sans-serif`;
  const lines = wrap(ctx, slogan, w * 0.84);
  lines.forEach((l, i) => ctx.fillText(l, w / 2, h * 0.7 + i * small * 1.1));

  // Age: foxing blots and a torn corner.
  const aged = opts.aged ?? 0.4;
  ctx.fillStyle = `rgba(60,40,20,${0.12 * aged})`;
  for (let i = 0; i < 12 * aged; i++) { ctx.beginPath(); ctx.arc(r() * w, r() * h, 2 + r() * w * 0.05, 0, Math.PI * 2); ctx.fill(); }

  if (opts.graffiti) {
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-0.25);
    ctx.font = `900 ${Math.round(h * 0.12)}px "Special Elite", "Courier New", monospace`;
    ctx.fillStyle = "rgba(200,30,20,0.9)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(opts.graffiti, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// A 2 to 3 colour constructivist slam card (VP, kills, the wanted reveal):
// the faction's paper, ink and accent only, a heroic diagonal wedge, a disc,
// and a stencil headline. opts: { headline, sub, seed, graffiti }
export function drawSlam(ctx, id, w, h, opts = {}) {
  const p = PROPAGANDA[id] || PROPAGANDA.krim;
  const r = rng(opts.seed ?? 11);
  ctx.save();
  ctx.fillStyle = p.paper; ctx.fillRect(0, 0, w, h);
  // Wedge and counter-wedge.
  ctx.fillStyle = p.accent; ctx.beginPath();
  ctx.moveTo(0, h * (0.55 + r() * 0.1)); ctx.lineTo(w, h * 0.05); ctx.lineTo(w, h * 0.38); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = p.ink; ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(w * 0.34, 0); ctx.lineTo(0, h * 0.42); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(w * (0.74 + r() * 0.08), h * 0.66, Math.min(w, h) * 0.2, 0, Math.PI * 2); ctx.fill();
  // Speed bars.
  for (let i = 0; i < 3; i++) ctx.fillRect(w * 0.06, h * (0.8 + i * 0.05), w * (0.18 + i * 0.08), h * 0.022);
  // Headline in a paper band so it reads over any wedge.
  const head = String(opts.headline || FACTION_SHORT[id] || id).toUpperCase();
  const size = Math.round(Math.min(h * 0.2, (w * 1.6) / Math.max(4, head.length)));
  ctx.font = `900 ${size}px "Big Shoulders Stencil Display", Oswald, Impact, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.save(); ctx.translate(w / 2, h * 0.42); ctx.rotate(-0.12);
  ctx.fillStyle = p.paper; ctx.fillRect(-w * 0.48, -size * 0.62, w * 0.96, size * 1.24);
  ctx.fillStyle = p.ink; ctx.fillText(head, 0, 0, w * 0.92);
  ctx.restore();
  if (opts.sub) {
    const s = Math.round(h * 0.075);
    ctx.font = `700 ${s}px Oswald, "Arial Narrow", sans-serif`;
    ctx.fillStyle = p.ink; ctx.fillRect(w * 0.08, h * 0.6 - s * 0.7, w * 0.6, s * 1.4);
    ctx.fillStyle = p.paper; ctx.textAlign = "left";
    ctx.fillText(String(opts.sub).toUpperCase(), w * 0.1, h * 0.6, w * 0.56);
  }
  if (opts.graffiti) {
    ctx.save(); ctx.translate(w / 2, h * 0.5); ctx.rotate(0.2);
    ctx.font = `900 ${Math.round(h * 0.16)}px "Special Elite", "Courier New", monospace`;
    ctx.fillStyle = "rgba(200,30,20,0.9)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(opts.graffiti, 0, 0, w * 0.95);
    ctx.restore();
  }
  ctx.restore();
}
