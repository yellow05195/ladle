"use client";

/**
 * The crowd renderer (v21): every character of the hall in one draw call.
 *
 * The Kenney Cube Pets are rigid parts (body, legs, tail, wings) moved by
 * node animation, and all twelve species share one colormap. So each
 * species' parts and the scarf box go into ONE THREE.BatchedMesh; a
 * character is a handful of batch instances (its parts + the five scarf
 * pieces), and its clips are baked once per species: for every frame (60
 * per second of clip) the matrix of every part in the character's frame.
 * Each frame a character costs one matrix product per part, no mixer, no
 * scene graph. The scarf is the same unit box, its UVs on a white texel of
 * the colormap, tinted per instance with the player's identity colour.
 *
 * Two batches: the stage (casts shadows on the high tier) and the stands
 * (no shadows, per-instance frustum culling, animated at a lower rate).
 */
import * as THREE from "three";
import { loadGLTF } from "./assets";
import { applyStatic, buildScarf, measure } from "./character";
import { petUrl, type Species } from "./pets";

export type CrowdClip = "idle" | "walk" | "static";
const CLIPS: CrowdClip[] = ["idle", "walk", "static"];
const FPS = 60;
/** a white block of the shared colormap (flipY false): the scarf's UV */
const WHITE_UV: [number, number] = [0.15625, 0.71875];
const SCARF_PIECES = 5;

export interface SpeciesBake {
  species: Species;
  /** part geometries (float attributes: position, normal, uv), in mesh-local space */
  geos: THREE.BufferGeometry[];
  /** the colormap (shared by all species) */
  map: THREE.Texture | null;
  clips: Record<CrowdClip, { frames: number; dur: number; data: Float32Array }>;
  /** parts + scarf pieces */
  slots: number;
}

let scarfBox: THREE.BufferGeometry | null = null;
function scarfGeometry(): THREE.BufferGeometry {
  if (scarfBox) return scarfBox;
  const b = new THREE.BoxGeometry(1, 1, 1);
  const g = floatGeometry(b);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, WHITE_UV[0], WHITE_UV[1]);
  b.dispose();
  scarfBox = g;
  return g;
}

/** The same geometry with plain float attributes (the models are quantized; a batch needs one layout). */
function floatGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const P = src.attributes.position!, N = src.attributes.normal, U = src.attributes.uv;
  const n = P.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    pos[i * 3] = P.getX(i); pos[i * 3 + 1] = P.getY(i); pos[i * 3 + 2] = P.getZ(i);
    if (N) { v.set(N.getX(i), N.getY(i), N.getZ(i)).normalize(); nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z; }
    if (U) { uv[i * 2] = U.getX(i); uv[i * 2 + 1] = U.getY(i); }
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  if (src.index) g.setIndex(Array.from(src.index.array as ArrayLike<number>));
  else { const idx: number[] = []; for (let i = 0; i < n; i++) idx.push(i); g.setIndex(idx); }
  if (!N) g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const bakes = new Map<Species, Promise<SpeciesBake>>();

