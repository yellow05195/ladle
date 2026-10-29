/**
 * The X article's cover (5:2, 2000 x 800): the OG image's layout at the article's
 * proportions. Left, on charcoal: the Ladle word, the tagline as the headline, one
 * line on what it is, the domain. Right: the hall itself (public/hall-poster.webp),
 * fading into the charcoal. Figtree as paths (brand-lib textPath), no AI letters.
 * Run from app/: node scripts/make-x-cover.mjs  ->  ../marketing/x-article/cover.jpg
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { C, WAYS, hallPhoto, svgDoc, textPath, wordAt } from "./brand-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const W = 2000, H = 800, x0 = 112;
const photoW = 1300;
// the drum and the felt crowd fill the right; the crop keeps the poster's full height
const hall = await hallPhoto(photoW, H, { rect: { x: 110, y: 0, w: 1462 } });
const fade = svgDoc(W, H, `<defs><linearGradient id="f" x1="0" x2="1"><stop offset="0.44" stop-color="${C.charcoal}" stop-opacity="1"/><stop offset="0.68" stop-color="${C.charcoal}" stop-opacity="0"/></linearGradient><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0.72" stop-color="${C.charcoal}" stop-opacity="0"/><stop offset="1" stop-color="${C.charcoal}" stop-opacity="0.55"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#f)"/><rect width="${W}" height="${H}" fill="url(#v)"/>`);

const head = { size: 86, face: "display", fill: C.cream, tracking: -0.028 };
const text = wordAt({ x: x0, y: 150, xh: 58, ...WAYS.primary }).svg
  + textPath("Same price", { x: x0 - 4, baseline: 348, ...head }).svg
  + textPath("for everyone.", { x: x0 - 4, baseline: 436, ...head }).svg
  + textPath("Not the same scoop.", { x: x0 - 4, baseline: 524, ...head }).svg
  + textPath("A live draw hall on Solana.", { x: x0, baseline: 610, size: 34, face: "text", fill: C.cream2, tracking: 0 }).svg
  + `<rect x="${x0}" y="676" width="48" height="5" rx="2.5" fill="${C.cream2}"/>`
  + textPath("useladle.fun", { x: x0 + 66, baseline: 688, size: 30, face: "textSemi", fill: C.cream3, tracking: 0 }).svg;

const out = join(root, "..", "marketing", "x-article");
mkdirSync(out, { recursive: true });
await sharp({ create: { width: W, height: H, channels: 3, background: C.charcoal } })
  .composite([{ input: hall, left: W - photoW, top: 0 }, { input: Buffer.from(fade), left: 0, top: 0 }, { input: Buffer.from(svgDoc(W, H, text)), left: 0, top: 0 }])
  .jpeg({ quality: 92, mozjpeg: true }).toFile(join(out, "cover.jpg"));
console.log("marketing/x-article/cover.jpg written");
