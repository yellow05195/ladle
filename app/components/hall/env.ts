"use client";

/**
 * The hall's environment (v21.4, perf F2): the image-based light every Standard and Physical material of the room reads.
 *
 * Until v21.3 the PMREM convolution linked its GGX program synchronously the moment the HDR landed (a 357 to 580 ms task
 * at 1.6 to 2.2 s into a cold visit), and the mid and low tiers built the room environment synchronously at mount. Here
 * one PMREMGenerator links its programs off the main thread (KHR_parallel_shader_compile) while the HDR downloads; the
 * HDR is decoded in a worker (hdr.ts, fix:1: parsed on the main thread it was a 60 to 74 ms task, 324 ms at 4x CPU) and
 * convolved in a task of its own, on the same generator (its programs are the ones already linked).
 * The room environment (the mid and low tiers, the HDR's failure, a slow network) goes the same way: its scene's
 * programs are linked before fromScene() draws it.
 *
 * A program's key takes the render target it is drawn into (a target means linear output and no tone mapping), so the
 * PMREM's programs are compiled with its own ping-pong target bound. On a slow network the room stands in at
 * ENV_FALLBACK_MS (before WarmGate stops waiting for the environment): it has the same 256 cube, so the same CUBEUV
 * defines, and the HDR that lands later swaps in without recompiling anything.
 *
 * Called from HallScene's HallEnv (after setupRenderer, so the renderer's output colour space is final), which mounts with
 * the canvas's first step: the HDR and the PMREM's links start one mount step earlier than from HallScene (fix:1, T7).
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { hdrStats, loadHDR } from "./hdr";
import { hall } from "./store";
import { compileReady } from "./warm";

export type EnvKind = "hdr" | "room";

export const ENV_HDR = "/assets/hdri/warm_bar_1k.hdr";
/** past this without the HDR, the room stands in (it lands before WarmGate's 5 s cap on the environment) */
export const ENV_FALLBACK_MS = 3500;
const HDR_INTENSITY = 0.35;
const ROOM_INTENSITY = 0.3;
const ROOM_SIGMA = 0.035;
/** the cube size of both paths: fromEquirectangular of a 1k HDR (1024 / 4) and fromScene's default */
const CUBE = 256;

/**
 * three 0.186.1's private PMREMGenerator fields (extras/PMREMGenerator.js), pinned here: each is checked at run time and
 * the plain path (fromEquirectangular / fromScene linking on first use, as before) is taken when one is missing.
 */
interface PmremInternals {
  _setSize?: (cubeSize: number) => void;
  _allocateTargets?: () => THREE.WebGLRenderTarget;
  _pingPongRenderTarget?: THREE.WebGLRenderTarget | null;
  _lodMeshes?: THREE.Mesh[];
  _ggxMaterial?: THREE.ShaderMaterial | null;
  _blurMaterial?: THREE.ShaderMaterial | null;
  _equirectMaterial?: THREE.ShaderMaterial | null;
}

/** the PMREM's own flat camera and fromScene's cube camera: neither enters a program's key */
const flatCam = new THREE.OrthographicCamera();
const cubeCam = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
const nextTask = () => new Promise<void>((r) => setTimeout(r, 0));

/** the room environment, built once per renderer (the mid and low tiers) */
const rooms = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

const dev = process.env.NODE_ENV !== "production";
function log(what: string): void {
  if (!dev || typeof window === "undefined") return;
  const w = window as unknown as { __envLog?: Array<[number, string]> };
  (w.__envLog ??= []).push([Math.round(performance.now()), what]);
}

/**
 * Compiles the generator's programs (and, for the room, its scene's and fromScene's backdrop) with the ping-pong target
 * bound, and resolves once they are linked. Null when the private fields are missing (the plain path).
 */
