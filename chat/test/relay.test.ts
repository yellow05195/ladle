/**
 * The relay end to end, over real WebSockets on a random port: hello and
 * welcome, spectators, wallet sign-in, talk fan-out, refusals, rate limit,
 * presence diffs, resume after a reconnect, origin and per-IP gates, the
 * mute file reload.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { createRelay, type Relay } from "../src/relay.ts";
import { signInMessage, type ServerMsg } from "../src/protocol.ts";
import { wallet } from "./helpers.ts";

const ORIGIN = "http://hall.test";
const dir = mkdtempSync(join(tmpdir(), "ladle-chat-"));
const muteFile = join(dir, "mute.txt");
let relay: Relay;
let url = "";

before(async () => {
  writeFileSync(muteFile, "# nobody yet\n");
  relay = createRelay({
    origins: [ORIGIN], publicHost: "chat.test", muteFile, mutePollMs: 50, maxPerIp: 50,
    presenceFlushMs: 20, heartbeatMs: 60_000, log: () => {},
    // generous for the fan-out tests; the rate-limit test uses its own relay
    talk: { capacity: 50, refillMs: 10 }, ipTalk: { capacity: 500, refillMs: 1 }, signins: { capacity: 100, refillMs: 10 },
  });
  const a = await relay.listen(0, "127.0.0.1");
  url = `ws://127.0.0.1:${a.port}/`;
});

after(async () => {
  await relay.close("test");
  rmSync(dir, { recursive: true, force: true });
});

type Msg = ServerMsg;

class Client {
  ws: WebSocket;
  inbox: Msg[] = [];
  waiters: Array<{ pred: (m: Msg) => boolean; resolve: (m: Msg) => void }> = [];
  closed: Promise<number>;
  constructor(target = url, origin: string | null = ORIGIN) {
    this.ws = new WebSocket(target, origin ? { origin } : {});
    this.ws.on("message", (d) => {
      const f = JSON.parse(d.toString()) as Msg;
      for (const m of f.t === "many" ? f.m : [f]) {
        const i = this.waiters.findIndex((w) => w.pred(m));
        if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(m);
        else this.inbox.push(m);
      }
    });
    this.closed = new Promise((r) => this.ws.on("close", (code) => r(code)));
    this.ws.on("error", () => {});
  }
  open() { return new Promise<void>((res, rej) => { this.ws.once("open", () => res()); this.ws.once("unexpected-response", (_q, r) => rej(new Error(String(r.statusCode)))); this.ws.once("error", rej); }); }
  send(o: unknown) { this.ws.send(JSON.stringify(o)); }
  next<T extends Msg["t"]>(t: T, pred: (m: Extract<Msg, { t: T }>) => boolean = () => true, ms = 2000): Promise<Extract<Msg, { t: T }>> {
    const p = (m: Msg) => m.t === t && pred(m as Extract<Msg, { t: T }>);
    const i = this.inbox.findIndex(p);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0] as Extract<Msg, { t: T }>);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${t}`)), ms);
      this.waiters.push({ pred: p, resolve: (m) => { clearTimeout(timer); resolve(m as Extract<Msg, { t: T }>); } });
    });
  }
  /** the first frame of any of these types */
  nextAny(types: Array<Msg["t"]>, ms = 2000): Promise<Msg> {
    const p = (m: Msg) => types.includes(m.t);
    const i = this.inbox.findIndex(p);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0]!);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${types.join("|")}`)), ms);
      this.waiters.push({ pred: p, resolve: (m) => { clearTimeout(timer); resolve(m); } });
    });
  }
  async hello(extra: Record<string, unknown> = {}) {
    await this.open();
    this.send({ t: "hello", v: 1, ...extra });
    return this.next("welcome");
  }
  async signIn(w = wallet(), nickname = "marlo", nonce?: string) {
    const n = nonce ?? (this.inbox.find((m) => m.t === "welcome") as Extract<Msg, { t: "welcome" }> | undefined)?.nonce;
    this.send({ t: "signin", address: w.address, nonce: n, signature: w.sign(signInMessage({ address: w.address, nonce: n!, host: "chat.test" })), profile: { nickname, species: "koala", scarf: "plum" } });
    return { w, reply: (await this.nextAny(["signed", "error"])) as Extract<Msg, { t: "signed" }> | Extract<Msg, { t: "error" }> };
  }
  close() { this.ws.close(); return this.closed; }
}

async function signedClient(nickname: string, w = wallet()) {
  const c = new Client();
  const welcome = await c.hello();
  const { reply } = await c.signIn(w, nickname, welcome.nonce);
  assert.equal(reply.t, "signed", JSON.stringify(reply));
  return { c, w, resume: (reply as Extract<Msg, { t: "signed" }>).resume };
}

test("a spectator says hello and gets a nonce, the history, the crowd and the limits", async () => {
  const c = new Client();
  const w = await c.hello();
  assert.equal(w.v, 1);
  assert.match(w.nonce, /^[0-9a-f]{32}$/);
  assert.equal(w.signed, false);
  assert.match(w.you.id, /^guest:[0-9a-f]{8}$/);
  assert.equal(w.host, "chat.test");
  assert.ok(Array.isArray(w.history));
  assert.ok(w.presence.list.some((p) => p.profile.id === w.you.id));
  assert.ok(w.presence.count >= 1);
  assert.deepEqual(w.limits, { maxText: 160, burst: 50, everyMs: 10 });
  // spectators read; they cannot talk
  c.send({ t: "say", text: "hello", cid: "1" });
  assert.deepEqual(await c.next("ack"), { t: "ack", cid: "1", ok: false, reason: "no-profile" });
  await c.close();
});

test("sign-in with a wallet signature, talk reaches everyone once, commands and links are refused", async () => {
  const watcher = new Client();
  await watcher.hello();
  const { c } = await signedClient("tessa");
  c.send({ t: "say", text: "  good   evening​ all ", cid: "a" });
  const ack = await c.next("ack");
  assert.equal(ack.ok, true);
  const seen = await watcher.next("line", (m) => m.line.kind === "talk");
  assert.equal(seen.line.text, "good evening all");
  assert.equal(seen.line.from?.nickname, "tessa");
  assert.equal(seen.line.from?.scarf, "#C77DFF");
  assert.equal(ack.ok && ack.id, seen.line.id);
  // the sender gets its own line back too
  assert.equal((await c.next("line")).line.id, seen.line.id);

  c.send({ t: "say", text: "!scoop 0.25", cid: "b" });
  assert.deepEqual(await c.next("ack"), { t: "ack", cid: "b", ok: false, reason: "command" });
  c.send({ t: "say", text: "claim at ladle-gift.xyz", cid: "c" });
  assert.deepEqual(await c.next("ack"), { t: "ack", cid: "c", ok: false, reason: "blocked" });
  c.send({ t: "say", text: "x".repeat(161), cid: "d" });
  assert.deepEqual(await c.next("ack"), { t: "ack", cid: "d", ok: false, reason: "too-long" });
  await c.close();
  await watcher.close();
});

test("a bad signature, a reused nonce and a reserved nickname are refused; each attempt gets a fresh nonce", async () => {
  const c = new Client();
  const welcome = await c.hello();
  const w = wallet();
  const other = wallet();
  c.send({ t: "signin", address: w.address, nonce: welcome.nonce, signature: other.sign(signInMessage({ address: w.address, nonce: welcome.nonce, host: "chat.test" })), profile: { nickname: "marlo", species: "fox", scarf: "sky" } });
  const e1 = await c.next("error");
  assert.equal(e1.code, "bad-signature");
  assert.ok(e1.nonce && e1.nonce !== welcome.nonce);
  // the first nonce is spent
  c.send({ t: "signin", address: w.address, nonce: welcome.nonce, signature: w.sign(signInMessage({ address: w.address, nonce: welcome.nonce, host: "chat.test" })), profile: { nickname: "marlo", species: "fox", scarf: "sky" } });
  const e2 = await c.next("error");
  assert.equal(e2.code, "bad-nonce");
  // a text signed for another relay host does not pass
  c.send({ t: "signin", address: w.address, nonce: e2.nonce, signature: w.sign(signInMessage({ address: w.address, nonce: e2.nonce!, host: "evil.test" })), profile: { nickname: "marlo", species: "fox", scarf: "sky" } });
  const e3 = await c.next("error");
  assert.equal(e3.code, "bad-signature");
  const { reply } = await c.signIn(w, "ladle_help", e3.nonce);
  assert.equal(reply.t === "error" && reply.code, "nickname-reserved");
  const ok = await c.signIn(w, "marlo", (reply as Extract<Msg, { t: "error" }>).nonce);
  assert.equal(ok.reply.t, "signed");
  await c.close();
});

test("presence: arrivals, seats and departures reach the others as batched diffs", async () => {
  const watcher = new Client();
  await watcher.hello();
  const { c, w } = await signedClient("juno");
  await watcher.next("presence", (m) => m.join.some((p) => p.profile.id === w.address));
  c.send({ t: "seat", seat: "stage" });
  const s = await watcher.next("presence", (m) => m.seat.some(([id]) => id === w.address));
  assert.deepEqual(s.seat.find(([id]) => id === w.address), [w.address, "stage"]);
  await c.close();
  const gone = await watcher.next("presence", (m) => m.leave.includes(w.address));
  assert.ok(gone.count >= 1);
  await watcher.close();
});

test("reconnect: the resume token restores the profile without a new signature, and only missed lines replay", async () => {
  const { c, w, resume } = await signedClient("olive");
  c.send({ t: "say", text: "first line", cid: "1" });
  const first = await c.next("line", (m) => m.line.text === "first line");
  await c.close();

  const other = await signedClient("pip");
  other.c.send({ t: "say", text: "said while olive was away", cid: "2" });
  await other.c.next("ack");

  const back = new Client();
  const welcome = await back.hello({ resume, since: first.line.id });
  assert.equal(welcome.signed, true);
  assert.equal(welcome.you.id, w.address);
  assert.equal(welcome.reset, false);
  assert.deepEqual(welcome.history.map((l) => l.text), ["said while olive was away"]);
  assert.ok(welcome.resume, "a refreshed token");
  back.send({ t: "say", text: "back again", cid: "3" });
  assert.equal((await back.next("ack")).ok, true);

  // a forged token is just a spectator
  const forged = new Client();
  const f = await forged.hello({ resume: "eyJwIjp7fX0.AAAA" });
  assert.equal(f.signed, false);
  await Promise.all([back.close(), other.c.close(), forged.close()]);
});

test("mute file: a wallet added to the file cannot talk after the reload, and can again once removed", async () => {
  const { c, w } = await signedClient("rook");
  writeFileSync(muteFile, `# muted for spam\n${w.address}\n`);
  await new Promise((r) => setTimeout(r, 400));
  c.send({ t: "say", text: "hello?", cid: "m1" });
  assert.deepEqual(await c.next("ack"), { t: "ack", cid: "m1", ok: false, reason: "muted" });
  writeFileSync(muteFile, "\n");
  await new Promise((r) => setTimeout(r, 400));
  c.send({ t: "say", text: "hello again", cid: "m2" });
  assert.equal((await c.next("ack")).ok, true);
  await c.close();
});

