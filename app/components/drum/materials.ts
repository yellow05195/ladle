/**
 * The material library of the 3D hall (v20, kept from v18): the brass of the
 * cage, the chute and the ladle, the balls (a MeshPhysicalMaterial with a
 * clearcoat whose map is a small canvas: the player's colour, an identity
 * never a result, two cream label discs with the initials in Figtree 800 (v21.1: the one family),
 * and a cream band on the viewer's own ball), the glow sprite, the room
 * environment through a PMREMGenerator (no download) for the mid and low
 * tiers, and the renderer defaults (ACES Filmic in the hall).
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export const COLORS = {
  label: "#F6EEE3",
  labelInk: "#16120F",
  /** the cage, axles, chute and rail: brushed copper-brass */
  steel: "#D39A62",
  /** the stand, bearings, gate: dark bronze */
  gunmetal: "#4A3426",
  /** the base: walnut */
  plate: "#3B2416",
  /** the crank knob: cream ceramic */
  lacquer: "#EDE2D0",
  /** the table */
  stage: "#2A1A10",
  floor: "#120D0A",
} as const;

/** The room: one PMREM environment per renderer, cached. */
const envs = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();
export function roomEnvironment(gl: THREE.WebGLRenderer): THREE.Texture {
  const hit = envs.get(gl);
  if (hit) return hit;
  const pmrem = new THREE.PMREMGenerator(gl);
  const room = new RoomEnvironment();
  const tex = pmrem.fromScene(room, 0.035).texture;
  room.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  pmrem.dispose();
  envs.set(gl, tex);
  return tex;
}

/** Renderer defaults shared by every canvas (v20 hall: ACES Filmic; the v18 stills kept Neutral). */
export function setupRenderer(gl: THREE.WebGLRenderer, tone: "aces" | "neutral" = "neutral"): void {
  gl.toneMapping = tone === "aces" ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  gl.outputColorSpace = THREE.SRGBColorSpace;
}

/**
 * v20 brass: the cage, the chute, the trims, the ladle. A room colour, never a result. v21.4 (perf F12): a Standard
 * material, one shader program fewer to link at arrival; it used no Physical feature, and at metalness 1 both shade
 * the same (the A/B in screenshots/v21/perf/out/brass-ab.json: identical frames).
 */
export function brass(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: "#C99A4B", metalness: 1, roughness: 0.22, envMapIntensity: 1.1 });
}

/** Brushed copper-brass (the cage, the chute, the rail): warm metal, anisotropic. */
export function brushedSteel(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color: COLORS.steel, metalness: 1, roughness: 0.3, anisotropy: 0.55, envMapIntensity: 0.95 });
}
/** Dark bronze (the stand, the bearings, the gate). */
export function gunmetal(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color: COLORS.gunmetal, metalness: 0.9, roughness: 0.46, envMapIntensity: 0.85 });
}
/** Oiled walnut (the base plate). */
export function plate(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color: "#ffffff", map: woodTexture(), metalness: 0, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.35, envMapIntensity: 0.5 });
}
/** Cream ceramic (the crank knob). */
export function lacquer(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color: COLORS.lacquer, metalness: 0, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
}
/** The table the drum stands on: walnut, a soft sheen that catches the lamp's pool. */
export function stageTop(): THREE.MeshPhysicalMaterial {
  const map = woodTexture().clone();
  map.repeat.set(2.2, 2.2);
  map.needsUpdate = true;
  return new THREE.MeshPhysicalMaterial({ color: "#ffffff", map, metalness: 0, roughness: 0.56, clearcoat: 0.2, clearcoatRoughness: 0.45, envMapIntensity: 0.12 });
}
/** Kept for older callers: the room beyond the table, matte and dark. */
export function studioFloor(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: COLORS.floor, metalness: 0, roughness: 0.9, envMapIntensity: 0.1 });
}

