import * as THREE from 'three';
import colorUrl from '../assets/materials/painted-steel/Diffuse.jpg';
import normalUrl from '../assets/materials/painted-steel/nor_gl.jpg';
import armUrl from '../assets/materials/painted-steel/arm.jpg';

export const MATERIAL_ASSET = 'blue_metal_plate';
export const MATERIAL_MAP_URLS = { color: colorUrl, normal: normalUrl, arm: armUrl };

export async function loadMaterialTextures(renderer) {
  const loader = new THREE.TextureLoader();
  const loaded = await Promise.all(Object.entries(MATERIAL_MAP_URLS).map(async ([key, url]) => {
    const texture = await loader.loadAsync(url);
    texture.name = `${MATERIAL_ASSET}:${key}`;
    texture.colorSpace = key === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return [key, texture];
  }));
  return Object.fromEntries(loaded);
}
