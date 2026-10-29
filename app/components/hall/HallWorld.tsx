"use client";

/**
 * The hall's R3F canvas (v20), loaded on the client only. One WebGL context
 * per page. The frame loop renders only while the tab is visible and no
 * modal canvas is open; below the fold it drops to 15 fps, past two
 * viewport heights it stops (one last frame), except on the home's scroll
 * tour (v21), where the hall is the page and keeps its full rate. The low
 * tier always runs at 15 fps at most; v25.1: it is a software GPU's (quality.ts),
 * drawn about 420 lines tall and paced to leave the compositor time for the
 * page, the poster if even that cannot hold. perf v21.4: no frame is drawn before the WarmGate
 * has linked every program under the final environment (the Canvas starts
 * in "never"), and the scene mounts in four steps under the loader's still.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cast } from "./Cast";
import { CameraRig } from "./CameraRig";
import { DrumAssembly, preloadCradle } from "./DrumAssembly";
import { FloorTicker } from "./FloorTicker";
import { HallEnv, HallScene, shellReady } from "./HallScene";
import { Ladle, ladleReady } from "./Ladle";
import { Staff } from "./Staff";
import { hall, useHall, type Quality } from "./store";
import * as THREE from "three";
import { TOUR, tourBus, tourMode, tourPose, type TourPose } from "./tour";
import { onScrollInput, scrollState, scrollingNow } from "./tour/scroll";
import { FRAME_WINDOW_MS, GIVE_UP_MS, PACE_GAP, REST_AFTER_MS, REST_MAX_MS, frameVerdict, lowDpr, softwareGpu } from "./quality";
import { WarmGate } from "./WarmGate";

function FrameDriver({ quality, onLowDpr }: { quality: Quality; onLowDpr?: (r: number) => void }) {
  const { setFrameloop, invalidate, gl } = useThree();
  // v21: on the home's scroll tour the hall IS the page: it keeps playing at full rate the whole way down
  // (v21.3: read as one value, so crossing a scroll threshold on the tour re-renders nothing here)
  const below = useHall((s) => (s.tour ? 0 : s.scroll));
  const paused = useHall((s) => s.paused);
  // perf v21.4 (F1): no frame until the WarmGate has linked every program under the final environment (the Canvas starts in "never")
  const warm = useHall((s) => s.warm);
  // v25.1: a software GPU's low tier is paced (quality.ts PACE_GAP): the next frame is asked once the last one has had
  // its cost again in free time, so the GPU process, which composites the page too, keeps time for the scroll
  const paced = quality === "low" && softwareGpu();
  // res: the drawing buffer's size, "move" while the camera travels, "rest" once it has settled (quality.ts lowDpr);
  // restOk goes false on a machine whose sharp frames cost too much (the scroll would wait on them)
  const pace = useRef({ askedAt: 0, timer: 0, costs: [] as number[], rests: [] as number[], since: 0, alive: false, res: "move" as "move" | "rest", restOk: true, warmAt: 0, frames: 0, bad: 0 });
  const setRes = useCallback((r: "move" | "rest") => {
    const p = pace.current;
    if (p.res === r) return;
    p.res = r;
    onLowDpr?.(lowDpr(r === "rest"));
  }, [onLowDpr]);
  // the reader's wheel, finger or key: the small, fast picture at once (the camera is about to travel)
  useEffect(() => (paced ? onScrollInput(() => setRes("move")) : undefined), [paced, setRes]);
  useFrame(() => {
    const p = pace.current;
    if (!p.alive || !p.askedAt) return;
    const now = performance.now();
    const cost = now - p.askedAt;
    p.askedAt = 0;
    const settled = p.restOk && !scrollingNow(REST_AFTER_MS) && !tourBus.jump && now - scrollState.inputAt > REST_AFTER_MS;
    if (p.res === "rest") {
      // sharp frames that cost too much keep the picture small for the rest of the visit
      p.rests.push(cost);
      if (p.rests.length >= 6) { const a = [...p.rests].sort((x, y) => x - y); p.rests = []; if ((a[3] ?? 0) > REST_MAX_MS) { p.restOk = false; setRes("move"); } }
    }
    if (settled !== (p.res === "rest")) setRes(settled ? "rest" : "move");
    if (hall.get().warm && p.res === "move") {
      if (!p.warmAt) p.warmAt = now;
      // the first seconds after warm draw what the driver still builds on first use (hundreds of ms a frame on a
      // software GPU, then ~50): no verdict on them (judged, they sent a capable machine to the poster at ~5 s)
      if (++p.frames > 12 && now - p.warmAt > 6000) {
        p.costs.push(cost);
        if (!p.since) p.since = now;
        // ~3 s of frames, then a verdict: two medians in a row past GIVE_UP_MS is a machine that cannot hold even this (the poster)
        if (now - p.since > 3000) {
          const a = [...p.costs].sort((x, y) => x - y);
          const med = a[a.length >> 1] ?? 0;
          p.costs = []; p.since = 0;
          if (med <= GIVE_UP_MS) p.bad = 0;
          else if (++p.bad >= 2) { p.alive = false; hall.set({ quality: "none" }); return; }
        }
      }
    }
    p.timer = window.setTimeout(() => { if (p.alive) { p.askedAt = performance.now(); invalidate(); } }, Math.max(1000 / 15, cost * PACE_GAP));
  });
  useEffect(() => {
    let id = 0;
    const p = pace.current;
    const apply = () => {
      clearInterval(id);
      clearTimeout(p.timer);
      p.alive = false;
      const hidden = document.visibilityState === "hidden";
      if (!warm || hidden || paused || below === 2) { setFrameloop("never"); if (!hidden) invalidate(); return; }
      if (paced) {
        setFrameloop("demand");
        p.alive = true;
        p.askedAt = performance.now();
        invalidate();
        return;
      }
      if (quality === "low" || below === 1) {
        setFrameloop("demand");
        id = window.setInterval(() => invalidate(), 1000 / 15);
        return;
      }
      setFrameloop("always");
    };
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => { clearInterval(id); clearTimeout(p.timer); p.alive = false; document.removeEventListener("visibilitychange", apply); };
  }, [warm, quality, below, paused, paced, setFrameloop, invalidate]);
  // (glReady is the WarmGate's: it goes true with warm)
  useEffect(() => {
    const ctx = gl.getContext();
    (window as unknown as { __hallGL?: string }).__hallGL = ctx instanceof WebGL2RenderingContext ? "webgl2" : "webgl";
  }, [gl]);
  return null;
}

/**
 * v21 fix (r2), perf v21.4: the GPU's side of the scroll, prepared before anyone scrolls. The programs are no longer
 * compiled here: the WarmGate links the whole scene's before the first frame (under its final environment), and
 * attachWarm (warm.ts) those of every object that lands later, before it is shown (the passes this ran beside the live
 * loop made the loop wait on the same programs: a 20-program pass took 3.26 s while the frames linked them one by one).
 * What is left is the driver's own per-object state: once the hall is warm and lit, the room is drawn once from every
 * stop of the tour and halfway along every leg, into one pixel, one pose per idle slot. Outside development the shader
 * error check (a synchronous info-log read per program) is off.
 */
function Warmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") gl.debug.checkShaderErrors = false;
  }, [gl]);
  // perf v21.4 (F1): the programs are the WarmGate's (the whole scene, before the first frame) and attachWarm's (what lands
  // later); what is left here is the GPU's side, once the hall is warm and lit
  useEffect(() => {
    let alive = true, idleId = 0;
    const timers: number[] = [];
    type Deadline = { timeRemaining: () => number; didTimeout?: boolean };
    const w = window as unknown as { requestIdleCallback?: (f: (d: Deadline) => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const idle = (f: (d: Deadline) => void, timeout: number) => {
      if (w.requestIdleCallback) idleId = w.requestIdleCallback((d) => { idleId = 0; if (alive) f(d); }, { timeout });
      else timers.push(window.setTimeout(() => { if (alive) f({ timeRemaining: () => 8 }); }, 30));
    };
    // one draw of the room from every stop of the tour and halfway along every leg, into a single pixel of the canvas (the
    // next frame repaints it), so the driver builds each object's draw state before the reader scrolls to it rather than in
    // the middle of the scroll. fix:scroll:1: one pose per idle slot, and only when the slot has room for it (a pose is a
    // whole-scene draw: several ms), never while the page scrolls
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
    const pose: TourPose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 40, vs: 0, lift: 0 };
    let askedAt = 0, askedFor = -1;
    let litAt = 0;
    const prime = (i: number) => {
      if (!litAt) litAt = performance.now();
      if (performance.now() - litAt < 1500) { timers.push(window.setTimeout(() => { if (alive) prime(i); }, 1500 - (performance.now() - litAt))); return; }
      if (askedFor !== i) { askedFor = i; askedAt = performance.now(); }
      if (!alive || i * 0.5 > TOUR.length - 1) {
        if (process.env.NODE_ENV !== "production") (window as unknown as { __primed?: number }).__primed = Math.round(performance.now());
        return;
      }
      idle((d) => {
        // (a fast display leaves short idle slots: past the timeout, one pose anyway, the page being still)
        if (scrollingNow() || (d.timeRemaining() < 8 && !d.didTimeout && performance.now() - askedAt < 600)) { timers.push(window.setTimeout(() => { if (alive) prime(i); }, scrollingNow() ? 320 : 0)); return; }
        const el = gl.domElement;
        const mode = tourMode(el.clientWidth || 1280, el.clientHeight || 800);
        tourPose(i * 0.5, mode, { fov: 40, vs: 0 }, pose);
        cam.aspect = (el.clientWidth || 1280) / (el.clientHeight || 800);
        cam.fov = pose.fov * 1.25;
        cam.updateProjectionMatrix();
        cam.position.set(pose.px, pose.py, pose.pz);
        cam.lookAt(pose.lx, pose.ly, pose.lz);
        const was = gl.getScissorTest();
        gl.setScissorTest(true);
        gl.setScissor(0, 0, 1, 1);
        const tp = performance.now();
        gl.render(scene, cam);
        gl.setScissorTest(was);
        if (process.env.NODE_ENV !== "production") { const dw = window as unknown as { __primeLog?: number[][] }; (dw.__primeLog ??= []).push([Math.round(tp), i, +(performance.now() - tp).toFixed(1), gl.info.programs?.length ?? 0]); }
        prime(i + 1);
      }, 600);
    };
    // (the priming waits 1.5 s past the room being lit: the loader's pull back to the first screen is never interrupted)
    let primed = false;
    const go = () => { const s = hall.get(); if (primed || !s.warm || !s.lit) return; primed = true; off(); prime(0); };
    const off = hall.subscribe(go);
    go();
    return () => { alive = false; off(); timers.forEach(clearTimeout); if (idleId) w.cancelIdleCallback?.(idleId); };
  }, [gl, scene]);
  return null;
}

