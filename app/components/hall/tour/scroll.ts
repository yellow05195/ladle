/**
 * The hall's one scroll reader (v21.3). A single passive scroll listener reads
 * window.scrollY once per scroll event (the browser runs scroll events in the
 * frame's update, just before the rAF callbacks, so the value is the one this
 * frame paints) and hands it to every subscriber. Subscribers only write
 * (styles, the tour bus, the hall store); nothing reads layout on a scroll
 * frame, and the viewport size is cached on resize. The camera rig reads the
 * stored y in useFrame, never the DOM.
 *
 * It also notes the reader's own input (wheel, touch, keys, pointer), so the
 * page can tell a scroll the reader made from one it did not (a restored
 * scroll, an anchor), cancel a jump the reader interrupts, and give the camera
 * a shorter follow under a finger.
 *
 * fix:scroll:r3, the smoothed page: on the tour (smoothScroll(true)) a mouse
 * wheel's notches and the paging keys (Page Up and Down, Space, the arrows)
 * no longer jump the page or leave it to the browser's own animation: the page
 * itself glides, and the captions and the camera ride the same value in the
 * same frame (the camera rig steps the glide at the top of its frame,
 * scrollTick). Each notch is spread over a little more than the time to
 * the next one, so a spun wheel scrolls at an even speed with no pulse per
 * notch; fix:scroll:r3-2: a click starts at once and eases out over about a
 * fifth of a second (half of it in about 85 ms), so clicks at a reading pace
 * run into one another, and the paging keys move in one eased curve. The glide
 * is rounded by one short critically damped stage (25 ms); a reversal turns at
 * once. A trackpad's fine deltas, a finger, the scrollbar and every
 * scroll the page makes itself stay native and immediate (the glide gives way
 * to them the moment they move the page); nothing is smoothed under reduced
 * motion. Same distances as the browser: native speed, no added momentum.
 */

type Sub = (y: number) => void;
type InputKind = "wheel" | "touch" | "key" | "pointer";
type InputSub = (kind: InputKind, e: Event) => void;

export const scrollState = {
  /** the page's scroll y as of the last scroll event (fix:scroll:r3: the glide's own, unrounded value while it drives the page) */
  y: 0,
  /** performance.now() of the last scroll event */
  at: -1e9,
  /** the viewport, cached on resize */
  vw: 0,
  vh: 0,
  /** performance.now() of the reader's last wheel, touch, key or pointer press */
  inputAt: -1e9,
  /** the last input was a finger */
  touch: false,
  /** fix:scroll:1: the wheel turns in notches (a mouse wheel), not in fine deltas (a trackpad) */
  notch: false,
  /** fix:scroll:1: a finger is on the screen (the page moves with it: a drag, never a fling) */
  finger: false,
  /** fix:scroll:r3: the glide is driving the page now (the camera then rides the page as it is, with no follow of its own) */
  smooth: false,
  /**
   * fix:scroll:r3: the last scroll event was the reader's own: their input, or a scroll carrying straight on from one
   * (a fling's momentum, the glide). A scroll the page did not get from the reader (a restored scroll, an anchor link,
   * fix:scroll:r3-2: a focus moved by Tab) is the only kind the tour may cut behind its veil or glide the camera through.
   */
  reader: false,
  /**
   * fix:scroll:r3-2: where the page's glide will come to rest (px), once that is known: a paging key's move at once, the
   * wheel's once a notch is overdue (REST_WAIT); kept once the glide has landed, until the page moves some other way;
   * null while the wheel still turns, or with no glide. The camera rig closes its look window as it nears it, so the view
   * lands with the camera (it went null again the moment the glide ended, and the window opened for a frame: an 11
   * degree snap).
   */
  rest: null as number | null,
};
let lastWheel = -1e9;
let readerAt = -1e9;

const subs = new Set<Sub>();
const inputSubs = new Set<InputSub>();
let attached = false;

/* ------------------------------ the glide (fix:scroll:r3) ------------------------------ */

