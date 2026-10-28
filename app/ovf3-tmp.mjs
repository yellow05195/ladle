import { launch, page } from "./screenshots/cdp.mjs";
const { conn, close } = await launch({ port: 9498, gpu: "hw" });
const p = await page(conn, { width: 320, height: 700, mobile: true });
await p.go("http://localhost:3000/odds", 200);
await p.eval("sessionStorage.setItem('ladle.loaded','1')");
const out = [];
for (const path of ["/", "/play?watch=1"]) for (const w of [320, 375, 390, 768, 1024, 1280, 1440]) {
  await p.size(w, 800, w < 768);
  await p.go(`http://localhost:3000${path}${path.includes("?") ? "&" : "?"}q=none`, 1200);
  const o = JSON.parse(await p.eval("JSON.stringify({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })"));
  if (o.sw > o.cw) out.push(`${path} @${w}: ${o.sw} > ${o.cw}`);
}
console.log(out.length ? out.join("\n") : "no overflow on / and /play at 320-1440");
close();