/**
 * Dev only: frame probes for the capture scripts. `window.__perf` keeps the
 * last 600 frames: CPU ms from the first useFrame to the end of gl.render
 * (scene logic + draw submission), the rAF interval, draw calls, triangles.
 */
function PerfProbe() {
  const { gl, camera, scene } = useThree();
  const t0 = useRef(0);
  const last = useRef(0);
  useEffect(() => {
    const w = window as unknown as { __gl?: unknown; __perf?: unknown; __camera?: unknown };
    w.__gl = gl;
    w.__camera = camera;
    (window as unknown as { __scene?: unknown }).__scene = scene;
    const buf: Array<[number, number, number, number]> = [];
    w.__perf = buf;
    const render = gl.render.bind(gl);
    gl.render = (scene, camera) => {
      render(scene, camera);
      const now = performance.now();
      if (t0.current) {
        buf.push([now - t0.current, last.current ? t0.current - last.current : 0, gl.info.render.calls, gl.info.render.triangles]);
        if (buf.length > 600) buf.shift();
        last.current = t0.current;
      }
    };
    return () => { gl.render = render; };
  }, [gl, camera, scene]);
  useFrame(() => { t0.current = performance.now(); }, -1000);
  return null;
}

/**
 * v21: the resolution follows the frame time. Over 2 s windows, a median
 * frame above 19 ms steps the pixel ratio down by 0.25 (never below 1); at
 * ratio 1 the next step redraws the shadow map every third frame only (the
 * high tier's soft shadows are its dearest pass on an integrated GPU). Ten
 * seconds under 13 ms undoes one step (the shadows first). The low tier
 * keeps its fixed 15 fps and ratio 1. perf v21.4 (F5, quality.ts
 * frameVerdict): a window gives its verdict at any frame count (a GPU held
 * under 10 fps steps down too), and none before the hall is warm.
 *
 * v21.3: the ratio is the Canvas's own prop (HallWorld's state, set through
 * onDpr), so a render of the Canvas can never put it back to its default;
 * it never goes above the screen's own ratio (no supersampling on a ratio-1
 * screen); and a new ratio (a canvas reallocation) waits for the page to be
 * still for half a second, never lands in the middle of a scroll.
 */
