import * as THREE from 'three';
import colorUrl from '../assets/materials/painted-steel/Diffuse.jpg';
import normalUrl from '../assets/materials/painted-steel/nor_gl.jpg';
import armUrl from '../assets/materials/painted-steel/arm.jpg';

import steelColor from '../assets/materials/gunmetal/Color.jpg';
import steelNormal from '../assets/materials/gunmetal/NormalGL.jpg';
import steelRoughness from '../assets/materials/gunmetal/Roughness.jpg';
import steelMetalness from '../assets/materials/gunmetal/Metalness.jpg';
import brassColor from '../assets/materials/brass/Color.jpg';
import brassNormal from '../assets/materials/brass/NormalGL.jpg';
import brassRoughness from '../assets/materials/brass/Roughness.jpg';
import brassMetalness from '../assets/materials/brass/Metalness.jpg';
import rubberColor from '../assets/materials/rubber/Color.jpg';
import rubberNormal from '../assets/materials/rubber/NormalGL.jpg';
import rubberRoughness from '../assets/materials/rubber/Roughness.jpg';
import glassColor from '../assets/materials/glass/Color.jpg';
import glassNormal from '../assets/materials/glass/NormalGL.jpg';
import glassRoughness from '../assets/materials/glass/Roughness.jpg';
import fabricColor from '../assets/materials/fabric/Color.jpg';
import fabricNormal from '../assets/materials/fabric/NormalGL.jpg';
import fabricRoughness from '../assets/materials/fabric/Roughness.jpg';

// Separate source assets, not five recolorings of the armor image.
export const MATERIAL_TEXTURES = {
  armor: { label: 'Armor', finish: 'Chipped paint', asset: 'blue_metal_plate', resolution: '2K',
    source: 'https://polyhaven.com/a/blue_metal_plate', credit: 'Rob Tuytel / Poly Haven', packed: true,
    maps: { color: colorUrl, normal: normalUrl, roughness: armUrl, metalness: armUrl } },
  gunmetal: { label: 'Gunmetal', finish: 'Brushed steel', asset: 'Metal009', resolution: '1K',
    source: 'https://ambientcg.com/a/Metal009', credit: 'ambientCG',
    maps: { color: steelColor, normal: steelNormal, roughness: steelRoughness, metalness: steelMetalness } },
  brass: { label: 'Brass', finish: 'Tarnished alloy', asset: 'Metal048C', resolution: '1K',
    source: 'https://ambientcg.com/a/Metal048C', credit: 'ambientCG · gold-alloy maps tinted to brass',
    maps: { color: brassColor, normal: brassNormal, roughness: brassRoughness, metalness: brassMetalness } },
  rubber: { label: 'Rubber', finish: 'Granular rubber', asset: 'Rubber004', resolution: '1K',
    source: 'https://ambientcg.com/a/Rubber004', credit: 'ambientCG',
    maps: { color: rubberColor, normal: rubberNormal, roughness: rubberRoughness } },
  glass: { label: 'Glass', finish: 'Smoked / smeared', asset: 'Smear002', resolution: '1K',
    source: 'https://ambientcg.com/a/Smear002', credit: 'ambientCG · smears on smoked glazing',
    maps: { color: glassColor, normal: glassNormal, roughness: glassRoughness } },
  fabric: { label: 'Canvas', finish: 'Woven cloth', asset: 'Fabric030', resolution: '1K',
    source: 'https://ambientcg.com/a/Fabric030', credit: 'ambientCG',
    maps: { color: fabricColor, normal: fabricNormal, roughness: fabricRoughness } },
};

export async function loadMaterialTextures(renderer) {
  const loader = new THREE.TextureLoader();
  const cache = new Map();
  const load = (key, url, asset) => {
    if (cache.has(url)) return cache.get(url);
    const promise = loader.loadAsync(url).then((texture) => {
      texture.name = `${asset}:${key}`;
      texture.colorSpace = key === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate = true;
      return texture;
    });
    cache.set(url, promise); return promise;
  };
  const loaded = await Promise.all(Object.entries(MATERIAL_TEXTURES).map(async ([family, definition]) => {
    const textures = await Promise.all(Object.entries(definition.maps).map(async ([key, url]) => [key, await load(key, url, definition.asset)]));
    return [family, { ...Object.fromEntries(textures), packed: !!definition.packed }];
  }));
  return Object.fromEntries(loaded);
}
