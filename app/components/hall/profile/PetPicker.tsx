"use client";

/**
 * The character preview (v20): the selected Cube Pet on a felt pedestal with
 * a brass rim, under its own small spotlight, turning slowly (drag to turn),
 * its scarf in the chosen colour. Selecting plays `gesture-positive` once,
 * then `idle`; hovering a species tile plays `dance`. A second small canvas
 * (DPR 1, 30 fps, RoomEnvironment), mounted only while the modal is open;
 * the hall pauses meanwhile, so one context renders at a time.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { roomEnvironment, setupRenderer } from "../../drum/materials";
import type { Species } from "../../../lib/profile";
import { buildCharacter, type CharacterHandle } from "../character";

function Pet({ species, scarf, dance, cheer, onReady }: { species: Species; scarf: string; dance: boolean; cheer: number; onReady?: () => void }) {
  const { gl, scene, invalidate } = useThree();
  const holder = useRef<THREE.Group>(null);
  const handle = useRef<CharacterHandle | null>(null);
  const turn = useRef({ y: -0.5, v: 0, drag: false, x: 0 });
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    setupRenderer(gl, "aces");
    scene.environment = roomEnvironment(gl);
    scene.environmentIntensity = 0.6;
  }, [gl, scene]);

  useEffect(() => {
    let alive = true;
    void buildCharacter(species, scarf, "pick").then((h) => {
      if (!alive || !holder.current) { h.dispose(); return; }
      handle.current?.dispose();
      handle.current = h;
      holder.current.add(h.root);
      h.play("gesture-positive", true);
      invalidate();
      requestAnimationFrame(() => readyRef.current?.());
    });
    return () => { alive = false; };
  }, [species, scarf, invalidate]);
  useEffect(() => () => handle.current?.dispose(), []);
  useEffect(() => { if (cheer) handle.current?.play("gesture-positive", true); }, [cheer]);
  useEffect(() => { handle.current?.play(dance ? "dance" : "idle"); }, [dance]);

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => { turn.current.drag = true; turn.current.x = e.clientX; el.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!turn.current.drag) return; const d = (e.clientX - turn.current.x) * 0.012; turn.current.x = e.clientX; turn.current.y += d; turn.current.v = d * 30; };
    const up = (e: PointerEvent) => { turn.current.drag = false; if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
  }, [gl]);

  useFrame((_, dt) => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!turn.current.drag) { turn.current.v *= Math.exp(-dt * 3); turn.current.y += (reduced ? 0 : 0.35) * dt + turn.current.v * dt; }
    if (holder.current) holder.current.rotation.y = turn.current.y;
    handle.current?.update(Math.min(0.05, dt));
  });

  return (
    <>
      <spotLight position={[0, 3.2, 1.2]} angle={0.55} penumbra={0.7} intensity={28} color="#FFE2A8" decay={2} />
      <hemisphereLight args={["#3A2618", "#12352F", 0.5]} />
      <mesh position={[0, -0.06, 0]}><cylinderGeometry args={[0.62, 0.66, 0.12, 48]} /><meshStandardMaterial color="#12352F" roughness={0.95} /></mesh>
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.62, 0.018, 8, 64]} /><meshStandardMaterial color="#C99A4B" metalness={1} roughness={0.25} /></mesh>
      <group ref={holder} />
    </>
  );
}

function Pacer() {
  const { invalidate } = useThree();
  useEffect(() => { const id = setInterval(() => invalidate(), 1000 / 30); return () => clearInterval(id); }, [invalidate]);
  return null;
}

export default function PetPicker({ species, scarf, dance, cheer, onReady }: { species: Species; scarf: string; dance: boolean; cheer: number; onReady?: () => void }) {
  return (
    <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: 30, position: [0, 0.9, 3.1] }} onCreated={({ camera }) => camera.lookAt(0, 0.48, 0)} gl={{ antialias: true, alpha: true }}>
      <Pacer />
      <Pet species={species} scarf={scarf} dance={dance} cheer={cheer} onReady={onReady} />
    </Canvas>
  );
}
