/**
 * v21 UI textures (§6.2): the Higgsfield sources in
 * scripts/textures-v21-src/*.png become seamless WebP tiles.
 * Seam fix: roll the image by half in x and y (the old edges meet in the
 * centre cross, the new edges are the old centre, which wraps), then
 * cross-fade a 64 px band along that cross with the unrolled image.
 * Writes a 3 x 3 tile check of each into screenshots/v21/textures/.
 * Run from app/: node scripts/make-textures.mjs
 */
import sharp from "sharp";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "public/assets/textures/ui-v21";
const CHECK = "screenshots/v21/textures";
mkdirSync(CHECK, { recursive: true });

const JOBS = [
  { src: "walnut-a.png", out: "walnut-veneer.webp", size: 1024, max: 120_000, q: 70 },
  { src: "velvet-a.png", out: "velvet-oxblood.webp", size: 1024, max: 140_000, q: 66 },
  { src: "paper-a.png", out: "paper-stock.webp", size: 512, max: 60_000, q: 72 },
];

async function seamless(file, size) {
  const { data, info } = await sharp(join("scripts/textures-v21-src", file)).resize(size, size, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width, c = info.channels, half = n >> 1, band = 64;
  const out = Buffer.alloc(data.length);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const sx = (x + half) % n, sy = (y + half) % n;
      // weight of the unrolled image: 1 on the centre cross, 0 beyond the band
      const dx = Math.abs(x - half), dy = Math.abs(y - half);
      const wx = Math.max(0, 1 - dx / band), wy = Math.max(0, 1 - dy / band);
      const w = Math.max(wx, wy);
      const ws = w * w * (3 - 2 * w);
      for (let k = 0; k < c; k++) {
        const rolled = data[(sy * n + sx) * c + k];
        const plain = data[(y * n + x) * c + k];
        out[(y * n + x) * c + k] = Math.round(rolled * (1 - ws) + plain * ws);
      }
    }
  }
  return sharp(out, { raw: { width: n, height: n, channels: c } });
}

for (const j of JOBS) {
  let q = j.q, buf;
  for (;;) {
    buf = await (await seamless(j.src, j.size)).webp({ quality: q, effort: 6 }).toBuffer();
    if (buf.length <= j.max || q <= 30) break;
    q -= 6;
  }
  writeFileSync(join(DIR, j.out), buf);
  const tile = await sharp(buf).png().toBuffer();
  const n = Math.min(j.size, 512);
  const small = await sharp(tile).resize(n, n).png().toBuffer();
  const comp = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) comp.push({ input: small, left: x * n, top: y * n });
  await sharp({ create: { width: n * 3, height: n * 3, channels: 3, background: "#000" } }).composite(comp).png().toFile(join(CHECK, j.out.replace(".webp", "-tile-check.png")));
  console.log(j.out, statSync(join(DIR, j.out)).size, "bytes, q", q);
}
