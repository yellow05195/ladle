/**
 * The page's live client (app/lib/chat/live.ts) against the real relay:
 * Node's own WebSocket stands in for the browser's, a throwaway ed25519 key
 * for the wallet's signMessage. The app's modules import each other without
 * extensions (bundler style), so a tiny resolve hook adds ".ts" for them.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { register } from "node:module";
import { createRelay, type Relay } from "../src/relay.ts";
import { base58Encode } from "../src/signin.ts";

register("data:text/javascript," + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); }
  catch (e) { if (spec.startsWith(".") && !/\\.[a-z]+$/.test(spec)) return next(spec + ".ts", ctx); throw e; }
}`));

// the browser globals live.ts touches
const storage = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.window = {
  addEventListener() {}, removeEventListener() {},
  localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) },
};
g.document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };

type Snapshot = { status: string; lines: Array<{ text: string; from: { id: string } | null; kind: string }>; present: Array<{ profile: { id: string; nickname: string }; seat: string }>; online: number; me?: { id: string } | null; signed?: boolean };
type Store = { get(): Snapshot; flush(): void };
type Source = { start(): void; stop(): void; say(t: string): Promise<{ ok: boolean; reason?: string; kind?: string; hint?: string }>; setProfile(p: unknown): void; setSigner(s: unknown): void; setSeat(s: string): void; signIn(): Promise<{ ok: boolean; reason?: string }> };

let relay: Relay;
let url = "";
/** every source a test starts, stopped after it whatever happened (a running source keeps reconnecting) */
const running: Source[] = [];
const track = (s: Source) => { running.push(s); return s; };
let RoomStore: new (s: Snapshot) => Store;
let liveSource: (store: Store, url: string) => Source;

before(async () => {
  relay = createRelay({ origins: ["http://hall.test"], allowNoOrigin: true, publicHost: "chat.test", muteFile: null, presenceFlushMs: 20, heartbeatMs: 60_000, log: () => {} });
  const a = await relay.listen(0, "127.0.0.1");
  url = `ws://127.0.0.1:${a.port}/`;
  // non-literal specifiers: the type checker does not follow them into the app's bundler-style imports
  const storeMod = "../../app/lib/chat/store.ts", liveMod = "../../app/lib/chat/live.ts";
  ({ RoomStore } = await import(storeMod));
  ({ liveSource } = await import(liveMod));
});

after(async () => {
  for (const s of running) s.stop();
  await relay.close("test");
});

function walletSigner() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const address = base58Encode(Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url"));
  let calls = 0;
  const signer = async (msg: Uint8Array) => { calls++; return new Uint8Array(sign(null, Buffer.from(msg), privateKey)); };
  return { address, signer, calls: () => calls };
}

const fresh = (): Snapshot => ({ status: "connecting", lines: [], present: [], online: 0, me: null, signed: false });