/** the glide's rounding stage (s): the page's pace is continuous across notches and their ends */
const GLIDE_T = 0.025;
/**
 * a notch is spread over NOTCH_OVER times the wheel's recent interval (its events' own time stamps, so a busy frame that
 * hands two notches over at once does not count), between these (s). Spread a little past the next notch, an uneven
 * hand (or an uneven delivery) keeps the page moving at one pace instead of a stop and a go per notch.
 * fix:scroll:r3-2: and the page never moves slower than what is left over NOTCH_EASE s (a lone notch: NOTCH_EASE0, a
 * slow hand: up to NOTCH_EASE1, twice its interval): a click starts at once, is half done in about 85 ms and eases out
 * over about a fifth of a second, so clicks at a reading pace (one every 230 ms) run into one another instead of
 * 130 ms bursts with dead stops between them (r3/r32b/glide2.mjs: pace never under 80 % of its mean at that cadence,
 * 98 % at a spin, it was 0 %; the page 92 ms behind a wheel spun at a notch every 90 ms, 56 ms at one every 40 ms)
 */
const NOTCH_MIN = 0.05, NOTCH_MAX = 0.35, NOTCH_OVER = 1.3, NOTCH_EASE0 = 0.09, NOTCH_EASE1 = 0.14;
/**
 * the paging keys' glide (s): a page, a line. fix:scroll:r3-2: one eased move (a cubic from the page's own pace, so a
 * second press carries straight on), never a start at full speed
 */
const PAGE_D = 0.4, LINE_D = 0.14;
/**
 * fix:scroll:r3-2: the wheel's rest is known once no notch has come for REST_WAITK times its recent interval (ms per s),
 * at least REST_WAIT0 ms: a notch is then overdue (r3/r32/sim3.mjs: the camera's view settles at 40 to 80 degrees/s at
 * most once the page has stopped; taking the goal so far as the rest from the first notch shut the look window for the
 * whole of a spin, and a fast spin turned at twice the pace)
 */
