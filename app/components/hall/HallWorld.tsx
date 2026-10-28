"use client";

/**
 * The hall's R3F canvas (v20), loaded on the client only. One WebGL context
 * per page. The frame loop renders only while the tab is visible and no
 * modal canvas is open; below the fold it drops to 15 fps, past two
 * viewport heights it stops (one last frame), except on the home's scroll
 * tour (v21), where the hall is the page and keeps its full rate. The low
 * tier (a software renderer, e.g. SwiftShader) always runs at 15 fps. The
 * shader programs are compiled before the first scroll (Warmup, v21 r2).
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import { Cast } from "./Cast";
import { CameraRig } from "./CameraRig";
import { DrumAssembly } from "./DrumAssembly";
import { FloorTicker } from "./FloorTicker";
import { HallScene } from "./HallScene";
import { Ladle } from "./Ladle";
import { Staff } from "./Staff";
import { hall, useHall, type Quality } from "./store";
import * as THREE from "three";
import { TOUR, tourMode, tourPose, type TourPose } from "./tour";

function FrameDriver({ quality }: { quality: Quality }) {
  const { setFrameloop, invalidate, gl } = useThree();
  const scroll = useHall((s) => s.scroll);
  const paused = useHall((s) => s.paused);
  // v21: on the home's scroll tour the hall IS the page: it keeps playing at full rate the whole way down
  const tour = useHall((s) => s.tour);
  useEffect(() => {
    let id = 0;
    const apply = () => {
      clearInterval(id);
      const hidden = document.visibilityState === "hidden";
      const below = tour ? 0 : scroll;
      if (hidden || paused || below === 2) { setFrameloop("never"); if (!hidden) invalidate(); return; }
      if (quality === "low" || below === 1) {
        setFrameloop("demand");
        id = window.setInterval(() => invalidate(), 1000 / 15);
        return;
      }
      setFrameloop("always");
    };
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", apply); };
  }, [quality, scroll, tour, paused, setFrameloop, invalidate]);
  useEffect(() => {
    const ctx = gl.getContext();
    (window as unknown as { __hallGL?: string }).__hallGL = ctx instanceof WebGL2RenderingContext ? "webgl2" : "webgl";
    hall.set({ glReady: true });
  }, [gl]);
  return null;
}

/**
 * v21 fix (r2): the GPU programs and textures are prepared before anyone scrolls. The scroll tour brings
 * new objects into view (the stands, the bear's gallery, the door, the back of the room); each one's
 * first frame used to compile its shader program and upload its textures on the spot (frames of 100 to
 * 270 ms, the camera stepping half a metre). Once the room is lit, in idle time, every material in the
 * scene (visible or not, in or out of the frustum: compile() walks the graph with the room's lights) is
 * compiled, with KHR_parallel_shader_compile where the GPU has it (compileAsync), and every texture is
 * uploaded. Then, every 2 s for the first 30 s, only the parts of the scene that gained a material since
 * (the crowd's species, the watchers, the staff) are compiled again: a whole-scene pass costs tens of
 * milliseconds of CPU even when every program exists, which must never land in the middle of a scroll.
 * Once compiled, the room is drawn once from every stop and halfway along every leg, into one pixel (the
 * driver's own per-object state). Outside development the shader error check (a synchronous info-log
 * read per program) is off.
 */
function Warmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const lit = useHall((s) => s.lit);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") gl.debug.checkShaderErrors = false;
  }, [gl]);
  useEffect(() => {
    if (!lit) return;
    let alive = true, runs = 0, idleId = 0;
    const timers: number[] = [];
    const seenTex = new WeakSet<THREE.Texture>();
    const seenMat = new WeakSet<THREE.Material>();
    const w = window as unknown as { requestIdleCallback?: (f: (d?: { timeRemaining: () => number }) => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const run = () => {
      idleId = 0;
      if (!alive) return;
      const t0 = performance.now();
      const n0 = gl.info.programs?.length ?? 0;
      // the scene's top-level parts that hold a material not compiled yet (the first pass: all of them)
      const parts: THREE.Object3D[] = [];
      for (const part of scene.children) {
        let fresh = false;
        part.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (!m) return;
          for (const mat of Array.isArray(m) ? m : [m]) {
            if (!seenMat.has(mat)) { seenMat.add(mat); fresh = true; }
            for (const v of Object.values(mat)) {
              if (v instanceof THREE.Texture && !seenTex.has(v) && v.image) { seenTex.add(v); gl.initTexture(v); }
            }
          }
        });
        if (fresh) parts.push(part);
      }
      if (parts.length) {
        void Promise.all(parts.map((part) => gl.compileAsync(part, camera, scene))).then(() => {
          if (process.env.NODE_ENV !== "production") {
            const d = window as unknown as { __warm?: Array<[number, number, number, number]> };
            // [when (performance.now()), parts compiled, how long until every program was ready (ms), programs added]
            d.__warm = [...(d.__warm ?? []), [Math.round(t0), parts.length, Math.round(performance.now() - t0), (gl.info.programs?.length ?? 0) - n0]];
          }
          if (!primed) { primed = true; prime(0); }
        }).catch(() => {});
      }
    };
    // then the GPU's side: one draw of the room from every stop of the tour and halfway along every leg, into a single pixel
    // of the canvas (the next frame repaints it), one pose per idle slot, so the driver builds each object's draw state
    // before the reader scrolls to it rather than in the middle of the scroll
    let primed = false;
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
    const pose: TourPose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 40, vs: 0, lift: 0 };
    const prime = (i0: number) => {
      if (!alive || i0 * 0.5 > TOUR.length - 1) {
        if (process.env.NODE_ENV !== "production") (window as unknown as { __primed?: number }).__primed = Math.round(performance.now());
        return;
      }
      const go = (deadline?: { timeRemaining: () => number }) => {
        idleId = 0;
        if (!alive) return;
        let i = i0;
        // as many poses as this idle slot has room for (at least one)
        do {
          const t = i * 0.5;
          if (t > TOUR.length - 1) break;
          const el = gl.domElement;
          const mode = tourMode(el.clientWidth || 1280, el.clientHeight || 800);
          tourPose(t, mode, { fov: 40, vs: 0 }, pose);
          cam.aspect = (el.clientWidth || 1280) / (el.clientHeight || 800);
          cam.fov = pose.fov * 1.25;
          cam.updateProjectionMatrix();
          cam.position.set(pose.px, pose.py, pose.pz);
          cam.lookAt(pose.lx, pose.ly, pose.lz);
          const was = gl.getScissorTest();
          gl.setScissorTest(true);
          gl.setScissor(0, 0, 1, 1);
          gl.render(scene, cam);
          gl.setScissorTest(was);
          i++;
        } while (deadline && deadline.timeRemaining() > 12);
        prime(i);
      };
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(go as () => void, { timeout: 600 });
      else window.setTimeout(go, 50);
    };
    const later = (ms: number) => timers.push(window.setTimeout(() => {
      if (!alive) return;
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(run, { timeout: 1000 });
      else run();
      if (++runs < 15) later(2000);
    }, ms));
    later(250);
    return () => { alive = false; timers.forEach(clearTimeout); if (idleId) w.cancelIdleCallback?.(idleId); };
  }, [lit, gl, scene, camera]);
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
 * keeps its fixed 15 fps and ratio 1.
 */