/** A walnut grain, drawn once on a canvas: long, slightly wavy streaks over a dark warm brown. */
let woodTex: THREE.CanvasTexture | null = null;
export function woodTexture(): THREE.CanvasTexture {
  if (woodTex) return woodTex;
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 1024;
  const g = c.getContext("2d")!;
  g.fillStyle = COLORS.stage;
  g.fillRect(0, 0, 1024, 1024);
  // a seeded walk so the grain is the same on every load (and in the poster)
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 260; i++) {
    const y0 = rnd() * 1024, amp = 2 + rnd() * 9, freq = 0.004 + rnd() * 0.01, ph = rnd() * 6.28;
    const light = rnd() < 0.5;
    g.strokeStyle = light ? `rgba(120, 78, 46, ${0.05 + rnd() * 0.12})` : `rgba(12, 7, 4, ${0.08 + rnd() * 0.18})`;
    g.lineWidth = 0.6 + rnd() * 2.8;
    g.beginPath();
    for (let x = 0; x <= 1024; x += 16) { const y = y0 + Math.sin(x * freq + ph) * amp; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  woodTex = new THREE.CanvasTexture(c);
  woodTex.colorSpace = THREE.SRGBColorSpace;
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.anisotropy = 8;
  return woodTex;
}

/** v21.1: the one family (Figtree, through --font-sans). Canvas cannot apply ss01; the default a is accepted. */
function fontFamily(): string {
  if (typeof document === "undefined") return "sans-serif";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim();
  return v || "ui-sans-serif, system-ui, sans-serif";
}

/** The ball's map: the player's colour all round, two label discs (front at u = 0.25, back at u = 0.75) with the initials. */
export function ballTexture(initials: string, color: string, size = 512, mine = false): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = size; c.height = size / 2;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  drawBall(tex, initials, color, mine);
  return tex;
}

/** The viewer's ball (v20) is the same size as every other one and carries a cream band round its equator. */
export function drawBall(tex: THREE.CanvasTexture, initials: string, color: string, mine = false): void {
  const c = tex.image as HTMLCanvasElement;
  const g = c.getContext("2d")!;
  const W = c.width, H = c.height;
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  if (mine) { g.fillStyle = COLORS.label; g.fillRect(0, H * 0.5 - H * 0.05, W, H * 0.1); }
  const text = initials.toUpperCase();
  const r = H * 0.25;
  const fam = fontFamily();
  for (const cx of [W * 0.25, W * 0.75]) {
    g.beginPath();
    // the disc is drawn on the equirectangular map: it stays round at the equator
    g.ellipse(cx, H / 2, r, r, 0, 0, Math.PI * 2);
    g.fillStyle = COLORS.label;
    g.fill();
    g.fillStyle = COLORS.labelInk;
    const fs = text.length > 2 ? r * 0.62 : r * 0.84;
    g.font = `800 ${Math.round(fs)}px ${fam}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, cx, H / 2 + fs * 0.04);
  }
  tex.needsUpdate = true;
}

export function ballMaterial(tex: THREE.Texture): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.1, sheen: 0.2, sheenColor: new THREE.Color("#ffffff") });
}

/**
 * v21: every ball of the drum in ONE instanced draw. The balls' maps live in
 * one atlas (1024 x 1024, 8 x 16 cells of 128 x 64, each cell the
 * equirectangular map of one ball, padded with its own colour so the mips
 * never bleed); each instance reads its cell through `aCell`.
 */
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 16;
const CELL_W = 128, CELL_H = 64, PAD = 4;

export class BallAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly tex: THREE.CanvasTexture;
  private free: number[] = [];
  private used = new Map<string, number>();
  private sig = new Map<number, string>();
  constructor() {
    const c = document.createElement("canvas");
    c.width = CELL_W * ATLAS_COLS; c.height = CELL_H * ATLAS_ROWS;
    this.canvas = c;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.tex.flipY = false;
    for (let i = ATLAS_COLS * ATLAS_ROWS - 1; i >= 0; i--) this.free.push(i);
  }
  /** The cell of a ball (drawn on first use, redrawn when its look changes). Returns -1 when the atlas is full. */
  cell(key: string, initials: string, color: string, mine: boolean): number {
    let i = this.used.get(key);
    if (i === undefined) {
      i = this.free.pop();
      if (i === undefined) return -1;
      this.used.set(key, i);
    }
    const sig = `${initials}|${color}|${mine ? 1 : 0}`;
    if (this.sig.get(i) !== sig) { this.sig.set(i, sig); this.draw(i, initials, color, mine); }
    return i;
  }
  release(key: string): void {
    const i = this.used.get(key);
    if (i === undefined) return;
    this.used.delete(key);
    this.free.push(i);
  }
  has(key: string): boolean { return this.used.has(key); }
  /** Redraw every cell (once the font has loaded). */
  redraw(): void {
    for (const [i, s] of this.sig) { const [ini, col, m] = s.split("|"); this.draw(i, ini!, col!, m === "1"); }
  }
  private draw(i: number, initials: string, color: string, mine: boolean): void {
    const g = this.canvas.getContext("2d")!;
    const x0 = (i % ATLAS_COLS) * CELL_W, y0 = Math.floor(i / ATLAS_COLS) * CELL_H;
    g.save();
    g.fillStyle = color;
    g.fillRect(x0, y0, CELL_W, CELL_H);
    const W = CELL_W - PAD * 2, H = CELL_H - PAD * 2, ix = x0 + PAD, iy = y0 + PAD;
    if (mine) { g.fillStyle = COLORS.label; g.fillRect(ix, iy + H * 0.45, W, H * 0.1); }
    const text = initials.toUpperCase();
    const r = H * 0.25;
    const fam = fontFamily();
    for (const cx of [ix + W * 0.25, ix + W * 0.75]) {
      g.beginPath();
      g.ellipse(cx, iy + H / 2, r, r, 0, 0, Math.PI * 2);
      g.fillStyle = COLORS.label;
      g.fill();
      g.fillStyle = COLORS.labelInk;
      const fs = text.length > 2 ? r * 0.62 : r * 0.86;
      g.font = `800 ${Math.round(fs)}px ${fam}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, cx, iy + H / 2 + fs * 0.05);
    }
    g.restore();
    this.tex.needsUpdate = true;
  }
  dispose(): void { this.tex.dispose(); }
}