const REST_WAIT0 = 50, REST_WAITK = 1300;
/** fix:scroll:r3-2: the keys that scroll the page (the reader's own scroll); Tab, Enter and the rest only move the focus */
const SCROLL_KEYS = new Set(["PageDown", "PageUp", " ", "Spacebar", "ArrowDown", "ArrowUp", "Home", "End"]);
export function isScrollKey(e: KeyboardEvent): boolean {
  return SCROLL_KEYS.has(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey;
}

const G = {
  enabled: false,
  run: false,
  /** where the input has sent the page (px) */
  goal: 0,
  /** the linear stage: it moves toward goal at `rate` (px/s), recomputed at each input, and never slower than what is left over `ease` s */
  lin: 0,
  rate: 0,
  ease: NOTCH_EASE0,
  /** fix:scroll:r3-2: the lin stage's pace (px/s), and a paging key's eased move (null when none) */
  linV: 0,
  key: null as null | { y0: number; y1: number; t0: number; dur: number; m0: number },
  /** fix:scroll:r3-2: the last input was a paging key (its rest is known at once) */
  keyed: false,
  /** the page's glided y (px, unrounded) and its pace (px/s) */
  y: 0,
  v: 0,
  /** performance.now() of the last step */
  last: 0,
  /** the y last written to the page (rounded as the browser keeps it) */
  set: 0,
  /** the notches' recent interval (s; 0 = none yet) */
  gap: 0,
  notchAt: -1e9,
  /** performance.now() the camera rig last stepped the glide (the glide's own rAF stands in when no frame does) */
  rigAt: -1e9,
  raf: 0,
};

/** Unity's SmoothDamp (the camera rig's), for the glide's rounding stage */
function damp(x: number, to: number, st: { v: number }, smooth: number, dt: number): number {
  const omega = 2 / smooth, k = omega * dt, e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const change = x - to, temp = (st.v + omega * change) * dt;
  st.v = (st.v - omega * temp) * e;
  let out = to + (change + temp) * e;
  if ((to - x > 0) === (out > to)) { out = to; st.v = 0; }
  return out;
}

function maxScroll(): number {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

function glideStop(landed = false) {
  G.run = false;
  G.v = 0;
  G.rate = 0;
  G.linV = 0;
  G.key = null;
  scrollState.smooth = false;
  scrollState.rest = landed ? G.goal : null;
  if (G.raf) cancelAnimationFrame(G.raf);
  G.raf = 0;
}

/** one step of the glide at `now` (performance.now()); several calls in one frame advance it once */
function glideStep(now: number) {
  if (!G.run) return;
  const dt = Math.min(0.05, (now - G.last) / 1000);
  if (dt < 0.002) return;
  G.last = now;
  // anything else moved the page (the scrollbar, a jump, find in page, a trackpad): it wins, from where it is
  if (Math.abs(window.scrollY - G.set) > 1.5) { glideStop(); return; }
  const lin0 = G.lin;
  if (G.key) {
    // a paging key: one cubic from the page's own pace to rest at the goal
    const K = G.key, u = Math.min(1, (now - K.t0) / (K.dur * 1000)), u2 = u * u, u3 = u2 * u;
    G.lin = K.y0 + (K.y1 - K.y0) * ((u3 - 2 * u2 + u) * K.m0 + (-2 * u3 + 3 * u2));
    if (u >= 1) { G.lin = G.goal = K.y1; G.key = null; }
  } else if (G.lin !== G.goal) {
    // the wheel: the notch's even pace, or what is left over the ease time when that is faster (an ease out)
    const rem = G.goal - G.lin, r = Math.sign(rem) * Math.max(Math.abs(G.rate), Math.abs(rem) / G.ease);
    const nx = G.lin + r * dt;
    G.lin = Math.abs(rem) < 0.25 || (rem >= 0 ? nx >= G.goal : nx <= G.goal) ? G.goal : nx;
  }
  G.linV = (G.lin - lin0) / dt;
  G.y = damp(G.y, G.lin, G, GLIDE_T, dt);
  // where the glide will rest, once nothing more is coming: a key's move at once, the wheel's once a notch is overdue
  scrollState.rest = G.keyed || now - G.notchAt > Math.max(REST_WAIT0, REST_WAITK * G.gap) ? G.goal : null;
  const done = G.lin === G.goal && Math.abs(G.goal - G.y) < 0.4 && Math.abs(G.v) < 4;
  if (done) G.y = G.goal;
  const yi = Math.round(G.y);
  if (yi !== G.set) {
    window.scrollTo({ top: yi, behavior: "instant" });
    G.set = window.scrollY;
  }
  scrollState.y = G.y;
  scrollState.at = now;
  readerAt = now;
  scrollState.reader = true;
  for (const s of subs) s(G.y);
  if (done) glideStop(true);
}

function glideLoop() {
  G.raf = 0;
  if (!G.run) return;
  const now = performance.now();
  // the camera rig steps the glide at the top of its frame (so the camera and the page move in the same frame); when no
  // frame of the hall runs (no WebGL), this does
  if (now - G.rigAt > 40) glideStep(now);
  G.raf = requestAnimationFrame(glideLoop);
}

/**
 * The input turns back against the glide (a wheel or a key the other way): the page stops where it is now and turns at
 * once (what was still to come the old way is dropped, and so is the glide's pace that way: no drift on after a reversal).
 */
function glideTurns(dy: number): boolean {
  if (!G.run) return false;
  const ahead = G.goal - G.y;
  if (!((Math.abs(ahead) > 0.5 && Math.sign(ahead) !== Math.sign(dy)) || (Math.abs(G.v) > 20 && Math.sign(G.v) !== Math.sign(dy)))) return false;
  G.goal = G.lin = G.y;
  G.v = 0;
  G.rate = 0;
  G.linV = 0;
  G.key = null;
  return true;
}

function glideStart(now: number) {
  if (G.run) return;
  G.run = true;
  G.y = G.lin = G.goal = window.scrollY;
  G.set = G.y;
  G.v = 0;
  G.linV = 0;
  G.key = null;
  G.last = now;
  scrollState.smooth = true;
  if (!G.raf) G.raf = requestAnimationFrame(glideLoop);
}

/** Sends the page `delta` px further over about `d` s (never slower than what is left over `ease` s), from where the glide (or the page) is. */
function glideBy(delta: number, d: number, ease: number) {
  glideStart(performance.now());
  G.key = null;
  G.keyed = false;
  G.goal = Math.min(maxScroll(), Math.max(0, G.goal + delta));
  G.rate = (G.goal - G.lin) / d;
  G.ease = ease;
}

/** fix:scroll:r3-2: a paging key: one eased move of `delta` px over `d` s, from the page's own pace (a second press carries on) */
function glideKey(delta: number, d: number) {
  const now = performance.now();
  glideStart(now);
  const y1 = Math.min(maxScroll(), Math.max(0, G.goal + delta)), dist = y1 - G.lin;
  G.goal = y1;
  G.keyed = true;
  if (Math.abs(dist) < 0.5) { G.key = null; G.rate = 0; return; }
  // the start's slope (in units of the move): the pace on hand, when it already heads that way, at most twice the mean
  const m0 = Math.sign(G.linV) === Math.sign(dist) ? Math.min(2, (G.linV * d) / dist) : 0;
  G.key = { y0: G.lin, y1, t0: now, dur: d, m0 };
}

/** fix:scroll:r3: steps the page's glide for this frame (the camera rig, first thing in its frame). */
export function scrollTick(): void {
  if (!G.run) return;
  const now = performance.now();
  G.rigAt = now;
  glideStep(now);
}

/** fix:scroll:r3: the tour's page glides under a mouse wheel and the paging keys while on (never under reduced motion). */
export function smoothScroll(on: boolean): () => void {
  attach();
  G.enabled = on;
  if (on) window.addEventListener("wheel", onWheelGlide, { passive: false });
  else { window.removeEventListener("wheel", onWheelGlide); glideStop(); }
  return () => { G.enabled = false; window.removeEventListener("wheel", onWheelGlide); glideStop(); detach(); };
}

/** the wheel or key lands in something that scrolls by itself (a sheet, the chat, a dialog): leave it to the browser */
export function innerScroller(t: EventTarget | null, dy: number): boolean {
  let el = t instanceof Element ? t : null;
  for (let k = 0; el && el !== document.body && el !== document.documentElement && k < 24; k++, el = el.parentElement) {
    if (el.closest?.("dialog[open], [role=dialog]")) return true;
    if (el.scrollHeight <= el.clientHeight + 1) continue;
    const oy = getComputedStyle(el).overflowY;
    if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") continue;
    if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
  }
  return false;
}
export function pageLocked(): boolean {
  const de = document.documentElement, b = document.body;
  return getComputedStyle(de).overflowY === "hidden" || (!!b && getComputedStyle(b).overflowY === "hidden");
}

function onWheelGlide(e: WheelEvent) {
  if (!G.enabled || !e.cancelable || e.defaultPrevented || e.ctrlKey) return;
  if (!scrollState.notch) { if (G.run) glideStop(); return; }
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.deltaY === 0) return;
  const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 0.875 * window.innerHeight : 1);
  if (innerScroller(e.target, dy) || pageLocked()) return;
  e.preventDefault();
  const at = e.timeStamp > 0 ? e.timeStamp : performance.now(), gap = (at - G.notchAt) / 1000;
  G.notchAt = at;
  // the notches' interval (a spun wheel: about 0.05 to 0.12 s); a pause starts again
  G.gap = gap < 0.25 ? (G.gap ? G.gap * 0.65 + Math.max(0.02, gap) * 0.35 : Math.max(0.02, gap)) : 0;
  // a reversal: the glide turns at once
  if (glideTurns(dy)) G.gap = 0;
  glideBy(dy, G.gap ? Math.min(NOTCH_MAX, Math.max(NOTCH_MIN, NOTCH_OVER * G.gap)) : NOTCH_MAX, G.gap ? Math.max(NOTCH_EASE0, Math.min(NOTCH_EASE1, 2 * G.gap)) : NOTCH_EASE0);
}