function AdaptiveDpr({ max, start, onDpr }: { max: number; start: number; onDpr: (v: number) => void }) {
  const gl = useThree((s) => s.gl);
  const lazyShadows = useRef(false);
  const frameN = useRef(0);
  // v21.3: the shadow map is redrawn here, at most 60 times a second (the spot is fixed, so only the moving casters need it:
  // a 60 Hz screen sees no change, a 120 to 240 Hz one stops paying for the shadow pass on every frame)
  const shadowAt = useRef(0);
  useEffect(() => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; return () => { gl.shadowMap.autoUpdate = true; }; }, [gl]);
  const dpr = useRef(start);
  const pending = useRef<number | null>(null);
  const win = useRef<number[]>([]);
  const t0 = useRef(0);
  const calm = useRef(0);
  const last = useRef(0);
  useFrame((state) => {
    const now = performance.now();
    if (lazyShadows.current) { if (++frameN.current % 3 === 0) gl.shadowMap.needsUpdate = true; }
    else if (now - shadowAt.current >= 15.5) { gl.shadowMap.needsUpdate = true; shadowAt.current = now; }
    // a new ratio waits for the page to be still (reallocating the canvas costs a frame)
    if (pending.current !== null && !scrollingNow(500)) { onDpr(pending.current); pending.current = null; }
    // below the fold (15 fps on demand) or paused: the frame time says nothing about the GPU
    if (state.frameloop !== "always") { win.current = []; last.current = 0; t0.current = 0; return; }
    if (last.current) win.current.push(now - last.current);
    last.current = now;
    if (!t0.current) t0.current = now;
    if (now - t0.current < FRAME_WINDOW_MS) return;
    t0.current = now;
    // perf v21.4 (F5): any full window gives a verdict (a GPU held under 10 fps now steps down); none before the hall is warm
    const v = frameVerdict(win.current, { running: state.frameloop === "always", visible: document.visibilityState === "visible", warm: hall.get().warm });
    win.current = [];
    if (!v) return;
    const shadows = (on: boolean) => { lazyShadows.current = !on; gl.shadowMap.needsUpdate = true; };
    const step = (r: number) => { dpr.current = r; pending.current = r; };
    if (v === "slow" && dpr.current > 1) { calm.current = 0; step(Math.max(1, dpr.current - 0.25)); }
    else if (v === "slow" && gl.shadowMap.enabled && !lazyShadows.current) { calm.current = 0; shadows(false); }
    else if (v === "fast" && (lazyShadows.current || dpr.current < max)) {
      if (++calm.current >= 5) {
        calm.current = 0;
        if (lazyShadows.current) shadows(true);
        else step(Math.min(max, dpr.current + 0.25));
      }
    }
    else calm.current = 0;
    if (process.env.NODE_ENV !== "production") Object.assign(window as unknown as Record<string, unknown>, { __dpr: dpr.current, __lazyShadows: lazyShadows.current });
  });
  return null;
}

