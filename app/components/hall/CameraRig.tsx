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
 * v21, the scroll tour (tour.ts): on the home shot the camera follows the
 * tour's curves to the position the page's scroll asks for, eased here with
 * a critically damped spring (no React render per scroll frame). The sway
 * and the first screen's framing fade out as the tour leaves the first
 * screen. Leaving for /play flies from wherever the tour is; coming back
 * flies to the tour's position for the current scroll. Under reduced motion
 * the camera cuts between stops (the page dips the hall to black for it).
 */
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { MOVE_MS, PHONE_PULL, SHOTS, type ShotName } from "./shots";
import { hall } from "./store";
import { LADLE_H, LADLE_PARK_Y, LADLE_Z, T_CARRY, revealTime } from "./stage";
import { MARK_CENTRE } from "./Ladle";
import { TOUR, flightPoint, planFlight, tourBus, tourMetresPerUnit, tourMode, tourPose, type TourPose } from "./tour";

const pos = new THREE.Vector3();
const look = new THREE.Vector3();
const corner = new THREE.Vector3();
const firstPos: [number, number, number] = [0, 0, 0];
const firstLook: [number, number, number] = [0, 0, 0];
const side = new THREE.Vector3();
/** v21 §7.4: the drum assembly in world metres (cradle, cage, hopper and chute, pedestal, the ladle at rest). */
const DRUM_BOX = { x0: -1.3, x1: 1.3, y0: 0.48, y1: 4.75, z0: -1.3, z1: 1.3 };

type Pose = { px: number; py: number; pz: number; lx: number; ly: number; lz: number; fov: number; vs: number; lift: number };
const KEYS = ["px", "py", "pz", "lx", "ly", "lz", "fov", "vs", "lift"] as const;

/** Unity's SmoothDamp: a critically damped approach to `to`, carrying its velocity in `st.v`, its speed capped at `maxSpeed`. */
function smoothDamp(x: number, to: number, st: { v: number }, smooth: number, dt: number, maxSpeed = Infinity): number {
  const omega = 2 / smooth;
  const k = omega * dt;
  const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const maxChange = maxSpeed * smooth;
  const change = Math.min(maxChange, Math.max(-maxChange, x - to));
  const goal = x - change;
  const temp = (st.v + omega * change) * dt;
  st.v = (st.v - omega * temp) * e;
  let out = goal + (change + temp) * e;
  if ((to - x > 0) === (out > to)) { out = to; st.v = 0; }
  return out;
}

