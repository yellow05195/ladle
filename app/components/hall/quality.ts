"use client";

/**
 * The hall's quality tier and its frame-time governor's verdict (perf v21.4, F5; detectQuality moved from HallCanvas).
 *
 * A software renderer (SwiftShader, llvmpipe, WARP) cannot run the full hall: frames of 300 to 950 ms in the GPU
 * process, which stalls the compositor and the page with it (1 to 5 fps for the whole visit). v25.1: it gets the low
 * tier, paced (lowDpr, PACE_GAP: HallWorld), the poster only if even that cannot hold. The GPU is asked once, in a throwaway worker on a 1 px OffscreenCanvas, with
 * failIfMajorPerformanceCaveat (a blocklisted or software GPU refuses the context outright), then by its renderer
 * string (a browser told to ignore its blocklist hands SwiftShader out anyway). The context's synchronous round trips
 * to the GPU process (creation, the renderer string, the context loss) stay in the worker: on the main thread they
 * cost 5 to 8 ms on a hardware GPU, 223 to 336 ms on SwiftShader while the GPU process is busy compositing; the worker
 * costs the main thread 0.6 ms (screenshots/v21/perf/qprobe.mjs). Where a worker cannot hold a WebGL context (older
 * Safari and Firefox), the same single probe runs on the main thread: still one context, never a second one.
 */
import type { Quality } from "./store";

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;
/** past this the worker is taken as unable to answer (blocked, crashed): the main-thread probe decides */
const WORKER_MS = 2500;

/** "hw": a GPU worth the live hall; "sw": a software or caveated GPU (the paced low tier), or no WebGL; "?": this probe cannot tell */
type Gpu = "hw" | "sw" | "?";

// the worker's whole source: one context with the caveat; refused, one without it tells a caveated GPU ("sw") from a worker
// that has no WebGL at all ("?"); then the renderer string (unmasked where the browser still allows it)
const WORKER_SRC = `onmessage=()=>{let g="?";try{if(typeof OffscreenCanvas!=="undefined"){
const a={failIfMajorPerformanceCaveat:true,antialias:false,depth:false,stencil:false};
const c=new OffscreenCanvas(1,1),gl=c.getContext("webgl2",a)||c.getContext("webgl",a);
if(gl){const e=gl.getExtension("WEBGL_debug_renderer_info");const r=String(gl.getParameter(e?e.UNMASKED_RENDERER_WEBGL:gl.RENDERER));
g=${SOFTWARE}.test(r)?"sw":"hw";const l=gl.getExtension("WEBGL_lose_context");if(l)l.loseContext();}
else{const d=new OffscreenCanvas(1,1),gs=d.getContext("webgl2")||d.getContext("webgl");
if(gs){g="sw";const l=gs.getExtension("WEBGL_lose_context");if(l)l.loseContext();}}}}catch(e){g="?"}postMessage(g)}`;

/** The ?q= override (high, mid, low, none), for captures and support. */
function forced(): Quality | null {
  try {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q === "high" || q === "mid" || q === "low" || q === "none") return q;
  } catch { /* no URL */ }
  return null;
}

/** A hardware GPU's tier: phones and machines of 4 cores or fewer get mid, the rest high. */
function tierOf(): Quality {
  const phone = window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4;
  return phone ? "mid" : "high";
}

function probeWorker(): Promise<Gpu> {
  return new Promise((resolve) => {
    let w: Worker | null = null, url = "", timer = 0;
    const done = (g: Gpu) => {
      clearTimeout(timer);
      try { w?.terminate(); } catch { /* gone */ }
      if (url) URL.revokeObjectURL(url);
      resolve(g);
    };
    try {
      if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") { resolve("?"); return; }
      url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
      w = new Worker(url);
      w.onmessage = (e: MessageEvent<Gpu>) => done(e.data === "hw" || e.data === "sw" ? e.data : "?");
      w.onerror = () => done("?");
      timer = window.setTimeout(() => done("?"), WORKER_MS);
      w.postMessage(0);
    } catch { done("?"); }
  });
}

