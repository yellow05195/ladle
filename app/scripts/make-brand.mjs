/**
 * Ladle brand kit (v21): the lettered logo, the symbol and the social assets.
 *
 * The logo is the word "ladle" drawn in scripts/brand-lib.mjs, its d drawn as
 * the ladle holding the ball. The symbol is that d alone. Nothing here depends
 * on an installed font: the lettering is geometry, the small lines are font
 * outlines converted to paths.
 *
 * Outputs (app/public/brand/):
 *   ladle-mark.svg / -light / -brass / -mono   the symbol in a 100 box (transparent; mono uses currentColor)
 *   ladle-mark-1024.png                         the symbol on charcoal
 *   ladle-wordmark.svg / -dark / -brass / -mono the word (transparent): cream for dark grounds, charcoal for light
 *   ladle-wordmark-2400.png                     the word on charcoal, for decks and press
 *   ladle-lockup.svg / ladle-lockup-dark.svg    the word over the tagline
 *   ladle-avatar-400.png / -1000.png            X / Discord / Telegram picture, circle-safe
 *   ladle-avatar-tomato-1000.png / -brass-1000  alternative pictures
 *   ladle-app-icon-1024.png                     the tomato tile
 *   ladle-banner-1500x500.png                   X header
 *   ladle-geometry.json                         the logo's paths, for the loader and the 3D ladle
 * And app/icon.png (64), app/apple-icon.png (180), public/favicon.ico (16, 32, 48), public/favicon.svg.
 *
 * Run: node scripts/make-brand.mjs   (from app/; also runs in prebuild)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { C, WAYS, geometrySvg, hallPhoto, markGeometry, svgDoc, symbolSquare, textPath, wordAt, wordGeometry } from "./brand-lib.mjs";

mkdirSync("public/brand", { recursive: true });
const out = (f) => `public/brand/${f}`;
const png = (svg, file, width) => sharp(Buffer.from(svg), { density: 300 }).resize(width).png({ compressionLevel: 9 }).toFile(file);
const TAG1 = "Same price for everyone.", TAG2 = "Not the same scoop.";

/* 1. the symbol: four colourways in a 100 box, and a 1024 PNG */
const mark = markGeometry(0.8);
for (const [suffix, ink, ball] of [["", C.cream, C.saffron], ["-light", C.charcoal, C.tomato], ["-brass", C.brass, C.saffron], ["-mono", "currentColor", "currentColor"]]) {
  writeFileSync(out(`ladle-mark${suffix}.svg`), geometrySvg(mark, { ink, ball, title: "Ladle", w: 100, h: 100 }));
}
await png(symbolSquare({ side: 1024, frac: 0.62, ...WAYS.primary }), out("ladle-mark-1024.png"), 1024);

/* 2. the word: four colourways (left-aligned when the box is wider than the word), and a large PNG */
const word = wordGeometry(4);
for (const [suffix, ink, ball] of [["", C.cream, C.saffron], ["-dark", C.charcoal, C.tomato], ["-brass", C.brass, C.saffron], ["-mono", "currentColor", "currentColor"]]) {
  writeFileSync(out(`ladle-wordmark${suffix}.svg`), geometrySvg(word, { ink, ball, title: "Ladle", align: "xMinYMid meet" }));
}
{
  const W = 2400, H = 1200, xh = 330, probe = wordAt({ xh, ink: "", ball: "" });
  const body = wordAt({ x: (W - probe.width) / 2, y: H / 2 + (probe.ascent - probe.descent) / 2, xh, ...WAYS.primary }).svg;
  await png(svgDoc(W, H, body, C.charcoal), out("ladle-wordmark-2400.png"), W);
}

/* 3. the lockup: the word over the tagline, set in Fraunces Black, left-aligned on the word's stem */
for (const [file, ink, ball, sub] of [["ladle-lockup.svg", C.cream, C.saffron, C.cream2], ["ladle-lockup-dark.svg", C.charcoal, C.tomato, "#4D4239"]]) {
  const xh = 56, wa = wordAt({ x: 0, y: 0, xh, ink, ball });
  const pad = 8, base = pad + wa.ascent, size = 30, lead = 36;
  const t1 = textPath(TAG1, { x: pad - 1, baseline: base + 54, size, face: "serif", fill: ink, tracking: -0.01 });
  const t2 = textPath(TAG2, { x: pad - 1, baseline: base + 54 + lead, size, face: "serif", fill: sub, tracking: -0.01 });
  const W = Math.ceil(Math.max(wa.width, t1.width, t2.width) + 2 * pad), H = Math.ceil(base + 54 + lead + 10 + pad);
  const body = wordAt({ x: pad, y: base, xh, ink, ball }).svg + t1.svg + t2.svg;
  writeFileSync(out(file), svgDoc(W, H, body).replace("<svg ", `<svg role="img" aria-label="Ladle. ${TAG1} ${TAG2}" `) + "\n");
}

