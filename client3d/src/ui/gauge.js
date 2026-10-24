// Boiler-pressure gauge: a brass-bezelled needle dial for rig heat. Ticks per
// point of heat, a red line zone past capacity, a glass glint. The needle eases
// from the last reading it showed for the same `key` (the HUD re-renders from
// scratch on every state), and a drop in heat (venting) blows a puff of steam.
import { el } from "./dom.js";

export const SWEEP = 270; // degrees of dial face the needle can travel
const START = -SWEEP / 2;

// Top of the scale: some headroom past capacity so "over" has somewhere to go.
export function gaugeMax(cap, heat = 0) {
  return Math.max(cap + 4, Math.ceil(heat));
}

// Needle angle in degrees, clockwise from straight up. 0 heat sits at the
// left stop, gaugeMax at the right stop.
export function needleAngle(heat, max) {
  const f = max > 0 ? Math.min(1, Math.max(0, heat / max)) : 0;
  return START + SWEEP * f;
}

// Which way the reading moved since the last render.
export function heatTrend(prev, next) {
  if (prev == null || prev === next) return "steady";
  return next < prev ? "vent" : "rise";
}

const last = new Map(); // key -> last heat shown
let uid = 0;

const rad = (deg) => ((deg - 90) * Math.PI) / 180;
const at = (deg, r) => [50 + Math.cos(rad(deg)) * r, 50 + Math.sin(rad(deg)) * r];
const f1 = (n) => n.toFixed(1);
function arc(a, b, r) {
  const [x1, y1] = at(a, r), [x2, y2] = at(b, r);
  return `M${f1(x1)},${f1(y1)} A${r},${r} 0 ${b - a > 180 ? 1 : 0} 1 ${f1(x2)},${f1(y2)}`;
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// heat, cap: numbers. opts.size: "sm" | "md" | "lg" (lg draws numerals).
// opts.key: stable id for needle easing ("bar:<rigId>"). opts.sweep: ritual
// mode (the needle swings to the stop and settles, see ignition.js).
export function boilerGauge(heat, cap, { size = "md", key = null, sweep = false, title = null } = {}) {
  const max = gaugeMax(cap, heat);
  const id = `bg${++uid}`;
  const over = heat > cap;
  const ticks = [];
  for (let i = 0; i <= max; i++) {
    const a = needleAngle(i, max), red = i >= cap;
    const [x1, y1] = at(a, i === cap ? 29 : 33), [x2, y2] = at(a, 39);
    ticks.push(`<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${red ? "#ff6a4a" : "#e8cf8f"}" stroke-width="${i === cap ? 3 : 1.6}"/>`);
    if (i < max) { // minor tick between points
      const m = needleAngle(i + 0.5, max); const [a1, b1] = at(m, 36), [a2, b2] = at(m, 39);
      ticks.push(`<line x1="${f1(a1)}" y1="${f1(b1)}" x2="${f1(a2)}" y2="${f1(b2)}" stroke="${red ? "#b8402c" : "#8a7446"}" stroke-width="1"/>`);
    }
  }
  const nums = size === "lg" ? [0, cap, max].map((v) => {
    const [x, y] = at(needleAngle(v, max), 24);
    return `<text x="${f1(x)}" y="${f1(y + 4)}" text-anchor="middle" class="gz-num${v >= cap && v > 0 ? " red" : ""}">${v}</text>`;
  }).join("") : "";
  const prev = key != null ? last.get(key) : null;
  const trend = heatTrend(prev, heat);
  if (key != null) last.set(key, heat);
  const from = sweep ? needleAngle(0, max) : needleAngle(prev ?? heat, max), to = needleAngle(heat, max);
  const wrap = el("div", { class: `bgauge ${size}${over ? " over" : ""}${sweep ? " sweep" : ""}`, title: title ?? `Boiler heat ${heat} / capacity ${cap}${over ? ": OVER, the engine is at risk" : ""}`, role: "img", "aria-label": `Heat ${heat} of ${cap}` });
  wrap.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient id="${id}b" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#fff0b8"/><stop offset=".35" stop-color="#c9a14a"/><stop offset=".75" stop-color="#6e5424"/><stop offset="1" stop-color="#2a1e0c"/></radialGradient>
      <radialGradient id="${id}f" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#1f1812"/><stop offset="1" stop-color="#070605"/></radialGradient>
      <radialGradient id="${id}c" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#fff0b8"/><stop offset=".6" stop-color="#b08a3a"/><stop offset="1" stop-color="#4a3614"/></radialGradient>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>
    <circle cx="50" cy="50" r="49" fill="url(#${id}b)"/>
    <circle cx="50" cy="50" r="43.5" fill="#1a130b"/>
    <circle cx="50" cy="50" r="42" fill="url(#${id}f)"/>
    <path d="${arc(needleAngle(cap, max), needleAngle(max, max), 36)}" stroke="#9e2b25" stroke-width="7" fill="none" opacity=".9"/>
    <path d="${arc(needleAngle(0, max), needleAngle(cap, max), 37.5)}" stroke="#4a3a22" stroke-width="3" fill="none"/>
    ${ticks.join("")}${nums}
    <g class="gz-needle" style="transform: rotate(${f1(from)}deg)">
      <path d="M48.3,54 L50,16 L51.7,54 Z" fill="#ff5a3c" stroke="#3a0e08" stroke-width=".8"/>
      <circle cx="50" cy="60" r="3.2" fill="#2a1e0c"/>
    </g>
    <circle cx="50" cy="50" r="6.5" fill="url(#${id}c)" stroke="#2a1e0c" stroke-width="1"/>
    <path d="M18,40 A34,34 0 0 1 64,15 A40,40 0 0 0 22,47 Z" fill="url(#${id}g)"/>
  </svg>`;
  const needle = wrap.querySelector(".gz-needle");
  if (!sweep && from !== to) {
    // Paint at the old reading first, then let the transition carry it over.
    requestAnimationFrame(() => requestAnimationFrame(() => { needle.style.transform = `rotate(${f1(to)}deg)`; }));
  } else if (!sweep) needle.style.transform = `rotate(${f1(to)}deg)`;
  wrap.style.setProperty("--to", `${f1(to)}deg`);
  if (trend === "vent" && !reducedMotion()) {
    for (let i = 0; i < 3; i++) wrap.append(el("span", { class: "gz-steam", style: `--i:${i}` }));
    setTimeout(() => wrap.querySelectorAll(".gz-steam").forEach((s) => s.remove()), 2000);
  }
  return wrap;
}