function AdaptiveDpr({ max }: { max: number }) {
  const setDpr = useThree((s) => s.setDpr);
  const gl = useThree((s) => s.gl);
  const lazyShadows = useRef(false);
  const frameN = useRef(0);
  useEffect(() => () => { gl.shadowMap.autoUpdate = true; }, [gl]);
  const dpr = useRef(Math.min(max, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));
  const win = useRef<number[]>([]);
  const t0 = useRef(0);
  const calm = useRef(0);
  const last = useRef(0);
  useFrame((state) => {
    const now = performance.now();
    if (lazyShadows.current && ++frameN.current % 3 === 0) gl.shadowMap.needsUpdate = true;
    // below the fold (15 fps on demand) or paused: the frame time says nothing about the GPU
    if (state.frameloop !== "always") { win.current = []; last.current = 0; t0.current = 0; return; }
    if (last.current) win.current.push(now - last.current);
    last.current = now;
    if (!t0.current) t0.current = now;
    if (now - t0.current < 2000) return;
    t0.current = now;
    const a = win.current.sort((x, y) => x - y);
    const med = a[Math.floor(a.length / 2)] ?? 16;
    win.current = [];
    if (a.length < 20) return; // paused or throttled: no verdict
    const shadows = (on: boolean) => { lazyShadows.current = !on; gl.shadowMap.autoUpdate = on; gl.shadowMap.needsUpdate = true; };
    if (med > 19 && dpr.current > 1) { dpr.current = Math.max(1, dpr.current - 0.25); calm.current = 0; setDpr(dpr.current); }
    else if (med > 19 && gl.shadowMap.enabled && !lazyShadows.current) { calm.current = 0; shadows(false); }
    else if (med < 13 && (lazyShadows.current || dpr.current < max)) {
      if (++calm.current >= 5) {
        calm.current = 0;
        if (lazyShadows.current) shadows(true);
        else { dpr.current = Math.min(max, dpr.current + 0.25); setDpr(dpr.current); }
      }
    }
    else calm.current = 0;
    if (process.env.NODE_ENV !== "production") Object.assign(window as unknown as Record<string, unknown>, { __dpr: dpr.current, __lazyShadows: lazyShadows.current });
  });
  return null;
}

export default function HallWorld({ quality, phone, compact = false }: { quality: Quality; phone: boolean; compact?: boolean }) {
  const onLadle = useCallback(() => {}, []);
  return (
    <Canvas
      className="hall-gl"
      dpr={quality === "high" ? [1, 1.5] : 1}
      shadows={quality === "high" ? "soft" : false}
      gl={{ antialias: quality !== "low", powerPreference: "high-performance", alpha: false, preserveDrawingBuffer: process.env.NODE_ENV !== "production" }}
      camera={{ fov: 30, position: [0, 6, 11.6], near: 0.1, far: 60 }}
      aria-hidden="true"
      tabIndex={-1}
    >
      <FrameDriver quality={quality} />
      {quality === "none" ? null : <Warmup />}
      {process.env.NODE_ENV !== "production" ? <PerfProbe /> : null}
      {quality === "high" ? <AdaptiveDpr max={1.5} /> : null}
      <CameraRig phone={phone} compact={compact} />
      <HallScene quality={quality} compact={compact} />
      <DrumAssembly quality={quality} />
      <Ladle onReady={onLadle} />
      <Cast quality={quality} phone={phone || compact} compact={compact} />
      {compact ? null : <Staff quality={quality} />}
      <FloorTicker />
    </Canvas>
  );
}
