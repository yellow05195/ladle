"use client";

/**
 * The warm gate (perf v21.4, F1), inside the Canvas: no frame is drawn until every program of the scene is linked under
 * its final environment. A WebGL program links on its first draw, synchronously, on the main thread (60 to 230 ms each
 * on this GPU): the hall used to draw before the HDR existed, so every Standard and Physical program was linked twice,
 * the second wave in one 1 to 2 s frame. Here, while the loader's still (or the poster) holds the screen:
 *  1. the final environment (the program keys take it), at most 5 s from the canvas mount (a slow network: whatever
 *     environment is there by then); meanwhile the textures already loaded are uploaded (step 4's, early);
 *  2. the last staggered mount step (`mounted`; its effects ran in the commit's flush, this one with them), then a task;
 *  3. each part of the scene compiled (partsOf), in tasks of a few ms (one part's compile(), the shader strings, is 22
 *     to 33 ms at most in development), the driver linking them off the main thread (KHR_parallel_shader_compile;
 *     compileReady, warm.ts: compileAsync without its synchronous look at the links); then, the same way, the linked
 *     programs' first use (their uniforms and attributes read: done by the first frame instead, it made a 66 to 78 ms
 *     frame of a 4 to 5 ms one; screenshots/v21/perf/gate-ab.mjs). Without the extension each part's link is forced in
 *     its own task instead (compile(), then that first use), so the loader keeps moving. The shadow pass's own programs
 *     (its depth material, one per kind of caster) go the same way, through stand-ins (warm.ts);
 *  4. while the driver links, every loaded texture of every material not uploaded yet, a few per task;
 *  5. each part drawn alone into one pixel, a few per task: its buffers uploaded and its draw state built;
 *  6. two priming frames through R3F (every useFrame, then the render; the shadow map drawn on the first, on the
 *     programs step 3 linked);
 *  7. warm and glReady: the frame loop starts (FrameDriver), the still dissolves (Loader), the poster goes (HallCanvas).
 * If step 1 ran out of time, the environment's arrival later pauses the loop (warm false) while the parts are compiled
 * again under it, instead of one frame linking them all. In development `window.__gate` keeps the gate's timings (screenshots/v21/perf).
 */
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { hall } from "./store";
import { asShadowPass, compileReady, firstUse, shadowStandIns, whenEnv } from "./warm";

const ENV_CAP_MS = 5000;      // from the canvas mount: past it the programs are keyed with whatever environment is there
const COMPILE_CAP_MS = 8000;  // a driver that never reports a program complete: the priming frames link what is left
const SLICE_MS = 6;           // a task of the gate takes another part (compile, first use) while it has run less than this
const PART_MATS = 12;         // a group holding more materials than this is split into its children (compile() costs per material)

type GateLog = { born: number; mount?: number[]; env: number; envCapped: boolean; start: number; parallel: boolean; parts: number; shadows: number; textures: number; issued: number; linked: number; compiled: number; drawn?: number; uploaded: number; primed: number[]; primedRender?: number[]; geometries?: number[]; open: number; programs: [number, number, number]; maxStepMs: number; late?: [number, number]; yields?: [number, number] };

/** the renderers this module has warmed (a remounted canvas is a new renderer: it is warmed again) */
const warmed = new WeakSet<THREE.WebGLRenderer>();

const wait = (ms: number) => new Promise<void>((r) => { window.setTimeout(r, ms); });
/**
 * a fresh task (a message: no 4 ms clamp on nested timers). fix:1 (T7): "user-blocking" where the browser has
 * scheduler.postTask: on a repeat visit the environment is in before the last mount step, so the gate runs while every
 * asset lands from the cache at once, and each of its tasks queued behind their parses and compiles (its issue phase
 * went from 60 ms to 255 ms). Its tasks stay short, and nextTask lets an overdue frame through first.
 */