/** The atlas cell (column, row) of index i, as the UV offset of its padded inner box. */
export function cellOffset(i: number, out: Float32Array, at: number): void {
  const c = i % ATLAS_COLS, r = Math.floor(i / ATLAS_COLS);
  out[at] = (c * CELL_W + PAD) / (CELL_W * ATLAS_COLS);
  out[at + 1] = (r * CELL_H + PAD) / (CELL_H * ATLAS_ROWS);
}

/** The balls' shared material: clear-coated, the map read from the instance's atlas cell. */
export function instancedBallMaterial(tex: THREE.Texture): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.0 });
  const sx = (CELL_W - PAD * 2) / (CELL_W * ATLAS_COLS), sy = (CELL_H - PAD * 2) / (CELL_H * ATLAS_ROWS);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aCell;")
      .replace("#include <uv_vertex>", `#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = vec2(vMapUv.x, 1.0 - vMapUv.y) * vec2(${sx.toFixed(6)}, ${sy.toFixed(6)}) + aCell;\n#endif`);
  };
  m.customProgramCacheKey = () => "ladle-ball-atlas";
  return m;
}

/** A plain glossy ball in one colour (the slow background floaters, the loader). */
export function glossBall(color: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.1 });
}

/** A soft round glow (additive sprite map), drawn once. */
let glowTex: THREE.CanvasTexture | null = null;
export function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.55)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** The quaternion that turns a ball's front label (+Z) toward `eye`. */
const m4 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
export function faceToward(out: THREE.Quaternion, from: THREE.Vector3, eye: THREE.Vector3): THREE.Quaternion {
  m4.lookAt(eye, from, UP);
  return out.setFromRotationMatrix(m4);
}

/** cubic-bezier(x1, y1, x2, y2) as a function of t in [0, 1] (Newton then bisection on x). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const bx = (t: number) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
  const by = (t: number) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  const dx = (t: number) => 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= (bx(t) - x) / d; }
    if (t < 0 || t > 1 || Math.abs(bx(t) - x) > 1e-4) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 30; i++) { t = (lo + hi) / 2; if (bx(t) < x) lo = t; else hi = t; }
    }
    return by(t);
  };
}

/** The mechanical ease of every decisive move: the floored cube's quarter turn. */
export const easeMech = cubicBezier(0.77, 0, 0.175, 1);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch { return false; }
}
