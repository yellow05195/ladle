/**
 * v20: renders the hall's stills from the real scene (never generated),
 * against the dev server, through Edge headless with WebGL on SwiftShader:
 *
 *   public/hall-poster.webp, hall-poster-mobile.webp   the no-WebGL fallback and the inner pages' head band
 *   public/art/{join,seal,draw,serve}.webp             the four beats of "How a round plays" (640 × 400)
 *
 * The dev-only route /art/<scene> plays a demo round on the hall and raises
 * window.__artReady at the moment to capture; the canvas is read with
 * toDataURL and written as WebP by sharp.
 * Run: node scripts/render-art.mjs [scene …]   (from app/, with the dev server on :3000)
 */
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { launch, page } from "../screenshots/cdp.mjs";

const BASE = process.env.BASE || "http://localhost:3000";
const JOBS = {
  // the posters are the live demo room on the home shot (the hall as it really is), HUD hidden
  poster: { w: 1600, h: 900, file: "public/hall-poster.webp", live: true },
  "poster-mobile": { w: 750, h: 1000, file: "public/hall-poster-mobile.webp", live: true },
  join: { w: 960, h: 600, file: "public/art/join.webp", out: 640 },
  seal: { w: 960, h: 600, file: "public/art/seal.webp", out: 640 },
  draw: { w: 960, h: 600, file: "public/art/draw.webp", out: 640 },
  serve: { w: 960, h: 600, file: "public/art/serve.webp", out: 640 },
};
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(JOBS);
mkdirSync("public/art", { recursive: true });
const { conn, close } = await launch({ port: 9473 });
try {
  for (const name of want) {
    const j = JOBS[name];
    const p = await page(conn, { width: j.w, height: j.h, dpr: 1 });
    let url;
    if (j.live) {
      await p.go(`${BASE}/odds`, 300);
      await p.eval("sessionStorage.setItem('ladle.loaded','1')");
      await p.go(`${BASE}/?q=high`, 1000);
      if (!(await p.until("(window.__stage?.castReady ?? 0) >= 6 && window.__hall?.get().loaded.shell", 240000, 200))) throw new Error(`art ${name} not ready`);
      await new Promise((r) => setTimeout(r, 2500));
      url = await p.eval("document.querySelector('.hall-canvas canvas').toDataURL('image/png')");
    } else {
      await p.go(`${BASE}/art/${name}?q=high`, 1000);
      if (!(await p.until("window.__artReady === true", 240000, 50))) throw new Error(`art ${name} not ready`);
      url = await p.eval("document.querySelector('[data-art] canvas').toDataURL('image/png')");
    }
    let img = sharp(Buffer.from(url.split(",")[1], "base64"));
    if (j.out) img = img.resize(j.out);
    const info = await img.webp({ quality: 84, effort: 6 }).toFile(j.file);
    console.log(j.file, Math.round(info.size / 1024), "KB");
    // v25.1: the posters' soft twin, the backdrop while the live hall is on its way (HallCanvas): blurred and dimmed here,
    // never by a CSS filter (a software compositor would run it every frame of the cross-fade)
    if (j.live) {
      const soft = j.file.replace(/\.webp$/, "-soft.webp");
      const s = await sharp(j.file).resize(Math.round(j.w / 2)).blur(9).modulate({ brightness: 0.62 }).webp({ quality: 72, effort: 6 }).toFile(soft);
      console.log(soft, Math.round(s.size / 1024), "KB");
    }
    await p.close();
  }
} finally { close(); }
