"use client";

/**
 * The camera rig (v20, v21): one PerspectiveCamera moved between the shots
 * of shots.ts with GSAP (power3.inOut). The home shot sways ±12 degrees of
 * azimuth over 40 s (never a full orbit, so the empty front wedge stays in
 * front) with a little elevation drift and about 2 degrees of mouse
 * parallax; the room shot breathes ±0.6 degrees of yaw over 20 s. Nothing
 * moves under reduced motion. On phones the view is offset so the drum sits
 * in the canvas visible above the bottom sheet.
 *
 * v21, the scroll tour (tour.ts), v21.3 model: on the home shot the camera
 * IS the tour path at the position the scroll asks for, followed here by one
 * short critically damped spring (0.085 s; 0.08 s under a finger) and nothing
 * else: no speed cap, no stillness test, no mode switch, so a slow read and a
 * reversal ride the same curve and the camera lands a breath after the text.
 * fix:scroll:r3: under a mouse wheel and the paging keys the page itself
 * glides (tour/scroll.ts, stepped here first thing in the frame) and the
 * camera rides it in the same frame as the captions; the fling's dip is gone
 * (the hall never darkens from scrolling): a fast scroll opens the look
 * window instead (tour.ts tourPose), so the view pans smoothly while the
 * camera flies the path. The base pose (path, lens, framing) is kept apart
 * from the sway and the parallax, which are added on top and fade with the
 * tour position. A jump the page starts (the side index, Home, End) glides
 * along the same path. Leaving for /play flies from the pose on screen;
 * coming back flies (timed in useFrame) to the tour's pose for the scroll.
 * Under reduced motion the camera holds a stop (the page's veil dips while
 * it changes). The shot tweens stay on GSAP, ticked here every frame so a
 * fast display never repeats a pose.
 */
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { MOVE_MS, PHONE_PULL, SHOTS, type ShotName } from "./shots";
import { hall } from "./store";
import { LADLE_H, LADLE_PARK_Y, LADLE_Z, T_CARRY, revealTime } from "./stage";
import { MARK_CENTRE } from "./Ladle";
import { flightPoint, planFlight, tourAt, tourBus, tourMode, tourPose, tourStopS, type TourPose } from "./tour";
import { scrollState, scrollTick } from "./tour/scroll";

const pos = new THREE.Vector3();
const look = new THREE.Vector3();
const corner = new THREE.Vector3();
const firstPos: [number, number, number] = [0, 0, 0];
const firstLook: [number, number, number] = [0, 0, 0];
const side = new THREE.Vector3();
/** v21 §7.4: the drum assembly in world metres (cradle, cage, hopper and chute, pedestal, the ladle at rest). */
const DRUM_BOX = { x0: -1.3, x1: 1.3, y0: 0.48, y1: 4.75, z0: -1.3, z1: 1.3 };

type Pose = { px: number; py: number; pz: number; lx: number; ly: number; lz: number; fov: number; vs: number; lift: number };

/** Unity's SmoothDamp: a critically damped approach to `to`, carrying its velocity in `st.v`; never past `to`. */
function smoothDamp(x: number, to: number, st: { v: number }, smooth: number, dt: number): number {
  const omega = 2 / smooth;
  const k = omega * dt;
  const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const change = x - to;
  const temp = (st.v + omega * change) * dt;
  st.v = (st.v - omega * temp) * e;
  let out = to + (change + temp) * e;
  if ((to - x > 0) === (out > to)) { out = to; st.v = 0; }
  return out;
}

/**
 * v21.3: the tour's follow (s): the camera trails the scroll by about this much at a steady pace (half way in about
 * 0.09 s, settled in about 0.35 s), shorter under a finger. fix:scroll:r3: while the page glides (a mouse wheel, the
 * paging keys: tour/scroll.ts) it is already smooth, and the camera rides it as it is (TOUR_FOLLOW_GLIDE, a frame):
 * the 3D and the captions move together, with no second lag and no pulse per notch. The follow's time eases between
 * these over about 150 ms as the input changes, so switching never kinks the motion.
 */
const TOUR_FOLLOW = 0.085;
const TOUR_FOLLOW_TOUCH = 0.08;
const TOUR_FOLLOW_GLIDE = 0.016;
/**
 * fix:scroll:r3, the look window (tour.ts tourPose) for fast scrolls, in place of the fling's dip: the scroll's pace
 * (px/s, smoothed over LOOK_SPEED_T, so one click or one bunched frame barely moves it) from LOOK_V0 to LOOK_V1
 * opens it to LOOK_TAU seconds of travel either side of the camera; it opens over LOOK_OPEN s and closes over
 * LOOK_CLOSE s as the scroll slows. A whole page in 2 s then pans across the room at about 120 degrees a second at
 * p95 (it turned at 270 to 400 under the dip), and so do brisk 3 and 7 s ones (r3/sim.mjs, which matched the
 * measured flicks); a reading pace leaves it shut or nearly (the view is the path's).
 */
