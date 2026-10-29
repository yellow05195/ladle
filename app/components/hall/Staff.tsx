"use client";

/**
 * The hall's staff (v20): the bear host beside the crank (Higgsfield / Meshy,
 * rigged, one wave clip) and the fox bellhop at the left door (Tripo). Staff
 * never stand on the felt, never react to a result and never carry a name
 * tag. The bear waves once when a round opens and once when the viewer
 * takes a seat; otherwise he holds the clip's first frame and breathes.
 *
 * v21.4 (perf F3, F9): both are compiled before they are shown (attachWarm:
 * the skinned bear's program was a 93 to 130 ms link at the end of the
 * pull-back), and the bear's culling sphere is set once from his posed box
 * (the engine worked it out over his bone-transformed vertices: 26 ms).
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { M, castShadows, loadGLTF, normalise } from "./assets";
import { azimuthToXZ } from "./seats";
import { hall, hallBus, type Quality } from "./store";
import { attachWarm } from "./warm";

/** the wave lifts a paw above the rest pose's box: the culling sphere has room for it */
const WAVE_PAD = 1.5;

export function Staff({ quality }: { quality: Quality }) {
  // (the renderer, the scene and the camera for attachWarm, read when a model lands)
  const three = useThree((s) => s.get);
  const bear = useRef<THREE.Group>(null);
  const fox = useRef<THREE.Group>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const wave = useRef<THREE.AnimationAction | null>(null);
  const lastWave = useRef(0);
  const lastRound = useRef("");

  useEffect(() => {
    let alive = true;
    loadGLTF(M("higgsfield/bear-host-5k.glb")).then((g) => {
      if (!alive || !bear.current) return;
      const root = g.scene;
      // (normalise keeps the bone-aware bounds on the skinned mesh; the wave gets room in the sphere)
      const w = normalise(root, 1.25);
      root.traverse((o) => { const sm = o as THREE.SkinnedMesh; if (sm.isSkinnedMesh && sm.boundingSphere) sm.boundingSphere.radius *= WAVE_PAD; });
      if (quality === "high") castShadows(w, true, false);
      void attachWarm(three(), bear.current, w);
      const mx = new THREE.AnimationMixer(root);
      const clip = g.animations[0];
      if (clip) {
        const a = mx.clipAction(clip);
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = false;
        a.play();
        a.paused = true;
        a.time = 0;
        mx.update(0);
        wave.current = a;
      }
      mixer.current = mx;
    }).catch(() => {});
    loadGLTF(M("higgsfield/fox-bellhop-5k.glb")).then((g) => {
      if (!alive || !fox.current) return;
      const w = normalise(g.scene, 1.25);
      void attachWarm(three(), fox.current, w);
    }).catch(() => {});
    return () => { alive = false; };
  }, [quality, three]);

  useFrame((state, dt) => {
    const s = hall.get();
    const t = state.clock.elapsedTime;
    const w = hallBus.w;
    // a round opens: one wave; a seat is taken: one wave
    if (w && w.phase === "open" && w.id !== lastRound.current) {
      const first = lastRound.current === "";
      lastRound.current = w.id;
      if (!first) hall.set((x) => ({ wave: x.wave + 1 }));
    }
    const a = wave.current;
    if (a && s.wave !== lastWave.current && !s.reduced) {
      lastWave.current = s.wave;
      a.reset();
      a.paused = false;
      a.play();
    }
    if (a && !a.paused && a.time >= a.getClip().duration - 0.05) { a.paused = true; a.time = 0; }
    mixer.current?.update(Math.min(0.05, dt));
    const breath = s.reduced ? 1 : 1 + Math.sin((t / 3.2) * Math.PI * 2) * 0.01;
    if (bear.current) bear.current.scale.set(1, breath, 1);
    if (fox.current) fox.current.scale.set(1, s.reduced ? 1 : 1 + Math.sin((t / 3.2) * Math.PI * 2 + 1.3) * 0.01, 1);
  });

  const [fx, fz] = azimuthToXZ(100, 11.6);
  return (
    <>
      <group ref={bear} position={[4.5, 0, -1.0]} rotation={[0, THREE.MathUtils.degToRad(-30), 0]} />
      <group ref={fox} position={[fx, 0, fz]} rotation={[0, Math.atan2(-fx, -fz), 0]} />
    </>
  );
}
