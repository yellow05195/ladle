"use client";

/**
 * Compile before attach (perf v21.4, F1/F3). A WebGL program links on its first draw, synchronously, on the
 * main thread (60-230 ms each here, the PMREM GGX one 357-580 ms); `compileAsync` hands the same programs to the
 * driver's KHR_parallel_shader_compile workers instead. The keys must equal the render keys, and they only do
 * once the lights, fog and FINAL environment are in the scene: hence whenEnv(). compile() walks invisible
 * objects too (scene.traverse) and takes the lights, fog and environment from the target scene, so an object
 * is added hidden, compiled where it hangs, then shown. (It must hold no light: a light changes every program's key,
 * the whole scene's; lights belong to the first mount.)
 *
 * The API below is frozen (PLAN.md F3): Staff, DrumAssembly, Cast and the HallScene props build on it.
 */
import * as THREE from "three";
import { hall } from "./store";

export type WarmCtx = { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera };

let envReady: Promise<void> | null = null;

/** Resolves once hall.loaded.env is true (the programs must be keyed with the final environment). */
export function whenEnv(): Promise<void> {
  if (hall.get().loaded.env) return Promise.resolve();
  // one shared subscription for every waiter; reset if the store is ever reset to "not loaded" (a remount)
  if (!envReady) envReady = new Promise<void>((resolve) => {
    const off = hall.subscribe(() => {
      if (!hall.get().loaded.env) return;
      off(); envReady = null; resolve();
    });
  });
  return envReady;
}

/**
 * The first use of the programs `obj`'s materials were compiled with: their uniforms and attributes read, here rather
 * than in the frame that first draws them (on the whole hall's 18 programs, in development: a 66 to 78 ms first frame
 * against 4 to 5 ms, the reads themselves 1 to 3 ms a part; screenshots/v21/perf/gate-ab.mjs). On a program still
 * linking this waits for it: without parallel compile it is where the link is waited for, in this task, not in a frame.
 * `linkedOnly` (fix:1): only the programs a compileReady has seen linked; any other is left to whoever compiled it.
 * The gate's first use walks whole parts, hidden children included, and a model attachWarm hung there hidden after
 * the gate's compiles (the cradle, landing from the cache on a repeat visit) had a program still linking: its read
 * waited 136 to 172 ms for the link, in one of the gate's tasks. (Not part of the frozen API above: the WarmGate's helper too.)
 */
export function firstUse(gl: THREE.WebGLRenderer, obj: THREE.Object3D, linkedOnly = false): void {
  obj.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      const pr = (gl.properties.get(mat) as { currentProgram?: { getUniforms: () => unknown; getAttributes: () => unknown } }).currentProgram;
      if (!pr || (linkedOnly && !linked.has(pr))) continue;
      pr.getUniforms(); pr.getAttributes();
    }
  });
}

/**
 * A mark after every command issued so far: true once the GPU process has worked through them (WebGL2: a fence, whose
 * status the browser reads without a round trip and updates between tasks; WebGL1: a short wait instead). The fence
 * also waits for the GPU to have run them, which a GPU busy elsewhere (a game) can hold back: past `capMs` it says true
 * all the same (and on a lost context, a driver that never signals).
 */
