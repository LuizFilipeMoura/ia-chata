// Player settings, remembered per browser. Everything has a safe default, and
// storage failures (private mode) just mean defaults every time.
const DEFAULTS = { nameplates: true, barks: true, edgePan: true, volume: 0.5, speed: 1, dangerPreview: true, wires: true, followCam: true, diceTray: true, threat: false };
const KEY = "oi3d-settings";
let cur = { ...DEFAULTS };
try { cur = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch {}
const subs = new Set();

export const settings = {
  get: (k) => cur[k],
  set(k, v) {
    cur[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch {}
    subs.forEach((f) => f(k, v));
  },
  on(f) { subs.add(f); return () => subs.delete(f); },
};
