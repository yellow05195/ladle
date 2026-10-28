"use client";

/**
 * The brand ladle in brass (v20, v21 fix): the v21 mark (public/brand/ladle-mark.svg, the "d": the
 * cradle holding the ball, the handle with its hanging hole) made an object, not a cut-out sign: a
 * 12 cm thick body with a deep rounded bevel all round, in the cradle's polished brass on every face
 * (brushed, so its faces never read as one flat yellow). It hangs from a brass rod through the hole,
 * parked up under the spotlight's rig between serves (out of the desktop shots, never cut by their
 * top edge), and is the loader's emblem. The scoop is the mark's saffron ball; it hides while the
 * ladle serves and comes back at rest.
 *
 * The reveal choreography (stage.ts ladlePose) is identical for every result: down from its park
 * during the decisive turn, dip into the funnel and scoop, carry the scoop forward and down to the
 * pedestal's front left (low, beside the empty cage, never across it), tip toward its lip and pour one
 * ball at a time in arrival order, go home and back up.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { glossBall } from "../drum/materials";
import { LADLE_BOWL_Y, LADLE_H, LADLE_PARK_Y, LADLE_S, LADLE_X, LADLE_Z, MARK_O, ladlePose, revealTime, stage, type LadlePose } from "./stage";

export { LADLE_H, LADLE_S };

/** The v21 mark's body (ladle-mark.svg): the "d" outline and its hanging hole. */
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M24.27 59.8A19.18 19.18 0 0 0 61.7 53.88V18.42A8.42 8.42 0 0 1 78.54 18.42V90H44.85C29.21 90 24.27 83.71 24.27 63.8V59.8ZM70.12 13.74A4.68 4.68 0 0 0 70.12 23.1A4.68 4.68 0 0 0 70.12 13.74Z"/></svg>`;
const BALL_R = 16.84;
const HOLE = { x: 70.12, y: 18.42 };
/** The mark's visual centre (x 24.27 … 78.54, y 10 … 90), from the origin, metres: the emblem shot centres on it. */
export const MARK_CENTRE = { x: ((24.27 + 78.54) / 2 - MARK_O.x) * LADLE_S, y: (MARK_O.y - 50) * LADLE_S };
export const ROD_TOP = 7.2;

const pose: LadlePose = { x: 0, y: 0, z: 0, tilt: 0, full: false };

/** Fine horizontal brushing (a tiling normal map drawn once): the faces of the ladle catch the room in streaks, like worked brass. */
function brushedNormal(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 8; c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let y = 0; y < 256; y++) {
    const ny = 128 + Math.round((rnd() - 0.5) * 70);
    g.fillStyle = `rgb(128, ${ny}, 255)`;
    g.fillRect(0, y, 8, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 0.6);
  return t;
}

export function Ladle({ onReady }: { onReady?: () => void }) {
  const group = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  const rod = useRef<THREE.Mesh>(null);
  const { geo, mat, ballMat, nrm } = useMemo(() => {
    const data = new SVGLoader().parse(MARK_SVG);
    const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
    // a real body: 10 cm of core plus a 2.2 cm rounded bevel each side (12 to 14 cm through), the bevel deep enough to catch a highlight
    const depth = 0.1 / LADLE_S, bevel = 0.022 / LADLE_S;
    const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.016 / LADLE_S, bevelSegments: 6, curveSegments: 48 });
    // mark units → metres, y up, origin at the ball's centre, centred in depth
    g.translate(-MARK_O.x, -MARK_O.y, -depth / 2);
    g.scale(LADLE_S, -LADLE_S, LADLE_S);
    // the y flip turned the faces inside out: flip them back
    const idx = g.index;
    if (idx) { const a = idx.array as Uint16Array | Uint32Array; for (let i = 0; i < a.length; i += 3) { const t = a[i]!; a[i] = a[i + 2]!; a[i + 2] = t; } idx.needsUpdate = true; }
    else {
      const pos = g.attributes.position!;
      for (let i = 0; i < pos.count; i += 3) {
        for (let c = 0; c < 3; c++) { const t = pos.getComponent(i, c); pos.setComponent(i, c, pos.getComponent(i + 2, c)); pos.setComponent(i + 2, c, t); }
      }
      pos.needsUpdate = true;
    }
    g.computeVertexNormals();
    const n = brushedNormal();
    // the cradle's polished brass (DrumAssembly tints the cradle's metal #E8C48A), on every face: no flat yellow, no dark sides
    const m = new THREE.MeshPhysicalMaterial({ color: "#CC9A50", metalness: 1, roughness: 0.27, envMapIntensity: 1.25, normalMap: n, normalScale: new THREE.Vector2(0.5, 0.5), clearcoat: 0.35, clearcoatRoughness: 0.18 });
    return { geo: g, mat: m, ballMat: glossBall("#FFB21A"), nrm: n };
  }, []);
  const rodGeo = useMemo(() => new THREE.CylinderGeometry(0.014, 0.014, 1, 10), []);
  const holeTop = useMemo(() => new THREE.Vector3((HOLE.x - MARK_O.x) * LADLE_S, (MARK_O.y - HOLE.y) * LADLE_S, 0), []);
  const top = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    onReady?.();
    return () => { geo.dispose(); mat.dispose(); ballMat.dispose(); rodGeo.dispose(); nrm?.dispose(); };
  }, [geo, mat, ballMat, rodGeo, nrm, onReady]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = performance.now();
    const t = revealTime(now);
    // the reveal (stage.ts): down from the park, dip, scoop, carry to the pedestal, pour, home, up; a pure function of the clock
    ladlePose(t, stage.revealN, stage.dip, pose);
    g.position.set(pose.x, pose.y, pose.z);
    g.rotation.z = pose.tilt;
    stage.bowl.set(pose.x, pose.y + 0.02, pose.z);
    // the mark's saffron ball rests in the cradle only while the ladle hangs empty, at home or parked
    const away = pose.full || pose.y < LADLE_BOWL_Y - 1e-3 || Math.abs(pose.x - LADLE_X) > 1e-3 || Math.abs(pose.z - LADLE_Z) > 1e-3 || pose.tilt !== 0;
    if (ball.current) ball.current.visible = !away || stage.reduced;
    // the rod: from the hanging hole to the rig
    if (rod.current) {
      g.updateMatrixWorld();
      top.copy(holeTop).applyMatrix4(g.matrixWorld);
      const len = Math.max(0.01, ROD_TOP - top.y);
      rod.current.position.set(top.x, top.y + len / 2, top.z);
      rod.current.scale.set(1, len, 1);
    }
  });

  return (
    <>
      <group ref={group} position={[LADLE_X, LADLE_PARK_Y, LADLE_Z]}>
        <mesh geometry={geo} material={mat} />
        <mesh ref={ball} material={ballMat}>
          <sphereGeometry args={[BALL_R * LADLE_S, 40, 28]} />
        </mesh>
      </group>
      <mesh ref={rod} geometry={rodGeo} material={mat} />
    </>
  );
}