/**
 * perf v21.4 (F7): the scene's mount steps: 1 the drivers, the camera and the environment (HallEnv: fix:1, the HDR and
 * the PMREM's links from the first step, the environment being what the warm gate waits on), 2 the room (HallScene) and
 * the crowd, 3 the drum, the floor ticker and the staff, 4 the ladle (its extruded bowl alone was 60 ms of a shared
 * step in development). fix:1 (T1): the crowd no longer mounts with the first step, the canvas's creation (its cleanup
 * now survives development's double effects: Cast); its frame callback still runs after the camera's.
 */
const MOUNT_STEPS = 4;

/**
 * fix:1 (T3): before a step mounts, the geometry its commit would otherwise build on the spot, built ahead (assets.ts
 * buildAhead): the room's shell before step 2, the ladle's body before step 4. A page that never went idle (4x CPU)
 * built the whole shell inside the room's commit (a 277 ms task).
 */
const STEP_READY: Partial<Record<number, () => Promise<void>>> = { 2: shellReady, 4: ladleReady };

/**
 * The staggered mount's clock, inside the Canvas: each step is asked for one idle slot after the scene's
 * own commit of the one before. (Counted from HallWorld's mount, outside, the steps all ran out before the Canvas had
 * measured itself and made its root, and the whole scene still mounted in one 340 ms commit.)
 */
function MountSteps({ step, next }: { step: number; next: () => void }) {
  useEffect(() => {
    // (in development, when each step's commit was in: window.__mountSteps, read by the gate's log)
    if (process.env.NODE_ENV !== "production") ((window as unknown as { __mountSteps?: number[] }).__mountSteps ??= [])[step - 1] = Math.round(performance.now());
    if (step >= MOUNT_STEPS) return;
    let alive = true;
    let cancel = () => {};
    const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const go = () => {
      if (!alive) return;
      // fix:1 (T7): the environment in (a warm visit), the steps are what the gate waits on: the next one in a task of its
      // own (a message), not after an idle slot that waited out its timeout behind the arrival's other tasks
      if (hall.get().loaded.env) {
        const c = new MessageChannel();
        c.port1.onmessage = () => { c.port1.close(); if (alive) next(); };
        c.port2.postMessage(0);
        cancel = () => c.port1.close();
        return;
      }
      // (a short timeout: the steps are what the gate waits on once the environment is in)
      if (w.requestIdleCallback) { const id = w.requestIdleCallback(next, { timeout: 50 }); cancel = () => w.cancelIdleCallback?.(id); return; }
      const id = window.setTimeout(next, 16);
      cancel = () => clearTimeout(id);
    };
    const ready = STEP_READY[step + 1];
    if (ready) void ready().then(go); else go();
    return () => { alive = false; cancel(); };
  }, [step, next]);
  return null;
}

/**
 * v21.3: memoised, with the scene's children built once per quality and layout: a render of the hall's DOM around it
 * (a resize, the phone band) never re-renders the Canvas, nor through it every component of the scene.
 */