function prelink(gl: THREE.WebGLRenderer, pmrem: THREE.PMREMGenerator, what: { equirect?: boolean; room?: RoomEnvironment; backdrop?: THREE.Mesh }): Promise<void> | null {
  const p = pmrem as unknown as PmremInternals;
  if (typeof p._setSize !== "function" || typeof p._allocateTargets !== "function") return null;
  const jobs: Array<Promise<unknown>> = [];
  const mats: THREE.Material[] = [];
  const prev = gl.getRenderTarget(), face = gl.getActiveCubeFace(), mip = gl.getActiveMipmapLevel();
  try {
    p._setSize(CUBE);
    // the targets and materials at the final size (768 x 1024); the output target it returns never reached the GPU (the
    // conversion allocates its own), the ping-pong target and the materials are the ones the conversion reuses
    p._allocateTargets().dispose();
    const rt = p._pingPongRenderTarget, plane = p._lodMeshes?.[0]?.geometry, ggx = p._ggxMaterial;
    if (!rt || !plane || !ggx) return null;
    gl.setRenderTarget(rt);
    // the equirect material comes from the public pre-compile, without its compile: that one draws an empty geometry,
    // and r186 keys a program on the position attribute being there (a program the conversion never uses)
    if (what.equirect) {
      const own = p as { _compileMaterial?: unknown };
      if (typeof own._compileMaterial === "function") {
        own._compileMaterial = () => {};
        try { pmrem.compileEquirectangularShader(); } finally { delete own._compileMaterial; }
      }
    }
    const flat = new THREE.Group();
    for (const m of [ggx, what.equirect ? p._equirectMaterial : null, what.room ? p._blurMaterial : null]) {
      if (!m) continue;
      flat.add(new THREE.Mesh(plane, m));
      mats.push(m);
    }
    // (fix:1: compileReady, warm.ts: three's compileAsync asks whether each program is linked in the compile's own task,
    // a synchronous round trip that waits for the GPU process to take the shaders in; 15 ms here on the room path)
    jobs.push(compileReady(gl, flat, flatCam, flat as unknown as THREE.Scene));
    // the room's scene, and the backdrop fromScene draws first: each on its own (their lights are part of the key)
    if (what.room) { jobs.push(compileReady(gl, what.room, cubeCam, what.room)); what.room.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) mats.push(m as THREE.Material); }); }
    if (what.backdrop) { jobs.push(compileReady(gl, what.backdrop, cubeCam, what.backdrop as unknown as THREE.Scene)); mats.push(what.backdrop.material as THREE.Material); }
  } catch {
    return null;
  } finally {
    gl.setRenderTarget(prev, face, mip);
  }
  return Promise.all(jobs).then(async () => {
    if (gl.extensions.has("KHR_parallel_shader_compile")) return;
    // without the extension compileAsync cannot wait for the link: force each one in a task of its own, while the HDR
    // is still on its way, rather than in the conversion's task
    for (const m of mats) {
      await nextTask();
      (gl.properties.get(m) as { currentProgram?: { getUniforms: () => unknown } }).currentProgram?.getUniforms();
    }
  }).catch(() => {});
}

/** A stand-in for fromScene's private backdrop mesh: the same program (a material's name is not part of its key). */
function backdrop(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false }));
}

/** The room environment through `pmrem`, its programs linked first. Null when `live()` turned false meanwhile. */
async function roomTexture(gl: THREE.WebGLRenderer, pmrem: THREE.PMREMGenerator, live: () => boolean): Promise<THREE.Texture | null> {
  const room = new RoomEnvironment();
  const bd = backdrop();
  try {
    const linked = prelink(gl, pmrem, { room, backdrop: bd });
    if (linked) await linked;
    if (!live()) return null;
    const t0 = performance.now();
    const tex = pmrem.fromScene(room, ROOM_SIGMA).texture;
    log(`room ${Math.round(performance.now() - t0)}ms`);
    return tex;
  } finally {
    // (after fromScene: the last material released on a program deletes it)
    room.dispose();
    bd.geometry.dispose();
    (bd.material as THREE.Material).dispose();
  }
}

/**
 * Puts the hall's environment on `scene` (with its intensity) and marks `env` loaded. "hdr": the warm bar HDR, the room
 * standing in past ENV_FALLBACK_MS or when the HDR fails; "room": the room (cached per renderer). Resolves once an
 * environment is in (or the signal aborted); never rejects. `onSwap` runs when the HDR replaces the room standing in
 * (a reader of `scene.environmentIntensity` re-reads its base).
 */
