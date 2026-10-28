"use client";

/**
 * Asset loading for the hall (v20): one GLTFLoader with the meshopt decoder
 * (every model is meshopt + KHR_mesh_quantization + WebP textures), a promise
 * cache per URL, and the few recolouring helpers the room needs. Models are
 * loaded on demand; the loader counts the ones it waits for.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

let loader: GLTFLoader | null = null;
const cache = new Map<string, Promise<GLTF>>();
const texCache = new Map<string, Promise<THREE.Texture>>();

function gltfLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

export const M = (p: string) => `/assets/models/${p}`;

export function loadGLTF(url: string): Promise<GLTF> {
  let p = cache.get(url);
  if (!p) {
    p = gltfLoader().loadAsync(url);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

export function peekGLTF(url: string): boolean { return cache.has(url); }

export function loadTexture(url: string, srgb = true, repeat = 1): Promise<THREE.Texture> {
  const key = `${url}|${srgb}|${repeat}`;
  let p = texCache.get(key);
  if (!p) {
    p = new THREE.TextureLoader().loadAsync(url).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 4;
      return t;
    });
    texCache.set(key, p);
  }
  return p;
}

/** Every mesh of a scene, with its material(s) cloned so a tint never leaks into another instance. */
export function eachMesh(root: THREE.Object3D, fn: (m: THREE.Mesh, mat: THREE.MeshStandardMaterial, i: number) => void): void {
  let i = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const cloned = mats.map((x) => x.clone());
    m.material = Array.isArray(m.material) ? cloned : cloned[0]!;
    cloned.forEach((mat) => fn(m, mat as THREE.MeshStandardMaterial, i++));
  });
}

/** Recolours a model: every material takes `color` (its map is dropped), keeping its own roughness. */
export function tint(root: THREE.Object3D, color: string, opts: { roughness?: number; metalness?: number; keepMap?: boolean; normalMap?: THREE.Texture | null } = {}): void {
  eachMesh(root, (_m, mat) => {
    mat.color = new THREE.Color(color);
    if (!opts.keepMap) mat.map = null;
    if (opts.roughness !== undefined) mat.roughness = opts.roughness;
    if (opts.metalness !== undefined) mat.metalness = opts.metalness;
    if (opts.normalMap !== undefined) mat.normalMap = opts.normalMap;
    mat.needsUpdate = true;
  });
}

/** Scales a model so that its bounding box is `size` tall (or wide), feet on y = 0, centred in x/z. Returns a wrapper group. */
export function normalise(root: THREE.Object3D, size: number, axis: "y" | "x" = "y"): THREE.Group {
  const g = new THREE.Group();
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const dims = box.getSize(new THREE.Vector3());
  const s = size / Math.max(1e-6, axis === "y" ? dims.y : dims.x);
  const c = box.getCenter(new THREE.Vector3());
  root.position.set(-c.x, -box.min.y, -c.z);
  const inner = new THREE.Group();
  inner.add(root);
  inner.scale.setScalar(s);
  g.add(inner);
  return g;
}

export function castShadows(root: THREE.Object3D, cast = true, receive = false): void {
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } });
}

export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((x) => x.dispose());
  });
}
