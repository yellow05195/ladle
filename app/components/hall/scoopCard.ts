"use client";

/**
 * The share card (v21.1, §7.13), drawn on a canvas in the browser, 1200 × 630:
 * a flat #16120F ground with no texture, the wordmark at 123 × 48, the cream
 * handle tag top right while in demo. Left: "15 players." / "One price." in
 * Figtree 900 (no italic), the viewer's line, the smallest and the largest at
 * one size, the sum line. Right: the arrival-order list with player dots,
 * every row the same size and colour. Bottom: the deepest band with the
 * mark, the conserved sentence and useladle.fun. The same layout for every result.
 */
import { BRAND } from "../../../config/brand";
import { playerColor } from "../../lib/colors";
import { formatMultiplier } from "../../lib/format";

export interface CardTile { name: string; m: number; mine: boolean; tokens?: string; color?: string }
export interface CardData { n: string; players: number; tiles: CardTile[]; seed8: string; demo: boolean; head: string; head2: string; foot: string; mineLine: string | null; extremes: string; sumLine: string; demoL1: string; demoL2: string }

const W = 1200, H = 630;

function cssVar(name: string, fallback: string): string {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

function fit(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && g.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** Figtree from the site's own file, registered once for the canvas (canvas text cannot apply ss01; the default a is accepted). */
let figtree: Promise<string> | null = null;
function cardFont(): Promise<string> {
  if (!figtree) {
    figtree = (async () => {
      try {
        const f = new FontFace("LadleCard", "url(/fonts/figtree-latin.woff)", { weight: "400 900", style: "normal" });
        await f.load();
        document.fonts.add(f);
        return "LadleCard, system-ui, sans-serif";
      } catch { return cssVar("--font-sans", "system-ui, sans-serif"); }
    })();
  }
  return figtree;
}

/** The round end of a handle tag with its punched hole, flat end on the right. */
function handleTag(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, hole: string) {
  const r = h / 2, r2 = h * 0.22;
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r2, y); g.quadraticCurveTo(x + w, y, x + w, y + r2);
  g.lineTo(x + w, y + h - r2); g.quadraticCurveTo(x + w, y + h, x + w - r2, y + h);
  g.lineTo(x + r, y + h); g.arc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2); g.closePath(); g.fill();
  g.fillStyle = hole; g.beginPath(); g.arc(x + r, y + r, h * 0.17, 0, Math.PI * 2); g.fill();
}

export async function drawScoopCard(c: HTMLCanvasElement, d: CardData): Promise<void> {
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const F = await cardFont();
  await document.fonts?.ready;
  const INK = "#F6EEE3", INK2 = "#D2C5B4", INK3 = "#A89884", GROUND = "#16120F", GROUND0 = "#0F0B09", ON = "#16120F";
  g.fillStyle = GROUND; g.fillRect(0, 0, W, H);
  const wm = await loadImage(BRAND.assets.wordmark);
  if (wm) g.drawImage(wm, 64, 58, 123, 48);
  g.textBaseline = "alphabetic";
  // the demo marker: the cream handle tag, top right
  if (d.demo) {
    g.font = `800 20px ${F}`;
    const label = `${d.demoL1.toLowerCase()} ${d.demoL2}`;
    const w = 44 + g.measureText(label).width + 18;
    const x = W - 64 - w, y = 64;
    handleTag(g, x, y, w, 40, INK, GROUND);
    g.fillStyle = ON; g.fillText(label, x + 44, y + 27);
  }
  // left half: one voice, no italic
  g.fillStyle = INK; g.font = `900 64px ${F}`;
  g.fillText(d.head, 64, 216);
  g.fillText(d.head2, 64, 282);
  let y = 344;
  if (d.mineLine) { g.font = `700 28px ${F}`; g.fillStyle = INK; g.fillText(fit(g, d.mineLine, 520), 64, y); y += 44; }
  g.font = `500 22px ${F}`; g.fillStyle = INK2;
  g.fillText(d.extremes, 64, y); y += 34;
  const words = d.sumLine.split(" "); let line = "";
  for (const wd of words) { const tr = line ? `${line} ${wd}` : wd; if (g.measureText(tr).width > 520) { g.fillText(line, 64, y); y += 30; line = wd; } else line = tr; }
  if (line) g.fillText(line, 64, y);
  // right half: the arrival order, one size, one colour, a player dot each
  const rows = d.tiles.slice(0, 13);
  const x0 = 660, x1 = W - 64, rh = 30;
  const ry0 = Math.max(160, 300 - (rows.length * rh) / 2);
  g.font = `500 20px ${F}`;
  rows.forEach((tl, i) => {
    const yy = ry0 + i * rh;
    g.fillStyle = tl.color ?? playerColor(tl.name); g.beginPath(); g.arc(x0 + 5, yy - 7, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = INK;
    g.font = `${tl.mine ? 800 : 500} 20px ${F}`;
    g.textAlign = "left"; g.fillText(fit(g, tl.name, 170), x0 + 22, yy);
    g.font = `500 20px ${F}`;
    g.textAlign = "right";
    if (tl.tokens) g.fillText(tl.tokens, x1 - 96, yy);
    g.fillText(formatMultiplier(tl.m), x1, yy);
    g.textAlign = "left";
  });
  if (d.tiles.length > 13) { g.fillStyle = INK3; g.font = `500 18px ${F}`; g.fillText(`+${d.tiles.length - 13}`, x0 + 22, ry0 + 13 * rh + 2); }
  // bottom: the deepest band with the mark, the conserved sentence and the domain
  const by = H - 96;
  g.fillStyle = GROUND0; g.fillRect(0, by, W, 96);
  const m = BRAND.logo.mark;
  g.save(); g.translate(64, by + 26); g.scale(44 / 84, 44 / 84); g.translate(-20, -10);
  g.fillStyle = INK; g.fill(new Path2D(m.ink));
  g.fillStyle = "#FFB21A"; g.beginPath(); g.arc(m.ball.cx, m.ball.cy, m.ball.r, 0, Math.PI * 2); g.fill();
  g.restore();
  g.fillStyle = INK; g.font = `650 24px ${F}`;
  g.fillText(fit(g, d.foot, 760), 64 + 34 + 16, by + 57);
  g.fillStyle = INK3; g.font = `500 16px ${F}`; g.textAlign = "right";
  g.fillText(`${BRAND.domain} · seed ${d.seed8}…`, W - 64, by + 56); g.textAlign = "left";
}
