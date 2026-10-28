/**
 * Ladle brand geometry (v21), shared by make-brand.mjs and make-og.mjs.
 *
 * The logo is lettering, drawn here from scratch (no font): "ladle" in a
 * heavy, square-shouldered lower case whose d is the ladle itself. Its bowl
 * is cut open and holds the ball (the scoop); its stem is the handle, with a
 * round end and a hanging hole. The ball completes the d, so the word reads
 * "ladle" and the d reads as a ladle serving one ball. The symbol is that d
 * alone.
 *
 * Construction (units: baseline y = 0, up is negative, x-height 56):
 *   - stems 18 wide; ascender 84; bowls 58 wide with a squircle left side
 *     (cubic handles at 0.76) and a flat side flush with the stem;
 *   - the a's counter is a circle (r 11) centred on the x-height middle;
 *   - the d's ball is r 18, its top 0.6 over the x-height (optical overshoot),
 *     inside a 2.5 gap that is cut out of the ink, so the one-colour logo still
 *     separates the ball from the ladle;
 *   - the handle ends in a half round (overshoot 1.5) with a hole r 5,
 *     concentric with that round end;
 *   - the e is a squircle (overshoot 0.8) with a half-round eye, a 9 bar and a
 *     10.5 aperture;
 *   - spacing l|a 5, a|d 5, d|l 9, l|e 5.
 * Every outline is clockwise and every counter anti-clockwise, so the ink is one
 * compound path under the default nonzero rule (SVGLoader, sharp, browsers).
 *
 * Type on the social images: Fraunces for headlines (its default instance,
 * Black, the sturdy small-optical-size cut) and Geist Medium / SemiBold for
 * small lines (scripts/fonts, both OFL), converted to paths with opentype.js,
 * so no SVG or PNG depends on an installed font.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";
const { parse } = opentype;

const here = dirname(fileURLToPath(import.meta.url));

/** The palette. The ball colour is the brand's one signal colour; it never marks a result. */
export const C = {
  charcoal: "#16120F",
  cream: "#F6EEE3",
  cream2: "#CFC3B3",
  cream3: "#9C8F80",
  line: "#2E2620",
  saffron: "#FFB21A",
  tomato: "#FF5A36",
  brass: "#C99A4B",
  walnut: "#3A2618",
  oxblood: "#4A1418",
  /** the six player colours (identity only, never a result) */
  players: ["#FF5A36", "#FFB21A", "#2EC4B6", "#5AA9FF", "#7ED957", "#C77DFF"],
};

/** Colourways: [ink, ball, background]. */
export const WAYS = {
  /** primary: the site, social, avatars. Cream ladle, saffron ball, on charcoal */
  primary: { ink: C.cream, ball: C.saffron, bg: C.charcoal },
  /** light: print, documents, light pages. Charcoal ladle, tomato ball, on cream */
  light: { ink: C.charcoal, ball: C.tomato, bg: C.cream },
  /** hall: brass ladle, saffron ball, on walnut (signage, merch, the room itself) */
  hall: { ink: C.brass, ball: C.saffron, bg: C.walnut },
  /** tomato: the app tile. Charcoal ladle and ball, on tomato */
  tomato: { ink: C.charcoal, ball: C.charcoal, bg: C.tomato },
};

/** Lettering constants (see the header). */
export const L = { XH: 56, ASC: 84, S: 18, K: 0.76, RC: 11, BW: 58, EW: 58, BAR: 9, EYE: 12.5, AP: 10.5, BALL: 18, GAP: 2.5, HOLE: 5, OS_E: 0.8, OS_BALL: 0.6, OS_TOP: 1.5, KERN: [5, 5, 9, 5] };

const r2 = (v, d = 2) => { const p = 10 ** d; const n = Math.round(v * p) / p; return (Object.is(n, -0) ? 0 : n).toString(); };

/** a quarter of a squircle from a to b; horizontal-first: the tangent at a is horizontal */
function quarter(a, b, horizFirst) {
  const K = L.K;
  return horizFirst
    ? [a, [a[0] + (b[0] - a[0]) * K, a[1]], [b[0], b[1] - (b[1] - a[1]) * K], b]
    : [a, [a[0], a[1] + (b[1] - a[1]) * K], [b[0] - (b[0] - a[0]) * K, b[1]], b];
}
const cub = (p) => `C${r2(p[1][0])} ${r2(p[1][1])} ${r2(p[2][0])} ${r2(p[2][1])} ${r2(p[3][0])} ${r2(p[3][1])}`;
function split(p, t) {
  const lerp = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const a = lerp(p[0], p[1]), b = lerp(p[1], p[2]), c = lerp(p[2], p[3]), d = lerp(a, b), e = lerp(b, c), m = lerp(d, e);
  return [[p[0], a, d, m], [m, e, c, p[3]]];
}
const yAt = (p, t) => { const u = 1 - t; return u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]; };
function tAtY(p, y) { let lo = 0, hi = 1; const up = yAt(p, 1) > yAt(p, 0); for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if ((yAt(p, m) < y) === up) lo = m; else hi = m; } return (lo + hi) / 2; }
/** a full circle, anti-clockwise (a counter) */
const hole = (cx, cy, r) => `M${r2(cx)} ${r2(cy - r)}A${r2(r)} ${r2(r)} 0 0 0 ${r2(cx)} ${r2(cy + r)}A${r2(r)} ${r2(r)} 0 0 0 ${r2(cx)} ${r2(cy - r)}Z`;

