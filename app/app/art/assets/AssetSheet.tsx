"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

type Item = {
  pack: string; name: string; file: string; bytes: number; tris: number;
  skinned: boolean; anims: string[]; license: string; author: string; source: string;
};

const CLIP_PREF = [/wave/i, /^idle$/i, /idle/i, /dance/i, /walk/i];

/** Dev contact sheet: renders every GLB of the manifest into one grid with a single WebGL context. */
export function AssetSheet({ set, title, cols, tile }: { set: string; title?: string; cols: number; tile: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("loading manifest");
  const [dims, setDims] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = (await (await fetch("/assets/manifest.json", { cache: "no-store" })).json()) as { items: Item[] };
      const packs = set === "all" ? null : set.split(",");
      const list = m.items.filter((i) => !packs || packs.includes(i.pack) || packs.includes(`${i.pack}/${i.name}`));
      if (cancelled) return;
      setItems(list);
      const rows = Math.ceil(list.length / cols);
      const canvas = canvasRef.current!;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(cols * tile, rows * tile, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.9;
      renderer.setScissorTest(true);

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      try {
        const hdr = await new HDRLoader().loadAsync("/assets/hdri/warm_bar_1k.hdr");
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = pmrem.fromEquirectangular(hdr).texture;
        scene.environmentIntensity = 0.7;
        hdr.dispose();
      } catch { /* lights alone are enough for a sheet */ }
      scene.add(new THREE.HemisphereLight(0xfff8ef, 0x2a1d16, 0.9));
      const key = new THREE.DirectionalLight(0xfff1de, 2.0);
      key.position.set(2, 4, 3);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xc77dff, 0.8);
      rim.position.set(-3, 2, -3);
      scene.add(rim);

      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const cam = new THREE.PerspectiveCamera(28, 1, 0.001, 1000);
      const dir = new THREE.Vector3(0.75, 0.5, 1.35).normalize();
      const H = rows * tile;

      for (const [k, it] of list.entries()) {
        if (cancelled) return;
        setStatus(`${k + 1}/${list.length} ${it.name}`);
        const x = (k % cols) * tile, y = Math.floor(k / cols) * tile;
        renderer.setViewport(x, H - y - tile, tile, tile);
        renderer.setScissor(x, H - y - tile, tile, tile);
        renderer.setClearColor(k % 2 ? 0x1d1713 : 0x221a15, 1);
        try {
          const gltf = await loader.loadAsync(it.file);
          const root = gltf.scene;
          const clip = CLIP_PREF.map((re) => gltf.animations.find((a) => re.test(a.name))).find(Boolean) ?? gltf.animations[0];
          if (clip) {
            const mixer = new THREE.AnimationMixer(root);
            mixer.clipAction(clip).play();
            mixer.update(Math.min(clip.duration * 0.45, 1.2));
          }
          root.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(root, true);
          const size = box.getSize(new THREE.Vector3());
          const dim = `${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}`;
          setDims((d) => ({ ...d, [it.file]: dim }));
          ((window as unknown as { __dims?: Record<string, string> }).__dims ??= {})[it.file] = dim;
          const center = box.getCenter(new THREE.Vector3());
          const r = Math.max(size.length() / 2, 1e-6);
          const pivot = new THREE.Group();
          root.position.sub(center);
          pivot.add(root);
          scene.add(pivot);
          const d = (r / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2))) * 1.18;
          cam.near = d / 100; cam.far = d * 10;
          cam.position.copy(dir).multiplyScalar(d);
          cam.lookAt(0, 0, 0);
          cam.updateProjectionMatrix();
          renderer.render(scene, cam);
          scene.remove(pivot);
          root.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.geometry.dispose();
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((mt) => { Object.values(mt).forEach((v) => { if (v instanceof THREE.Texture) v.dispose(); }); mt.dispose(); });
            }
          });
        } catch (e) {
          renderer.setClearColor(0x5a1a10, 1);
          renderer.clear();
          console.error("asset failed", it.file, e);
        }
      }
      setStatus("done");
      document.body.dataset.sheet = "done";
    })();
    return () => { cancelled = true; };
  }, [set, cols, tile]);

  const rows = Math.ceil(items.length / cols) || 1;
  const totalKb = Math.round(items.reduce((s, i) => s + i.bytes, 0) / 1024);
  return (
    <div style={{ background: "#16120F", color: "#F6EEE3", minHeight: "100vh", padding: "16px 16px 72px", fontFamily: "var(--font-geist), system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", width: cols * tile, marginBottom: 8 }}>
        <strong style={{ fontSize: 15, letterSpacing: 0.2 }}>Ladle asset library · {title ?? set}</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }} data-status={status}>{items.length} models · {totalKb} KB optimized · {status}</span>
      </div>
      <div style={{ position: "relative", width: cols * tile, height: rows * tile }}>
        <canvas ref={canvasRef} style={{ width: cols * tile, height: rows * tile, display: "block" }} />
        {items.map((it, k) => (
          <div key={it.file} style={{ position: "absolute", left: (k % cols) * tile, top: Math.floor(k / cols) * tile, width: tile, height: tile, boxShadow: "inset 0 0 0 1px rgba(246,238,227,0.07)", pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: 6, right: 6, bottom: 5, fontSize: 10.5, lineHeight: 1.25 }}>
              <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
              <div style={{ opacity: 0.62, fontFamily: "var(--font-geist-mono), monospace", fontSize: 9.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {Math.round(it.bytes / 1024)} KB · {it.tris.toLocaleString("en")} tris{it.anims.length ? ` · ${it.anims.length} anim` : ""}{it.skinned ? " · rig" : ""}
              </div>
              <div style={{ opacity: 0.5, fontFamily: "var(--font-geist-mono), monospace", fontSize: 9 }}>{dims[it.file] ? `${dims[it.file]} units (w×h×d)` : " "}</div>
            </div>
            <div style={{ position: "absolute", left: 6, top: 5, fontSize: 9, opacity: 0.55, letterSpacing: 0.3, textTransform: "uppercase" }}>{it.pack} · {it.license.startsWith("CC0") ? "CC0" : "HF"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