const LOOK_SPEED_T = 0.12, LOOK_V0 = 1000, LOOK_V1 = 3000, LOOK_TAU = 1.2, LOOK_OPEN = 0.08, LOOK_CLOSE = 0.1;
/**
 * fix:scroll:r3-2: the window never reaches past where the camera set off from or where it will come to rest. Its
 * half-width is at most LOOK_K times the camera's perceptual distance from the place it last rested (still, slower
 * than LOOK_REST_V stops/s, for LOOK_REST_MS; a hold it only brushes through at speed does not count), LOOK_K_END
 * times its distance from either end of the path, and, once the rest is known, LOOK_K_REST times the distance to it
 * (a paging key's move, or the wheel's glide once its notches stop: tour/scroll.ts scrollState.rest, kept after the
 * glide ends; or the page itself once no scroll has come for LOOK_STOP_MS). A rest found under a wider window takes that window as
 * it is (up to LOOK_K_MAX times the distance left) and shrinks it with the distance, so the view lands with the
 * camera; what is left over shuts over LOOK_DOWN s, never in a frame (r3/r32/sim3.mjs: a 16-notch spin from the top
 * turned 37 degrees with the camera parked, at up to 1200 degrees/s, and snapped 11 in one frame; now it settles over
 * about 0.4 s at 45 degrees/s at most). A cut, a jump
 * the page glides and the flight back reset it.
 */
const LOOK_K = 3, LOOK_K_END = 1.5, LOOK_K_REST = 1.5, LOOK_K_MAX = 3, LOOK_REST_V = 0.03, LOOK_REST_MS = 100, LOOK_STOP_MS = 50, LOOK_DOWN = 0.2;
const smoothstep = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const inOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
/** the tour's perceptual distance (tour.ts tourStopS) at tour position q, and back */
function sOfQ(q: number, S: number[]): number {
  const n = S.length - 1, qc = Math.min(n, Math.max(0, q)), i = Math.min(n - 1, Math.floor(qc));
  return S[i]! + (qc - i) * (S[i + 1]! - S[i]!);
}
function qOfS(s: number, S: number[]): number {
  const n = S.length - 1;
  if (s <= S[0]!) return 0;
  if (s >= S[n]!) return n;
  let i = 0;
  while (i < n - 1 && s >= S[i + 1]!) i++;
  const L = S[i + 1]! - S[i]!;
  return i + (L > 1e-9 ? (s - S[i]!) / L : 0);
}
const dirA = new THREE.Vector3(), dirB = new THREE.Vector3(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), FWD = new THREE.Vector3(0, 0, -1);

/**
 * v21 fix (r2): /play on a tablet held upright (768 px and wider, portrait): from higher and steeper than the
 * landscape room shot, so the hanging ladle sits above the frame (never cut by the top bar) and the drum is
 * about 40 % of the width with the felt crowd round it, under the round's instruments. The lens (TALL_FOV)
 * is the final one: the target's fov is divided by the rig's portrait correction so the flight's fov is smooth.
 */
const TALL = { pos: [0, 6.8, 10.2] as const, look: { room: 1.0, reveal: 1.5 }, fov: 43.5 };
/** v21 fix (r2): the embed's band: where the parked ladle sits, as a share of the band's height from its top */
const EMBED_LADLE_AT = 0.24;