/* ---------- the glyphs, each at pen x; return { d, adv } ---------- */

function glyphL(x) {
  return { d: `M${r2(x)} ${-L.ASC}H${r2(x + L.S)}V0H${r2(x)}Z`, adv: L.S };
}

function glyphA(x) {
  const { XH, S, BW, RC } = L, H2 = XH / 2, xr = x + BW, xs = xr - S, xm = x + (BW - S) / 2 + 2;
  const d = `M${r2(xr)} ${-XH}V0H${r2(xm)}${cub(quarter([xm, 0], [x, -H2], true))}${cub(quarter([x, -H2], [xm, -XH], false))}Z`
    + hole(xs - RC, -H2, RC);
  return { d, adv: BW };
}

/** the d drawn as the ladle; also returns the ball */
function glyphD(x) {
  const { XH, ASC, S, BW, BALL, GAP, HOLE, OS_BALL, OS_TOP } = L, H2 = XH / 2;
  const xr = x + BW, xs = xr - S, xm = x + (BW - S) / 2 + 2;
  const R = BALL + GAP, cx = xs - R, cy = -XH + BALL - OS_BALL;
  const yLip = cy + Math.sqrt(R * R - (x - cx) * (x - cx)); // where the gap meets the bowl's outer edge
  const top = -ASC - OS_TOP, cap = top + S / 2;
  const d = `M${r2(x)} ${r2(yLip)}A${r2(R)} ${r2(R)} 0 0 0 ${r2(xs)} ${r2(cy)}V${r2(cap)}A${r2(S / 2)} ${r2(S / 2)} 0 0 1 ${r2(xr)} ${r2(cap)}V0H${r2(xm)}${cub(quarter([xm, 0], [x, -H2], true))}V${r2(yLip)}Z`
    + hole(xs + S / 2, cap, HOLE);
  return { d, adv: BW, ball: { cx, cy, r: BALL } };
}

function glyphE(x) {
  const { XH, EW, BAR, EYE, AP, OS_E } = L, H2 = XH / 2;
  const xr = x + EW, xm = x + EW / 2, bot = OS_E, top = -XH - OS_E;
  const barTop = -H2 + BAR / 2 - 3, barBot = barTop + BAR, apBot = barBot + AP;
  const qBR = quarter([xr, -H2], [xm, bot], false);
  const [, lower] = split(qBR, tAtY(qBR, apBot));
  const xa = xm - 1;
  const d = `M${r2(xr)} ${r2(barBot)}H${r2(xa)}V${r2(apBot)}H${r2(lower[0][0])}${cub(lower)}${cub(quarter([xm, bot], [x, -H2], true))}${cub(quarter([x, -H2], [xm, top], false))}${cub(quarter([xm, top], [xr, -H2], true))}Z`
    + `M${r2(xm + 0.5 + EYE)} ${r2(barTop)}A${EYE} ${EYE} 0 0 0 ${r2(xm + 0.5 - EYE)} ${r2(barTop)}Z`;
  return { d, adv: EW };
}

/**
 * The word at (x0, baseline 0) in lettering units.
 * Returns the ink (one compound path), the ball, the width, and the drawn top (negative).
 */
export function letters(x0 = 0) {
  const seq = [glyphL, glyphA, glyphD, glyphL, glyphE];
  let x = x0, ink = "", ball = null;
  seq.forEach((g, i) => { const o = g(x); ink += o.d; if (o.ball) ball = o.ball; x += o.adv + (L.KERN[i] ?? 0); });
  const width = x - x0;
  return { ink, ball, width, top: -L.ASC - L.OS_TOP, bottom: L.OS_E };
}

/** The drawing primitives, for studies and boards (screenshots/v21/brand/make-boards.mjs). */
export const parts = { quarter, cub, hole, glyphL, glyphA, glyphD, glyphE };

