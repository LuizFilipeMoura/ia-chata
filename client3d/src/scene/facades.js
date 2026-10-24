// Facade dressing on the table's buildings, per theme (`theme.dress`):
// propaganda posters pasted on the walls (defaced when their side falls
// behind), warm deco neon signs, racks of glowing whale-oil canisters at the
// foot of a wall, and on the layered themes a lit gilded band up high over
// dark pipe clutter down low. Visual only: every piece sits flat on a wall the
// building already has (found by a ray, so eaves and setbacks don't leave it
// floating), and a piece that would poke out of the building's slot is
// dropped (rig/envelope.js SET_ENVELOPE).
import * as THREE from "three";
import { std, glow, shadow, V } from "./dress-kit.js";
import { dressRandom } from "./themes.js";
import { pickPoster, drawPoster, GRAFFITI } from "../propaganda.js";
import { SET_ENVELOPE } from "./rig/envelope.js";

const hasDOM = typeof document !== "undefined";
const OVERHANG = SET_ENVELOPE.building.overhang - 0.05;

// A canvas texture of any aspect, or null headless (node tests).
export function paintTexture(w, h, draw) {
  if (!hasDOM) return null;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Stable per-piece seed from the battle's dressing seed and the rect.
function pieceSeed(ctx, t, salt = 0) {
  let h = ((ctx.seed ?? 0) >>> 0) ^ 0x811c9dc5 ^ salt;
  for (const v of [Math.round((t.x || 0) * 10), Math.round((t.y || 0) * 10), Math.round((t.w || 0) * 10)]) { h ^= v; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Cast horizontally at height y toward the building from one of its four
// sides; returns { point, normal } on a vertical wall, or null.
const ray = new THREE.Raycaster();
function wallHit(g, box, side, y, along = 0) {
  const c = box.getCenter(V(0, 0, 0)), size = box.getSize(V(0, 0, 0));
  const dirs = [V(0, 0, -1), V(0, 0, 1), V(-1, 0, 0), V(1, 0, 0)];
  const d = dirs[side];
  const from = V(c.x - d.x * (size.x / 2 + 2) + (d.z ? along * size.x * 0.5 : 0), y, c.z - d.z * (size.z / 2 + 2) + (d.x ? along * size.z * 0.5 : 0));
  ray.set(from, d); ray.far = Math.max(size.x, size.z) + 4;
  const hit = ray.intersectObject(g, true).find((h) => h.face && !h.object.userData.facade);
  if (!hit) return null;
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  if (Math.abs(n.y) > 0.2 || n.dot(d) > -0.7) return null;
  n.y = 0; n.normalize();
  return { point: hit.point, normal: n };
}
// Stand `o` on the wall at `hit`, facing out, `off` in front of it.
function mount(o, hit, off = 0.03) {
  o.position.copy(hit.point).addScaledVector(hit.normal, off);
  o.rotation.y = Math.atan2(hit.normal.x, hit.normal.z);
  o.userData.facade = true;
  o.traverse((m) => { m.userData.facade = true; });
  return o;
}
// Keep a piece only if it stays inside the building's slot.
function fitsSlot(o, t) {
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  return b.min.x >= -t.w / 2 - OVERHANG && b.max.x <= t.w / 2 + OVERHANG && b.min.z >= -t.h / 2 - OVERHANG && b.max.z <= t.h / 2 + OVERHANG && b.max.y <= SET_ENVELOPE.building.height() - 0.05 && b.min.y >= -0.01;
}

// ---- Posters ----
const POSTER_GEO = new THREE.PlaneGeometry(0.8, 1.2);
function posterMat(p) {
  const tex = paintTexture(256, 384, (g, w, h) => drawPoster(g, p.id, w, h, { slogan: p.slogan, seed: p.seed, graffiti: p.graffiti, aged: p.aged }));
  return new THREE.MeshStandardMaterial({ map: tex, color: tex ? 0xffffff : 0xb8a888, roughness: 0.95 });
}
function poster(ctx, seed, side) {
  const r = dressRandom(seed);
  const { id, slogan } = pickPoster(seed);
  const p = { id, slogan, seed, side, aged: 0.3 + r() * 0.6, graffiti: null };
  const mesh = new THREE.Mesh(POSTER_GEO, posterMat(p)); mesh.receiveShadow = true;
  mesh.rotation.z = (r() - 0.5) * 0.08;
  p.mesh = mesh;
  (ctx.posters ||= []).push(p);
  // Morale: posters of the side that's losing by 3+ VP get daubed over.
  ctx.setMorale ||= (vps) => {
    const lead = (vps?.[0] ?? 0) - (vps?.[1] ?? 0);
    const losing = lead >= 3 ? "b" : lead <= -3 ? "a" : null;
    for (const q of ctx.posters || []) {
      const want = q.side === losing ? GRAFFITI[q.seed % GRAFFITI.length] : null;
      if (want === q.graffiti) continue;
      q.graffiti = want;
      const old = q.mesh.material; q.mesh.material = posterMat(q); old.map?.dispose(); old.dispose();
    }
  };
  return mesh;
}

// ---- Deco neon signs: warm and dim, never white-hot ----
const NEON_WORDS = ["HOTEL", "BAR", "GRAND", "CINEMA", "FATHOM", "OIL & IRON", "DANCE", "RADIO", "CAFE", "LOUNGE"];
const NEON_COLS = [0xffa040, 0xff7a4a, 0xffc070, 0xff8a5a];
function neonSign(ctx, r, vertical) {
  const word = NEON_WORDS[Math.floor(r() * NEON_WORDS.length)], col = NEON_COLS[Math.floor(r() * NEON_COLS.length)];
  const [w, h] = vertical ? [0.5, 1.9] : [Math.min(2.2, 0.36 * word.length + 0.4), 0.55];
  const tex = paintTexture(vertical ? 64 : 256, vertical ? 256 : 64, (g, W, H) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#fff"; g.lineWidth = 3; g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
    if (vertical) {
      const n = word.replace(/ /g, "").length, step = (H - 24) / n;
      g.font = `700 ${Math.floor(Math.min(W * 0.7, step * 0.9))}px Oswald, "Arial Narrow", sans-serif`;
      [...word.replace(/ /g, "")].forEach((ch, i) => g.fillText(ch, W / 2, 12 + step * (i + 0.5)));
    } else {
      g.font = `700 ${Math.floor(H * 0.58)}px Oswald, "Arial Narrow", sans-serif`; g.fillText(word, W / 2, H / 2 + 2);
    }
  });
  const sign = new THREE.Group();
  sign.add(at(shadow(new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.08), std(0x1c1814, { metalness: 0.4 }))), 0, 0, 0.04));
  const face = new THREE.MeshStandardMaterial({ color: 0x0c0a08, emissive: col, emissiveMap: tex, emissiveIntensity: tex ? 1.1 : 0.4, roughness: 0.9 });
  sign.add(at(new THREE.Mesh(new THREE.PlaneGeometry(w, h), face), 0, 0, 0.085));
  // Now and then a tube stutters.
  const ph = r() * 20, base = face.emissiveIntensity;
  ctx.anim?.((dt, now) => { const k = (now + ph) % 11; face.emissiveIntensity = k < 0.12 || (k > 0.25 && k < 0.32) ? base * 0.25 : base; });
  return sign;
}
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

