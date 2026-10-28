"use client";

/**
 * The hall (v20): one round room, warm and dark, seen from above in
 * three-quarter. Walnut wall panels with brass inlays and an oxblood band,
 * three velvet curtain bays at the back, two arched doorways with hanging
 * lanterns, eight columns, ten brass wall lamps, four booths, a dark parquet,
 * a black marble gallery ring and the felt stage with its brass trims. One
 * spotlight on the drum, a hemisphere fill, two warm door lights, fog.
 *
 * No slot machine, no chips, no coins, no prize wheel: the casino line of
 * the brief. The room shell is built with kit.ts (merged, vertex-coloured,
 * one draw call); the props are CC0 models (Kenney, Quaternius, Kay Lousberg,
 * iPoly3D via Poly Pizza) and two Higgsfield/Tripo models.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { glowTexture, roomEnvironment, setupRenderer } from "../drum/materials";
import { M, castShadows, loadGLTF, loadTexture, normalise, tint } from "./assets";
import { Builder } from "./kit";
import { STANDS, azimuthToXZ } from "./seats";
import { STAGE_TOP } from "./stage";
import { hall, type Quality } from "./store";
import { tourBus } from "./tour";

const C = {
  walnut: "#3A2618", walnutHi: "#5A3A22", oxblood: "#4A1418", oxbloodHi: "#6E1F24", felt: "#12352F", feltHi: "#1D4A42",
  brass: "#C99A4B", ceiling: "#0E0B09", opening: "#0B0907", lamp: "#FFC46B", spot: "#FFE2A8", hall: "#1E1612",
};
const WALL_R = 13, WALL_H = 7.5;
const DOORS = [100, 260];
const CURTAINS = [140, 180, 220];
const COLUMNS = [40, 80, 120, 160, 200, 240, 280, 320];
const LAMPS = [40, 60, 80, 120, 160, 200, 240, 280, 300, 320];
const BOOTHS = [60, -60, 120, -120];

const rad = (d: number) => (d * Math.PI) / 180;
/** Rotation about y that turns a model's +Z toward the centre from azimuth a. */
const faceIn = (a: number) => Math.PI - rad(a);
const faceInv = (a: number) => -rad(a);