/** The same probe on the main thread (one context; refused with the caveat, no second one is made). */
function probeHere(): "hw" | "sw" {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const a: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true, antialias: false, depth: false, stencil: false };
    const gl = (c.getContext("webgl2", a) || c.getContext("webgl", a)) as WebGLRenderingContext | null;
    if (!gl) return "sw";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const r = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return SOFTWARE.test(r) ? "sw" : "hw";
  } catch { return "sw"; }
}

/** the worker's answer, asked once per page (the GPU does not change) */
let asked: Promise<Gpu> | null = null;

/** v25.1: the GPU was found to be a software one (WARP, SwiftShader, llvmpipe) or caveated: HallWorld paces its low tier for it. */
let software = false;
export function softwareGpu(): boolean { return software; }

/**
 * Asks the GPU ahead of detectQuality (fix:1, T7): HallCanvas calls it from its module's load, so the worker (a thread,
 * then a context made in the GPU process) runs beside the page's hydration. Asked from HallCanvas's effect, after the
 * hydration, its round trip came between it and the canvas: 20 ms on a calm machine, up to 240 ms on a loaded one.
 */
export function preloadQuality(): void {
  if (asked || typeof window === "undefined" || forced() || typeof WebGLRenderingContext === "undefined") return;
  asked = probeWorker();
}

/**
 * The hall's tier: the ?q= override, else high or mid by the screen and the cores on a hardware GPU. v25.1: a software
 * or caveated GPU (a browser with its graphics acceleration off: common) gets the low tier, paced for it (HallWorld:
 * a small drawing buffer, frames spaced so the compositor keeps time for the page, the poster if even that cannot
 * hold), no longer the poster outright: the room, its players and the tour's camera stay live. No WebGL: the poster.
 * Asynchronous: the GPU is asked off the main thread (about 10 ms on a hardware GPU).
 */
export async function detectQuality(): Promise<Quality> {
  const q = forced();
  if (q) { software = q === "low"; return q; }
  if (typeof WebGLRenderingContext === "undefined") return "none";
  const g = await (asked ??= probeWorker());
  if ((g === "?" ? probeHere() : g) === "hw") return tierOf();
  software = true;
  return "low";
}

/**
 * v25.1: the low tier's drawing buffer, as a pixel ratio: about LOW_LINES lines tall whatever the window (a software
 * renderer's frame costs its pixel count; 420 lines of a 945-line window is a fifth of its pixels), never above 1.
 */
const LOW_LINES = 420;
export function lowDpr(): number {
  if (typeof window === "undefined") return 1;
  return Math.max(0.25, Math.min(1, LOW_LINES / Math.max(1, window.innerHeight)));
}

/**
 * v25.1: the low tier's pacing. A software frame is drawn in the GPU process, which also composites the page: back to
 * back frames freeze the scroll. The next frame is asked PACE_GAP times the last one's cost after it (the cost read as
 * the wait from asking for a frame to drawing it), at most 15 a second; a median cost over GIVE_UP_MS, once warm, means
 * the machine cannot hold even this, and the hall falls back to the poster.
 */
export const PACE_GAP = 1.6;
export const GIVE_UP_MS = 450;

/** AdaptiveDpr's window: one verdict per this many ms of frames. */
export const FRAME_WINDOW_MS = 2000;

/**
 * AdaptiveDpr's verdict on one full window of frame intervals (ms): "slow" steps the quality down (the pixel ratio, then
 * the shadow map's rate), "fast" counts towards stepping it back up, "ok" holds; null says nothing (the loop is not
 * running at full rate, the tab is hidden, or the hall is not warm yet: those frames say nothing about the GPU).
 *
 * F5: a window with few frames used to be "no verdict" too (fewer than 20), so the governor never acted below 10 fps,
 * where it matters most. Now the median decides at any count: a GPU that holds 5 fps steps down; one long stall in an
 * otherwise smooth window (a GC, a modal opening, a tab switch's first frame) leaves the median where it was.
 */
export function frameVerdict(intervals: readonly number[], o: { running: boolean; visible: boolean; warm: boolean }): "slow" | "fast" | "ok" | null {
  if (!o.running || !o.visible || !o.warm || intervals.length < 2) return null;
  const a = [...intervals].sort((x, y) => x - y);
  const med = a[Math.floor(a.length / 2)] ?? 16;
  return med > 19 ? "slow" : med < 13 ? "fast" : "ok";
}