/** The symbol: the ladle-d alone, its drawn box starting at x 0. */
export function symbol() {
  const o = glyphD(0);
  const left = o.ball.cx - o.ball.r; // the ball reaches slightly left of the bowl
  return { ink: o.d, ball: o.ball, box: { x: Math.min(0, left), y: -L.ASC - L.OS_TOP, w: L.BW - Math.min(0, left), h: L.ASC + L.OS_TOP } };
}

/* ---------- placing and rendering ---------- */

const ballEl = (b, fill, k = 1, dx = 0, dy = 0) => `<circle cx="${r2(dx + b.cx * k)}" cy="${r2(dy + b.cy * k)}" r="${r2(b.r * k)}" fill="${fill}"/>`;

/** the word scaled so its x-height is `xh` px, its baseline-left at (x, y) */
export function wordAt({ x = 0, y = 0, xh = 56, ink, ball }) {
  const k = xh / L.XH, w = letters(0);
  return {
    svg: `<g transform="translate(${r2(x)} ${r2(y)}) scale(${r2(k, 5)})"><path d="${w.ink}" fill="${ink}"/>${ballEl(w.ball, ball)}</g>`,
    width: w.width * k, ascent: -w.top * k, descent: w.bottom * k,
  };
}

/** the symbol scaled to drawn height `h` px, its box centred on (cx, cy); `dx` optical shift in units */
export function symbolAt({ cx, cy, h, ink, ball, dx = 0 }) {
  const s = symbol(), k = h / s.box.h;
  const ox = cx - (s.box.x + s.box.w / 2 + dx) * k, oy = cy - (s.box.y + s.box.h / 2) * k;
  return `<g transform="translate(${r2(ox)} ${r2(oy)}) scale(${r2(k, 5)})"><path d="${s.ink}" fill="${ink}"/>${ballEl(s.ball, ball)}</g>`;
}

/** Optical shift of the symbol in its square: the ball's weight sits left, so nudge right. */
export const SYMBOL_DX = -1.5;

/** Apply x' = ox + k x, y' = oy + k y to an absolute path made of M L H V C A Z (k > 0). */
export function xform(d, k, ox, oy) {
  const X = (v) => r2(ox + k * v), Y = (v) => r2(oy + k * v);
  return d.replace(/([MLHVCAZ])([^MLHVCAZ]*)/g, (_, cmd, args) => {
    const n = (args.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/g) || []).map(Number);
    if (cmd === "Z") return "Z";
    if (cmd === "H") return `H${X(n[0])}`;
    if (cmd === "V") return `V${Y(n[0])}`;
    if (cmd === "A") return `A${r2(n[0] * k)} ${r2(n[1] * k)} ${n[2]} ${n[3]} ${n[4]} ${X(n[5])} ${Y(n[6])}`;
    const out = [];
    for (let i = 0; i < n.length; i += 2) out.push(`${X(n[i])} ${Y(n[i + 1])}`);
    return cmd + out.join(" ");
  });
}

/** The symbol baked into a 100-unit box: drawn height `frac` x 100, centred (with the optical shift). */
export function markGeometry(frac = 0.8) {
  const s = symbol(), k = (100 * frac) / s.box.h;
  const ox = 50 - (s.box.x + s.box.w / 2 + SYMBOL_DX) * k, oy = 50 - (s.box.y + s.box.h / 2) * k;
  return { viewBox: "0 0 100 100", ink: xform(s.ink, k, ox, oy), ball: { cx: +r2(ox + s.ball.cx * k), cy: +r2(oy + s.ball.cy * k), r: +r2(s.ball.r * k) } };
}

/** The word in lettering units, moved so its drawn box starts at (pad, pad). */
export function wordGeometry(pad = 4) {
  const w = letters(0), oy = pad - w.top;
  const W = w.width + 2 * pad, H = w.bottom - w.top + 2 * pad;
  return { viewBox: `0 0 ${r2(W)} ${r2(H)}`, w: +r2(W), h: +r2(H), baseline: +r2(oy), ink: xform(w.ink, 1, pad, oy), ball: { cx: +r2(pad + w.ball.cx), cy: +r2(oy + w.ball.cy), r: w.ball.r } };
}

/** A standalone SVG for a geometry and colours; `align` sets preserveAspectRatio. */
export function geometrySvg(g, { ink, ball, title, align = "xMidYMid meet", w, h }) {
  const [, , vw, vh] = g.viewBox.split(" ").map(Number);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${g.viewBox}" width="${r2(w ?? vw)}" height="${r2(h ?? vh)}" preserveAspectRatio="${align}" role="img" aria-label="${title}"><title>${title}</title><path d="${g.ink}" fill="${ink}"/><circle cx="${g.ball.cx}" cy="${g.ball.cy}" r="${g.ball.r}" fill="${ball}"/></svg>\n`;
}