const message = () => new Promise<void>((r) => {
  const s = (globalThis as { scheduler?: { postTask?: (f: () => void, o?: { priority?: string }) => Promise<unknown> } }).scheduler;
  if (s?.postTask) { void s.postTask(r, { priority: "user-blocking" }); return; }
  const c = new MessageChannel();
  c.port1.onmessage = () => { c.port1.close(); r(); };
  c.port2.postMessage(0);
});

/**
 * fix:1 (T7): the page's last frame while a gate runs (its own requestAnimationFrame loop), and how overdue one may be
 * before the gate's next task lets it through first. Its tasks are messages: back to back with the arrival's other
 * work (the assets landing, their compiles), a part of 20 to 26 ms each, the loader's frames waited behind them (103 to
 * 105 ms frames on a loaded machine).
 */
const FRAME_DUE_MS = 40;
/**
 * the most a gate waits for frames in all: past it, frames are slow to come on this machine (4x CPU: 19 waits, 572 to
 * 590 ms of a 1.5 s gate) and the gate's own progress comes first; on a 1x machine it waits 3 or 4 times, 35 to 90 ms
 */
const FRAME_WAIT_BUDGET_MS = 150;
let frameAt = 0;
/** the frames the gate let through, and the ms it waited for them (development: window.__gate.yields) */
const yields: [number, number] = [0, 0];
// (a frame that never comes, an occluded window's, gives way to a 50 ms timer: at 100 ms, 4x CPU's slow frames held the
// gate for 590 ms in all, against a few tens of ms of frames gained at 1x)
const frame = () => new Promise<void>((r) => {
  const t = window.setTimeout(r, 50);
  requestAnimationFrame(() => { clearTimeout(t); r(); });
});
/** a fresh task, after a frame if one is overdue */
const nextTask = async () => {
  if (frameAt && performance.now() - frameAt > FRAME_DUE_MS && yields[1] < FRAME_WAIT_BUDGET_MS && document.visibilityState === "visible") {
    const t0 = performance.now();
    await frame();
    yields[0]++; yields[1] += Math.round(performance.now() - t0);
  }
  await message();
};

/**
 * The parts the gate compiles: the scene's top-level children that hold a material. One that also holds a light is split
 * into its children: compile(part, camera, scene) counts the part's own lights on top of the scene's (it expects a part
 * not yet added), so its programs would be keyed with those lights twice and linked again on the first frame. (A mesh
 * with a light below it leaves its own program to the priming frames.) A group of many materials is split too: compile()
 * works out every material's program key, so the crowd's or the drum's group was one 110 to 190 ms task on a loaded
 * machine (screenshots/v21/perf/gate-ab.mjs).
 */
function partsOf(root: THREE.Object3D, out: THREE.Object3D[] = []): THREE.Object3D[] {
  for (const c of root.children) {
    let mats = 0, light = false;
    c.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) mats += Array.isArray(m) ? m.length : 1; if ((o as THREE.Light).isLight) light = true; });
    if (!mats) continue;
    if (light || (mats > PART_MATS && !(c as THREE.Mesh).material && c.children.length)) partsOf(c, out);
    else out.push(c);
  }
  return out;
}

/**
 * `part` drawn alone, once, into one pixel of the canvas (the other parts hidden, its own culling off, the shadow map
 * left alone): its geometry's buffers uploaded and its draw state built now rather than all in the first frame. The
 * next frame repaints the pixel. Every flag is put back before it returns.
 */
