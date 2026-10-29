"use client";

/**
 * The drum assembly (v21): the brass-and-walnut cradle (Higgsfield / Tripo)
 * holding the app's own spherical cage between its hubs, the wire chute and
 * gate on top, the seal latch, and the balls. The physics stay in
 * drum/drum-sim.ts; v21 drops the glass shell (it cost a transmission pass
 * and drew double images) and draws every ball in ONE instanced mesh whose
 * maps live in one atlas.
 *
 * Every ball is the same size (shrinking with the entry count, the same for
 * all) and wears its player's colour (an identity); yours carries a cream
 * band. A new entry's owner hops; when the chute is free its ball drops
 * into the funnel's mouth from just above it (v21 fix: no toss across the room, no ball hanging in the
 * air) and falls through the chute into the cage, where the heap tumbles in the lower third (drum-sim). At the reveal the ladle scoops the balls out
 * of the cage and pours them at the front of the pedestal, one at a time
 * in ARRIVAL order; each rolls in a straight low line to the pedestal's rim,
 * hops onto the felt and rolls to its owner's feet (stage.ts). Identical for
 * every result.
 *
 * v21.4 (perf F3): the cradle is compiled before it is shown (attachWarm: its
 * program was a 134 to 178 ms link on its first frame); `cradle` is marked
 * loaded once it is ready to draw.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CAGE_Y, CHUTE_Y0, CHUTE_Y1, DROP_IN_H, DROP_IN_MS, MAX_BALLS, OMEGA_FAST, OMEGA_IDLE, R, inDrum } from "../drum/drum-sim";
import { BallAtlas, brass, cellOffset, easeMech, easeOut, instancedBallMaterial } from "../drum/materials";
import { cageGeometry, chuteGeometry } from "../drum/parts";
import { play } from "../../lib/sfx";
import { M, castShadows, loadGLTF } from "./assets";
import {
  CAGE_CENTRE, CAGE_SCALE, CRADLE_SCALE, LADLE_BOWL_Y, LADLE_CUP_R, LADLE_LIP_A, STAGE_TOP, T_POUR, T_SCOOP,
  cupPoint, ladlePoint, ladlePose, onSim, planServe, revealEnd, revealTime, servedAt, stage, staggerFor, type LadlePose,
} from "./stage";
import { hall, hallBus, type Quality } from "./store";
import { attachWarm } from "./warm";

const CAP = MAX_BALLS * 2 + 16;
const v3 = new THREE.Vector3();
const v3b = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const sc = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const RIG_POS = new THREE.Vector3(CAGE_CENTRE.x, CAGE_CENTRE.y - CAGE_Y * CAGE_SCALE, CAGE_CENTRE.z);
const pose: LadlePose = { x: 0, y: 0, z: 0, tilt: 0, full: false };
const eTilt = new THREE.Euler();
const cup = { x: 0, y: 0 };

/** per ball: where it was drawn last frame and how it is turned (the roll along the serve) */
interface Track { last: THREE.Vector3; q: THREE.Quaternion; seen: boolean }

const CRADLE = M("higgsfield/drum-cradle-1k.glb");
/**
 * fix:1 (T7, T3): the cradle parsed from the canvas's first mount step (HallWorld), not from this one's (the third): the
 * loader goes live on the cradle, which landed after the gate had opened (70 ms on a repeat visit, 0.5 s at 4x CPU)
 */
export function preloadCradle(): void { void loadGLTF(CRADLE).catch(() => {}); }