function passedMark(gl: THREE.WebGLRenderer, capMs = 250): () => boolean {
  const t0 = performance.now();
  const c = gl.getContext();
  const sync = typeof WebGL2RenderingContext !== "undefined" && c instanceof WebGL2RenderingContext ? c.fenceSync(c.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
  if (!sync) return () => performance.now() - t0 >= 20;
  (c as WebGL2RenderingContext).flush();
  let done = false;
  return () => {
    if (done) return true;
    const g = c as WebGL2RenderingContext;
    if (g.getSyncParameter(sync, g.SYNC_STATUS) === g.SIGNALED || performance.now() - t0 >= capMs) { done = true; g.deleteSync(sync); }
    return done;
  };
}

type Program = { isReady: () => boolean };
/** the programs a compileReady has seen linked (firstUse's `linkedOnly`) */
const linked = new WeakSet<object>();
type Waiter = { mats: Set<THREE.Material>; passed: () => boolean; t0: number; resolve: () => void };
/** per renderer: the compileReady calls still waiting on their links, and the one timer that looks for all of them */
const waiting = new WeakMap<THREE.WebGLRenderer, { list: Waiter[]; timer: number }>();

/** One look for every waiter of `gl`: each program still linking is asked once (a synchronous round trip), however many wait on it. */
function lookAll(gl: THREE.WebGLRenderer) {
  const w = waiting.get(gl);
  if (!w) return;
  w.timer = 0;
  const linking = new Set<Program>();
  w.list = w.list.filter((x) => {
    if (!x.passed()) return true;
    for (const m of x.mats) {
      const p = (gl.properties.get(m) as { currentProgram?: Program }).currentProgram;
      if (p && linking.has(p)) break;
      let ready = true;
      try { ready = !p || p.isReady(); } catch { /* a lost context: nothing to wait for */ }
      if (!ready) { linking.add(p as Program); break; }
      if (p) linked.add(p);
      x.mats.delete(m);
    }
    // (a driver that never reports a program complete: the first draw links what is left, as without the extension)
    if (x.mats.size && performance.now() - x.t0 <= 10000) return true;
    x.resolve();
    return false;
  });
  if (w.list.length) w.timer = window.setTimeout(() => lookAll(gl), 10);
}

/**
 * compileAsync, its first look at the links one mark later (perf v21.4, B2's note). three's compileAsync asks every program
 * whether it is linked (COMPLETION_STATUS_KHR: a synchronous round trip to the GPU process) in the same task as compile(),
 * while the GPU process is still taking the shaders in: the answer waited for it, 70 to 163 ms on a loaded machine. Here
 * compile() issues the links, a fence follows them, and the programs are asked only once the GPU process is past it,
 * then every 10 ms. One timer looks for every call (lookAll): the hall's props, crowd and staff are about a hundred
 * attachWarm calls at once, sharing a few programs, and each of three's own polls asked all of its materials every 10 ms.
 * On the whole hall (gate-ab.mjs, a loaded machine) the compile tasks' GL waits went from 377 ms (246 in the looks, up to
 * 155 at once, and 131 in linkProgram behind them) to 4. Never rejects; compile() may throw (a lost context),
 * synchronously, as three's own does.
 */
export function compileReady(gl: THREE.WebGLRenderer, obj: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): Promise<void> {
  const mats = gl.compile(obj, camera, scene);
  const passed = passedMark(gl);
  return new Promise((resolve) => {
    let w = waiting.get(gl);
    if (!w) { w = { list: [], timer: 0 }; waiting.set(gl, w); }
    w.list.push({ mats, passed, t0: performance.now(), resolve });
    if (!w.timer) w.timer = window.setTimeout(() => lookAll(gl), 10);
  });
}

// three r186 WebGLShadowMap: the side a caster's depth material takes (not VSM): front faces cast from their backs
const SHADOW_SIDE: Record<THREE.Side, THREE.Side> = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
/** per renderer: the kinds of shadow caster whose depth program has a stand-in already */
const shadowKinds = new WeakMap<THREE.WebGLRenderer, Set<string>>();

/**
 * Stand-ins for the shadow pass's own programs (perf v21.4). compile() never makes those: WebGLShadowMap draws each caster
 * with its MeshDepthMaterial, set up per caster (its map, alpha test, side...), whose program then links in the first frame
 * that draws the shadow map (on the hall: three programs, 25 to 45 ms of the gate's first priming frame). For every kind of
 * caster under `obj` not met yet on this renderer (the object kind, the depth material's settings, the geometry's
 * attributes: what keys the program), this returns a stand-in: the caster itself underneath (Object.create: the same
 * geometry, instancing, batching, skinning), childless, wearing that depth material as getDepthMaterial would set it up.
 * Compile them inside asShadowPass() (the shadow pass draws into a render target, without the fog: what its keys hold). Their
 * materials are never disposed: the programs stay the shadow pass's for the renderer's life. Made for a spot or directional
 * light's shadow, the hall's one (a point light's pass draws with MeshDistanceMaterial: these would go unused); a custom
 * depth material is left to its first pass.
 */
export function shadowStandIns(ctx: WarmCtx, obj: THREE.Object3D): THREE.Object3D[] {
  const { gl } = ctx;
  if (!gl.shadowMap.enabled || gl.shadowMap.type === THREE.VSMShadowMap) return [];
  const seen = shadowKinds.get(gl) ?? new Set<string>();
  shadowKinds.set(gl, seen);
  const out: THREE.Object3D[] = [];
  obj.traverse((o) => {
    const c = o as THREE.Mesh & { isLine?: boolean; isPoints?: boolean; _colorsTexture?: unknown; morphTexture?: unknown; instanceColor?: unknown; isBatchedMesh?: boolean; isInstancedMesh?: boolean; isSkinnedMesh?: boolean };
    if (!c.castShadow || !(c.isMesh || c.isLine || c.isPoints) || c.customDepthMaterial) return;
    const g = c.geometry;
    const kind = c.isBatchedMesh ? `b${c._colorsTexture ? "c" : ""}` : c.isInstancedMesh ? `i${c.instanceColor ? "c" : ""}${c.morphTexture ? "m" : ""}` : c.isSkinnedMesh ? "s" : c.isPoints ? "pt" : c.isLine ? "l" : "m";
    const attrs = `${Object.keys(g.attributes).sort().join("/")}:${Object.keys(g.morphAttributes).sort().join("/")}`;
    for (const m0 of Array.isArray(c.material) ? c.material : [c.material]) {
      const m = m0 as THREE.MeshStandardMaterial | undefined;
      if (!m) continue;
      const side = m.shadowSide ?? SHADOW_SIDE[m.side], alphaTest = m.alphaToCoverage ? 0.5 : m.alphaTest;
      const key = [kind, side, m.map?.channel ?? -1, m.alphaMap?.channel ?? -1, alphaTest > 0, m.displacementMap?.channel ?? -1, m.clippingPlanes?.length ?? 0, !!m.wireframe, attrs].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const d = new THREE.MeshDepthMaterial();
      d.side = side; d.alphaTest = alphaTest;
      d.map = m.map ?? null; d.alphaMap = m.alphaMap ?? null;
      d.clipShadows = m.clipShadows; d.clippingPlanes = m.clippingPlanes; d.clipIntersection = m.clipIntersection;
      d.displacementMap = m.displacementMap ?? null; d.displacementScale = m.displacementScale ?? 1; d.displacementBias = m.displacementBias ?? 0;
      d.wireframe = !!m.wireframe;
      out.push(Object.assign(Object.create(c) as THREE.Mesh, { material: d, children: [] }));
    }
  });
  return out;
}

/**
 * `f` (the stand-ins' compile, synchronous) as the shadow pass keys its programs: into a render target (no tone mapping, a
 * linear output; a 1 px one here) and without the scene's fog (it draws with an empty scene: the key's fog flags are off).
 * The lights are still the scene's (compile() gathers them from it). Then the previous target and the fog again.
 */
export function asShadowPass<T>(ctx: WarmCtx, f: () => T): T {
  const { gl, scene } = ctx;
  const prev = gl.getRenderTarget(), face = gl.getActiveCubeFace(), level = gl.getActiveMipmapLevel(), fog = scene.fog;
  const rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  gl.setRenderTarget(rt);
  scene.fog = null;
  try { return f(); }
  finally { scene.fog = fog; gl.setRenderTarget(prev, face, level); rt.dispose(); }
}

/** a task of its own (a message: no 4 ms clamp on nested timers) */
const nextTask = () => new Promise<void>((r) => {
  const c = new MessageChannel();
  c.port1.onmessage = () => { c.port1.close(); r(); };
  c.port2.postMessage(0);
});

/** obj.visible = false; parent.add(obj); await whenEnv(); await ctx.gl.compileAsync(obj, ctx.camera, ctx.scene); obj.visible = true
 * (compileReady in place of compileAsync: the same, without its synchronous look at the links) */
export async function attachWarm(ctx: WarmCtx, parent: THREE.Object3D, obj: THREE.Object3D): Promise<void> {
  obj.visible = false;
  parent.add(obj);
  // (in development, window.__attachLog: [name, added, environment in, compiled, shown] per object, performance.now() ms)
  const log = process.env.NODE_ENV !== "production" ? [obj.name || obj.type, Math.round(performance.now())] as (string | number)[] : null;
  if (log) ((window as unknown as { __attachLog?: unknown[] }).__attachLog ??= []).push(log);
  try {
    await whenEnv();
    log?.push(Math.round(performance.now()));
    // each object in a task of its own: the props, the cradle and the staff all wait on the environment, and their
    // compile() calls (a few ms each) used to run back to back in the task it landed in (80 ms of them)
    await nextTask();
    // detached while we waited (the owner unmounted): nothing to compile, and nothing to show
    if (!obj.parent) return;
    // (its shadow programs too: a new kind of caster, the skinned bear, linked its depth program on its first shadow pass)
    const standIns = shadowStandIns(ctx, obj);
    const shadows = standIns.length ? asShadowPass(ctx, () => standIns.map((s) => compileReady(ctx.gl, s, ctx.camera, ctx.scene))) : [];
    await Promise.all([compileReady(ctx.gl, obj, ctx.camera, ctx.scene), ...shadows]);
    log?.push(Math.round(performance.now()));
    firstUse(ctx.gl, obj);
    for (const s of standIns) firstUse(ctx.gl, s);
  } catch {
    // a lost context or a compile error: show it anyway, the first draw links it the old way
  } finally {
    obj.visible = true;
    log?.push(Math.round(performance.now()));
  }
}