/** Bakes a species once (cached): its parts and its clips as matrices. */
export function bakeSpecies(species: Species): Promise<SpeciesBake> {
  let p = bakes.get(species);
  if (!p) {
    p = loadGLTF(petUrl(species)).then((g) => {
      const info = measure(species, g);
      const scene = g.scene.clone(true);
      const root = new THREE.Group();
      const wrap = new THREE.Group();
      scene.position.copy(info.offset);
      wrap.add(scene);
      wrap.scale.setScalar(info.scale);
      root.add(wrap);
      const meshes: THREE.Mesh[] = [];
      scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
      const map = ((meshes[0]?.material as THREE.MeshStandardMaterial | undefined)?.map) ?? null;
      const bodyNode = scene.getObjectByName("body") ?? scene;
      applyStatic(scene, g.animations);
      root.updateMatrixWorld(true);
      // the scarf in the body's frame (it rides the body node, as in character.ts)
      const scarf = buildScarf(info, species, "#ffffff", false);
      scarf.updateMatrixWorld(true);
      const bodyInv = bodyNode.matrixWorld.clone().invert();
      const scarfLocal = scarf.children.slice(0, SCARF_PIECES).map((c) => bodyInv.clone().multiply(c.matrixWorld));
      const P = meshes.length, S = P + SCARF_PIECES;
      const tmp = new THREE.Matrix4();
      const clips = {} as SpeciesBake["clips"];
      for (const name of CLIPS) {
        const clip = g.animations.find((c) => c.name === name) ?? g.animations.find((c) => c.name === "idle");
        const dur = clip ? Math.max(clip.duration, 1 / FPS) : 1 / FPS;
        const frames = name === "static" ? 1 : Math.max(1, Math.round(dur * FPS));
        const data = new Float32Array(frames * S * 16);
        const mixer = new THREE.AnimationMixer(scene);
        if (clip) mixer.clipAction(clip).play();
        for (let f = 0; f < frames; f++) {
          mixer.setTime(f / FPS);
          root.updateMatrixWorld(true);
          for (let k = 0; k < P; k++) meshes[k]!.matrixWorld.toArray(data, (f * S + k) * 16);
          for (let k = 0; k < SCARF_PIECES; k++) tmp.multiplyMatrices(bodyNode.matrixWorld, scarfLocal[k]!).toArray(data, (f * S + P + k) * 16);
        }
        mixer.stopAllAction();
        mixer.uncacheRoot(scene);
        clips[name] = { frames, dur, data };
      }
      scarf.clear();
      return { species, geos: meshes.map((m) => floatGeometry(m.geometry)), map, clips, slots: S };
    });
    p.catch(() => bakes.delete(species));
    bakes.set(species, p);
  }
  return p;
}

/** The crowd's material: the colormap, matte; per-instance colour (white for the pets, the scarf's colour for its pieces). */
export function crowdMaterial(map: THREE.Texture | null): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, envMapIntensity: 1 });
}

const WHITE = new THREE.Color("#ffffff");
const mA = new THREE.Matrix4();
const mB = new THREE.Matrix4();
const mOut = new THREE.Matrix4();
const qA = new THREE.Quaternion();
const eA = new THREE.Euler();
const vA = new THREE.Vector3();
const sA = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** One character in a batch. */
export interface Figure {
  bake: SpeciesBake;
  ids: number[];
  color: string;
}

/** Pose of a character this frame. */
export interface FigurePose {
  x: number; y: number; z: number;
  yaw: number;
  /** squash (catch): x/z and y scale on top of the character scale */
  sx: number; sy: number;
  /** the body's lift (hop) and forward tilt (look-up) */
  lift: number; tilt: number;
  scale: number;
  clip: CrowdClip; time: number;
  /** cross-fade from a previous clip (0 … 1, 1 = all `clip`) */
  from?: CrowdClip; fromTime?: number; blend?: number;
}

export class CrowdBatch {
  readonly mesh: THREE.BatchedMesh;
  private geoIds = new Map<Species, number[]>();
  private scarfId = -1;
  private cap: number;

  constructor(maxInstances: number, material: THREE.Material, opts: { shadows: boolean; cull: boolean }) {
    this.cap = maxInstances;
    this.mesh = new THREE.BatchedMesh(maxInstances, 12_500, 24_000, material);
    this.mesh.sortObjects = false;
    this.mesh.perObjectFrustumCulled = opts.cull;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = opts.shadows;
    this.mesh.receiveShadow = false;
  }

  private ensure(b: SpeciesBake): number[] {
    let ids = this.geoIds.get(b.species);
    if (!ids) {
      ids = b.geos.map((g) => this.mesh.addGeometry(g));
      this.geoIds.set(b.species, ids);
    }
    if (this.scarfId < 0) this.scarfId = this.mesh.addGeometry(scarfGeometry());
    return ids;
  }

  get free(): number { return this.cap - this.mesh.instanceCount; }