export function DrumAssembly({ quality }: { quality: Quality }) {
  // (the renderer, the scene and the camera for attachWarm, read when a model lands)
  const three = useThree((s) => s.get);
  const rig = useRef<THREE.Group>(null);
  const cage = useRef<THREE.Group>(null);
  const gate = useRef<THREE.Group>(null);
  const latch = useRef<THREE.Mesh>(null);
  const cradleRoot = useRef<THREE.Group>(null);
  const lastSlot = useRef(-1);
  const lastVersion = useRef(-1);
  const poured = useRef(0);
  const chimed = useRef("");
  const sealedFor = useRef("");
  const tracks = useRef(new Map<string, Track>());
  const cells = useRef(new Set<string>());
  const sim = stage.sim;

  const geo = useMemo(() => ({ cage: cageGeometry(), chute: chuteGeometry(), ball: new THREE.SphereGeometry(1, 18, 12) }), []);
  const mat = useMemo(() => ({
    brass: brass(),
    dark: new THREE.MeshStandardMaterial({ color: "#3A2618", roughness: 0.5, metalness: 0.4 }),
  }), []);
  const balls = useMemo(() => {
    const atlas = new BallAtlas();
    const m = new THREE.InstancedMesh(geo.ball, instancedBallMaterial(atlas.tex), CAP);
    const cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 2), 2);
    cellAttr.setUsage(THREE.DynamicDrawUsage);
    m.geometry = geo.ball.clone();
    m.geometry.setAttribute("aCell", cellAttr);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    return { atlas, mesh: m, cellAttr };
  }, [geo]);

  useEffect(() => { balls.mesh.castShadow = quality === "high"; }, [balls, quality]);

  // the cradle
  useEffect(() => {
    let alive = true;
    loadGLTF(CRADLE).then((g) => {
      if (!alive || !cradleRoot.current) return;
      const root = g.scene.clone(true);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mt = (m.material as THREE.MeshStandardMaterial).clone();
        // the cradle's metal reads a little coppery: pull it toward the room's brass
        if (mt.metalness > 0.5) { mt.color = new THREE.Color("#E8C48A"); mt.envMapIntensity = 1.05; }
        m.material = mt;
      });
      if (quality === "high") castShadows(root, true, false);
      root.scale.setScalar(CRADLE_SCALE);
      root.position.set(0, STAGE_TOP, 0);
      return attachWarm(three(), cradleRoot.current, root).then(() => { if (alive) hall.markLoaded("cradle"); });
    }).catch(() => hall.markLoaded("cradle"));
    return () => { alive = false; };
  }, [quality, three]);

  useEffect(() => () => {
    Object.values(geo).forEach((g) => g.dispose());
    Object.values(mat).forEach((m) => m.dispose());
    balls.mesh.geometry.dispose();
    (balls.mesh.material as THREE.Material).dispose();
    balls.atlas.dispose();
  }, [geo, mat, balls]);

  useEffect(() => {
    const off = onSim((e) => { if (e === "spin") play("whoosh"); else if (e === "drop") play("tok"); });
    document.fonts?.ready.then(() => balls.atlas.redraw()).catch(() => {});
    return off;
  }, [sim, balls]);

  useFrame((_, delta) => {
    const now = performance.now();
    const dt = Math.min(1 / 20, delta);
    const r = rig.current, c = cage.current;
    if (!r || !c) return;
    const w = hallBus.w;
    if (w && hallBus.version !== lastVersion.current) {
      lastVersion.current = hallBus.version;
      const wasSettled = sim.settledAt !== 0 && sim.windowId === w.id;
      sim.setWindow(w, now);
      // a reveal starts when the round in focus is served while we watch
      if (!wasSettled && sim.settledAt !== 0 && !sim.served && stage.revealId !== w.id) {
        stage.revealId = w.id;
        stage.revealN = Math.min(w.entries.length, MAX_BALLS);
        stage.landAt.clear();
        planServe(stage.revealN, sim.rbTarget * CAGE_SCALE);
        stage.revealT0 = stage.reduced ? now - revealEnd(stage.revealN) - 1 : sim.spinAt;
        poured.current = 0;
        hall.set({ reveal: { id: w.id, t0: stage.revealT0, flipped: 0, done: false } });
      } else if (sim.served && stage.revealId !== w.id && w.phase !== "open") {
        // a page opened on a served round: shown at rest, every tag already flipped
        stage.revealId = w.id; stage.revealT0 = now - 99_999; stage.revealN = w.entries.length; stage.serve.clear(); stage.serveEnd = 0;
        hall.set({ reveal: { id: w.id, t0: stage.revealT0, flipped: w.entries.length, done: true } });
      }
      if (w.phase === "open" && stage.revealId && stage.revealId !== w.id) { stage.revealId = ""; stage.revealT0 = 0; stage.landAt.clear(); stage.serve.clear(); stage.serveEnd = 0; }
      // seal: the latch clacks once
      if (w.phase !== "open" && sealedFor.current !== w.id) { sealedFor.current = w.id; if (now - sim.lockAt < 400) play("latch"); }
      // the last ten slots: a brass tick per slot
      if (w.phase === "open" && w.slotsRemaining !== lastSlot.current) {
        if (w.slotsRemaining <= 10 && w.slotsRemaining > 0 && lastSlot.current > w.slotsRemaining) play("tick");
        lastSlot.current = w.slotsRemaining;
      }
      sim.omegaOpen = w.phase === "open" && w.slotsRemaining <= 10 ? OMEGA_IDLE + (OMEGA_FAST - OMEGA_IDLE) * (1 - w.slotsRemaining / 10) : OMEGA_IDLE;
    }
    if (stage.reduced) sim.omegaOpen = 0;
    sim.step(dt, now);
    c.rotation.x = -sim.angle;

    const t = revealTime(now);
    const revealing = !!stage.revealId && stage.revealId === sim.windowId && t >= 0;
    if (revealing && t >= T_SCOOP && !sim.served) { sim.served = true; hall.set({ glowAt: now }); }

    // the gate: shut from the seal until the turn ends; the latch drops across it at slot 92
    if (gate.current) {
      const closing = sim.gateAt ? easeMech(Math.min(1, Math.max(0, now - sim.gateAt) / 520)) : 0;
      const reopen = revealing && t > 1150 ? easeOut(Math.min(1, (t - 1150) / 260)) : 0;
      gate.current.rotation.z = (Math.PI / 2) * 0.97 * (1 - closing + closing * reopen);
    }
    if (latch.current) {
      const f = sim.gateAt && !(revealing && t > 1150) ? Math.min(1, Math.max(0, now - sim.gateAt - 380) / 180) : 0;
      const settle = f >= 1 ? Math.sin(Math.min(1, (now - sim.gateAt - 560) / 160) * Math.PI) * 0.02 : 0;
      latch.current.position.y = CAGE_Y + CHUTE_Y0 + 0.07 + (1 - easeOut(f)) * 0.45 + settle;
      latch.current.visible = f > 0;
    }

    // the funnel's mouth in world space (tosses aim at it), and how far the ladle dips to reach it
    r.updateMatrixWorld();
    stage.funnel.set(0, CAGE_Y + R + 0.81, 0).applyMatrix4(r.matrixWorld);
    stage.dip = Math.max(0, LADLE_BOWL_Y - (stage.funnel.y + 0.14 + 0.34));

    // the balls: one instance each
    const mesh = balls.mesh, atlas = balls.atlas, cellArr = balls.cellAttr.array as Float32Array;
    const rad = sim.rb * CAGE_SCALE;
    const live = new Set<string>();
    let k = 0;
    let cellsDirty = false;
    const put = (key: string, pos: THREE.Vector3, q: THREE.Quaternion, s: number) => {
      if (k >= CAP || s <= 0.0001) return;
      const cell = atlasCell(key);
      if (cell < 0) return;
      m4.compose(pos, q, sc.set(s, s, s));
      mesh.setMatrixAt(k, m4);
      const o = k * 2;
      const prevX = cellArr[o], prevY = cellArr[o + 1];
      cellOffset(cell, cellArr, o);
      if (cellArr[o] !== prevX || cellArr[o + 1] !== prevY) cellsDirty = true;
      k++;
    };
    const cellOf = new Map<string, number>();
    const atlasCell = (key: string) => cellOf.get(key) ?? -1;
    for (const b of sim.balls) { live.add(b.key); cellOf.set(b.key, atlas.cell(b.key, b.initials, b.color, b.mine)); }
    for (const b of sim.leaving) if (atlas.has(b.key)) { live.add(b.key); cellOf.set(b.key, atlas.cell(b.key, b.initials, b.color, b.mine)); }
    for (const key of cells.current) if (!live.has(key)) { atlas.release(key); tracks.current.delete(key); }
    cells.current = live;

    const servedNow = sim.served && revealing;
    let poseReady = false;
    let heapSlots = 0;
    let departed = 0;
    let slotA = 0;
    if (servedNow) {
      ladlePose(t, stage.revealN, stage.dip, pose);
      poseReady = true;
      // v21 fix: the scoop rides IN the mark's cradle, single file along its arc, the lowest place first
      slotA = 2.08 * Math.asin(Math.min(1, rad / Math.max(0.02, LADLE_CUP_R - rad)));
      heapSlots = Math.max(1, Math.floor((LADLE_LIP_A + Math.PI / 2) / Math.max(0.05, slotA)) + 1);
      // how many balls have left the lip, as a continuous count: the row in the cradle slides toward the lip
      departed = Math.max(0, (t - T_POUR) / staggerFor(stage.revealN));
    }
    for (const b of sim.balls) {
      let tr = tracks.current.get(b.key);
      if (!tr) { tr = { last: new THREE.Vector3(), q: new THREE.Quaternion(), seen: false }; tracks.current.set(b.key, tr); }
      if (servedNow && poseReady) {
        const path = stage.serve.get(b.i);
        if (!path) continue;
        const st = servedAt(path, t, v3);
        if (st.state === "lip") {
          // riding the ladle: the next balls to pour sit single file in the cradle from its lowest place (or
          // the lip, once the ladle is tipped past it), in ARRIVAL order (ball i leaves at T_POUR + i x stagger);
          // the rest wait deeper in the bowl, out of sight, and slide into the row as it pours
          if (!pose.full) continue;
          const slot = b.i - departed;
          if (slot >= heapSlots) continue;
          const a = Math.min(LADLE_LIP_A, pose.tilt) - Math.max(0, slot) * slotA;
          // only where a ball can rest: within 62 degrees of the cradle's lowest place, on the arc
          if (a < -Math.PI / 2 || Math.abs(a - pose.tilt) > 1.08) continue;
          cupPoint(a, rad, cup);
          ladlePoint(pose, cup.x, cup.y, 0, v3);
          b.world.copy(v3);
          tr.last.copy(v3); tr.seen = true;
          // rolling toward the lip: one turn per 2 pi radii travelled
          qa.setFromEuler(eTilt.set(0, 0, pose.tilt + slot * 2)).multiply(b.q);
          tr.q.copy(qa);
          put(b.key, v3, qa, rad * Math.min(1, heapSlots - slot));
          continue;
        }
        if (st.state === "gone") continue;
        if (st.state === "caught") {
          if (!stage.landAt.has(b.i)) {
            stage.landAt.set(b.i, now);
            if (poured.current++ < 8) play("pour");
          }
          b.world.copy(v3);
          put(b.key, v3, tr.q, rad * (1 - easeOut(st.catchF)));
          continue;
        }
        // on the road: roll with the ground (the axis across the motion)
        if (tr.seen) {
          v3b.subVectors(v3, tr.last);
          v3b.y = 0;
          const d = v3b.length();
          if (d > 1e-5) { v3b.cross(UP).normalize().negate(); qb.setFromAxisAngle(v3b, d / rad); tr.q.premultiply(qb); }
        } else tr.q.copy(b.q);
        tr.last.copy(v3); tr.seen = true;
        b.world.copy(v3);
        put(b.key, v3, tr.q, rad);
        continue;
      }
      if (sim.served) continue;
      if (b.mode === "drop" && now < b.born && b.tossAt) {
        // v21 fix: no toss across the room (from the room's camera it read as balls hanging in the air
        // beside the chute). The owner hops; then the ball drops into the funnel's mouth from just above
        // it, straight down on a short ballistic fall (it starts falling at once, never hovers), a few
        // centimetres off-centre on its owner's side, and enters the chute
        if (stage.reduced || now < b.born - DROP_IN_MS) continue;
        const f = 1 - (b.born - now) / DROP_IN_MS;
        const hands = stage.hands.get(b.i);
        v3b.set(0, 0, 0);
        if (hands) { v3b.set(hands.x - stage.funnel.x, 0, hands.z - stage.funnel.z); const l = v3b.length(); if (l > 1e-3) v3b.multiplyScalar((0.06 * (1 - f)) / l); }
        b.world.set(v3b.x / CAGE_SCALE, CAGE_Y + CHUTE_Y1 + 0.08 + DROP_IN_H * (1 - f * f), v3b.z / CAGE_SCALE).applyMatrix4(r.matrixWorld);
        tr.q.copy(b.q);
        put(b.key, b.world, b.q, rad * easeOut(Math.min(1, f * 3)));
        continue;
      }
      if ((b.mode === "drop" || inDrum(b)) && now >= b.born) {
        b.world.copy(b.p).add(v3.set(0, CAGE_Y, 0)).applyMatrix4(r.matrixWorld);
        qa.multiplyQuaternions(r.quaternion, b.q);
        tr.q.copy(qa); tr.last.copy(b.world); tr.seen = true;
        put(b.key, b.world, qa, rad);
      }
    }
    // the previous round's balls shrink away where they were
    for (const b of sim.leaving) {
      const f = Math.min(1, (now - b.outAt) / 320);
      if (b.world.lengthSq() === 0) continue;
      const tr = tracks.current.get(b.key);
      put(b.key, b.world, tr?.q ?? b.q, rad * (1 - easeOut(f)));
    }
    mesh.count = k;
    if (k > 0) mesh.instanceMatrix.needsUpdate = true;
    if (cellsDirty) balls.cellAttr.needsUpdate = true;

    // the reveal's end: one chime, identical for every result
    if (revealing && stage.serveEnd > 0 && t >= revealEnd(stage.revealN) && chimed.current !== stage.revealId) {
      chimed.current = stage.revealId;
      if (t - revealEnd(stage.revealN) < 1500) play("chime");
      hall.set((s) => ({ reveal: s.reveal ? { ...s.reveal, done: true } : { id: stage.revealId, t0: stage.revealT0, flipped: stage.revealN, done: true } }));
    }
  });

  const y0 = CAGE_Y + CHUTE_Y0 + 0.02;
  return (
    <group>
      <group ref={cradleRoot} />
      <group ref={rig} position={RIG_POS} scale={CAGE_SCALE}>
        <mesh geometry={geo.chute} material={mat.brass} />
        <group ref={gate} position={[-0.2, y0 + 0.012, 0]}>
          <mesh position={[0.2, 0, 0]} material={mat.dark}><cylinderGeometry args={[0.19, 0.19, 0.014, 40]} /></mesh>
        </group>
        <mesh ref={latch} material={mat.brass} position={[0, y0 + 0.07, 0]} visible={false}><boxGeometry args={[0.52, 0.035, 0.06]} /></mesh>
        <group ref={cage} position={[0, CAGE_Y, 0]}>
          <mesh geometry={geo.cage} material={mat.brass} castShadow={quality === "high"} />
          {/* axle stubs into the cradle's hubs */}
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * (R + 0.16), 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.brass}><cylinderGeometry args={[0.035, 0.035, 0.34, 16]} /></mesh>
          ))}
        </group>
      </group>
      <primitive object={balls.mesh} />
    </group>
  );
}