export const svgDoc = (w, h, body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(w)} ${r2(h)}" width="${r2(w)}" height="${r2(h)}">${bg ? `<rect width="${r2(w)}" height="${r2(h)}" fill="${bg}"/>` : ""}${body}</svg>`;

/** The symbol in a square of `side`, drawn height `frac` of the side; optional disc or tile behind it. */
export function symbolSquare({ side, frac, ink, ball, bg, plate, plateFill, plateR }) {
  let body = "";
  if (plate === "disc") body += `<circle cx="${side / 2}" cy="${side / 2}" r="${r2(side / 2)}" fill="${plateFill}"/>`;
  if (plate === "tile") body += `<rect width="${side}" height="${side}" rx="${r2(side * (plateR ?? 0.22))}" fill="${plateFill}"/>`;
  body += symbolAt({ cx: side / 2, cy: side / 2, h: side * frac, ink, ball, dx: SYMBOL_DX });
  return svgDoc(side, side, body, bg);
}

/* ---------- text as paths: serif = Fraunces Black, medium / semibold = Schibsted Grotesk (v21);
   v21.1: display / text / textSemi = Figtree 900 / 500 / 600 (static instances of figtree-400-900.ttf, made with
   `py -I -m fontTools.varLib.instancer figtree-400-900.ttf wght=900 -o figtree-900.ttf`, and 500, 600; OFL-Figtree.txt).
   opentype.js cannot apply ss01, so the a is the default one, which v21.1 §3.4 accepts. ---------- */

const fonts = {};
function font(name) {
  const file = { serif: "Fraunces[SOFT,WONK,opsz,wght].ttf", medium: "schibsted-500.ttf", semibold: "schibsted-600.ttf", display: "figtree-900.ttf", text: "figtree-500.ttf", textSemi: "figtree-600.ttf" }[name];
  if (!fonts[file]) {
    const buf = readFileSync(join(here, "fonts", file));
    fonts[file] = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return fonts[file];
}

/** Text as one SVG path at font `size`; `tracking` in em. Returns the path and the advance width. */
export function textPath(text, { x = 0, baseline = 0, size = 32, face = "semibold", fill = "#000", tracking = 0 } = {}) {
  const f = font(face);
  let pen = x, d = "";
  const glyphs = [...text].map((ch) => f.charToGlyph(ch)); // per character: opentype.js cannot run some ccmp lookups
  glyphs.forEach((g, i) => {
    const p = g.getPath(pen, baseline, size);
    for (const c of p.commands) {
      if (c.type === "M" || c.type === "L") d += `${c.type}${r2(c.x)} ${r2(c.y)}`;
      else if (c.type === "Q") d += `Q${r2(c.x1)} ${r2(c.y1)} ${r2(c.x)} ${r2(c.y)}`;
      else if (c.type === "C") d += `C${r2(c.x1)} ${r2(c.y1)} ${r2(c.x2)} ${r2(c.y2)} ${r2(c.x)} ${r2(c.y)}`;
      else if (c.type === "Z") d += "Z";
    }
    pen += (g.advanceWidth * size) / f.unitsPerEm;
    const next = glyphs[i + 1];
    if (next) pen += (f.getKerningValue(g, next) * size) / f.unitsPerEm + tracking * size;
  });
  return { svg: `<path d="${d}" fill="${fill}"/>`, width: pen - x };
}

/**
 * A crop of the hall (public/hall-poster.webp, written by render-art.mjs) as a PNG buffer of w x h.
 * `rect` is the crop in poster pixels (1600 x 900): by default the drum and the players, without the
 * hanging ladle at the top. Darkened slightly so type on or beside it keeps its contrast.
 */
export async function hallPhoto(w, h, { rect = { x: 170, y: 118, w: 1250, h: 0 } } = {}) {
  const r = { ...rect, h: rect.h || Math.round(rect.w * (h / w)) };
  return sharp(join(here, "..", "public", "hall-poster.webp"))
    .extract({ left: r.x, top: r.y, width: r.w, height: Math.min(r.h, 900 - r.y) })
    .resize(w, h, { fit: "cover" })
    .modulate({ brightness: 0.92 })
    .png().toBuffer();
}

/** A row of the six player-colour balls, the same size, evenly spaced from x0 to x1 at y. */
export function ballRow(x0, x1, y, r) {
  const n = C.players.length;
  const step = (x1 - x0 - 2 * r) / (n - 1);
  return C.players.map((c, i) => `<circle cx="${r2(x0 + r + i * step)}" cy="${r2(y)}" r="${r2(r)}" fill="${c}"/>`).join("");
}

export { r2 };