function HallWorld({ quality, phone, compact = false }: { quality: Quality; phone: boolean; compact?: boolean }) {
  const onLadle = useCallback(() => {}, []);
  // the high tier's ratio: the screen's own up to 1.5, then whatever AdaptiveDpr finds the GPU can hold
  const maxDpr = quality === "high" ? Math.min(1.5, Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1)) : 1;
  const [dpr, setDpr] = useState(maxDpr);
  const gl = useMemo(() => ({ antialias: quality !== "low", powerPreference: "high-performance" as const, alpha: false, preserveDrawingBuffer: process.env.NODE_ENV !== "production" }), [quality]);
  const camera = useMemo(() => ({ fov: 30, position: [0, 6, 11.6] as [number, number, number], near: 0.1, far: 60 }), []);
  // the canvas is fixed: its box never moves with the scroll (no measuring on scroll)
  const resize = useMemo(() => ({ scroll: false }), []);
  // perf v21.4 (F7): the scene mounts in MOUNT_STEPS steps, one per idle slot, under the still (one 96-124 ms commit
  // becomes one per step); the WarmGate compiles after the last. MountSteps moves them on from inside the Canvas
  const [step, setStep] = useState(1);
  const nextStep = useCallback(() => setStep((s) => Math.min(MOUNT_STEPS, s + 1)), []);
  // (fix:1: the cradle, which the loader goes live on, parsed from the first step rather than the drum's own: DrumAssembly)
  useEffect(() => { if (quality !== "none") preloadCradle(); }, [quality]);
  // each slot is an element of its own memo, the same object from one step to the next: a step's commit renders what it
  // mounts, the clock and the gate, never again what is already in (one memo for the whole fragment re-rendered every
  // mounted component of the scene at every step). Each slot keeps its place, so nothing remounts when the step moves
  const mountedAll = step >= MOUNT_STEPS;
  // v25.1: the low tier's drawing buffer is about 460 lines tall while the camera travels, 760 once it rests (quality.ts
  // lowDpr; FrameDriver switches it), the browser scales it up
  const [lowRatio, setLowRatio] = useState(() => (quality === "low" ? lowDpr() : 1));
  const driver = useMemo(() => <FrameDriver quality={quality} onLowDpr={setLowRatio} />, [quality]);
  const clock = useMemo(() => <MountSteps step={step} next={nextStep} />, [step, nextStep]);
  const gate = useMemo(() => (quality === "none" ? null : <WarmGate mounted={mountedAll} />), [quality, mountedAll]);
  const first = useMemo(() => (
    <>
      {/* (v25.1: not on the low tier: each priming pose is a whole-scene draw, hundreds of ms on a software GPU) */}
      {quality === "none" || quality === "low" ? null : <Warmup />}
      {process.env.NODE_ENV !== "production" ? <PerfProbe /> : null}
      {quality === "high" ? <AdaptiveDpr max={maxDpr} start={maxDpr} onDpr={setDpr} /> : null}
      <CameraRig phone={phone} compact={compact} />
      <HallEnv quality={quality} />
    </>
  ), [quality, phone, compact, maxDpr]);
  const room = useMemo(() => <HallScene quality={quality} compact={compact} />, [quality, compact]);
  const crowd = useMemo(() => <Cast quality={quality} phone={phone || compact} compact={compact} />, [quality, phone, compact]);
  const drum = useMemo(() => <><DrumAssembly quality={quality} /><FloorTicker />{compact ? null : <Staff quality={quality} />}</>, [quality, compact]);
  const ladle = useMemo(() => <Ladle onReady={onLadle} />, [onLadle]);
  const scene = useMemo(() => (
    <>
      {driver}
      {clock}
      {gate}
      {first}
      {step >= 2 ? room : null}
      {step >= 2 ? crowd : null}
      {step >= 3 ? drum : null}
      {step >= 4 ? ladle : null}
    </>
  ), [driver, clock, gate, first, room, crowd, drum, ladle, step]);
  // perf v21.4 (F1): the soft shadows are three r186's PCF ("percentage"). R3F's "soft" is PCFSoftShadowMap, which r186 has
  // removed: compile() keyed every program SHADOWMAP_TYPE_BASIC with it, then the first shadow pass swapped the type to
  // PCFShadowMap (WebGLShadowMap.render), so the first frame linked every program a second time (the same pixels after)
  return (
    <Canvas
      className="hall-gl"
      frameloop="never"
      dpr={quality === "high" ? dpr : quality === "low" ? lowRatio : 1}
      shadows={quality === "high" ? "percentage" : false}
      gl={gl}
      camera={camera}
      resize={resize}
      aria-hidden="true"
      tabIndex={-1}
    >
      {scene}
    </Canvas>
  );
}

export default memo(HallWorld);