/** v21 fix: the tour's camera glides no faster than this (m/s) while it keeps up with the scroll (a lag it cannot close is a flight). */
const TOUR_MAX_MS = 6;
/** v21 fix: the tour's smoothing time (s): a glide from stop to stop rather than a whip; shorter once the scroll has stopped. */
const TOUR_SMOOTH = 0.45;
const TOUR_SMOOTH_REST = 0.3;
/** v21 fix (r2): a lag (stop units) the glide does not walk: one flight instead, while the scroll moves (JUMP) or once it has stopped (SETTLE). */
const TOUR_JUMP = 1.6;
const TOUR_SETTLE = 0.9;
/** v21 fix (r2): the scroll counts as stopped when the page has not scrolled (nor the target moved 0.01 stop) for this long (ms): longer than the gap between two wheel notches. */
const TOUR_STILL_MS = 250;

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
  /** the pose applied on the last frame (handed to the next shot's flight) */
  const live = useRef<Pose>({ px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 30, vs: 0, lift: 0 });
  /** the flight back to the tour (from another shot): k 0 → 1 */
  const back = useRef<{ k: number; from: Pose; tw: gsap.core.Tween | null }>({ k: 1, from: { ...live.current }, tw: null });
  const tp = useRef<TourPose>({ px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 30, vs: 0, lift: 0 });
  /** the scroll target's last move (stop units, performance.now()): whether the scroll has stopped */
  const still = useRef({ v: 0, at: 0 });
  /** r2: the velocity of a flight's end while it follows a moving scroll target */
  const endVel = useRef({ v: 0 });
  /**
   * the flight in progress (planned on its first frame): its start, its end (the live target's pose), its control points
   * (eased toward a fresh plan, n1 and n2, when the end moves on), the end they were planned for and when
   */
  const fl = useRef({ on: false, a: new THREE.Vector3(), b: new THREE.Vector3(), c1: new THREE.Vector3(), c2: new THREE.Vector3(), p: new THREE.Vector3(), pb: new THREE.Vector3(), n1: new THREE.Vector3(), n2: new THREE.Vector3(), at: 0 });
  const vsTween = useRef<gsap.core.Tween | null>(null);
  const rectAt = useRef(0);
  /** px: the vertical view offset that centres the drum in a visible band (phones, the stacked home) */
  const bandOff = useRef<number | null>(null);
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
    const apply = () => {
      const s = hall.get();
      const name = s.shot as ShotName;
      if (name === shot.current) {
        // v21 §7.5: the framing moved without a new shot (a resize, a layout change): ease it over 600 ms
        const vs = phone || name === "emblem" ? 0 : s.viewShift;
        if (Math.abs(vs - cur.current.vs) > 0.0005 && !(tween.current && tween.current.isActive())) {
          vsTween.current?.kill();
          if (s.reduced) cur.current.vs = vs;
          else vsTween.current = gsap.to(cur.current, { vs, duration: 0.6, ease: "power3.inOut" });
        }
        return;
      }
      vsTween.current?.kill();
      const first = shot.current === null;
      const prev = shot.current;
      shot.current = name;
      tween.current?.kill();
      back.current.tw?.kill();
      const to = target(name);
      bandK.current.tw?.kill();
      if (name === "emblem") bandK.current.k = 0;
      else if (prev === "emblem" && !s.reduced) { bandK.current.k = 0; bandK.current.tw = gsap.to(bandK.current, { k: 1, duration: 1.1, ease: "power3.inOut" }); }
      else bandK.current.k = 1;
      const ms = prev === "emblem" ? 1200 : name === "room" && prev === "reveal" ? 900 : MOVE_MS[name];
      const touring = tourBus.t > 0.001 || back.current.k < 1;
      if (prev === "home" && touring) {
        // leaving the tour (for /play): the flight starts from the pose on screen
        Object.assign(cur.current, live.current);
        tourBus.t = 0; tourBus.v = 0; back.current.k = 1;
      }
      if (name === "home" && tourBus.target > 0.001) {
        // back to the home mid-page: the first screen's values underneath, the flight to the tour's pose on top
        tourBus.t = tourBus.target; tourBus.v = 0; endVel.current.v = 0;
        const from = { ...live.current };
        Object.assign(cur.current, to);
        if (first || s.reduced || prev === null) { back.current.k = 1; return; }
        back.current.from = from;
        back.current.k = 0;
        fl.current.on = false;
        back.current.tw = gsap.to(back.current, { k: 1, duration: (prev === "emblem" ? 1200 : MOVE_MS.home) / 1000, ease: "power3.inOut" });
        return;
      }
      if (first || s.reduced || ms === 0) { Object.assign(cur.current, to); return; }
      tween.current = gsap.to(cur.current, { ...to, duration: ms / 1000, ease: "power3.inOut" });
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
    const cam = camera as THREE.PerspectiveCamera;
    const s = hall.get();
    const c = cur.current;
    const t = state.clock.elapsedTime;
    const dt = Math.min(0.1, dtRaw);
    const k = 1 - Math.exp(-dt * 2.5);
    const live0 = !s.reduced;
    const name = shot.current;

    // v21: the scroll tour on the home shot (the first screen is stop 0)
    let P: Pose = c;
    let w = 0;
    if (name === "home") {
      const b = back.current;
      const nowMs = performance.now();
      // the scroll has stopped when its target has not moved (0.01 stop) and the page has not scrolled for TOUR_STILL_MS
      // (a stop's hold keeps the target still while the reader is still scrolling: that is not a stop)
      const St = still.current;
      if (Math.abs(tourBus.target - St.v) > 0.01) { St.v = tourBus.target; St.at = nowMs; }
      // (at either end of the page there is nowhere further to go: it has stopped as soon as the target has)
      const atEnd = tourBus.target < 0.02 || tourBus.target > TOUR.length - 1.02;
      const stopped = atEnd ? nowMs - St.at > 40 : nowMs - Math.max(St.at, tourBus.scrollAt) > TOUR_STILL_MS;
      const lag = Math.abs(tourBus.target - tourBus.t);
      // where a jump is going, when the page knows it before its smooth scroll gets there (the side index, Home, End)
      if (tourBus.dest !== null && (nowMs - tourBus.destAt > 2500 || (stopped && Math.abs(tourBus.target - tourBus.dest) < 0.02))) tourBus.dest = null;
      const goal = tourBus.dest ?? tourBus.target;
      // v21 fix (r2): a lag the glide would walk for seconds (an anchor link, the side index, the Home key, a fling, a long
      // scroll back up) is one flight: at once while the scroll still moves past TOUR_JUMP (or the page has said where it is
      // going), or as soon as it stops past TOUR_SETTLE. The flight lands where the page is: on the known destination, or
      // on the live target, its end following a smooth scroll still under way at a bounded pace.
      if (b.k >= 1 && !s.reduced && (lag > TOUR_JUMP || Math.abs(goal - tourBus.t) > TOUR_JUMP || (stopped && lag > TOUR_SETTLE))) {
        b.from = { ...live.current };
        const span = Math.abs(goal - tourBus.t);
        tourBus.t = goal; tourBus.v = 0; endVel.current.v = 0;
        b.k = 0;
        fl.current.on = false;
        b.tw?.kill();
        b.tw = gsap.to(b, { k: 1, duration: Math.min(1.4, 0.9 + 0.25 * span), ease: "power2.inOut" });
      }
      if (b.k < 1) {
        // in flight: its end eases to where the scroll is now (never faster than 2.5 stops a second, so a smooth scroll still
        // under way bends the arc instead of dragging it); what it has not reached when the flight lands, the glide finishes
        if (tourBus.dest === null) tourBus.t = smoothDamp(tourBus.t, tourBus.target, endVel.current, 0.22, dt, 2.5);
        tourBus.v = 0;
      } else {
        fl.current.on = false;
        if (s.reduced) { tourBus.t = tourBus.cut; tourBus.v = 0; }
        else {
          // v21 fix: a glide, its speed capped in metres per second along the path (a fast scroll never whips the camera)
          // metres per stop unit here and just ahead in the travel's direction (the path's pace changes at its control points)
          // (r2: toward the jump's known destination while the page is still scrolling there, never back to the scroll)
          const md = tourMode(size.width, size.height), ahead = Math.sign(goal - tourBus.t) * 0.05;
          const mpu = Math.max(tourMetresPerUnit(tourBus.t, md), tourMetresPerUnit(tourBus.t + ahead, md));
          // r2: a lag growing toward a flight is closed a little faster (within about 1.2 s) rather than left to grow
          const cap = Math.max(0.3, TOUR_MAX_MS / Math.max(0.01, mpu), Math.abs(goal - tourBus.t) / 1.2);
          const t0 = tourBus.t;
          tourBus.t = smoothDamp(t0, goal, tourBus, stopped ? TOUR_SMOOTH_REST : TOUR_SMOOTH, dt, cap);
          // and a hard limit per frame (the damper's transients never exceed the cap by more than a tenth)
          const step = cap * dt * 1.1;
          if (Math.abs(tourBus.t - t0) > step) { tourBus.t = t0 + Math.sign(tourBus.t - t0) * step; tourBus.v = Math.sign(tourBus.v) * cap; }
        }
      }
      tourBus.fly = b.k;
      if (tourBus.t > 0.0005 || b.k < 1) {
        firstPos[0] = c.px; firstPos[1] = c.py; firstPos[2] = c.pz; firstLook[0] = c.lx; firstLook[1] = c.ly; firstLook[2] = c.lz;
        const pose = tourPose(tourBus.t, tourMode(size.width, size.height), { fov: c.fov, vs: c.vs, pos: firstPos, look: firstLook }, tp.current);
        if (b.k < 1) {
          // v21 fix: the flight rises over the crowd, the stage's rim and the stands and bows round the drum (tour.ts planFlight),
          // instead of a straight line through the felt
          const e = b.k, f = b.from, out = live.current, F = fl.current;
          if (!F.on) { F.a.set(f.px, f.py, f.pz); F.b.set(pose.px, pose.py, pose.pz); planFlight(F.a, F.b, F.c1, F.c2); F.n1.copy(F.c1); F.n2.copy(F.c2); F.pb.copy(F.b); F.at = nowMs; F.on = true; }
          F.b.set(pose.px, pose.py, pose.pz);
          // r2: the end moved on (a smooth scroll still under way): plan again for the new end (at most every 80 ms) and ease
          // the control points toward that plan, so the arc bends to the new end without a jump
          if (F.b.distanceToSquared(F.pb) > 0.09 && nowMs - F.at > 80) { planFlight(F.a, F.b, F.n1, F.n2); F.pb.copy(F.b); F.at = nowMs; }
          const kk = 1 - Math.exp(-dt * 9);
          F.c1.lerp(F.n1, kk); F.c2.lerp(F.n2, kk);
          for (const key of KEYS) out[key] = f[key] + (pose[key] - f[key]) * e;
          flightPoint(F.a, F.c1, F.c2, F.b, e, F.p);
          out.px = F.p.x; out.py = F.p.y; out.pz = F.p.z;
          P = out;
        } else P = pose;
        w = b.k < 1 ? b.k : Math.min(1, tourBus.t);
      }
    }
    if (name !== "home") tourBus.fly = 1;
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
    const fov = P.fov * fkNow;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // what the next shot's flight starts from (the lens without this viewport's correction)
    if (P !== live.current) Object.assign(live.current, P);
    live.current.fov = fov / (fk || 1);
    live.current.px = cam.position.x; live.current.py = cam.position.y; live.current.pz = cam.position.z;
    live.current.lx = look.x; live.current.ly = look.y; live.current.lz = look.z;
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __cam?: unknown }).__cam = { shot: name, p: cam.position.toArray().map((x) => +x.toFixed(2)), fov: cam.fov, view: cam.view?.enabled ? cam.view.offsetY : 0, vis: s.visibleH, tour: +tourBus.t.toFixed(3), w: +w.toFixed(3), fly: +back.current.k.toFixed(3) };
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
      return;
    }
    // phones and the stacked home: the drum centred in the band of canvas left visible; elsewhere the view shift (§7.5); the tour's own framing
    const vis = s.visibleH, top = s.visibleTop;
    const bk = bandK.current.k;
    const inBand = vis > 0 && vis < size.height && bk > 0;
    if (!inBand) bandOff.current = null;
    const offX = Math.round(-P.vs * size.width * 10) / 10;
    const offY0 = inBand ? (bandOff.current ?? size.height / 2 - (top + vis) / 2) * bk : s.viewLift;
    const offY = Math.round((offY0 * (1 - w) + P.lift * size.height) * 10) / 10;
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
      if (inBand && bk >= 1) {
        let want = (top + vis) / 2, have = (y0 + y1) / 2;
        if (compact && name !== "emblem") {
          corner.set(0, LADLE_PARK_Y, LADLE_Z).project(cam);
          want = top + EMBED_LADLE_AT * (vis - top); have = ((1 - corner.y) / 2) * size.height;
        }
        if (Math.abs(have - want) > 1) bandOff.current = Math.round(offY + (have - want));
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