function onKeyGlide(e: KeyboardEvent): boolean {
  if (!G.enabled || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return false;
  const vh = window.innerHeight;
  let dy = 0, d = PAGE_D;
  if (e.key === "PageDown") dy = 0.875 * vh;
  else if (e.key === "PageUp") dy = -0.875 * vh;
  else if (e.key === " " || e.key === "Spacebar") dy = (e.shiftKey ? -1 : 1) * 0.875 * vh;
  else if (e.key === "ArrowDown" && !e.shiftKey) { dy = 40; d = LINE_D; }
  else if (e.key === "ArrowUp" && !e.shiftKey) { dy = -40; d = LINE_D; }
  else return false;
  const el = e.target as HTMLElement | null;
  // keys a focused control uses itself (typing, buttons, links, menus, sliders), or a scroller of its own: the browser's
  if (el && el !== document.body && el !== document.documentElement && (el.isContentEditable || el.closest?.("input, textarea, select, button, a, summary, [role=button], [role=slider], [role=listbox], [role=menu], [role=tab], [contenteditable]"))) return false;
  if (innerScroller(el, dy) || pageLocked()) return false;
  e.preventDefault();
  glideTurns(dy);
  glideKey(dy, d);
  return true;
}

/* ------------------------------ the reader ------------------------------ */

function read() {
  const now = performance.now();
  // the glide's own scroll: its unrounded value (the browser keeps whole pixels)
  const y = G.run && Math.abs(window.scrollY - G.set) <= 1 ? G.y : window.scrollY;
  // the page moved some other way since the glide landed: its rest is no longer known
  if (!G.run && scrollState.rest !== null && Math.abs(y - scrollState.rest) > 1.5) scrollState.rest = null;
  scrollState.y = y;
  scrollState.at = now;
  // a scroll is the reader's if it follows their input, or carries straight on from a scroll that was (momentum)
  scrollState.reader = G.run || scrollState.finger || now - readerAt < 400;
  if (scrollState.reader) readerAt = now;
  for (const s of subs) s(y);
}
function size() {
  scrollState.vw = window.innerWidth;
  scrollState.vh = window.innerHeight;
}
function onResize() { size(); read(); }
function input(kind: InputKind, e: Event) {
  const now = performance.now();
  // fix:scroll:r3-2: a key that does not scroll (Tab, Enter...) is not the reader scrolling: the browser's scroll to the
  // newly focused link is a jump the page did not get from the reader's hand (TourDriver glides the camera through it)
  const scrolls = kind !== "key" || isScrollKey(e as KeyboardEvent);
  if (scrolls) {
    scrollState.inputAt = now;
    readerAt = now;
  }
  if (kind === "touch") scrollState.touch = true;
  else if (kind === "wheel") scrollState.touch = false;
  // a finger, a press (the scrollbar, a link) or a key the glide does not take: the page is the reader's again
  if (kind === "touch" || kind === "pointer") { if (G.run) glideStop(); scrollState.rest = null; }
  for (const s of inputSubs) s(kind, e);
}
const onWheel = (e: Event) => {
  const w = e as WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number }, now = performance.now();
  const d = Math.max(Math.abs(w.deltaY), Math.abs(w.deltaX));
  const legacy = Math.max(Math.abs(w.wheelDeltaY ?? 0), Math.abs(w.wheelDeltaX ?? 0));
  // a click of a mouse wheel: lines or pages; in Chromium (Windows, Linux) a whole number of 120-unit ticks (several when a
  // busy frame coalesces them; a trackpad's legacy delta is its own fine one: fix:scroll:r3, a fast swipe's coalesced first
  // event of 261 px was taken for a click and glided); elsewhere 50 px or more after a pause (a trackpad's swipe starts
  // with small deltas and keeps them coming every frame). Fine deltas mean a trackpad (or a mouse with its own smooth
  // scrolling); a big delta in the middle of a stream keeps whatever the stream was, and a pause forgets it
  if (w.deltaMode !== 0) scrollState.notch = true;
  else if (w.isTrusted && legacy > 0) scrollState.notch = legacy % 120 === 0 && d >= 30;
  else if (d >= 50 && now - lastWheel > 24) scrollState.notch = true;
  else if ((d > 0 && d < 30) || now - lastWheel > 300) scrollState.notch = false;
  lastWheel = now;
  input("wheel", e);
};
const onTouch = (e: Event) => { scrollState.finger = true; input("touch", e); };
const onTouchEnd = (e: Event) => { scrollState.finger = (e as TouchEvent).touches?.length > 0; readerAt = performance.now(); };
const onKey = (e: Event) => {
  input("key", e);
  const k = e as KeyboardEvent;
  if (!onKeyGlide(k) && G.run && !k.defaultPrevented && !["Shift", "Control", "Alt", "Meta", "Tab"].includes(k.key)) glideStop();
};
const onPointer = (e: Event) => input("pointer", e);

