"use client";

/**
 * A Cube Pet with its scarf (v20), shared by the cast, the character picker
 * and the portrait renderer. Normalised per species on the `static` clip:
 * 1.0 m tall, feet on y 0, centred, facing +Z. The scarf is procedural: a
 * square band of four boxes round the body cube at the species' seam height
 * plus a tail at the front left, parented to the node that carries the body
 * in the clips, so it follows every move.
 */
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadGLTF } from "./assets";
import { petUrl, scarfY, type Species } from "./pets";

export interface SpeciesInfo { scale: number; offset: THREE.Vector3; body: { w: number; d: number; cx: number; cz: number; y0: number; y1: number } }
const infoCache = new Map<Species, SpeciesInfo>();
const scarfMats = new Map<string, THREE.MeshStandardMaterial>();
export const scarfMat = (c: string) => { let m = scarfMats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0 }); scarfMats.set(c, m); } return m; };
const box = new THREE.BoxGeometry(1, 1, 1);

export function applyStatic(scene: THREE.Object3D, clips: THREE.AnimationClip[]): void {
  const st = clips.find((c) => c.name === "static") ?? clips.find((c) => c.name === "idle");
  if (!st) return;
  const mx = new THREE.AnimationMixer(scene);
  mx.clipAction(st).play();
  mx.update(0);
  mx.stopAllAction();
}

export function measure(species: Species, g: GLTF): SpeciesInfo {
  const hit = infoCache.get(species);
  if (hit) return hit;
  const s = g.scene.clone(true);
  applyStatic(s, g.animations);
  s.updateMatrixWorld(true);
  const all = new THREE.Box3().setFromObject(s, true);
  const size = all.getSize(new THREE.Vector3());
  const scale = 1 / Math.max(1e-6, size.y);
  const offset = new THREE.Vector3(-(all.min.x + all.max.x) / 2, -all.min.y, -(all.min.z + all.max.z) / 2);
  const body = s.getObjectByName("body");
  const bb = new THREE.Box3();
  body?.children.forEach((c) => { if ((c as THREE.Mesh).isMesh) bb.expandByObject(c, true); });
  if (bb.isEmpty()) bb.copy(all);
  // the band hugs the body's cross-section at the seam, not its widest point (ears, cheeks, wings)
  // the band hugs the body cube at the seam: cast rays at that height from the sides and the back
  const meshes = (body?.children ?? []).filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
  if (meshes.length) {
    const seamRaw = all.min.y + scarfY(species) * size.y;
    const c0 = bb.getCenter(new THREE.Vector3());
    const far = Math.max(size.x, size.z) * 2;
    const ray = new THREE.Raycaster();
    const hit = (from: THREE.Vector3, dir: THREE.Vector3): THREE.Vector3 | null => {
      ray.set(from, dir); ray.far = far * 2;
      return ray.intersectObjects(meshes, false)[0]?.point ?? null;
    };
    const left = hit(new THREE.Vector3(c0.x - far, seamRaw, c0.z), new THREE.Vector3(1, 0, 0));
    const right = hit(new THREE.Vector3(c0.x + far, seamRaw, c0.z), new THREE.Vector3(-1, 0, 0));
    const back = hit(new THREE.Vector3(c0.x, seamRaw, c0.z - far), new THREE.Vector3(0, 0, 1));
    if (left && right && back) {
      const w = right.x - left.x;
      bb.min.x = left.x; bb.max.x = right.x;
      bb.min.z = back.z; bb.max.z = Math.min(bb.max.z, back.z + w * 1.02);
    }
  }
  const info: SpeciesInfo = {
    scale, offset,
    body: { w: (bb.max.x - bb.min.x) * scale, d: (bb.max.z - bb.min.z) * scale, cx: ((bb.min.x + bb.max.x) / 2 + offset.x) * scale, cz: ((bb.min.z + bb.max.z) / 2 + offset.z) * scale, y0: (bb.min.y + offset.y) * scale, y1: (bb.max.y + offset.y) * scale },
  };
  infoCache.set(species, info);
  return info;
}

/** The scarf, in metres in the character's frame. */
export function buildScarf(info: SpeciesInfo, species: Species, color: string, shadows = true): THREE.Group {
  const g = new THREE.Group();
  const m = scarfMat(color);
  const { w, d, cx, cz, y0, y1 } = info.body;
  const y = Math.min(y1 - 0.06, Math.max(y0 + 0.05, scarfY(species)));
  const W = w + 0.04, D = d + 0.04, t = 0.06, h = 0.09;
  const add = (sx: number, sy: number, sz: number, x: number, yy: number, z: number, rz = 0) => {
    const mesh = new THREE.Mesh(box, m);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, yy, z);
    mesh.rotation.z = rz;
    mesh.castShadow = shadows;
    g.add(mesh);
  };
  add(W, h, t, cx, y, cz + D / 2 - t / 2);
  add(W, h, t, cx, y, cz - D / 2 + t / 2);
  add(t, h, D, cx + W / 2 - t / 2, y, cz);
  add(t, h, D, cx - W / 2 + t / 2, y, cz);
  add(0.08, 0.22, 0.03, cx + W * 0.26, y - 0.13, cz + D / 2 + 0.005, THREE.MathUtils.degToRad(20));
  return g;
}

export type Clip = "idle" | "walk" | "dance" | "gesture-positive" | "static";

export interface CharacterHandle {
  root: THREE.Group;
  body: THREE.Group;
  play(name: Clip, once?: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

/** Builds one character (a plain clone: Cube Pets animate nodes, not skins). */
export async function buildCharacter(species: Species, scarf: string, seedKey: string, opts: { shadows?: boolean; idlePhase?: number; idlePace?: number } = {}): Promise<CharacterHandle> {
  const g = await loadGLTF(petUrl(species));
  const info = measure(species, g);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const scene = g.scene.clone(true);
  const wrap = new THREE.Group();
  scene.position.copy(info.offset);
  wrap.add(scene);
  wrap.scale.setScalar(info.scale);
  body.add(wrap);
  applyStatic(scene, g.animations);
  root.updateMatrixWorld(true);
  const sc = buildScarf(info, species, scarf, opts.shadows ?? true);
  body.add(sc);
  sc.updateMatrixWorld(true);
  const bodyNode = scene.getObjectByName("body");
  if (bodyNode) bodyNode.attach(sc);
  scene.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) mm.castShadow = opts.shadows ?? true; });
  const mixer = new THREE.AnimationMixer(scene);
  const actions: Partial<Record<string, THREE.AnimationAction>> = {};
  for (const c of g.animations) actions[c.name] = mixer.clipAction(c);
  let current: THREE.AnimationAction | null = null;
  const play = (name: Clip, once = false) => {
    const a = actions[name];
    if (!a) return;
    if (current && current !== a) current.fadeOut(0.2);
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.fadeIn(0.2).play();
    current = a;
    if (once) {
      const done = (e: { action: THREE.AnimationAction }) => { if (e.action === a) { mixer.removeEventListener("finished", done as never); play("idle"); } };
      mixer.addEventListener("finished", done as never);
    }
  };
  const idle = actions.idle;
  if (idle) {
    idle.timeScale = opts.idlePace ?? 1;
    idle.play();
    idle.time = (opts.idlePhase ?? 0) * idle.getClip().duration;
    current = idle;
  }
  void seedKey;
  return {
    root, body, play,
    update: (dt) => mixer.update(dt),
    dispose: () => { mixer.stopAllAction(); root.removeFromParent(); },
  };
}