/* 4. pictures: the symbol 56 % of the side, centred for the circle crop */
for (const size of [400, 1000]) await png(symbolSquare({ side: size, frac: 0.56, ...WAYS.primary }), out(`ladle-avatar-${size}.png`), size);
await png(symbolSquare({ side: 1000, frac: 0.56, ink: C.charcoal, ball: C.cream, bg: C.tomato }), out("ladle-avatar-tomato-1000.png"), 1000);
await png(symbolSquare({ side: 1000, frac: 0.56, ...WAYS.hall }), out("ladle-avatar-brass-1000.png"), 1000);
await png(symbolSquare({ side: 1024, frac: 0.56, ink: C.charcoal, ball: C.charcoal, bg: C.tomato }), out("ladle-app-icon-1024.png"), 1024);

/* 5. X header 1500 x 500: the hall on the left (the profile picture sits over that side), fading into
   charcoal; the word and the tagline on the right */
{
  const W = 1500, H = 500;
  const hall = await hallPhoto(860, H);
  const fade = svgDoc(W, H, `<defs><linearGradient id="f" x1="0" x2="1"><stop offset="0.36" stop-color="${C.charcoal}" stop-opacity="0"/><stop offset="0.58" stop-color="${C.charcoal}" stop-opacity="1"/></linearGradient><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="${C.charcoal}" stop-opacity="0"/><stop offset="1" stop-color="${C.charcoal}" stop-opacity="0.85"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#v)"/><rect width="${W}" height="${H}" fill="url(#f)"/>`);
  const xh = 92, probe = wordAt({ xh, ink: "", ball: "" });
  const t1 = textPath(TAG1, { size: 40, face: "serif", tracking: -0.01 }), t2 = textPath(TAG2, { size: 40, face: "serif", tracking: -0.01 });
  const right = W - 110, wx = right - probe.width, base = 232;
  const text = wordAt({ x: wx, y: base, xh, ...WAYS.primary }).svg
    + textPath(TAG1, { x: right - t1.width, baseline: base + 78, size: 40, face: "serif", fill: C.cream, tracking: -0.01 }).svg
    + textPath(TAG2, { x: right - t2.width, baseline: base + 126, size: 40, face: "serif", fill: C.cream2, tracking: -0.01 }).svg;
  await sharp({ create: { width: W, height: H, channels: 3, background: C.charcoal } })
    .composite([{ input: hall, left: 0, top: 0 }, { input: Buffer.from(fade), left: 0, top: 0 }, { input: Buffer.from(svgDoc(W, H, text)), left: 0, top: 0 }])
    .png({ compressionLevel: 9 }).toFile(out("ladle-banner-1500x500.png"));
}

/* 6. the logo's geometry, for the loader (it draws the word) and the 3D ladle (it extrudes the symbol) */
writeFileSync(out("ladle-geometry.json"), JSON.stringify({ note: "Generated by scripts/make-brand.mjs. mark: the symbol in a 100 box; word: the lettering, baseline at word.baseline. Fill ink with the ladle colour and ball with the ball colour; the ball's gap is already cut out of ink.", mark, word }, null, 2) + "\n");
{
  // config/brand.ts carries the same paths for client code: say so when they drift
  const cfg = readFileSync("../config/brand.ts", "utf8");
  if (!cfg.includes(mark.ink) || !cfg.includes(word.ink)) console.warn("make-brand: config/brand.ts BRAND.logo differs from public/brand/ladle-geometry.json; copy the paths across.");
}

/* 7. favicon and app icons: the symbol on a charcoal tile, so it holds on light and dark tab strips */
const tile = (side, frac) => symbolSquare({ side, frac, ...WAYS.primary, bg: null, plate: "tile", plateFill: C.charcoal, plateR: 0.22 });
await png(tile(64, 0.74), "app/icon.png", 64);
await png(symbolSquare({ side: 180, frac: 0.6, ...WAYS.primary }), "app/apple-icon.png", 180);
writeFileSync("public/favicon.svg", tile(64, 0.74).replace("<svg ", '<svg role="img" aria-label="Ladle" ') + "\n");
{
  // an .ico holding three PNGs (16, 32, 48): 6-byte header, 16-byte entries, then the images
  const sizes = [16, 32, 48];
  const imgs = await Promise.all(sizes.map((s) => sharp(Buffer.from(tile(s * 4, s <= 16 ? 0.8 : 0.76)), { density: 72 }).resize(s, s).png().toBuffer()));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(imgs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += imgs[i].length;
  });
  writeFileSync("public/favicon.ico", Buffer.concat([head, ...imgs]));
}

console.log("brand kit written to public/brand/, app/icon.png, app/apple-icon.png, public/favicon.ico, public/favicon.svg");
