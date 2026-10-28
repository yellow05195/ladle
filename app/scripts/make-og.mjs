/**
 * Build step: the Open Graph image (1200 x 630). Left, on charcoal: the Ladle
 * word, the tagline as the headline (Fraunces Black, as paths), the conserved
 * sentence on two lines, the domain. Right: the hall itself (the drum and the
 * players, from public/hall-poster.webp), fading into the charcoal.
 * The favicon and the app icons are written by make-brand.mjs.
 */
import sharp from "sharp";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { C, WAYS, hallPhoto, svgDoc, textPath, wordAt } from "./brand-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const W = 1200, H = 630, x0 = 72;
const photoW = 720;
const hall = await hallPhoto(photoW, H, { rect: { x: 300, y: 100, w: 1140 } });
const fade = svgDoc(W, H, `<defs><linearGradient id="f" x1="0" x2="1"><stop offset="0.4" stop-color="${C.charcoal}" stop-opacity="1"/><stop offset="0.66" stop-color="${C.charcoal}" stop-opacity="0"/></linearGradient><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="${C.charcoal}" stop-opacity="0"/><stop offset="1" stop-color="${C.charcoal}" stop-opacity="0.92"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#v)"/><rect width="${W}" height="${H}" fill="url(#f)"/>`);

const text = wordAt({ x: x0, y: 132, xh: 48, ...WAYS.primary }).svg
  + textPath("Same price", { x: x0 - 3, baseline: 280, size: 72, face: "serif", fill: C.cream, tracking: -0.02 }).svg
  + textPath("for everyone.", { x: x0 - 3, baseline: 354, size: 72, face: "serif", fill: C.cream, tracking: -0.02 }).svg
  + textPath("Not the same scoop.", { x: x0 - 3, baseline: 428, size: 72, face: "serif", fill: C.cream, tracking: -0.02 }).svg
  + textPath("The pot is conserved.", { x: x0, baseline: 510, size: 25, face: "medium", fill: C.cream2, tracking: -0.005 }).svg
  + textPath("The house neither wins nor loses on the draw.", { x: x0, baseline: 543, size: 25, face: "medium", fill: C.cream2, tracking: -0.005 }).svg
  + `<rect x="${x0}" y="574" width="40" height="3" fill="${C.brass}"/>`
  + textPath("useladle.fun", { x: x0 + 54, baseline: 584, size: 22, face: "semibold", fill: C.brass, tracking: 0 }).svg;

await sharp({ create: { width: W, height: H, channels: 3, background: C.charcoal } })
  .composite([{ input: hall, left: W - photoW, top: 0 }, { input: Buffer.from(fade), left: 0, top: 0 }, { input: Buffer.from(svgDoc(W, H, text)), left: 0, top: 0 }])
  .png({ compressionLevel: 9 }).toFile(join(root, "public/og.png"));
console.log("og.png written");
