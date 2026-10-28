"use client";

/**
 * The brass floor ticker (v20): a band of the stage's rim carrying the
 * curve's latest moves, newest first, buys and sells in time order, all the
 * same size and brightness: `R#{n} bought {tokens} LADLE · {before} → {after}
 * SOL / 1M` and `sell {tokens} LADLE · {before} → {after} SOL / 1M`. Read from
 * the history source; hidden when there is none. Still under reduced motion.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getHistorySource } from "../../lib/data";
import type { CurvePoint } from "../../lib/data/types";
import { formatInt } from "../../lib/format";
import { hall } from "./store";

const TEX_W = 8192, TEX_H = 64;
const R = 3.61, H = 0.3, Y = 0.12 + 0.18;
const SPEED = 0.35; // m/s along the rim

/**
 * The price before and after a move. v21 fix: a move too small to show at 4 decimals is printed with 6 (or 8),
 * so a sell never reads as "0.0725 → 0.0725" under a caption that says each sell steps the price down.
 */
export function pricePair(before: number, after: number): string {
  for (const d of [4, 6, 8]) {
    const a = before.toFixed(d), b = after.toFixed(d);
    if (a !== b || d === 8) return `${a} → ${b}`;
  }
  return `${before} → ${after}`;
}

export function tickerLine(p: CurvePoint): string {
  const tok = formatInt(p.tokens / 1_000_000n);
  return p.kind === "buy"
    ? `R#${p.round} bought ${tok} LADLE · ${pricePair(p.before, p.after)} SOL / 1M`
    : `sell ${tok} LADLE · ${pricePair(p.before, p.after)} SOL / 1M`;
}

export function FloorTicker() {
  const mesh = useRef<THREE.Mesh>(null);
  const { tex, canvas } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = TEX_W; c.height = TEX_H;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return { tex: t, canvas: c };
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.2, emissive: new THREE.Color("#ffffff"), emissiveMap: tex, emissiveIntensity: 0.22 }), [tex]);

  useEffect(() => {
    const src = getHistorySource();
    if (!src) { if (mesh.current) mesh.current.visible = false; return; }
    let alive = true;
    const draw = async () => {
      const pts = await src.getCurve();
      if (!alive) return;
      const g = canvas.getContext("2d")!;
      g.fillStyle = "#3A2618";
      g.fillRect(0, 0, TEX_W, TEX_H);
      g.fillStyle = "rgba(201,154,75,0.5)";
      g.fillRect(0, 2, TEX_W, 1.5); g.fillRect(0, TEX_H - 3.5, TEX_W, 1.5);
      // v21.1: the one family (Figtree through --font-sans)
      const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() || "sans-serif";
      g.font = `600 34px ${fam}`;
      g.textBaseline = "middle";
      let x = 40;
      for (let i = pts.length - 1; i >= 0 && x < TEX_W - 40; i--) {
        const line = tickerLine(pts[i]!);
        const w = g.measureText(line).width;
        if (x + w > TEX_W - 40) break;
        g.fillStyle = "#F0CB7E";
        g.fillText(line, x, TEX_H / 2 + 1);
        x += w + 36;
        g.fillStyle = "#C99A4B";
        g.beginPath(); g.arc(x - 18, TEX_H / 2, 4, 0, Math.PI * 2); g.fill();
      }
      tex.needsUpdate = true;
    };
    void document.fonts?.ready.then(draw);
    let pending = 0;
    const off = src.subscribeCurve?.(() => { if (!pending) pending = window.setTimeout(() => { pending = 0; void draw(); }, 400); });
    return () => { alive = false; off?.(); if (pending) clearTimeout(pending); };
  }, [canvas, tex]);

  useEffect(() => () => { tex.dispose(); mat.dispose(); }, [tex, mat]);

  useFrame((_, dt) => {
    if (hall.get().reduced) return;
    tex.offset.x = (tex.offset.x + (dt * SPEED) / (2 * Math.PI * R)) % 1;
  });

  return (
    <mesh ref={mesh} position={[0, Y, 0]} material={mat}>
      <cylinderGeometry args={[R, R, H, 128, 1, true]} />
    </mesh>
  );
}
