/**
 * v20: renders the 72 character portraits (12 Cube Pets × 6 scarf colours)
 * from the real models, against the dev server, through Edge headless
 * (WebGL on SwiftShader): the dev-only route /art/pets draws them on one
 * transparent canvas, this script crops each 256 px tile to
 * public/assets/pets/{species}-{scarf}.webp.
 * Run: node scripts/render-pets.mjs   (from app/, with the dev server on :3000)
 */
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { launch, page } from "../screenshots/cdp.mjs";

const BASE = process.env.BASE || "http://localhost:3000";
const SPECIES = ["fox", "cat", "bunny", "panda", "penguin", "koala", "polar", "chick", "pig", "cow", "elephant", "bee"];
const SCARVES = ["teal", "sky", "mint", "plum", "tomato", "saffron"];
const TILE = 256;
mkdirSync("public/assets/pets", { recursive: true });
const { conn, close } = await launch({ port: 9472 });
try {
  const p = await page(conn, { width: SCARVES.length * TILE, height: SPECIES.length * TILE, dpr: 1 });
  await p.go(`${BASE}/art/pets`, 1500);
  if (!(await p.until("window.__petsReady === true", 180000, 250))) throw new Error("pets not ready");
  const url = await p.eval("document.querySelector('[data-pets]').toDataURL('image/png')");
  const sheet = Buffer.from(url.split(",")[1], "base64");
  let total = 0;
  for (let y = 0; y < SPECIES.length; y++) for (let x = 0; x < SCARVES.length; x++) {
    const file = `public/assets/pets/${SPECIES[y]}-${SCARVES[x]}.webp`;
    const info = await sharp(sheet).extract({ left: x * TILE, top: y * TILE, width: TILE, height: TILE }).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(file);
    total += info.size;
  }
  console.log(`72 portraits, ${Math.round(total / 1024)} KB`);
  if (p.logs.length) console.log(p.logs.join("\n"));
  await p.close();
} finally { close(); }
