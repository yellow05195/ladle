/**
 * Unit tests: rate limits and slow mode, wallet signature check with a
 * generated ed25519 key, resume tokens, presence caps and diffs, history
 * replay, frame parsing and profile rules.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyedLimiter, SlowMode, TokenBucket } from "../src/ratelimit.ts";
import { ResumeTokens, addressBytes, base58Decode, base58Encode, verifyWalletSignature } from "../src/signin.ts";
import { Roster } from "../src/presence.ts";
import { History } from "../src/history.ts";
import { parseClient, signInMessage, type WireProfile } from "../src/protocol.ts";
import { checkNickname, guestProfile, validateProfile } from "../src/profile.ts";
import { wallet } from "./helpers.ts";

const prof = (id: string, nickname = "marlo"): WireProfile => ({ id, nickname, species: "koala", scarf: "#2EC4B6", genesis: null });

test("token bucket: burst of 3, then one every 1.5 s", () => {
  const b = new TokenBucket({ capacity: 3, refillMs: 1500 }, 0);
  assert.equal(b.take(0).ok, true);
  assert.equal(b.take(0).ok, true);
  assert.equal(b.take(0).ok, true);
  const no = b.take(0);
  assert.equal(no.ok, false);
  assert.equal(!no.ok && no.retryMs, 1500);
  assert.equal(b.take(1000).ok, false);
  assert.equal(b.take(1500).ok, true);
  assert.equal(b.take(1600).ok, false);
  b.refund();
  assert.equal(b.take(1600).ok, true);
});

test("keyed limiter keeps wallets apart and forgets idle ones", () => {
  const l = new KeyedLimiter({ capacity: 1, refillMs: 1000 });
  assert.equal(l.take("a", 0).ok, true);
  assert.equal(l.take("a", 10).ok, false);
  assert.equal(l.take("b", 10).ok, true);
  assert.equal(l.size, 2);
  l.sweep(5000);
  assert.equal(l.size, 0);
});

test("slow mode switches on above the threshold and off after a quiet spell", () => {
  const s = new SlowMode({ windowMs: 10_000, above: 5, ms: 4000, coolMs: 20_000 });
  let t = 0;
  for (let i = 0; i < 5; i++) assert.equal(s.record(`w${i}`, (t += 100)), null);
  assert.equal(s.record("w5", (t += 100)), true);
  assert.equal(s.on, true);
  assert.equal(s.check("w5", t + 1000).ok, false);
  assert.equal(s.check("w5", t + 4000).ok, true);
  assert.equal(s.check("someone-else", t + 1).ok, true);
  // quiet: the window empties, then the cool-down runs
  assert.equal(s.update(t + 11_000), null);
  assert.equal(s.update(t + 30_000), null);
  assert.equal(s.update(t + 31_001), false);
  assert.equal(s.on, false);
});

test("base58 round-trips and only 32-byte addresses pass", () => {
  const raw = Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? 0 : i * 7));
  const s = base58Encode(raw);
  assert.ok(s.startsWith("1"));
  assert.deepEqual([...base58Decode(s)!], [...raw]);
  assert.equal(addressBytes(s)?.length, 32);
  assert.equal(addressBytes("abc"), null);
  assert.equal(addressBytes("0OIl"), null);
  assert.equal(addressBytes("11111111111111111111111111111111")?.length, 32);
});

test("wallet signature: a generated ed25519 key signs the sign-in text, the relay checks it", () => {
  const w = wallet();
  const text = signInMessage({ address: w.address, nonce: "ab".repeat(16), host: "chat.example" });
  const sig = w.sign(text);
  assert.equal(verifyWalletSignature(w.address, text, sig), true);
  assert.equal(verifyWalletSignature(w.address, text.replace("ab", "ac"), sig), false, "another nonce");
  assert.equal(verifyWalletSignature(wallet().address, text, sig), false, "another wallet");
  assert.equal(verifyWalletSignature(w.address, text, sig.slice(0, -4) + "AAAA"), false, "a changed signature");
  assert.equal(verifyWalletSignature(w.address, text, "not base64 !!"), false);
  assert.equal(verifyWalletSignature("nope", text, sig), false);
  assert.match(text, /^Ladle chat sign-in\nwallet: \w+\nrelay: chat\.example\nnonce: [0-9a-f]{32}\nThis signature lets you talk/);
});

test("resume tokens: issued, checked, refused when forged or expired", () => {
  const t = new ResumeTokens(Buffer.alloc(32, 7), 60_000);
  const p = prof(wallet().address);
  const tok = t.issue(p, 1000);
  assert.deepEqual(t.check(tok, 2000), p);
  assert.equal(t.check(tok, 61_001), null, "expired");
  const [payload, mac] = tok.split(".");
  const forged = Buffer.from(JSON.stringify({ p: { ...p, nickname: "evil" }, exp: 9e12 })).toString("base64url");
  assert.equal(t.check(`${forged}.${mac}`, 2000), null);
  assert.equal(t.check(`${payload}.AAAA`, 2000), null);
  assert.equal(new ResumeTokens(Buffer.alloc(32, 8), 60_000).check(tok, 2000), null, "another secret");
});

test("presence: 300 listed, everyone counted, signed players bump spectators", () => {
  const r = new Roster(300);
  for (let i = 0; i < 350; i++) r.add(guestProfile(`guest:${i.toString(16).padStart(8, "0")}`), false, i);
  assert.equal(r.count, 350);
  assert.equal(r.snapshot().list.length, 300);
  const first = r.drain()!;
  assert.equal(first.join.length, 300);
  assert.equal(first.count, 350);
  assert.equal(r.drain(), null, "nothing changed");

  const w = wallet().address;
  r.add(prof(w), true);
  assert.equal(r.isListed(w), true, "a signed player always gets a listed place");
  const d = r.drain()!;
  assert.equal(d.join.length, 1);
  assert.equal(d.leave.length, 1, "one spectator went back to the count");
  assert.equal(r.snapshot().list.length, 300);

  // a second tab of the same wallet is the same person
  r.add(prof(w), true);
  assert.equal(r.count, 351);
  assert.equal(r.remove(w), false);
  assert.equal(r.isListed(w), true);

  r.setSeat(w, "stage");
  assert.deepEqual(r.drain()!.seat, [[w, "stage"]]);

  // leaving frees a place, the next waiting member takes it
  assert.equal(r.remove(w), true);
  const after = r.drain()!;
  assert.deepEqual(after.leave, [w]);
  assert.equal(after.join.length, 1);
  assert.equal(r.snapshot().list.length, 300);
  assert.equal(after.count, 350);
});

test("presence diffs coalesce: a join and a leave inside one flush send nothing but the count", () => {
  const r = new Roster(10);
  r.add(guestProfile("guest:aaaaaaaa"), false);
  r.drain();
  r.add(guestProfile("guest:bbbbbbbb"), false);
  r.remove("guest:bbbbbbbb");
  assert.equal(r.drain(), null);
});

test("history: replay after an id, reset after a restart or a wide gap", () => {
  const h = new History(3, "b00t");
  const line = () => ({ id: h.nextId(), at: 0, kind: "talk" as const, from: null, text: "x" });
  const a = line(); h.push(a);
  const b = line(); h.push(b);
  assert.deepEqual(h.since(a.id), { lines: [b], reset: false });
  assert.deepEqual(h.since(b.id), { lines: [], reset: false });
  assert.equal(h.since(undefined).reset, true);
  assert.equal(h.since("other.1").reset, true);
  for (let i = 0; i < 5; i++) h.push(line());
  assert.equal(h.length, 3);
  assert.equal(h.since(a.id).reset, true, "the gap is wider than the ring");
});

test("frames: only known shapes pass", () => {
  assert.deepEqual(parseClient('{"t":"hello","v":1}'), { t: "hello", v: 1, resume: undefined, since: undefined });
  assert.equal(parseClient('{"t":"hello"}'), null);
  assert.equal(parseClient("not json"), null);
  assert.equal(parseClient("[]"), null);
  assert.equal(parseClient('{"t":"seat","seat":"roof"}'), null);
  assert.equal(parseClient('{"t":"say","text":5}'), null);
  assert.equal(parseClient(JSON.stringify({ t: "say", text: "x".repeat(2001) })), null);
  assert.equal(parseClient('{"t":"signin","address":"a","nonce":"b","signature":"c"}'), null);
  assert.equal(parseClient('{"t":"nope"}'), null);
});

test("profiles: the app's nickname rule, plus no posing as the house", () => {
  assert.equal(checkNickname("marlo_7"), "ok");
  assert.equal(checkNickname("ma"), "short");
  assert.equal(checkNickname("Marlo"), "chars");
  assert.equal(checkNickname("x".repeat(17)), "chars");
  assert.equal(checkNickname("admin"), "reserved");
  assert.equal(checkNickname("ladle_support"), "reserved");
  assert.equal(checkNickname("guest_1234"), "reserved");
  const a = wallet().address;
  const ok = validateProfile(a, { nickname: "marlo", species: "koala", scarf: "plum", genesis: 12 }, false);
  assert.deepEqual(ok, { ok: true, profile: { id: a, nickname: "marlo", species: "koala", scarf: "#C77DFF", genesis: null } });
  const trusted = validateProfile(a, { nickname: "marlo", species: "koala", scarf: "#c77dff", genesis: 12 }, true);
  assert.equal(trusted.ok && trusted.profile.genesis, 12);
  assert.deepEqual(validateProfile(a, { nickname: "marlo", species: "dragon", scarf: "plum" }, false), { ok: false, code: "bad-profile" });
  assert.deepEqual(validateProfile(a, { nickname: "marlo", species: "fox", scarf: "#000000" }, false), { ok: false, code: "bad-profile" });
  assert.deepEqual(validateProfile(a, { nickname: "official_x", species: "fox", scarf: "sky" }, false), { ok: false, code: "nickname-reserved" });
});