  add(b: SpeciesBake, scarf: string): Figure | null {
    if (this.free < b.slots) return null;
    const geo = this.ensure(b);
    const ids: number[] = [];
    const col = new THREE.Color(scarf);
    for (const g of geo) { const id = this.mesh.addInstance(g); this.mesh.setColorAt(id, WHITE); this.mesh.setMatrixAt(id, HIDDEN); ids.push(id); }
    for (let k = 0; k < SCARF_PIECES; k++) { const id = this.mesh.addInstance(this.scarfId); this.mesh.setColorAt(id, col); this.mesh.setMatrixAt(id, HIDDEN); ids.push(id); }
    return { bake: b, ids, color: scarf };
  }

  remove(f: Figure): void {
    for (const id of f.ids) this.mesh.deleteInstance(id);
    f.ids.length = 0;
  }

  hide(f: Figure): void { for (const id of f.ids) this.mesh.setMatrixAt(id, HIDDEN); }

  /** Writes a character's instances for this frame. */
  pose(f: Figure, p: FigurePose): void {
    const b = f.bake;
    // the character's frame: root (position, yaw, scale and squash), then the body (lift, tilt)
    qA.setFromEuler(eA.set(0, p.yaw, 0));
    mA.compose(vA.set(p.x, p.y, p.z), qA, sA.set(p.scale * p.sx, p.scale * p.sy, p.scale * p.sx));
    if (p.lift !== 0 || p.tilt !== 0) {
      qA.setFromEuler(eA.set(p.tilt, 0, 0));
      mB.compose(vA.set(0, p.lift / p.scale, 0), qA, sA.set(1, 1, 1));
      mA.multiply(mB);
    }
    const A = sample(b, p.clip, p.time);
    const blend = p.from && p.blend !== undefined && p.blend < 1 ? p.blend : 1;
    const B = blend < 1 ? sample(b, p.from!, p.fromTime ?? 0) : null;
    const S = b.slots;
    const e = mB.elements;
    for (let k = 0; k < S; k++) {
      const o = k * 16;
      if (B) {
        for (let j = 0; j < 16; j++) {
          const a = lerpFrame(A, o + j), c = lerpFrame(B, o + j);
          e[j] = c + (a - c) * blend;
        }
      } else {
        for (let j = 0; j < 16; j++) e[j] = lerpFrame(A, o + j);
      }
      mOut.multiplyMatrices(mA, mB);
      this.mesh.setMatrixAt(f.ids[k]!, mOut);
    }
  }

  dispose(): void { this.mesh.dispose(); }
}

interface Sample { d: Float32Array; o0: number; o1: number; u: number }
const sA0: Sample = { d: new Float32Array(0), o0: 0, o1: 0, u: 0 };
const sB0: Sample = { d: new Float32Array(0), o0: 0, o1: 0, u: 0 };
let flip = false;
function sample(b: SpeciesBake, clip: CrowdClip, time: number): Sample {
  const c = b.clips[clip];
  const s = (flip = !flip) ? sA0 : sB0;
  s.d = c.data;
  if (c.frames <= 1) { s.o0 = 0; s.o1 = 0; s.u = 0; return s; }
  const f = (((time / c.dur) % 1) + 1) % 1 * c.frames;
  const f0 = Math.floor(f) % c.frames, f1 = (f0 + 1) % c.frames;
  s.o0 = f0 * b.slots * 16; s.o1 = f1 * b.slots * 16; s.u = f - Math.floor(f);
  return s;
}
function lerpFrame(s: Sample, k: number): number {
  const a = s.d[s.o0 + k]!;
  return s.u === 0 ? a : a + (s.d[s.o1 + k]! - a) * s.u;
}

/** A soft round contact shadow under every character: one instanced draw. */
export function blobShadows(max: number): THREE.InstancedMesh {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(0.6, "rgba(0,0,0,0.25)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.count = 0;
  m.frustumCulled = false;
  m.renderOrder = 1;
  return m;
}
