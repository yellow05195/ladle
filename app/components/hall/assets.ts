"use client";

/**
 * Asset loading for the hall (v20): one GLTFLoader with the meshopt decoder
 * (every model is meshopt + KHR_mesh_quantization + WebP textures), a promise
 * cache per URL, and the few recolouring helpers the room needs. Models are
 * loaded on demand; the loader counts the ones it waits for.
 *
 * v21.4 (perf F8, F9): the room's textures are decoded off the main thread
 * (ImageBitmap, as GLTFLoader does), one decode and one upload per image
 * whatever the repeats it is used at; a model's box no longer walks every
 * vertex (each mesh's own box through its world matrix, the skinned bear's
 * bones applied once, in one pass).
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

let loader: GLTFLoader | null = null;
const cache = new Map<string, Promise<GLTF>>();
const texCache = new Map<string, Promise<THREE.Texture>>();
/** one decoded image per URL (its Source is shared by every texture made from it) */
const srcCache = new Map<string, Promise<THREE.Texture>>();

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

let bitmaps: boolean | null = null;
/** createImageBitmap with the options used here (GLTFLoader's own test: not in Safari < 17 nor Firefox < 98) */
function bitmapsOk(): boolean {
  if (bitmaps !== null) return bitmaps;
  if (typeof createImageBitmap === "undefined" || typeof navigator === "undefined") return (bitmaps = false);
  const ua = navigator.userAgent;
  const safari = /^((?!chrome|android).)*safari/i.test(ua);
  const sv = safari ? parseInt(ua.match(/Version\/(\d+)/)?.[1] ?? "-1", 10) : -1;
  const firefox = ua.includes("Firefox");
  const fv = firefox ? parseInt(ua.match(/Firefox\/([0-9]+)\./)?.[1] ?? "-1", 10) : -1;
  return (bitmaps = !((safari && sv < 17) || (firefox && fv < 98)));
}

/**
 * The decoded image of a URL, once. An ImageBitmap is decoded off the main thread and uploads in a few milliseconds (an
 * <img> was decoded on the main thread inside its first upload: 63 to 70 ms for the room's maps); WebGL ignores flipY
 * for a bitmap, so it is flipped at decode and the texture says flipY = false. The WebP maps carry no ICC profile, so no
 * colour conversion is the browser's default too (screenshots/v21/perf/tex-ab.mjs: the same frames, pixel for pixel).
 */
function loadSource(url: string): Promise<THREE.Texture> {
  let p = srcCache.get(url);
  if (!p) {
    p = bitmapsOk()
      ? new THREE.ImageBitmapLoader().setOptions({ imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" }).loadAsync(url).then((bmp) => {
          const t = new THREE.Texture(bmp);
          t.flipY = false;
          t.needsUpdate = true;
          return t;
        })
      : new THREE.TextureLoader().loadAsync(url);
    p.catch(() => srcCache.delete(url));
    srcCache.set(url, p);
  }
  return p;
}

export function loadTexture(url: string, srgb = true, repeat = 1): Promise<THREE.Texture> {
  const key = `${url}|${srgb}|${repeat}`;
  let p = texCache.get(key);
  if (!p) {
    p = loadSource(url).then((src) => {
      // a texture of its own (wrap, repeat, colour space) on the shared Source: one decode, one upload (Fabric026's
      // normals, at repeat 4 on the curtains and 10 on the felt, were decoded and uploaded twice). clone() marks the
      // Source dirty, which would upload the same pixels again: its version is put back
      const v = src.source.version;
      const t = src.clone();
      t.source.version = v;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 4;
      return t;
    });
    p.catch(() => texCache.delete(key));
    texCache.set(key, p);
  }
  return p;
}

/** a 1x1 stand-in's texel: white (a map, a roughness map) and a flat normal */
export const STUB_WHITE: [number, number, number] = [255, 255, 255];
export const STUB_NORMAL: [number, number, number] = [128, 128, 255];
/**
 * v21.3: a 1x1 stand-in for a map that loads later (HallScene's floor, the crowd's colormap): the material compiles once
 * with the map's slot and the real image only swaps in (no program change; `userData.stub` says it may be disposed then).
 */
export function stubTexture(rgb: [number, number, number], srgb: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([rgb[0], rgb[1], rgb[2], 255]), 1, 1, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.userData.stub = true;
  t.needsUpdate = true;
  return t;
}

type Deadline = { timeRemaining: () => number; didTimeout?: boolean };
/**
 * Uploads textures one per idle slot (an ImageBitmap upload is 2 to 4 ms; seven in one task were 70 ms). Resolves once
 * every one is on the GPU, or as soon as `alive()` is false.
 */