async function until(what: string, ok: () => boolean, ms = 3000) {
  const t0 = Date.now();
  while (!ok()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

test("a spectator and a signed player share one room: talk, crowd, seat, departure, resume", async () => {
  const w = walletSigner();
  const profile = { id: w.address, nickname: "marlo", species: "koala", scarf: "#C77DFF", genesis: null };

  const sA = new RoomStore(fresh()), sB = new RoomStore(fresh());
  const A = track(liveSource(sA, url)), B = track(liveSource(sB, url));
  A.setProfile(profile);
  A.setSigner(w.signer);
  A.start(); B.start();
  await until("both live", () => sA.get().status === "live" && sB.get().status === "live");
  assert.equal(sB.get().signed, false);

  // the spectator cannot talk: no profile
  assert.equal((await B.say("hello?")).reason, "no-profile");

  // the first line asks the wallet for one signature, then goes out
  const r = await A.say("good evening all");
  assert.deepEqual(r, { ok: true, kind: "talk" });
  assert.equal(w.calls(), 1);
  await until("B sees the line", () => sB.get().lines.some((l) => l.text === "good evening all" && l.from?.id === w.address));
  await until("A is signed", () => sA.get().signed === true && sA.get().me?.id === w.address);
  await until("B sees marlo in the crowd", () => sB.get().present.some((p) => p.profile.id === w.address && p.profile.nickname === "marlo"));

  // the seat follows the round
  A.setSeat("stage");
  await until("B sees marlo on the stage", () => sB.get().present.some((p) => p.profile.id === w.address && p.seat === "stage"));

  // the local bucket: burst of 3 (one already spent)
  const burst = [await A.say("two"), await A.say("three"), await A.say("four")];
  assert.deepEqual(burst.map((x) => x.ok), [true, true, false]);
  assert.equal(burst[2]!.reason, "rate-limited");
  assert.match(burst[2]!.hint!, /One line every 1\.5 s, next in [12] s\./);

  // leaving: B sees marlo go
  A.stop();
  await until("B sees marlo leave", () => !sB.get().present.some((p) => p.profile.id === w.address));

  // coming back (same browser): the resume token, no new signature
  const sC = new RoomStore(fresh());
  const C = track(liveSource(sC, url));
  C.setProfile(profile);
  C.setSigner(w.signer);
  C.start();
  await until("C live and signed by resume", () => sC.get().status === "live" && sC.get().signed === true);
  assert.equal(w.calls(), 1, "no second signature");
  assert.ok(sC.get().lines.some((l) => l.text === "good evening all"), "history on join");
  await new Promise((r) => setTimeout(r, 1600));
  assert.deepEqual(await C.say("back again"), { ok: true, kind: "talk" });

  // a new nickname for the same wallet: the old sign-in no longer fits, the next line signs again
  C.setProfile({ ...profile, nickname: "marlo_2" });
  await until("C signed out", () => sC.get().signed === false);
  await new Promise((r) => setTimeout(r, 1600)); // the relay's own bucket for this wallet refills
  assert.deepEqual(await C.say("new name"), { ok: true, kind: "talk" });
  assert.equal(w.calls(), 2);
  await until("B sees the new name", () => sB.get().lines.some((l) => l.text === "new name"));

  B.stop(); C.stop();
});

test("a page that joins while a line is in flight shows it once", async () => {
  const w = walletSigner();
  const sA = new RoomStore(fresh());
  const A = track(liveSource(sA, url));
  A.setProfile({ id: w.address, nickname: "nell", species: "cow", scarf: "#7ED957", genesis: null });
  A.setSigner(w.signer);
  A.start();
  await until("A live", () => sA.get().status === "live");
  assert.equal((await A.signIn()).ok, true);
  const sJ = new RoomStore(fresh());
  const J = track(liveSource(sJ, url));
  const said = A.say("in flight");
  J.start();
  await said;
  await until("J live", () => sJ.get().status === "live");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(sJ.get().lines.filter((l) => l.text === "in flight").length, 1);
  A.stop(); J.stop();
});

test("a declined signature and a wallet without signMessage are reported, not thrown", async () => {
  const w = walletSigner();
  const s = new RoomStore(fresh());
  const src = track(liveSource(s, url));
  src.setProfile({ id: w.address, nickname: "pip", species: "fox", scarf: "#2EC4B6", genesis: null });
  src.start();
  await until("live", () => s.get().status === "live");
  const none = await src.say("hi");
  assert.equal(none.reason, "not-signed");
  src.setSigner(async () => { throw new Error("User rejected the request."); });
  const declined = await src.say("hi");
  assert.equal(declined.reason, "not-signed");
  assert.match(declined.hint!, /declined/);
  src.stop();
});

test("the relay going away: pending lines come back as offline, the client reconnects on its own", async () => {
  const r2 = createRelay({ origins: ["*"], allowNoOrigin: true, publicHost: "chat.test", muteFile: null, log: () => {} });
  const a = await r2.listen(0, "127.0.0.1");
  const s = new RoomStore(fresh());
  const src = track(liveSource(s, `ws://127.0.0.1:${a.port}/`));
  src.start();
  await until("live", () => s.get().status === "live");
  await r2.close("restart");
  await until("connecting after the drop", () => s.get().status !== "live");
  const w = walletSigner();
  src.setProfile({ id: w.address, nickname: "wren", species: "bee", scarf: "#FFB21A", genesis: null });
  assert.equal((await src.say("anyone?")).reason, "offline");
  // the same port again: the backoff finds it
  const r3: Relay = createRelay({ origins: ["*"], allowNoOrigin: true, publicHost: "chat.test", muteFile: null, log: () => {} });
  await r3.listen(a.port, "127.0.0.1");
  await until("live again", () => s.get().status === "live", 8000);
  src.stop();
  await r3.close("test");
});