test("gates: unknown origin 403, no origin 403, wrong path 404, too many sockets from one IP 429", async () => {
  await assert.rejects(new Client(url, "https://elsewhere.example").open(), /403/);
  await assert.rejects(new Client(url, null).open(), /403/);
  await assert.rejects(new Client(url + "nope", ORIGIN).open(), /404/);

  const small = createRelay({ origins: [ORIGIN], maxPerIp: 2, log: () => {}, muteFile: null });
  const a = await small.listen(0, "127.0.0.1");
  const u = `ws://127.0.0.1:${a.port}/`;
  const c1 = new Client(u), c2 = new Client(u);
  await Promise.all([c1.open(), c2.open()]);
  await assert.rejects(new Client(u).open(), /429/);
  await Promise.all([c1.close(), c2.close()]);
  await small.close("test");
});

test("rate limit: three lines at once, the fourth waits; slow mode switches on under load", async () => {
  const r = createRelay({ origins: [ORIGIN], publicHost: "chat.test", log: () => {}, muteFile: null, slow: { windowMs: 10_000, above: 4, ms: 4000, coolMs: 20_000 } });
  const a = await r.listen(0, "127.0.0.1");
  const u = `ws://127.0.0.1:${a.port}/`;
  const c = new Client(u);
  const welcome = await c.hello();
  const { reply } = await c.signIn(wallet(), "quill", welcome.nonce);
  assert.equal(reply.t, "signed");
  for (const cid of ["1", "2", "3", "4"]) c.send({ t: "say", text: `line ${cid}`, cid });
  const acks = [await c.next("ack"), await c.next("ack"), await c.next("ack"), await c.next("ack")];
  assert.deepEqual(acks.map((x) => x.ok), [true, true, true, false]);
  const last = acks[3]!;
  assert.equal(!last.ok && last.reason, "rate-limited");
  assert.ok(!last.ok && last.retryMs! > 0 && last.retryMs! <= 1500);

  // four more talkers push the room over the threshold
  const others = await Promise.all(["ana", "bo_", "cy_", "dee"].map(async (n) => {
    const x = new Client(u);
    const wl = await x.hello();
    await x.signIn(wallet(), n, wl.nonce);
    x.send({ t: "say", text: `hi from ${n}`, cid: n });
    await x.next("ack");
    return x;
  }));
  const slow = await c.next("slow");
  assert.equal(slow.ms, 4000);
  const note = await c.next("line", (m) => m.line.kind === "notice");
  assert.match(note.line.text, /one line every 4 s/);
  await Promise.all([c.close(), ...others.map((x) => x.close())]);
  await r.close("test");
});

test("a socket that never says hello is closed; frames before hello are refused", async () => {
  const r = createRelay({ origins: [ORIGIN], log: () => {}, muteFile: null, helloTimeoutMs: 100 });
  const a = await r.listen(0, "127.0.0.1");
  const c = new Client(`ws://127.0.0.1:${a.port}/`);
  await c.open();
  c.send({ t: "say", text: "hi" });
  assert.equal((await c.next("error")).code, "protocol");
  assert.equal((await c.next("error")).code, "hello-timeout");
  assert.equal(await c.closed, 4000);
  await r.close("test");
});