// ---- Whale-oil canisters in a rack, a dim amber glow in each window ----
const OIL = () => glow(0xffa030, 0.7);
function oilRack(ctx, r) {
  const g = new THREE.Group();
  const iron = std(0x2a2622, { metalness: 0.6 }), brass = std(0x8a6a34, { metalness: 0.6 });
  const n = 2 + Math.floor(r() * 2), W = n * 0.42 + 0.1;
  for (const y of [0.04, 0.86]) g.add(at(shadow(new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, 0.4), iron)), 0, y, 0.22));
  for (const x of [-W / 2, W / 2]) g.add(at(shadow(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), iron)), x, 0.45, 0.4));
  const oil = OIL();
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.26 + i * 0.42;
    g.add(at(shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.72, 12), brass)), x, 0.44, 0.22));
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.33), oil), x, 0.44, 0.22));
    for (const y of [0.1, 0.78]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 12), iron), x, y, 0.22));
  }
  const ph = r() * 6;
  ctx.anim?.((dt, now) => { oil.emissiveIntensity = 0.6 + 0.12 * Math.sin(now * 0.7 + ph); });
  return g;
}

// ---- Class layers: a lit gilded band high up, pipe clutter low down ----
function giltBand(ctx, width) {
  const g = new THREE.Group();
  const gold = std(0x9a7a3a, { metalness: 0.6 });
  g.add(at(shadow(new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, 0.1), gold)), 0, 0.42, 0.05));
  g.add(at(shadow(new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, 0.1), gold)), 0, -0.42, 0.05));
  g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(width * 0.94, 0.5), glow(ctx.theme.lamp, 0.55)), 0, 0, 0.02));
  const n = Math.max(2, Math.floor(width / 0.6));
  for (let i = 0; i <= n; i++) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.08), gold), -width / 2 + (i / n) * width, 0, 0.05));
  return g;
}
function pipeClutter(r, width) {
  const g = new THREE.Group();
  const pipe = std(0x3a3028, { metalness: 0.5 }), dark = std(0x1e1a16);
  for (const [y, rr] of [[0.35, 0.09], [0.62, 0.06]]) { const p = shadow(new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, width, 8), pipe)); p.rotation.z = Math.PI / 2; g.add(at(p, 0, y, rr + 0.02)); }
  const boxes = 1 + Math.floor(r() * 2);
  for (let i = 0; i < boxes; i++) g.add(at(shadow(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.22), dark)), (r() - 0.5) * width * 0.7, 0.3, 0.12));
  g.add(at(shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), pipe)), width * 0.4, 0.8, 0.07));
  return g;
}