function attach() {
  if (attached || typeof window === "undefined") return;
  attached = true;
  size();
  scrollState.y = window.scrollY;
  window.addEventListener("scroll", read, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("wheel", onWheel, { passive: true, capture: true });
  window.addEventListener("touchstart", onTouch, { passive: true, capture: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });
  window.addEventListener("keydown", onKey);
  window.addEventListener("pointerdown", onPointer, { passive: true, capture: true });
}
function detach() {
  if (!attached || subs.size || inputSubs.size || G.enabled) return;
  attached = false;
  window.removeEventListener("scroll", read);
  window.removeEventListener("resize", onResize);
  window.removeEventListener("wheel", onWheel, { capture: true });
  window.removeEventListener("touchstart", onTouch, { capture: true });
  window.removeEventListener("touchend", onTouchEnd, { capture: true });
  window.removeEventListener("touchcancel", onTouchEnd, { capture: true });
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("pointerdown", onPointer, { capture: true });
}

/** Calls `fn` with the scroll y on every scroll event (and on resize), and once now. Write only: never read layout in it. */
export function onScrollY(fn: Sub): () => void {
  attach();
  subs.add(fn);
  fn(scrollState.y);
  return () => { subs.delete(fn); detach(); };
}

/** Calls `fn` on the reader's own input (wheel, touch, key, pointer press), before the page handles it. */
export function onScrollInput(fn: InputSub): () => void {
  attach();
  inputSubs.add(fn);
  return () => { inputSubs.delete(fn); detach(); };
}

/** Reads the scroll again now and tells every subscriber (after a layout change, or a scroll the page made itself). */
export function rescroll(): void {
  if (attached) read();
}

/** The page scrolled within the last `ms` (idle work waits for the reader to stop). */
export function scrollingNow(ms = 300): boolean {
  return G.run || performance.now() - scrollState.at < ms;
}

/**
 * Runs `cb` once the browser is idle and the page has not scrolled for 300 ms (never on a scroll frame). Returns a
 * cancel function.
 */
export function whenStill(cb: () => void, timeout = 2500): () => void {
  const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  let idle = 0, timer = 0, alive = true;
  const t0 = performance.now();
  const go = () => {
    idle = 0;
    if (!alive) return;
    // still scrolling: wait for it to stop (but never for ever)
    if (scrollingNow() && performance.now() - t0 < timeout * 4) { timer = window.setTimeout(ask, 320); return; }
    alive = false;
    cb();
  };
  const ask = () => {
    timer = 0;
    if (!alive) return;
    if (w.requestIdleCallback) idle = w.requestIdleCallback(go, { timeout });
    else timer = window.setTimeout(go, 50);
  };
  ask();
  return () => { alive = false; if (idle) w.cancelIdleCallback?.(idle); if (timer) clearTimeout(timer); };
}

// dev captures (screenshots/v21/scroll/r3/*.mjs) read the reader's state and the glide's
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  Object.assign(window as unknown as Record<string, unknown>, { __scroll: { state: scrollState, glide: G } });
}
