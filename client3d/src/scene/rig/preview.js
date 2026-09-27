// Dev Room part previews: build a body that uses the part, then hide every
// mesh that is not that part and recentre what is left on the origin.
import { THREE } from "./kit.js";
import { RECIPES, FALLBACK } from "./recipes.js";
import { TORSOS, HEADS, BACKPACKS, LEGS, FEET, SHOULDERS, SIGNATURES } from "./parts.js";
import { buildRigBody } from "./body.js";
import { skinMaterials } from "./skins.js";

export const PART_KINDS = {
  torso: Object.keys(TORSOS),
  head: Object.keys(HEADS).filter((h) => h !== "none"),
  backpack: Object.keys(BACKPACKS),
  legs: Object.keys(LEGS),
  feet: Object.keys(FEET),
  shoulders: Object.keys(SHOULDERS),
  signature: Object.keys(SIGNATURES),
};
const MEDIUM_LEGS = new Set(["pillar", "elephantDrum", "crabKnee"]);
const MEDIUM_CODENAMES = new Set(["Copper", "Black", "Red", "Silver", "Brass", "Ivory", "Jade"]);

// Who wears it (codenames), for the card.
export function partUsers(kind, name) {
  return Object.entries(RECIPES).filter(([, r]) => r[kind] === name).map(([n]) => n);
}

export function partPreview(kind, name, paintColor = 0x8a7a5a) {
  const owner = Object.entries(RECIPES).find(([, r]) => r[kind] === name);
  const cls = kind === "legs" ? (MEDIUM_LEGS.has(name) ? "medium" : "light") : owner && MEDIUM_CODENAMES.has(owner[0]) ? "medium" : "light";
  const recipe = owner ? owner[1] : { ...FALLBACK[cls], [kind]: name };
  const glass = new THREE.MeshStandardMaterial({ color: 0xffcf7a, emissive: 0xc06a18, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.15 });
  const vent = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xff3300, emissiveIntensity: 0.3, metalness: 0.7, roughness: 0.4 });
  const built = buildRigBody({ cls, recipe, mats: skinMaterials("factory", { color: paintColor, trim: recipe.trim }), glass, vent });
  const holder = new THREE.Group(); holder.add(built.pelvis);
  // Legs preview both legs; feet one; everything else as tagged.
  built.pelvis.traverse((o) => { if (o.isMesh) o.visible = o.userData.part === kind; });
  if (kind === "feet") built.legs[1].hip.traverse((o) => { if (o.isMesh) o.visible = false; });
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  holder.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
  });
  const wrap = new THREE.Group(); wrap.add(holder);
  if (!box.isEmpty()) holder.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  const size = box.isEmpty() ? 1 : Math.max(...box.getSize(v).toArray());
  wrap.scale.setScalar(Math.min(1.4, 1.2 / Math.max(0.2, size)));
  return { group: wrap, cls, users: partUsers(kind, name) };
}