export function CameraRig({ phone, compact = false }: { phone: boolean; compact?: boolean }) {
  const { camera, size } = useThree();
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const cur = useRef<Pose>({ px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 30, vs: 0, lift: 0 });
  /** v21.3: the BASE pose drawn on the last frame, before the sway and the parallax (where the next shot's move starts) */
  const live = useRef<Pose>({ px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 30, vs: 0, lift: 0 });
  /**
   * v21.3: the flight back to the tour from another shot (/play), timed here in useFrame: k 0 → 1 over `dur` s from
   * `t0`; its arc (planFlight) is planned on its first frame, its end is the tour's live pose
   */
  const back = useRef({ on: false, k: 1, t0: 0, dur: 1, planned: false, at: 0, from: { ...live.current } as Pose, a: new THREE.Vector3(), b: new THREE.Vector3(), c1: new THREE.Vector3(), c2: new THREE.Vector3(), n1: new THREE.Vector3(), n2: new THREE.Vector3(), pb: new THREE.Vector3(), p: new THREE.Vector3() });
  const flp = useRef<Pose>({ px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 30, vs: 0, lift: 0 });
  const tp = useRef<TourPose>({ px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 30, vs: 0, lift: 0 });
  /** v21.3: the follow: the camera's tour position (stop units) and its velocity (stop units per second) */
  const follow = useRef({ q: 0, v: 0, init: false });
  /** fix:scroll:r3: the follow's smooth time, eased as the input changes (a finger, the page's glide, the rest) */
  const followT = useRef(TOUR_FOLLOW);
  /** fix:scroll:r3: the look window: the scroll's smoothed pace (px, px/s) and the window's half-width (perceptual distance) */
  const lookW = useRef({ y: 0, v: 0, ws: 0, w: 0, init: false, from: 0, restAt: 0, lockY: NaN, lockK: LOOK_K_REST });
  /** v21.3: a jump the page started, as the camera rides it: perceptual distance along the path, a Hermite from its own pace */
  const jp = useRef({ id: 0, on: false, s0: 0, s1: 0, m0: 0, t0: 0, dur: 1 });
  /** v21.3: the framing drawn on the last frame (lens with its correction, view offsets) and a blend from it to a new shot's */
  const drawn = useRef({ fov: 30, ox: 0, oy: 0 });
  const fb = useRef({ on: false, t0: 0, dur: 1, fov: 30, ox: 0, oy: 0 });
  const vsTween = useRef<gsap.core.Tween | null>(null);
  const rectAt = useRef(0);
  /** px: the vertical view offset that centres the drum in a visible band (phones, the stacked home) */
  const bandOff = useRef<number | null>(null);
  /** fix:scroll:1: where bandOff eases to (a nudge, a band moving), and the band's centre it was measured for */
  const bandGoal = useRef<number | null>(null);
  const bandC = useRef(NaN);
  /** v21.2: how much of the phone band applies (0 in the loader's close shot, which fills the screen; eased back to 1 over the flight out) */
  const bandK = useRef<{ k: number; tw: gsap.core.Tween | null }>({ k: 1, tw: null });
  const shot = useRef<ShotName | null>(null);
  const tween = useRef<gsap.core.Tween | null>(null);
  const pointer = useRef({ x: 0, y: 0, over: false });

  const target = (name: ShotName): Pose => {
    const sz = sizeRef.current;
    if (!phone && sz.width < sz.height && (name === "room" || name === "reveal")) {
      // the rig's portrait lens correction (useFrame), undone here so the shot renders at TALL.fov
      const fkP = Math.max(Math.min(1.25, Math.max(1, 1280 / sz.width)), Math.min(1.9, (sz.height / sz.width) * 1.35));
      return { px: TALL.pos[0], py: TALL.pos[1], pz: TALL.pos[2], lx: 0, ly: TALL.look[name], lz: 0, fov: TALL.fov / fkP, vs: 0, lift: 0 };
    }
    const d = SHOTS[name];
    const pull = phone ? PHONE_PULL[name] : 1;
    const [px, py, pz] = phone && d.posPhone ? d.posPhone : d.pos, [lx, ly, lz] = phone && d.lookPhone ? d.lookPhone : d.look;
    const vs = phone || name === "emblem" ? 0 : hall.get().viewShift;
    return { px: lx + (px - lx) * pull, py: ly + (py - ly) * pull, pz: lz + (pz - lz) * pull, lx, ly, lz, fov: phone ? d.fovPhone : d.fov, vs, lift: 0 };
  };

  // jump or fly to the shot in the store
  useEffect(() => {
    /**
     * v21 §7.5: the framing moved without a new shot (a resize, a layout change): ease it over 600 ms. fix:scroll:1: never
     * while a shot's move runs (GSAP's isActive() is false until a new tween's first render, so a second tween on the same
     * value used to start beside it and hand over with a 25 px jump); the move's end checks again
     */
    const syncVs = () => {
      const s = hall.get();
      const name = shot.current;
      if (!name || (tween.current && tween.current.progress() < 1)) return;
      const vs = phone || name === "emblem" ? 0 : s.viewShift;
      if (Math.abs(vs - cur.current.vs) <= 0.0005 || (vsTween.current && vsTween.current.progress() < 1 && Math.abs((vsTween.current.vars as { vs: number }).vs - vs) <= 0.0005)) return;
      vsTween.current?.kill();
      if (s.reduced) cur.current.vs = vs;
      else vsTween.current = gsap.to(cur.current, { vs, duration: 0.6, ease: "power3.inOut" });
    };
    const apply = () => {
      const s = hall.get();
      const name = s.shot as ShotName;
      if (name === shot.current) { syncVs(); return; }
      vsTween.current?.kill();
      const first = shot.current === null;
      const prev = shot.current;
      shot.current = name;
      tween.current?.kill();
      const B = back.current;
      const to = target(name);
      bandK.current.tw?.kill();
      if (name === "emblem") bandK.current.k = 0;
      else if (prev === "emblem" && !s.reduced) { bandK.current.k = 0; bandK.current.tw = gsap.to(bandK.current, { k: 1, duration: 1.1, ease: "power3.inOut" }); }
      else bandK.current.k = 1;
      const ms = prev === "emblem" ? 1200 : name === "room" && prev === "reveal" ? 900 : MOVE_MS[name];
      const touring = tourBus.t > 0.001 || B.on;
      // the tour's follow starts again where the page is, the next time the home shot is on
      follow.current.init = false;
      jp.current.on = false;
      // fix:scroll:1: a framing blend still running (the tour's framing easing into the room's) carries on into the next
      // shot from the framing on screen (/play can go to the room and at once to the reveal while the ladle serves: the
      // blend used to stop there and the view offset stepped by up to 160 px on phones)
      const blending = fb.current.on;
      fb.current.on = false;
      if (blending && !s.reduced && ms > 0) Object.assign(fb.current, drawn.current, { on: true, t0: performance.now(), dur: ms / 1000 });
      if (prev === "home" && touring) {
        // leaving the tour (for /play): the move starts from the base pose on screen (the sway, on top, fades by itself)
        // and the framing (lens correction, view offsets) eases from the one on screen to the new shot's over the move
        Object.assign(cur.current, live.current);
        tourBus.t = 0; B.on = false; B.k = 1;
        if (!s.reduced && ms > 0) Object.assign(fb.current, drawn.current, { on: true, t0: performance.now(), dur: ms / 1000 });
      }
      // v21.3: back to the home from another shot (/play) is always this flight, its end the tour's live pose: the page
      // restores its scroll a moment after the shot changes, and the flight simply lands there (the loader's close shot
      // keeps its own move to the first screen)
      if (name === "home" && (tourBus.target > 0.001 || (prev !== null && prev !== "emblem"))) {
        // back to the home mid-page: the first screen's values underneath, the flight to the tour's pose on top
        const from = { ...live.current };
        Object.assign(cur.current, to);
        if (first || s.reduced || prev === null) { B.on = false; B.k = 1; return; }
        const dur = (prev === "emblem" ? 1200 : MOVE_MS.home) / 1000;
        Object.assign(B.from, from);
        Object.assign(B, { on: true, k: 0, t0: performance.now(), dur, planned: false });
        Object.assign(fb.current, drawn.current, { on: true, t0: B.t0, dur });
        return;
      }
      if (first || s.reduced || ms === 0) { Object.assign(cur.current, to); return; }
      tween.current = gsap.to(cur.current, { ...to, duration: ms / 1000, ease: "power3.inOut", onComplete: syncVs });
    };
    apply();
    return hall.subscribe(apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  // the seat shot eases to the room after 2 s
  useEffect(() => {
    let id = 0, was = "";
    const off = hall.subscribe(() => {
      const s = hall.get();
      if (s.shot === "seat" && was !== "seat") { clearTimeout(id); id = window.setTimeout(() => { if (hall.get().shot === "seat") hall.set({ shot: "room" }); }, 2000 + MOVE_MS.seat); }
      was = s.shot;
    });
    return () => { off(); clearTimeout(id); };
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pointer.current.x = e.clientX / window.innerWidth - 0.5;
      pointer.current.y = e.clientY / window.innerHeight - 0.5;
      const el = e.target as HTMLElement | null;
      pointer.current.over = !!el?.closest?.(".frame, .hud-pane, button, input, a, .tour-cap");
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  const sway = useRef({ a: 0, e: 0, px: 0, py: 0 });
  const sink = useRef(0);
  useFrame((state, dtRaw) => {
    // GSAP's own ticker skips a frame that comes early on a fast display (it waits 4 ms after a late one): tick it with
    // every frame drawn, so the shot moves (and the loader's band) advance on each one and never repeat a pose
    gsap.ticker.tick();
    // fix:scroll:r3: the page's glide (a mouse wheel, the paging keys) steps here, before the camera reads the scroll, so
    // the captions and the camera show the same scroll in the same frame
    scrollTick();
    const cam = camera as THREE.PerspectiveCamera;
    const s = hall.get();
    const c = cur.current;
    const t = state.clock.elapsedTime;
    const dt = Math.min(0.1, dtRaw);
    const k = 1 - Math.exp(-dt * 2.5);
    const live0 = !s.reduced;
    const name = shot.current;
    const now = performance.now();

    // v21.3: the scroll tour on the home shot (the first screen is stop 0). The camera is the path at the followed position.
    let P: Pose = c;
    let w = 0;
    const B = back.current;
    if (name === "home") {
      const md = tourMode(size.width, size.height);
      const S = tourStopS(md);
      const F = follow.current, J = jp.current, jb = tourBus.jump;
      // a jump the page started (the side index, Home, End): the camera rides the path there, from its own pace
      if (jb && jb.id !== J.id && !s.reduced) {
        J.id = jb.id; J.on = true; J.t0 = jb.t0; J.dur = jb.dur;
        J.s0 = sOfQ(F.q, S); J.s1 = sOfQ(jb.to, S);
        const i = Math.min(S.length - 2, Math.max(0, Math.floor(F.q)));
        const m = F.v * (S[i + 1]! - S[i]!) * jb.dur;
        // its start velocity is the camera's own when it already heads that way (a Hermite, never a stop and a restart)
        J.m0 = Math.sign(m) === Math.sign(J.s1 - J.s0) ? Math.sign(m) * Math.min(Math.abs(m), 1.5 * Math.abs(J.s1 - J.s0)) : 0;
      }
      // the reader took over (a wheel, a finger, a key): the follow carries on from the pose and pace on screen
      if (J.on && !jb) J.on = false;
      const dts = Math.min(0.05, dtRaw);
      // fix:scroll:r3: the follow's time for the input on hand (the page's glide: ride it; a finger; the rest), eased
      const wantT = scrollState.smooth ? TOUR_FOLLOW_GLIDE : scrollState.touch ? TOUR_FOLLOW_TOUCH : TOUR_FOLLOW;
      followT.current += (wantT - followT.current) * (1 - Math.exp(-dts / 0.05));
      if (s.reduced) { F.q = tourBus.cut; F.v = 0; F.init = true; J.on = false; }
      else if (!F.init || tourBus.snap || B.on) { F.q = tourBus.target; F.v = 0; F.init = true; J.on = false; }
      // fix:scroll:1: the tour's page has gone (on its way to /play): hold the pose on screen until the shot changes (it used
      // to follow the page's reset to the top, a 30 m rewind through the tour when the next shot came late)
      else if (!tourBus.on) F.v = 0;
      else if (J.on) {
        const u = Math.min(1, (now - J.t0) / (J.dur * 1000)), u2 = u * u, u3 = u2 * u;
        const q = qOfS((2 * u3 - 3 * u2 + 1) * J.s0 + (u3 - 2 * u2 + u) * J.m0 + (-2 * u3 + 3 * u2) * J.s1, S);
        F.v = dt > 0 ? (q - F.q) / dt : 0;
        F.q = q;
        if (u >= 1) { J.on = false; F.v = 0; if (tourBus.jump === jb) tourBus.jump = null; }
      } else {
        // the one follow (fix:scroll:r3: under the page's glide it rides the page as it is)
        F.q = smoothDamp(F.q, tourBus.target, F, followT.current, dts);
      }
      const snapped = tourBus.snap;
      tourBus.snap = false;
      tourBus.t = F.q;
      // fix:scroll:r3: the look window, opened by a fast scroll only (the scroll's pace, smoothed); fix:scroll:r3-2: within
      // the camera's own travel (see LOOK_K), and shut and reset by a cut, a jump the page glides, the flight back and
      // reduced motion (it smoothed the scroll across a cut, so its pace exploded and the view whipped as the veil lifted)
      {
        const LW = lookW.current, A = tourBus.anchors, yEnd = A[A.length - 1] || 1, Send = S[S.length - 1]!;
        const sNow = sOfQ(F.q, S);
        if (!LW.init || s.reduced || snapped || B.on || J.on || !tourBus.on) {
          LW.y = tourBus.y; LW.v = 0; LW.ws = 0; LW.w = 0; LW.from = sNow; LW.restAt = 0; LW.lockY = NaN; LW.init = true;
        } else {
          LW.y = smoothDamp(LW.y, tourBus.y, LW, LOOK_SPEED_T, dts);
          const open = smoothstep((Math.abs(LW.v) - LOOK_V0) / (LOOK_V1 - LOOK_V0));
          const want = open * LOOK_TAU * Math.abs(LW.v) * (Send / yEnd);
          LW.ws += (want - LW.ws) * (1 - Math.exp(-dts / (want > LW.ws ? LOOK_OPEN : LOOK_CLOSE)));
          // the camera at rest: the window opens only with the distance it travels from there
          if (Math.abs(F.v) < LOOK_REST_V) { if (!LW.restAt) LW.restAt = now; if (now - LW.restAt >= LOOK_REST_MS) LW.from = sNow; }
          else LW.restAt = 0;
          // where it will rest, once that is known
          const yRest = scrollState.rest ?? (!scrollState.smooth && now - scrollState.at > LOOK_STOP_MS ? tourBus.y : null);
          let capTo = Infinity;
          if (yRest !== null) {
            const d = Math.abs(sOfQ(yRest === tourBus.y ? tourBus.target : tourAt(yRest, A, tourBus.holds), S) - sNow);
            if (yRest !== LW.lockY) { LW.lockY = yRest; LW.lockK = Math.min(LOOK_K_MAX, Math.max(LOOK_K_REST, LW.w / Math.max(1e-3, d))); }
            capTo = LW.lockK * d;
          } else LW.lockY = NaN;
          const wt = Math.min(LW.ws, LOOK_K_END * Math.min(sNow, Send - sNow), LOOK_K * Math.abs(sNow - LW.from), capTo);
          LW.w = wt >= LW.w ? wt : LW.w + (wt - LW.w) * (1 - Math.exp(-dts / LOOK_DOWN));
          if (LW.w < 1e-3) LW.w = 0;
        }
      }
      // the first screen's framing, sway and lens fade over the first leg, by the tour position only
      w = smoothstep(F.q);
      // fix:scroll:r3-2: the path's pose whenever the look window is open, too (the first screen's own pose below 0.0005 has
      // none: crossing there with the window open snapped the view by up to 9 degrees; the window now shuts at the top anyway)
      if (F.q > 0.0005 || B.on || lookW.current.w > 0) {
        firstPos[0] = c.px; firstPos[1] = c.py; firstPos[2] = c.pz; firstLook[0] = c.lx; firstLook[1] = c.ly; firstLook[2] = c.lz;
        const pose = tourPose(F.q, md, { fov: c.fov, vs: c.vs, pos: firstPos, look: firstLook }, tp.current, lookW.current.w);
        P = pose;
        if (B.on) {
          // the way back from another shot (/play): an arc over the crowd and round the drum (tour.ts planFlight), timed
          // here; its end is the tour's live pose, so a scroll restored meanwhile only moves where it lands
          const kk = Math.min(1, (now - B.t0) / (B.dur * 1000)), e = inOutCubic(kk), f = B.from, out = flp.current;
          if (!B.planned) { B.a.set(f.px, f.py, f.pz); B.b.set(pose.px, pose.py, pose.pz); planFlight(B.a, B.b, B.c1, B.c2); B.n1.copy(B.c1); B.n2.copy(B.c2); B.pb.copy(B.b); B.at = now; B.planned = true; }
          B.b.set(pose.px, pose.py, pose.pz);
          // the end moved on (the scroll restored meanwhile): plan again for it (at most every 80 ms) and ease the arc's
          // controls toward that plan, so it bends to the new end without a jump
          if (B.b.distanceToSquared(B.pb) > 0.09 && now - B.at > 80) { planFlight(B.a, B.b, B.n1, B.n2); B.pb.copy(B.b); B.at = now; }
          const kc = 1 - Math.exp(-dt * 9);
          B.c1.lerp(B.n1, kc); B.c2.lerp(B.n2, kc);
          flightPoint(B.a, B.c1, B.c2, B.b, e, B.p);
          out.px = B.p.x; out.py = B.p.y; out.pz = B.p.z;
          // the view turns from the start's direction to the end's (a look point lerped while the position arcs could swing
          // behind the camera and flip the view)
          dirA.set(f.lx - f.px, f.ly - f.py, f.lz - f.pz);
          dirB.set(pose.lx - pose.px, pose.ly - pose.py, pose.lz - pose.pz);
          const dA = dirA.length() || 1, dB = dirB.length() || 1;
          qA.setFromUnitVectors(FWD, dirA.divideScalar(dA)); qB.setFromUnitVectors(FWD, dirB.divideScalar(dB));
          dirA.copy(FWD).applyQuaternion(qA.slerp(qB, e)).multiplyScalar(dA + (dB - dA) * e);
          out.lx = out.px + dirA.x; out.ly = out.py + dirA.y; out.lz = out.pz + dirA.z;
          out.fov = f.fov + (pose.fov - f.fov) * e; out.vs = f.vs + (pose.vs - f.vs) * e; out.lift = f.lift + (pose.lift - f.lift) * e;
          P = out;
          B.k = kk;
          if (kk >= 1) { B.on = false; B.k = 1; }
        }
      }
    }
    tourBus.fly = name === "home" && B.on ? B.k : 1;
    tourBus.w += ((name === "home" ? w : 0) - tourBus.w) * (1 - Math.exp(-dt * 4));

    // the home shot's slow sway and parallax (fading out as the tour leaves the first screen); the room's breathing
    const calm = 1 - w;
    // v21 fix: a narrower sway on the wide home (+-5 degrees), so the playbill's side of the frame stays on the room's dark side
    const swayDeg = !phone && size.width >= 1100 ? 5 : 12;
    const wantA = live0 && name === "home" ? THREE.MathUtils.degToRad(swayDeg) * Math.sin((t / 40) * Math.PI * 2) * calm : live0 && name === "room" ? THREE.MathUtils.degToRad(0.6) * Math.sin((t / 20) * Math.PI * 2) : 0;
    const wantE = live0 && name === "home" ? THREE.MathUtils.degToRad(2) * Math.sin((t / 31) * Math.PI * 2) * calm : 0;
    const par = live0 && name === "home" && !phone && !pointer.current.over ? calm : 0;
    sway.current.a += (wantA - sway.current.a) * k;
    sway.current.e += (wantE - sway.current.e) * k;
    sway.current.px += (pointer.current.x * par - sway.current.px) * k;
    sway.current.py += (pointer.current.y * par - sway.current.py) * k;
    look.set(P.lx, P.ly, P.lz);
    pos.set(P.px - P.lx, P.py - P.ly, P.pz - P.lz);
    // v21: the reveal shot follows the ladle down when it carries the scoop to the pedestal (a slow 0.6 m drop)
    if (name === "reveal" && live0) {
      const rt = revealTime(performance.now());
      const u = rt < 0 ? 0 : Math.min(1, Math.max(0, (rt - T_CARRY + 150) / 900));
      sink.current += (u * u * (3 - 2 * u) - sink.current) * Math.min(1, dt * 6);
    } else sink.current += (0 - sink.current) * Math.min(1, dt * 3);
    look.y -= 0.6 * sink.current;
    const az = sway.current.a + THREE.MathUtils.degToRad(2) * sway.current.px;
    pos.applyAxisAngle(THREE.Object3D.DEFAULT_UP, az);
    const el = sway.current.e - THREE.MathUtils.degToRad(1.5) * sway.current.py;
    side.crossVectors(pos, THREE.Object3D.DEFAULT_UP).normalize();
    pos.applyAxisAngle(side, el);
    cam.position.copy(look).add(pos);
    cam.lookAt(look);
    // v21: narrower and portrait viewports, and a visible band, stand the lens back so the drum fits
    const vis0 = s.visibleH, top0 = s.visibleTop, band = vis0 > 0 && vis0 < size.height ? vis0 - top0 : 0;
    let fk = 1;
    if (!phone && name !== "emblem") {
      fk = Math.min(1.25, Math.max(1, 1280 / size.width));
      if (size.width < size.height) fk = Math.max(fk, Math.min(1.9, (size.height / size.width) * 1.35));
      if (band > 0) fk = Math.max(fk, Math.min(2.1, (0.8 * size.height) / band));
    } else if (phone && band > 0 && name !== "emblem" && !(name === "home" && SHOTS.home.posPhone)) fk = Math.min(1.35, Math.max(1, (0.55 * size.height) / band));
    // the tour's stops carry their own lens (desktop: a little wider below 1280 px)
    const fkTour = tourMode(size.width, size.height) === "desk" ? Math.min(1.25, Math.max(1, 1280 / size.width)) : 1;
    const fkNow = fk + (fkTour - fk) * w;
    const fov0 = P.fov * fkNow;
    // v21.3: a framing blend (leaving the tour, coming back to it): from the lens and offsets on screen to the new shot's
    const FB = fb.current;
    const fbk = FB.on ? inOutCubic(Math.min(1, (now - FB.t0) / (FB.dur * 1000))) : 1;
    if (FB.on && fbk >= 1) FB.on = false;
    const fov = FB.on ? FB.fov + (fov0 - FB.fov) * fbk : fov0;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    drawn.current.fov = fov;
    // v21.3: what the next shot's move starts from: the BASE pose (the sway stays on top of whatever comes next and fades on
    // its own; storing the swayed pose added it twice) and the lens without this viewport's correction
    if (P !== live.current) Object.assign(live.current, P);
    live.current.fov = fov0 / (fk || 1);
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __cam?: unknown }).__cam = { shot: name, p: cam.position.toArray().map((x) => +x.toFixed(2)), fov: cam.fov, view: cam.view?.enabled ? cam.view.offsetY : 0, vis: s.visibleH, tour: +tourBus.t.toFixed(3), w: +w.toFixed(3), fly: +back.current.k.toFixed(3), lw: +lookW.current.w.toFixed(3), lws: +lookW.current.ws.toFixed(3) };
      // dev captures (screenshots/v21/hall/shoot-top.mjs, v21/tour/scout.mjs): a fixed diagnostic view, with an optional shift or lift
      const o = (window as unknown as { __camOverride?: { pos: [number, number, number]; look: [number, number, number]; fov: number; shift?: number; lift?: number } }).__camOverride;
      if (o) {
        cam.position.set(...o.pos); cam.lookAt(...o.look);
        if (cam.fov !== o.fov) { cam.fov = o.fov; cam.updateProjectionMatrix(); }
        const ox = -(o.shift ?? 0) * size.width, oy = (o.lift ?? 0) * size.height;
        if (ox || oy) cam.setViewOffset(size.width, size.height, ox, oy, size.width, size.height);
        else if (cam.view?.enabled) cam.clearViewOffset();
        return;
      }
    }
    // the loader's emblem: stand back so the ladle (parked, LADLE_H tall) is the SVG mark's size, offset so it sits where the mark is
    if (name === "emblem" && s.emblem) {
      const ladleH = 0.77 * s.emblem.h;
      const fov = phone ? 60 : 50;
      if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
      const d = (LADLE_H * size.height) / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * Math.max(40, ladleH));
      const ty = LADLE_PARK_Y + MARK_CENTRE.y, tx = MARK_CENTRE.x;
      cam.position.set(tx, ty, LADLE_Z + d);
      cam.lookAt(tx, ty, LADLE_Z);
      const off = size.height / 2 - s.emblem.cy;
      if (!cam.view || cam.view.offsetY !== off) cam.setViewOffset(size.width, size.height, 0, off, size.width, size.height);
      c.px = tx; c.py = ty; c.pz = LADLE_Z + d; c.lx = tx; c.ly = ty; c.lz = LADLE_Z; c.fov = fov;
      Object.assign(live.current, c);
      drawn.current.fov = fov; drawn.current.ox = 0; drawn.current.oy = off;
      return;
    }
    // phones and the stacked home: the drum centred in the band of canvas left visible; elsewhere the view shift (§7.5); the tour's own framing
    const vis = s.visibleH, top = s.visibleTop;
    const bk = bandK.current.k;
    const inBand = vis > 0 && vis < size.height && bk > 0;
    if (!inBand) { bandOff.current = null; bandGoal.current = null; bandC.current = NaN; }
    else {
      // fix:scroll:1: the band moved (a sheet or a HUD came in, often in the middle of a move): the drum keeps its place in it,
      // eased, never a step; a nudge's correction eases in the same way (about 120 ms)
      const bc = (top + vis) / 2;
      if (Number.isFinite(bandC.current) && bc !== bandC.current) {
        if (bandOff.current === null) bandOff.current = size.height / 2 - bandC.current;
        bandGoal.current = (bandGoal.current ?? bandOff.current) - (bc - bandC.current);
      }
      bandC.current = bc;
      if (bandOff.current !== null && bandGoal.current !== null) {
        const d = bandGoal.current - bandOff.current;
        bandOff.current = Math.abs(d) < 0.05 ? bandGoal.current : bandOff.current + d * (1 - Math.exp(-dt / 0.12));
      }
    }
    const offY0 = inBand ? (bandOff.current ?? size.height / 2 - (top + vis) / 2) * bk : s.viewLift;
    let ox = -P.vs * size.width, oy = offY0 * (1 - w) + P.lift * size.height;
    if (FB.on) { ox = FB.ox + (ox - FB.ox) * fbk; oy = FB.oy + (oy - FB.oy) * fbk; }
    const offX = Math.round(ox * 10) / 10;
    const offY = Math.round(oy * 10) / 10;
    drawn.current.ox = offX; drawn.current.oy = offY;
    if (Math.abs(offX) > 0.05 || Math.abs(offY) > 0.05) {
      if (!cam.view || !cam.view.enabled || cam.view.offsetX !== offX || cam.view.offsetY !== offY || cam.view.fullWidth !== size.width || cam.view.fullHeight !== size.height) cam.setViewOffset(size.width, size.height, offX, offY, size.width, size.height);
    } else if (cam.view?.enabled) cam.clearViewOffset();
    // §7.4: publish the drum's screen box every 6th frame (8 projections), only when it moved; not while the tour is away from the first screen
    if (w < 0.01 && ++rectAt.current % 6 === 0) {
      cam.updateMatrixWorld();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? DRUM_BOX.x1 : DRUM_BOX.x0, i & 2 ? DRUM_BOX.y1 : DRUM_BOX.y0, i & 4 ? DRUM_BOX.z1 : DRUM_BOX.z0).project(cam);
        const sx = ((corner.x + 1) / 2) * size.width, sy = ((1 - corner.y) / 2) * size.height;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      // in a band: nudge the offset so the drum's centre sits in the band's centre (linear, settles in a step or two);
      // v21 fix (r2): the embed's band puts the parked ladle about a quarter down instead, whole, its rod leaving the top
      // (not while the band is still easing in after the loader's close shot: the first guess holds until it is whole)
      // fix:scroll:1: never while the camera or the framing moves (a shot's move, the framing's blend, the flight back): the
      // drum's place then is not where it will rest, and a nudge measured on a blended offset fed back into the blend (a
      // sawtooth of 8 to 230 px on phones leaving the tour for /play)
      if (inBand && bk >= 1 && !FB.on && !B.on && !(tween.current && tween.current.progress() < 1)) {
        let want = (top + vis) / 2, have = (y0 + y1) / 2;
        if (compact && name !== "emblem") {
          corner.set(0, LADLE_PARK_Y, LADLE_Z).project(cam);
          want = top + EMBED_LADLE_AT * (vis - top); have = ((1 - corner.y) / 2) * size.height;
        }
        if (Math.abs(have - want) > 1) {
          // the drawn offset is the base here (no blend, the first screen): the base that centres it, eased toward
          const goal = Math.round(offY + (have - want));
          if (bandOff.current === null) bandOff.current = offY;
          bandGoal.current = goal;
        }
      }
      // the lowest 120 px of the ladle's rod, kept on screen
      y0 = Math.max(0, y0 - 120);
      const r = { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
      const prev = s.drumRect;
      if (!prev || Math.abs(prev.x - r.x) > 1 || Math.abs(prev.y - r.y) > 1 || Math.abs(prev.w - r.w) > 1 || Math.abs(prev.h - r.h) > 1) {
        hall.set({ drumRect: r });
        const st = document.querySelector<HTMLElement>(".hall-stage");
        if (st) { st.style.setProperty("--drum-l", `${r.x}px`); st.style.setProperty("--drum-t", `${r.y}px`); st.style.setProperty("--drum-w", `${r.w}px`); st.style.setProperty("--drum-h", `${r.h}px`); }
      }
    }
  });
  return null;
}