export function buildEnv(gl: THREE.WebGLRenderer, scene: THREE.Scene, kind: EnvKind, opts: { signal?: AbortSignal; onSwap?: () => void } = {}): Promise<void> {
  const { signal, onSwap } = opts;
  const off = () => signal?.aborted === true;
  if (off()) return Promise.resolve();
  let resolve!: () => void;
  const first = new Promise<void>((r) => { resolve = r; });
  signal?.addEventListener("abort", () => resolve(), { once: true });
  const put = (tex: THREE.Texture, intensity: number) => {
    scene.environment = tex;
    scene.environmentIntensity = intensity;
    hall.markLoaded("env");
    resolve();
  };
  log(`start ${kind}`);

  if (kind === "room") {
    const hit = rooms.get(gl);
    if (hit) { put(hit, ROOM_INTENSITY); return first; }
    const pmrem = new THREE.PMREMGenerator(gl);
    void roomTexture(gl, pmrem, () => !off())
      .then((tex) => { if (tex) { rooms.set(gl, tex); put(tex, ROOM_INTENSITY); } })
      .catch(() => { if (!off()) put(syncRoom(gl), ROOM_INTENSITY); })
      .finally(() => pmrem.dispose());
    return first;
  }

  const pmrem = new THREE.PMREMGenerator(gl);
  // "wait" (nothing yet), "room" (standing in), "hdr" (final)
  let phase: "wait" | "room" | "hdr" = "wait";
  let standIn: THREE.Texture | null = null;
  let roomJob: Promise<unknown> | null = null;
  let hdrIn = false;
  const startRoom = () => {
    if (roomJob || phase !== "wait" || off()) return;
    log("room stands in");
    roomJob = roomTexture(gl, pmrem, () => !off() && phase === "wait")
      .then((tex) => { if (tex) { standIn = tex; phase = "room"; put(tex, ROOM_INTENSITY); } })
      .catch(() => { if (!off() && phase === "wait") { phase = "room"; put(syncRoom(gl), ROOM_INTENSITY); } });
  };
  // a slow network: the room stands in (an HDR already here but still waiting for its link is not late)
  const timer = setTimeout(() => { if (!hdrIn) startRoom(); }, ENV_FALLBACK_MS);
  // an abort drops this build's result but never cancels the download: loadHDR shares one request per URL between
  // builds (as three's FileLoader did), so cancelling it failed the HDR of the build that replaced this one (a remount,
  // or development's double effect: the room stood in for good, on a repeat visit every time)
  signal?.addEventListener("abort", () => clearTimeout(timer), { once: true });
  const linked = (prelink(gl, pmrem, { equirect: true }) ?? Promise.resolve()).then(() => log("linked"));
  const hdr = loadHDR(ENV_HDR).then(
    // decoded (in a worker): the conversion runs in a task of its own
    async (t) => { hdrIn = true; log(`hdr parsed (${hdrStats.how} ${hdrStats.ms}ms)`); await nextTask(); return t; },
    () => null,
  );
  const hdrJob = Promise.all([hdr, linked]).then(([t]) => {
    clearTimeout(timer);
    if (off()) { t?.dispose(); return; }
    if (!t) { log("hdr failed"); startRoom(); return; }
    t.mapping = THREE.EquirectangularReflectionMapping;
    const t0 = performance.now();
    const env = pmrem.fromEquirectangular(t).texture;
    t.dispose();
    log(`pmrem ${Math.round(performance.now() - t0)}ms`);
    const swap = phase === "room";
    phase = "hdr";
    put(env, HDR_INTENSITY);
    if (swap) { standIn?.dispose(); standIn = null; onSwap?.(); }
  }).catch(() => { if (!off()) startRoom(); });
  // the generator goes once nothing can use it any more (its materials hold the linked programs)
  void hdrJob.then(() => roomJob).catch(() => {}).finally(() => {
    pmrem.dispose();
    // nothing came through at all (no HDR, no async room): the synchronous room, as before v21.4
    if (!off() && phase === "wait") put(syncRoom(gl), ROOM_INTENSITY);
  });
  return first;
}

/** The pre-v21.4 room (synchronous link): only when the asynchronous paths throw. */
function syncRoom(gl: THREE.WebGLRenderer): THREE.Texture {
  const hit = rooms.get(gl);
  if (hit) return hit;
  const pmrem = new THREE.PMREMGenerator(gl);
  const room = new RoomEnvironment();
  const tex = pmrem.fromScene(room, ROOM_SIGMA).texture;
  room.dispose();
  pmrem.dispose();
  rooms.set(gl, tex);
  return tex;
}
