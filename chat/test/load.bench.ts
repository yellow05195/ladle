/**
 * A rough load run, not part of the test suite. The relay runs in this
 * process; spectators run in child processes (so the measure is the relay's
 * fan-out, not the test clients' JSON parsing); talkers sign in with
 * throwaway keys and each says one line every `every` ms. Per-IP limits and
 * slow mode are lifted (every client is 127.0.0.1, and the point is a
 * stress test: in production slow mode caps the room near 3 lines/s).
 *
 *   node chat/test/load.bench.ts [spectators=1000] [talkers=25] [seconds=15] [every=1600] [children=4]
 */
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const role = process.argv[2];

if (role === "--spectators") {
  // child: open N spectators, measure each line's travel time (the send time rides in the text)
  const [url, count] = [process.argv[3]!, Number(process.argv[4])];
  const lat: number[] = [];
  let frames = 0; // frames received (a tick's lines arrive as one)
  const socks: WebSocket[] = [];
  // 20 connects at a time per child (a Windows loopback backlog refuses big bursts; Linux takes them)
  for (let i = 0; i < count; i += 20) {
    socks.push(...await Promise.all(Array.from({ length: Math.min(20, count - i) }, () => new Promise<WebSocket>((res, rej) => {
      const ws = new WebSocket(url, { origin: "http://load.test" });
      ws.once("open", () => { ws.send(JSON.stringify({ t: "hello", v: 1 })); res(ws); });
      ws.once("error", rej);
      ws.on("message", (d) => {
        frames++;
        // one frame may carry several lines ({t:"many"}): every "@t<ms>" is one line's send time
        const now = Date.now();
        for (const m of d.toString().matchAll(/@t(\d+)"/g)) lat.push(now - Number(m[1]));
      });
    }))));
  }
  process.send!({ ready: true });
  process.on("message", () => { process.send!({ lat, frames }); for (const s of socks) s.terminate(); setTimeout(() => process.exit(0), 100); });
} else {
  const { createRelay } = await import("../src/relay.ts");
  const { signInMessage } = await import("../src/protocol.ts");
  const { wallet } = await import("./helpers.ts");
  const [N, T, SECONDS, EVERY, K] = [1000, 25, 15, 1600, 4].map((d, i) => Number(process.argv[2 + i] ?? d)) as [number, number, number, number, number];
  const relay = createRelay({
    origins: ["http://load.test"], maxPerIp: 1e6, maxConnections: 1e6, muteFile: null, log: () => {}, publicHost: "load.test",
    signins: { capacity: 1e6, refillMs: 1 }, ipTalk: { capacity: 1e6, refillMs: 1 }, slow: { windowMs: 10_000, above: 1e9, ms: 4000, coolMs: 20_000 },
  });
  const a = await relay.listen(0, "127.0.0.1");
  const url = `ws://127.0.0.1:${a.port}/`;
  const t0 = Date.now();
  const kids = Array.from({ length: K }, (_, i) => fork(fileURLToPath(import.meta.url), ["--spectators", url, String(Math.floor(N / K) + (i < N % K ? 1 : 0))]));
  await Promise.all(kids.map((k) => new Promise((r) => k.once("message", r))));
  console.log(`${N} spectators in ${K} processes connected in ${Date.now() - t0} ms`);

  const talkers = await Promise.all(Array.from({ length: T }, (_, i) => new Promise<WebSocket>((res) => {
    const ws = new WebSocket(url, { origin: "http://load.test" });
    const w = wallet();
    ws.once("open", () => ws.send(JSON.stringify({ t: "hello", v: 1 })));
    ws.once("message", (d) => {
      const nonce = JSON.parse(d.toString()).nonce as string;
      ws.send(JSON.stringify({ t: "signin", address: w.address, nonce, signature: w.sign(signInMessage({ address: w.address, nonce, host: "load.test" })), profile: { nickname: `talker_${i}`, species: "fox", scarf: "sky" } }));
      res(ws);
    });
  })));
  await new Promise((r) => setTimeout(r, 500));
  const cpu0 = process.cpuUsage();
  const w0 = Date.now();
  let n = 0;
  const timers = talkers.map((ws, i) => setInterval(() => ws.send(JSON.stringify({ t: "say", text: `line ${i}-${n++} @t${Date.now()}`, cid: String(n) })), EVERY + i));
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  timers.forEach(clearInterval);
  await new Promise((r) => setTimeout(r, 1000));
  const cpu = process.cpuUsage(cpu0);
  const wall = Date.now() - w0;
  const results = await Promise.all(kids.map((k) => new Promise<{ lat: number[]; frames: number }>((r) => { k.once("message", (m) => r(m as { lat: number[]; frames: number })); k.send("done"); })));
  const lat = results.flatMap((r) => r.lat).sort((x, y) => x - y);
  const q = (p: number) => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))];
  const st = relay.stats();
  const mem = process.memoryUsage();
  console.log(`talk: ${st.lines} lines in ${SECONDS} s (${(st.lines / SECONDS).toFixed(1)}/s), ${lat.length} deliveries (expected ${st.lines * N}), dropped slow sockets ${st.dropped}`);
  console.log(`line travel to every spectator: p50 ${q(0.5)} ms, p95 ${q(0.95)} ms, p99 ${q(0.99)} ms, max ${lat[lat.length - 1]} ms`);
  console.log(`relay process: cpu ${(((cpu.user + cpu.system) / 1000 / wall) * 100).toFixed(0)}% of one core, rss ${(mem.rss / 2 ** 20).toFixed(0)} MB, heap ${(mem.heapUsed / 2 ** 20).toFixed(0)} MB, listed ${st.listed}, count ${st.count}`);
  for (const ws of talkers) ws.terminate();
  await relay.close("done");
  process.exit(0);
}
