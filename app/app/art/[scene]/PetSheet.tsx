"use client";

/**
 * Dev only (v20): the 72 character portraits (12 species × 6 scarves),
 * rendered from the real models with one WebGL context and a scissor grid
 * on a transparent canvas. scripts/render-pets.mjs crops each 256 px tile
 * into public/assets/pets/{species}-{scarf}.webp.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SCARVES, SPECIES } from "../../../lib/profile";
import { buildCharacter } from "../../../components/hall/character";

const TILE = 256;

export function PetSheet() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const cols = SCARVES.length, rows = SPECIES.length;
      const c = ref.current!;
      const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1);
      r.setSize(cols * TILE, rows * TILE, false);
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.05;
      r.setClearColor(0x000000, 0);
      r.setScissorTest(true);
      const scene = new THREE.Scene();
      const pm = new THREE.PMREMGenerator(r);
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.55;
      const key = new THREE.SpotLight(0xffe2a8, 40, 0, 0.6, 0.7, 2);
      key.position.set(0.6, 3, 2.2);
      key.target.position.set(0, 0.5, 0);
      scene.add(key, key.target);
      scene.add(new THREE.HemisphereLight(0x5a3a22, 0x12352f, 0.7));
      const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
      cam.position.set(0.55, 0.95, 2.6);
      cam.lookAt(0, 0.5, 0);
      const H = rows * TILE;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (!alive) return;
          const h = await buildCharacter(SPECIES[y]!, SCARVES[x]!.hex, "portrait", { shadows: false });
          h.play("static");
          h.update(0);
          h.root.rotation.y = -0.35;
          scene.add(h.root);
          r.setViewport(x * TILE, H - (y + 1) * TILE, TILE, TILE);
          r.setScissor(x * TILE, H - (y + 1) * TILE, TILE, TILE);
          r.clear();
          r.render(scene, cam);
          scene.remove(h.root);
          h.dispose();
        }
      }
      (window as unknown as { __petsReady?: boolean }).__petsReady = true;
    })().catch((e) => console.error("pets", e));
    return () => { alive = false; };
  }, []);
  return <canvas ref={ref} data-pets style={{ width: SCARVES.length * TILE, height: SPECIES.length * TILE, display: "block", background: "transparent" }} />;
}