// Dress one building `g` built for rect t (unplaced, centred).
export function dressFacade(g, t, ctx) {
  const d = ctx?.theme?.dress;
  if (!d) return g;
  const r = dressRandom(pieceSeed(ctx, t));
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  const H = box.max.y;
  const add = (o) => { if (fitsSlot(o, t)) g.add(o); };
  const sides = [0, 1, 2, 3].sort(() => r() - 0.5);
  // Posters at eye height, sometimes a pair pasted side by side.
  if (r() < d.posters) {
    const count = 1 + Math.floor(r() * 3);
    for (let i = 0; i < count; i++) {
      const hit = wallHit(g, box, sides[i % 4], 1.35 + r() * 0.3, (r() - 0.5) * 0.6);
      if (!hit) continue;
      const seed = pieceSeed(ctx, t, 101 + i);
      add(mount(poster(ctx, seed, (seed >>> 11) & 1 ? "a" : "b"), hit, 0.03));
    }
  }
  // Neon, above the posters.
  if (r() < d.neon && H > 3) {
    const vertical = H > 5 && r() < 0.5;
    const hit = wallHit(g, box, sides[0], vertical ? Math.min(H - 1.3, 3.6) : Math.min(H - 0.6, 2.7), (r() - 0.5) * 0.4);
    if (hit) add(mount(neonSign(ctx, r, vertical), hit, 0.01));
  }
  // A whale-oil rack at the foot of a wall.
  if (r() < d.oilRacks) {
    const hit = wallHit(g, box, sides[1], 0.5, (r() - 0.5) * 0.5);
    if (hit) { const rack = mount(oilRack(ctx, r), hit, 0.0); rack.position.y = 0; add(rack); }
  }
  // High and low: gilt up top, grime at the base (tall buildings only).
  if (d.layered && H > 5.5) {
    const side = sides[2], w = Math.min(2.4, (side < 2 ? box.max.x - box.min.x : box.max.z - box.min.z) * 0.6);
    const top = wallHit(g, box, side, H * 0.78);
    if (top) add(mount(giltBand(ctx, w), top, 0.02));
    const low = wallHit(g, box, side, 0.5);
    if (low) { const p = mount(pipeClutter(r, w), low, 0.0); p.position.y = 0; add(p); }
  }
  return g;
}