/** The room shell: walls, doorways, the ceiling, brass trims, the stage plinth's trims. */
function buildShell(): THREE.BufferGeometry {
  const b = new Builder();
  const seg = 24, w = (2 * Math.PI * WALL_R) / seg + 0.05;
  for (let k = 0; k < seg; k++) {
    const a = 7.5 + k * 15;
    if (DOORS.some((d) => Math.abs(a - d) < 8)) continue;
    const [x, z] = azimuthToXZ(a, WALL_R);
    const [xi, zi] = azimuthToXZ(a, WALL_R - 0.07);
    const ry = faceIn(a);
    b.box(w, WALL_H, 0.12, C.walnut, x, 0, z, { ry });
    // brass inlay frame on the panel (two posts, two rails), the dado rail, the oxblood band
    const fw = w - 0.5;
    for (const y of [1.25, 4.35]) b.box(fw, 0.03, 0.02, C.brass, xi, y, zi, { ry });
    for (const s of [-1, 1]) {
      const [px, pz] = [xi + Math.cos(rad(a)) * s * (fw / 2) * -1, zi + Math.sin(rad(a)) * s * (fw / 2) * -1];
      b.box(0.03, 3.1, 0.02, C.brass, px, 1.25, pz, { ry });
    }
    const [xd, zd] = azimuthToXZ(a, WALL_R - 0.09);
    b.box(w, 0.06, 0.06, C.brass, xd, 0.97, zd, { ry });
    b.box(w, WALL_H - 4.6, 0.04, C.oxblood, xi, 4.6, zi, { ry });
    b.box(w, 0.04, 0.05, C.brass, xd, 4.58, zd, { ry });
  }
  // the doorways: walnut jambs, a brass half-torus arch, a dark opening
  for (const d of DOORS) {
    const [x, z] = azimuthToXZ(d, WALL_R);
    const ry = faceIn(d);
    const tx = Math.cos(rad(d)), tz = Math.sin(rad(d));
    for (const s of [-1, 1]) b.box(0.35, 3.4, 0.4, C.walnutHi, x - tx * s * 1.35, 0, z - tz * s * 1.35, { ry });
    b.box(2.4, 4.2, 0.05, C.opening, x, 0, z, { ry });
    b.add(new THREE.TorusGeometry(1.2, 0.07, 8, 24, Math.PI), C.brass, x, 3.4, z, { pivot: "center", ry });
    b.box(3.2, 7.5 - 4.6, 0.14, C.walnut, x, 4.6, z, { ry });
    b.box(3.2, 0.9, 0.16, C.walnut, x, 3.7, z, { ry });
  }
  // v21: the stands, four walnut tiers round the back of the room (oxblood carpet, brass nosing), aisles at the doors
  const step = 3;
  for (let t = 0; t < STANDS.tiers; t++) {
    const r0 = STANDS.r0 + STANDS.depth * t, r1 = r0 + STANDS.depth, top = STANDS.rise * (t + 1);
    for (let a = STANDS.from; a < STANDS.to - 0.01; a += step) {
      const mid = a + step / 2;
      if (STANDS.aisles.some(([c, half]) => Math.abs(mid - c) < half)) continue;
      const ry = faceIn(mid);
      const wOut = 2 * r1 * Math.sin(rad(step / 2)) + 0.03;
      const [x, z] = azimuthToXZ(mid, (r0 + r1) / 2);
      b.box(wOut, top, STANDS.depth, C.walnut, x, 0, z, { ry });
      const [xc, zc] = azimuthToXZ(mid, (r0 + r1) / 2 + 0.02);
      b.box(wOut - 0.004, 0.014, STANDS.depth - 0.07, C.oxblood, xc, top, zc, { ry });
      const [xn, zn] = azimuthToXZ(mid, r0 + 0.022);
      b.box(2 * r0 * Math.sin(rad(step / 2)) + 0.03, 0.03, 0.045, C.brass, xn, top - 0.012, zn, { ry });
    }
  }
  // ceiling, brass ring trims round the stage
  b.add(new THREE.CircleGeometry(WALL_R + 0.3, 48), C.ceiling, 0, WALL_H, 0, { pivot: "center", rx: Math.PI / 2 });
  b.add(new THREE.TorusGeometry(3.6, 0.035, 8, 96), C.brass, 0, STAGE_TOP, 0, { pivot: "center", rx: Math.PI / 2 });
  b.add(new THREE.TorusGeometry(4.0, 0.035, 8, 96), C.brass, 0, 0.12, 0, { pivot: "center", rx: Math.PI / 2 });
  b.add(new THREE.TorusGeometry(4.6, 0.02, 6, 96), C.brass, 0, 0.012, 0, { pivot: "center", rx: Math.PI / 2 });
  const g = b.geometry();
  // ambient occlusion, baked: darker near the floor and the ceiling
  const pos = g.attributes.position!, col = g.attributes.color!;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const f = 0.62 + 0.38 * Math.min(1, Math.min(y / 1.2, (WALL_H - y) / 1.6));
    col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
  }
  return g;
}