function drawAlone(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, parts: readonly THREE.Object3D[], part: THREE.Object3D) {
  const hidden: THREE.Object3D[] = [], culled: THREE.Object3D[] = [];
  for (const p of parts) if (p !== part && p.visible) { p.visible = false; hidden.push(p); }
  part.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
  // (the world matrices are brought up to date once for all the parts, by the caller: not the whole scene's again per part)
  const needs = gl.shadowMap.needsUpdate, scissor = gl.getScissorTest(), auto = scene.matrixWorldAutoUpdate;
  gl.shadowMap.needsUpdate = false;
  scene.matrixWorldAutoUpdate = false;
  gl.setScissorTest(true);
  gl.setScissor(0, 0, 1, 1);
  try { gl.render(scene, camera); }
  finally {
    gl.setScissorTest(scissor);
    gl.shadowMap.needsUpdate = needs;
    scene.matrixWorldAutoUpdate = auto;
    for (const o of culled) o.frustumCulled = true;
    for (const p of hidden) p.visible = true;
  }
}

/** every texture a material of the scene holds that is loaded and not on the GPU yet (render targets and videos excluded) */
function texturesOf(scene: THREE.Scene, gl: THREE.WebGLRenderer): THREE.Texture[] {
  const out = new Set<THREE.Texture>();
  const take = (v: unknown) => {
    if (!(v instanceof THREE.Texture) || out.has(v)) return;
    const t = v as THREE.Texture & { isRenderTargetTexture?: boolean; isVideoTexture?: boolean };
    if (t.isRenderTargetTexture || t.isVideoTexture || !t.image || t.version === 0) return;
    if ((gl.properties.get(t) as { __version?: number }).__version === t.version) return;
    out.add(t);
  };
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      for (const v of Object.values(mat)) take(v);
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const k in u) take(u[k]?.value);
    }
  });
  return [...out];
}

