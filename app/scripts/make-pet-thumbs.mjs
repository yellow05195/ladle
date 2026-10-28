/**
 * v21.1 (§7.14): 64 x 64 pet portrait thumbs for the chat discs, the presence
 * stack, the player plate and the species tiles, from the 72 portraits of
 * 256 px in public/assets/pets/ (species x scarf). WebP q 80, cover, focus
 * 50 % 30 %. Run from app/: node scripts/make-pet-thumbs.mjs
 */
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC = path.resolve("public/assets/pets");
const OUT = path.join(SRC, "thumb");
await mkdir(OUT, { recursive: true });
const files = (await readdir(SRC)).filter((f) => /^[a-z]+-[a-z]+\.webp$/.test(f));
let n = 0;
for (const f of files) {
  const img = sharp(path.join(SRC, f));
  const { width = 256, height = 256 } = await img.metadata();
  // cover to a square, the focus a little above the middle (the face)
  const side = Math.min(width, height);
  const left = Math.round((width - side) * 0.5), top = Math.round((height - side) * 0.3);
  await img.extract({ left, top, width: side, height: side }).resize(64, 64, { kernel: "lanczos3" }).webp({ quality: 80 }).toFile(path.join(OUT, f));
  n++;
}
console.log(`${n} thumbs in ${path.relative(process.cwd(), OUT)}`);