export function uploadEach(gl: THREE.WebGLRenderer, textures: Array<THREE.Texture | null | undefined>, alive: () => boolean = () => true): Promise<void> {
  const list = textures.filter((t): t is THREE.Texture => !!t);
  const w = window as unknown as { requestIdleCallback?: (f: (d: Deadline) => void, o?: { timeout: number }) => number };
  return new Promise<void>((resolve) => {
    const step = () => {
      const t = list.shift();
      if (!t || !alive()) { resolve(); return; }
      gl.initTexture(t);
      slot();
    };
    const slot = () => { if (w.requestIdleCallback) w.requestIdleCallback(step, { timeout: 500 }); else setTimeout(step, 16); };
    slot();
  });
}

/**
 * perf v21.4 (F7): a value built ahead, from its module's load, in idle slots, while the canvas mounts in its own steps
 * under the loader's still. `steps` yields between its parts and returns the value; the first mount takes it (finishing
 * whatever steps are left), later mounts build their own. Built in the mount step that needs it, the room's shell made that
 * step's commit 58 to 65 ms in development. (Strict Mode calls a memo's function twice in development: within one task
 * the same value is handed out again, not a second one built.)
 *
 * fix:1 (T3): `ready()` resolves once the value is built, the steps left then going one per task rather than waiting
 * for idle slots. A page that never goes idle (4x CPU) got none, and the mount step finished the whole build in its
 * commit (a 277 ms task); HallWorld now mounts each step after its value is ready.
 */
export function buildAhead<T>(steps: () => Generator<void, T>): (() => T) & { ready: () => Promise<void> } {
  type Job = { it: Generator<void, T>; done: { v: T } | null };
  const finish = (it: Generator<void, T>): T => { let r = it.next(); while (!r.done) r = it.next(); return r.value; };
  let job: Job | null = null;
  let taken: { v: T } | null = null;
  let waiting: Promise<void> | null = null;
  let wake = () => {};
  /** the steps from here on go one per task (ready() was asked) */
  let pressed = false;
  let press = () => {};
  if (typeof window !== "undefined") {
    const own: Job = { it: steps(), done: null };
    job = own;
    const w = window as unknown as { requestIdleCallback?: (f: (d: Deadline) => void, o?: { timeout: number }) => number };
    // `more`: whether this task may take another step (a step is a whole part of the build: a few ms at 1x)
    const advance = (more: () => boolean) => {
      if (job !== own || own.done) return;
      try {
        let r = own.it.next();
        while (!r.done && more()) r = own.it.next();
        if (r.done) { own.done = { v: r.value }; wake(); }
      } catch {
        // (a step threw: the build ahead is dropped, and the mount builds its own, throwing where it always did)
        job = null;
        wake();
      }
    };
    const run = (d: Deadline) => { advance(() => d.timeRemaining() > 8); if (job === own && !own.done && !pressed) slot(); };
    const slot = () => {
      if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 500 });
      else window.setTimeout(() => run({ timeRemaining: () => 0 }), 16);
    };
    // (a message: a task of its own, no 4 ms clamp; one step each, so a frame of the loader fits between two)
    const task = () => {
      const c = new MessageChannel();
      c.port1.onmessage = () => { c.port1.close(); advance(() => false); if (job === own && !own.done) task(); };
      c.port2.postMessage(0);
    };
    press = () => { if (pressed) return; pressed = true; task(); };
    slot();
  }
  const take = () => {
    if (taken) return taken.v;
    const j = job;
    job = null;
    const t0 = performance.now();
    const v = j ? (j.done ? j.done.v : finish(j.it)) : finish(steps());
    // (development: [when, what, how it was had, the ms the take itself cost], for the perf probes in screenshots/v21/perf)
    if (process.env.NODE_ENV !== "production") ((window as unknown as { __aheadLog?: Array<[number, string, string, number]> }).__aheadLog ??= []).push([Math.round(t0), steps.name, j ? (j.done ? "ahead" : "partly") : "built", +(performance.now() - t0).toFixed(1)]);
    taken = { v };
    queueMicrotask(() => { taken = null; });
    wake();
    return v;
  };
  const ready = (): Promise<void> => {
    if (!job || job.done) return Promise.resolve();
    if (!waiting) {
      waiting = new Promise<void>((r) => { wake = () => { wake = () => {}; r(); }; });
      press();
    }
    return waiting;
  };
  return Object.assign(take, { ready });
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

const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** A world matrix that keeps axes on axes (any scale, quarter turns): a box through it is still the exact box. */
function axisAligned(m: THREE.Matrix4): boolean {
  const e = m.elements;
  for (let c = 0; c < 3; c++) {
    const x = Math.abs(e[c * 4]!), y = Math.abs(e[c * 4 + 1]!), z = Math.abs(e[c * 4 + 2]!);
    const big = Math.max(x, y, z) * 1e-6;
    if ((x > big ? 1 : 0) + (y > big ? 1 : 0) + (z > big ? 1 : 0) !== 1) return false;
  }
  return true;
}