/** `mounted`: the canvas's last staggered mount step is in (F7); the gate compiles nothing before it. */
export function WarmGate({ mounted = true }: { mounted?: boolean }) {
  const get = useThree((s) => s.get);
  const born = useRef(0);
  useEffect(() => { if (!born.current) born.current = performance.now(); }, []);
  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    // (the frame clock above, from here to the gate's opening)
    let raf = 0;
    const beat = () => { frameAt = performance.now(); raf = requestAnimationFrame(beat); };
    const still = () => { cancelAnimationFrame(raf); raf = 0; frameAt = 0; };
    yields[0] = yields[1] = 0;
    const run = async () => {
      const { gl, scene } = get();
      if (warmed.has(gl)) { hall.set({ warm: true, glReady: true }); return; }
      beat();
      // a new renderer (the canvas was remounted): nothing of it is linked yet
      if (hall.get().warm) hall.set({ warm: false, glReady: false });
      const dev = process.env.NODE_ENV !== "production";
      const programs = () => gl.info.programs?.length ?? 0;
      const log: GateLog = { born: Math.round(born.current), env: 0, envCapped: false, start: 0, parallel: false, parts: 0, shadows: 0, textures: 0, issued: 0, linked: 0, compiled: 0, uploaded: 0, primed: [], open: 0, programs: [programs(), 0, 0], maxStepMs: 0 };
      const step = (t0: number) => { log.maxStepMs = Math.max(log.maxStepMs, +(performance.now() - t0).toFixed(1)); };
      // f over the items, a new task whenever this one has run `budget` ms (0: one item per task). Each new task waits
      // behind whatever else the page has queued (on a warm visit: the assets landing at once), so the gate takes as
      // few as it can while each stays short. False once the gate is gone
      const sliced = async <T,>(items: readonly T[], budget: number, f: (x: T) => void): Promise<boolean> => {
        let t1 = -Infinity;
        for (const x of items) {
          if (performance.now() - t1 >= budget) { await nextTask(); if (!alive) return false; t1 = performance.now(); }
          const t0 = performance.now();
          f(x);
          step(t0);
        }
        return true;
      };
      // (the log is live: a gate that never opens shows where it stopped)
      if (dev) { const w = window as unknown as { __gate?: GateLog; __mountSteps?: number[] }; w.__gate = log; log.mount = w.__mountSteps; log.yields = yields; }

      // 4. the textures, a few per task, up to 6 ms of uploads (an ImageBitmap's is 2 to 4 ms). In idle slots they waited
      // behind the gate's own tasks (no idle time while a task is queued: one upload per 150 ms timeout, the gate's last
      // 140 to 300 ms on a warm visit). `until`: the early pass stops when the environment is in
      const upload = async (until?: () => boolean) => {
        const list = texturesOf(scene, gl);
        log.textures += list.length;
        let i = 0;
        while (i < list.length && !until?.()) {
          await nextTask();
          if (!alive) return;
          const t1 = performance.now();
          do {
            const t0 = performance.now();
            const t = list[i++];
            try { if (t) gl.initTexture(t); } catch { /* the first frame uploads it */ }
            step(t0);
          } while (i < list.length && performance.now() - t1 < 6);
        }
        if (!until) log.uploaded = Math.round(performance.now());
      };

      // 1. the final environment, capped from the canvas mount. A cold visit waits here on the HDR: the textures already
      // loaded go up meanwhile, while the GPU process has no links to make (one uploaded beside the links waited 171 ms)
      const left = Math.max(0, ENV_CAP_MS - (performance.now() - (born.current || performance.now())));
      let envIn = false;
      const early = upload(() => envIn);
      await Promise.race([whenEnv(), wait(left)]);
      envIn = true;
      await early;
      if (!alive) return;
      log.env = Math.round(performance.now());
      log.envCapped = !hall.get().loaded.env;
      // 2. a task past the last mount step (an idle slot here was 50 to 80 ms of a warm visit's gate, the environment in)
      await nextTask();
      if (!alive) return;
      log.start = Math.round(performance.now());

      // 3. the programs, a few parts per task (the camera as it is now: R3F's default, CameraRig poses it in useFrame)
      const camera = get().camera;
      // (three r186 removed PCFSoftShadowMap: compile() keys it SHADOWMAP_TYPE_BASIC, then the first shadow pass swaps it
      // for PCFShadowMap and every program links again. HallWorld asks for PCF; this keeps the keys right if one asks "soft")
      if (gl.shadowMap.type === THREE.PCFSoftShadowMap) gl.shadowMap.type = THREE.PCFShadowMap;
      const parallel = gl.extensions.has("KHR_parallel_shader_compile");
      log.parallel = parallel;
      // (`meanwhile`: work for the main thread while the driver links: the textures)
      const compile = async (meanwhile?: () => Promise<void>) => {
        const parts = partsOf(scene);
        log.parts = parts.length;
        const jobs: Promise<unknown>[] = [];
        // (with parallel compile, a few parts per task while it stays short; without, one: each part's links waited for)
        const issued = await sliced(parts, parallel ? SLICE_MS : 0, (part) => {
          try {
            if (parallel) jobs.push(compileReady(gl, part, camera, scene));
            else {
              // no parallel compile: compileAsync would resolve on its first poll and leave the links to the first frame;
              // the first use waits for this part's links here, in this task, between two of the loader's
              gl.compile(part, camera, scene);
              firstUse(gl, part);
            }
          } catch { /* a lost context: the priming frames will say so */ }
        });
        if (!issued) return;
        // the shadow pass's own programs (its depth material per kind of caster: compile() never makes them, the first
        // priming frame linked them, 25 to 45 ms of it): stand-ins compiled under a render target (warm.ts), all in one
        // task in parallel, one per task without
        const standIns = shadowStandIns({ gl, scene, camera }, scene);
        log.shadows = standIns.length;
        for (let i = 0; i < standIns.length; i += parallel ? standIns.length : 1) {
          await nextTask();
          if (!alive) return;
          const t0 = performance.now();
          const some = standIns.slice(i, parallel ? undefined : i + 1);
          try {
            asShadowPass({ gl, scene, camera }, () => { for (const s of some) { if (parallel) jobs.push(compileReady(gl, s, camera, scene)); else gl.compile(s, camera, scene); } });
            if (!parallel) for (const s of some) firstUse(gl, s);
          } catch { /* the priming frames link them */ }
          step(t0);
        }
        if (!log.issued) log.issued = Math.round(performance.now());
        if (!parallel) { await meanwhile?.(); return; }
        const linked = Promise.race([Promise.all(jobs), wait(COMPILE_CAP_MS)]).then(() => { if (!log.linked) log.linked = Math.round(performance.now()); });
        await Promise.all([linked, meanwhile?.()]);
        if (!alive) return;
        // (only the programs seen linked: a model attachWarm hung in a part since its compile may still be linking)
        await sliced([...parts, ...standIns], SLICE_MS, (part) => { try { firstUse(gl, part, true); } catch { /* a lost context */ } });
      };
      // (and the textures loaded since the early pass, while the driver links)
      await compile(() => upload());
      if (!alive) return;
      log.compiled = Math.round(performance.now());
      log.programs[1] = programs();

      // 5. each visible part drawn alone into one pixel, a few per task (drawAlone: its buffers and draw state; all of them
      // in the first priming frame made it 54 of its 71 ms in development, 35 geometries). A hidden one (still compiling:
      // attachWarm) is left to the frame that shows it
      const shown = partsOf(scene).filter((x) => x.visible);
      scene.updateMatrixWorld();
      if (!(await sliced(shown, SLICE_MS, (part) => { try { drawAlone(gl, scene, camera, shown, part); } catch { /* the priming frames draw it */ } }))) return;
      log.drawn = Math.round(performance.now());

      // 6. two priming frames, each in its own task. In 'never', R3F's update() calls clock.getDelta() (a no-op on the clock
      // its setFrameloop stopped; a running clock first adds the seconds since oldTime; a stopped autoStart one restarts at
      // 0), then hands every useFrame `timestamp - clock.elapsedTime` and keeps the timestamp as elapsedTime: this one
      // makes that 1/60 s (advance(performance.now()) would hand them seconds' worth of milliseconds)
      // (in development the log also keeps each frame's render share and the geometries on the GPU before and after)
      if (dev) { log.primedRender = []; log.geometries = [gl.info.memory.geometries]; }
      for (let f = 0; f < 2; f++) {
        await nextTask();
        if (!alive) return;
        const s = get(), c = s.clock;
        if (f === 0) gl.shadowMap.needsUpdate = true;
        const ts = (c.running ? c.elapsedTime + (performance.now() - c.oldTime) / 1000 : c.autoStart ? 0 : c.elapsedTime) + 1 / 60;
        const render = gl.render;
        let took = 0;
        if (dev) gl.render = (sc, cam) => { const t = performance.now(); render.call(gl, sc, cam); took += performance.now() - t; };
        const t0 = performance.now();
        try { s.advance(ts, true); } catch { /* a lost context: the gate opens all the same, the hall shows what it can */ }
        finally { if (dev) gl.render = render; }
        log.primed.push(+(performance.now() - t0).toFixed(1));
        log.primedRender?.push(+took.toFixed(1));
      }
      log.geometries?.push(gl.info.memory.geometries);
      log.programs[2] = programs();

      // 7. open
      still();
      warmed.add(gl);
      log.open = Math.round(performance.now());
      hall.set({ warm: true, glReady: true });

      // 8. the environment came after the cap: every Standard and Physical program changes key with it. The loop pauses
      // (the canvas keeps its last frame, the page stays live) while the parts compile again, then resumes
      if (!log.envCapped) return;
      await whenEnv();
      if (!alive) return;
      const t0 = performance.now();
      hall.set({ warm: false });
      get().setFrameloop("never");
      await compile();
      if (!alive) return;
      log.late = [Math.round(t0), Math.round(performance.now() - t0)];
      hall.set({ warm: true });
    };
    void run();
    return () => { alive = false; still(); };
  }, [mounted, get]);
  return null;
}