/** The spotlight's visible cone: additive, vertical fade, a slow scrolling noise. */
function coneMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(C.spot) }, uOpacity: { value: 0.1 } },
    vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }",
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+1.),f.x), f.y); }
      void main(){ float fade = smoothstep(0.0, 0.25, vUv.y) * (0.35 + 0.65 * vUv.y); float rim = pow(abs(dot(vN, vV)), 1.4);
        float k = 0.75 + 0.25 * n(vec2(vUv.x * 18.0, vUv.y * 4.0 - uTime * 0.12));
        gl_FragColor = vec4(uColor * fade * rim * k * uOpacity, 1.0); }`,
  });
}

function Dust({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);
  const { geo, seeds } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3), s = new Float32Array(count);
    let r = 11;
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for (let i = 0; i < count; i++) {
      const y = 0.8 + rnd() * 6.2, maxR = 0.2 + ((7.2 - y) / 6.7) * 2.6, a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * maxR;
      p[i * 3] = Math.cos(a) * d; p[i * 3 + 1] = y; p[i * 3 + 2] = Math.sin(a) * d + 0.3; s[i] = rnd();
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return { geo: g, seeds: s };
  }, [count]);
  const mat = useMemo(() => new THREE.PointsMaterial({ color: C.spot, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTexture(), sizeAttenuation: true }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame((_, dt) => {
    const pts = ref.current;
    if (!pts || hall.get().reduced) return;
    const a = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      let y = a.getY(i) + dt * (0.04 + seeds[i]! * 0.06);
      if (y > 7.0) y = 0.8;
      a.setY(i, y);
      a.setX(i, a.getX(i) + Math.sin(performance.now() / 2400 + seeds[i]! * 40) * dt * 0.02);
    }
    a.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo} material={mat} />;
}

export function HallScene({ quality, onEnv, onShell, compact = false }: { quality: Quality; onEnv?: () => void; onShell?: () => void; compact?: boolean }) {
  const { gl, scene } = useThree();
  const props = useRef<THREE.Group>(null);
  const spot = useRef<THREE.SpotLight>(null);
  const spotTarget = useMemo(() => new THREE.Object3D(), []);
  const lampMats = useRef<THREE.MeshStandardMaterial[]>([]);
  const halos = useRef<THREE.SpriteMaterial[]>([]);
  const cone = useMemo(() => coneMaterial(), []);
  const high = quality === "high";
  const shell = useMemo(() => buildShell(), []);
  const shellMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.15, envMapIntensity: 0.6 }), []);
  // v21 fix: a walnut base until the parquet's maps arrive (never a flat untextured grey); the maps then take over at #8c8c8c
  const floorMat = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color("#3f2c1f"), roughness: 0.6, metalness: 0, envMapIntensity: 0.5 }), []);
  const marbleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color("#3a3a3a"), roughness: 0.25, metalness: 0, envMapIntensity: 0.9 }), []);
  const stageMats = useMemo(() => [
    new THREE.MeshStandardMaterial({ color: C.walnut, roughness: 0.55, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: C.felt, roughness: 0.95, metalness: 0, envMapIntensity: 0.25 }),
    new THREE.MeshStandardMaterial({ color: C.walnut, roughness: 0.55 }),
  ], []);
  const plinthMat = useMemo(() => new THREE.MeshStandardMaterial({ color: C.walnut, roughness: 0.5, metalness: 0.05 }), []);

  // the renderer, the fog, the environment
  useEffect(() => {
    setupRenderer(gl, "aces");
    gl.toneMappingExposure = 1.05;
    scene.fog = new THREE.Fog(C.hall, 16, 32);
    scene.background = new THREE.Color("#0d0a08");
    let alive = true;
    if (high) {
      new HDRLoader().loadAsync("/assets/hdri/warm_bar_1k.hdr").then((hdr) => {
        if (!alive) return;
        const pmrem = new THREE.PMREMGenerator(gl);
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = pmrem.fromEquirectangular(hdr).texture;
        scene.environmentIntensity = 0.35;
        hdr.dispose(); pmrem.dispose();
        hall.markLoaded("env"); onEnv?.();
      }).catch(() => { scene.environment = roomEnvironment(gl); scene.environmentIntensity = 0.3; hall.markLoaded("env"); onEnv?.(); });
    } else {
      scene.environment = roomEnvironment(gl);
      scene.environmentIntensity = 0.3;
      hall.markLoaded("env"); onEnv?.();
    }
    return () => { alive = false; };
  }, [gl, scene, high, onEnv]);

  // textures
  useEffect(() => {
    let alive = true;
    const T = "/assets/textures";
    Promise.all([
      loadTexture(`${T}/WoodFloor064/WoodFloor064_color.webp`, true, 8),
      loadTexture(`${T}/WoodFloor064/WoodFloor064_normalgl.webp`, false, 8),
      loadTexture(`${T}/WoodFloor064/WoodFloor064_roughness.webp`, false, 8),
      loadTexture(`${T}/Marble016/Marble016_color.webp`, true, 3),
      loadTexture(`${T}/Marble016/Marble016_normalgl.webp`, false, 3),
      loadTexture(`${T}/Fabric026/Fabric026_normalgl.webp`, false, 10),
      loadTexture(`${T}/Fabric026/Fabric026_roughness.webp`, false, 10),
    ]).then(([wc, wn, wr, mc, mn, fn, fr]) => {
      if (!alive) return;
      floorMat.map = wc!; floorMat.normalMap = wn!; floorMat.roughnessMap = wr!; floorMat.color = new THREE.Color("#8c8c8c"); floorMat.needsUpdate = true;
      marbleMat.map = mc!; marbleMat.normalMap = mn!; marbleMat.color = new THREE.Color("#5a5a5a"); marbleMat.needsUpdate = true;
      const felt = stageMats[1]!;
      felt.normalMap = fn!; felt.roughnessMap = fr!; felt.normalScale = new THREE.Vector2(0.6, 0.6); felt.needsUpdate = true;
    }).catch(() => {});
    return () => { alive = false; };
  }, [floorMat, marbleMat, stageMats]);

  // the props
  useEffect(() => {
    const root = props.current;
    if (!root) return;
    if (compact) { hall.markLoaded("shell"); return; }
    let alive = true;
    const add = (o: THREE.Object3D, a: number, r: number, y = 0, ry = faceIn(a)) => {
      const [x, z] = azimuthToXZ(a, r);
      o.position.set(x, y, z);
      o.rotation.y = ry;
      root.add(o);
    };
    const lampMat = (intensity: number) => {
      const m = new THREE.MeshStandardMaterial({ color: C.lamp, emissive: new THREE.Color(C.lamp), emissiveIntensity: intensity, roughness: 0.4 });
      lampMats.current.push(m);
      return m;
    };
    const halo = (o: THREE.Object3D, size: number, opacity: number) => {
      const sm = new THREE.SpriteMaterial({ map: glowTexture(), color: C.lamp, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      halos.current.push(sm);
      const s = new THREE.Sprite(sm);
      s.scale.setScalar(size);
      o.add(s);
      return s;
    };
    const fabricN = loadTexture("/assets/textures/Fabric026/Fabric026_normalgl.webp", false, 4);
    const jobs: Array<Promise<unknown>> = [
      loadGLTF(M("polypizza/curtains-double-quaternius.glb")).then(async (g) => {
        const n = await fabricN.catch(() => null);
        for (const a of CURTAINS) {
          const m = g.scene.clone(true);
          tint(m, C.oxblood, { roughness: 0.9, metalness: 0, normalMap: n });
          const w = normalise(m, 5.5);
          const box = new THREE.Box3().setFromObject(w);
          const size = box.getSize(new THREE.Vector3());
          w.scale.set(3.4 / Math.max(0.01, Math.max(size.x, size.z)), 1, 1);
          add(w, a, WALL_R - 0.35);
        }
      }),
      loadGLTF(M("polypizza/column-quaternius.glb")).then((g) => {
        for (const a of COLUMNS) {
          const m = g.scene.clone(true);
          tint(m, C.walnutHi, { roughness: 0.5, metalness: 0.1 });
          const w = normalise(m, 6);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 24), new THREE.MeshStandardMaterial({ color: C.brass, metalness: 1, roughness: 0.25 }));
          ring.rotation.x = Math.PI / 2; ring.position.y = 0.35;
          const cap = ring.clone(); cap.position.y = 5.7;
          w.add(ring, cap);
          add(w, a, 12.4);
        }
      }),
      loadGLTF(M("kenney-furniture/lampWall.glb")).then((g) => {
        for (const a of LAMPS) {
          const m = g.scene.clone(true);
          m.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mesh.material = mats.map((mt) => (mt.name === "lamp" ? lampMat(2.2) : new THREE.MeshStandardMaterial({ color: C.brass, metalness: 1, roughness: 0.3 })));
            if (!Array.isArray(mesh.geometry.groups) || mesh.geometry.groups.length === 0) mesh.material = (mesh.material as THREE.Material[])[0]!;
          });
          const w = normalise(m, 0.7, "x");
          halo(w, 0.6 / 0.7 * 1.6, 0.35).position.set(0, 0.35, 0.25);
          add(w, a, WALL_R - 0.12, 3.2);
        }
      }),
      loadGLTF(M("polypizza/lantern-hanging-kaylousberg.glb")).then((g) => {
        for (const a of DOORS) {
          const m = g.scene.clone(true);
          m.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) { const mt = (mesh.material as THREE.MeshStandardMaterial).clone(); mt.emissive = new THREE.Color(C.lamp); mt.emissiveIntensity = 0.9; mt.emissiveMap = mt.map; mesh.material = mt; } });
          const w = normalise(m, 0.9);
          halo(w, 1.4, 0.35).position.set(0, 0.35, 0);
          add(w, a, WALL_R - 1.0, 4.4);
        }
      }),
      loadGLTF(M("polypizza/couch-small-quaternius.glb")).then(async (g) => {
        const [table, lamp] = await Promise.all([loadGLTF(M("kenney-furniture/tableRound.glb")), loadGLTF(M("kenney-furniture/lampRoundTable.glb"))]);
        const booths = quality === "high" ? BOOTHS : BOOTHS.slice(2);
        for (const a of booths) {
          const c = g.scene.clone(true);
          tint(c, C.oxblood, { roughness: 0.7, metalness: 0 });
          const cw = normalise(c, 2.1, "x");
          add(cw, a, 8.9);
          const t = table.scene.clone(true);
          tint(t, C.walnut, { roughness: 0.45 });
          const tw = normalise(t, 0.85, "x");
          add(tw, a, 7.7);
          const l = lamp.scene.clone(true);
          l.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const next = mats.map((mt) => (mt.name === "lamp" ? lampMat(1.6) : new THREE.MeshStandardMaterial({ color: C.brass, metalness: 1, roughness: 0.3 })));
            mesh.material = next.length === 1 ? next[0]! : next;
          });
          const lw = normalise(l, 0.42);
          halo(lw, 0.9, 0.3).position.set(0, 0.32, 0);
          const tb = new THREE.Box3().setFromObject(tw);
          add(lw, a, 7.7, tb.max.y - tw.position.y);
        }
      }),
      loadGLTF(M("polypizza/armchair-creativetrio.glb")).then((g) => {
        for (const a of [DOORS[0]! - 18, DOORS[1]! + 18]) {
          const m = g.scene.clone(true);
          tint(m, C.oxblood, { roughness: 0.65, metalness: 0 });
          add(normalise(m, 1.0), a, 11.2);
        }
      }),
      loadGLTF(M("kenney-furniture/pottedPlant.glb")).then((g) => {
        for (const a of [30, 330, 120 - 8, 240 + 8]) {
          const m = g.scene.clone(true);
          m.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const next = mats.map((mt) => { const x = (mt as THREE.MeshStandardMaterial).clone(); x.color = new THREE.Color(mt.name === "plant" ? C.feltHi : C.walnut); return x; });
            mesh.material = next.length === 1 ? next[0]! : next;
          });
          add(normalise(m, 1.5), a, 11.6);
        }
      }),
      loadGLTF(M("higgsfield/stanchion-velvet-rope-3k.glb")).then((g) => {
        for (let k = 0; k < 6; k++) {
          const a = 130 + k * 20;
          const m = g.scene.clone(true);
          const w = normalise(m, 1.45, "x");
          w.scale.multiplyScalar(1);
          if (high) castShadows(w, true, false);
          add(w, a, 4.4, 0, faceIn(a));
        }
      }),
      loadGLTF(M("polypizza/spotlight-a-ipoly3d.glb")).then((g) => {
        const m = g.scene.clone(true);
        // the key light sits inside the can, so nothing lights its body from below: v21 fix (r2) a dark brass that the room's
        // fill and reflections still model, with a faint warm floor of its own, so it never renders as a black hole in a
        // tour frame (at least #2A1E16); a warm lens
        const can = new THREE.MeshStandardMaterial({ color: "#5A4128", metalness: 0.55, roughness: 0.42, emissive: new THREE.Color("#2E2016"), emissiveIntensity: 1 });
        m.traverse((o) => { const mesh = o as THREE.Mesh; if (!mesh.isMesh) return; const name = (mesh.material as THREE.Material).name; mesh.material = name === "Glow" ? new THREE.MeshBasicMaterial({ color: "#8a6a3c" }) : can; });
        const w = normalise(m, 0.7);
        w.position.set(0, 7.5 - 0.7, 0.3);
        w.rotation.x = Math.PI;
        root.add(w);
      }),
    ];
    Promise.allSettled(jobs).then(() => { if (alive) { hall.markLoaded("shell"); onShell?.(); } });
    return () => { alive = false; };
  }, [quality, high, onShell, compact]);

  useEffect(() => () => { shell.dispose(); shellMat.dispose(); floorMat.dispose(); marbleMat.dispose(); stageMats.forEach((m) => m.dispose()); plinthMat.dispose(); cone.dispose(); }, [shell, shellMat, floorMat, marbleMat, stageMats, plinthMat, cone]);

  // the light comes up (lit), the spot narrows over the last slots and glows once when the round is served
  const ramp = useRef(0);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const envBase = useRef(0);
  const doorLights = useRef<Array<THREE.PointLight | null>>([]);
  useFrame((state, dt) => {
    const s = hall.get();
    // v21: the house lights come up a little while the scroll tour is away from the first screen (uniforms only: no light is added)
    const tw = tourBus.w;
    // v21 fix: the fill comes up (hemisphere, environment); the exposure barely moves and the door lamps step down a little,
    // so their pools on the floor never blow out to a flat cream plane behind the captions
    if (hemi.current) hemi.current.intensity = 0.25 + 0.4 * tw;
    if (scene.environment) {
      if (!envBase.current) envBase.current = scene.environmentIntensity;
      scene.environmentIntensity = envBase.current * (1 + 0.6 * tw);
    }
    gl.toneMappingExposure = 1.05 + 0.04 * tw;
    for (const l of doorLights.current) if (l) l.intensity = 14 * (1 - 0.3 * tw);
    ramp.current = Math.min(1, ramp.current + (s.lit ? dt / 0.6 : 0));
    const k = s.lit ? ramp.current : 0.0;
    for (const m of lampMats.current) m.emissiveIntensity = (m.userData.base ??= m.emissiveIntensity) * k;
    for (const h of halos.current) h.opacity = (h.userData.base ??= h.opacity) * k;
    const now = performance.now();
    const glow = s.glowAt && now - s.glowAt < 400 ? 1 + 0.15 * Math.sin(((now - s.glowAt) / 400) * Math.PI) : 1;
    const sp = spot.current;
    if (sp) {
      const target = (sp.userData.angle as number | undefined) ?? 0.42;
      sp.angle += (target - sp.angle) * Math.min(1, dt * 3);
      sp.intensity = 95 * glow * (s.lit ? 1 : 0.85);
    }
    cone.uniforms.uTime!.value = state.clock.elapsedTime;
    cone.uniforms.uOpacity!.value = 0.1 * glow;
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={[C.walnut, C.felt, 0.25]} />
      <primitive object={spotTarget} position={[0, 1.2, -0.1]} />
      <spotLight
        ref={spot}
        position={[0, 7.2, 0.3]}
        color={C.spot}
        angle={0.42}
        penumbra={0.6}
        decay={2}
        distance={0}
        intensity={95}
        target={spotTarget}
        castShadow={high}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-camera-near={2}
        shadow-camera-far={10}
      />
      {DOORS.map((d, i) => { const [x, z] = azimuthToXZ(d, WALL_R - 1.4); return <pointLight key={d} ref={(l) => { doorLights.current[i] = l; }} position={[x, 3.6, z]} color={C.lamp} intensity={14} distance={9} decay={2} />; })}

      {compact ? null : <mesh geometry={shell} material={shellMat} />}
      {/* floor, gallery ring, stage */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={floorMat} receiveShadow={high}><circleGeometry args={[16, 64]} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} material={marbleMat}><ringGeometry args={[4.0, 4.6, 96]} /></mesh>
      <mesh position={[0, 0.06, 0]} material={plinthMat}><cylinderGeometry args={[4.0, 4.0, 0.12, 96]} /></mesh>
      <mesh position={[0, 0.12 + 0.18, 0]} material={stageMats} receiveShadow={high}><cylinderGeometry args={[3.6, 3.6, 0.36, 96]} /></mesh>
      {/* the spotlight's cone */}
      <mesh position={[0, 7.2 - 6.7 / 2, 0.3]} material={cone} renderOrder={5}><cylinderGeometry args={[0.15, 3.0, 6.7, 48, 1, true]} /></mesh>
      {high ? <Dust count={120} /> : null}
      <group ref={props} />
    </>
  );
}

export { faceInv };