/**
 * The posed box of a skinned mesh (its bones as they stand), through `post` after the bind (the mesh's world matrix, or
 * nothing for its own space): SkinnedMesh.getVertexPosition's arithmetic, with each bone's matrix multiplied once rather
 * than once per vertex and influence (43 ms for the bear through Box3's precise path).
 */
export function skinnedBox(mesh: THREE.SkinnedMesh, post: THREE.Matrix4 | null, out: THREE.Box3): THREE.Box3 {
  out.makeEmpty();
  const g = mesh.geometry, sk = mesh.skeleton;
  const P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  if (!P) return out;
  if (!sk || !SI || !SW || g.morphAttributes.position) {
    // (no skin, or morphs too: the engine's own path)
    for (let i = 0; i < P.count; i++) {
      if (sk && SI && SW) mesh.getVertexPosition(i, _v); else _v.fromBufferAttribute(P, i);
      out.expandByPoint(post ? _v.applyMatrix4(post) : _v);
    }
    return out;
  }
  // per bone: bone.matrixWorld x boneInverse x bindMatrix (the vertex's bind, then the bone)
  const nb = sk.bones.length;
  const A = new Float64Array(nb * 12);
  for (let b = 0; b < nb; b++) {
    const bone = sk.bones[b], inv = sk.boneInverses[b];
    if (!bone || !inv) continue;
    const e = _m.multiplyMatrices(bone.matrixWorld, inv).multiply(mesh.bindMatrix).elements;
    A.set([e[0]!, e[1]!, e[2]!, e[4]!, e[5]!, e[6]!, e[8]!, e[9]!, e[10]!, e[12]!, e[13]!, e[14]!], b * 12);
  }
  const t = (post ? _m.copy(post).multiply(mesh.bindMatrixInverse) : _m.copy(mesh.bindMatrixInverse)).elements;
  for (let i = 0; i < P.count; i++) {
    const px = P.getX(i), py = P.getY(i), pz = P.getZ(i);
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 4; k++) {
      const wgt = SW.getComponent(i, k);
      if (wgt === 0) continue;
      const o = SI.getComponent(i, k) * 12;
      x += wgt * (A[o]! * px + A[o + 3]! * py + A[o + 6]! * pz + A[o + 9]!);
      y += wgt * (A[o + 1]! * px + A[o + 4]! * py + A[o + 7]! * pz + A[o + 10]!);
      z += wgt * (A[o + 2]! * px + A[o + 5]! * py + A[o + 8]! * pz + A[o + 11]!);
    }
    out.expandByPoint(_v.set(t[0]! * x + t[4]! * y + t[8]! * z + t[12]!, t[1]! * x + t[5]! * y + t[9]! * z + t[13]!, t[2]! * x + t[6]! * y + t[10]! * z + t[14]!));
  }
  return out;
}

/**
 * The box of a model as Box3.setFromObject(root, true) finds it, without walking every vertex: a mesh's own box through
 * a world matrix that keeps axes on axes is already exact (every prop of the room); otherwise its vertices. A skinned
 * mesh's posed bounds (box and sphere, in its own space) are kept on it, so the engine never works them out again for
 * its first frustum test (26 ms for the bear).
 */
export function boundsOf(root: THREE.Object3D, out = new THREE.Box3()): THREE.Box3 {
  out.makeEmpty();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    const g = m.geometry as THREE.BufferGeometry | undefined;
    const P = g?.getAttribute("position");
    if (!g || !P) return;
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) {
      const local = skinnedBox(sm, null, new THREE.Box3());
      sm.boundingBox = local;
      sm.boundingSphere = local.getBoundingSphere(new THREE.Sphere());
      out.union(axisAligned(sm.matrixWorld) ? _box.copy(local).applyMatrix4(sm.matrixWorld) : skinnedBox(sm, sm.matrixWorld, _box));
      return;
    }
    const im = o as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      if (im.boundingBox === null) im.computeBoundingBox();
      out.union(_box.copy(im.boundingBox!).applyMatrix4(im.matrixWorld));
      return;
    }
    const morphs = !!g.morphAttributes.position && !!m.isMesh && !!m.morphTargetInfluences?.some((x) => x !== 0);
    if (!morphs && axisAligned(m.matrixWorld)) {
      if (!g.boundingBox) g.computeBoundingBox();
      out.union(_box.copy(g.boundingBox!).applyMatrix4(m.matrixWorld));
      return;
    }
    for (let i = 0; i < P.count; i++) out.expandByPoint((m.isMesh ? m.getVertexPosition(i, _v) : _v.fromBufferAttribute(P, i)).applyMatrix4(m.matrixWorld));
  });
  return out;
}

/** Scales a model so that its bounding box is `size` tall (or wide), feet on y = 0, centred in x/z. Returns a wrapper group. */
export function normalise(root: THREE.Object3D, size: number, axis: "y" | "x" = "y"): THREE.Group {
  const g = new THREE.Group();
  const box = boundsOf(root);
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
