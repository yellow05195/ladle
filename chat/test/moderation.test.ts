/**
 * The talk gate: cleaning, refusals (links, wallet-drain bait, pasted
 * addresses, commands, length) and the insult mask.
 *
 * Run: node --test "chat/test/**\/*.test.ts"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { codePoints, hasLink, isBait, maskProfanity, moderate, normalise } from "../src/moderation.ts";

test("normalise strips control, zero-width and bidi characters and collapses whitespace", () => {
  assert.equal(normalise("  hi​ there‮ \u0007\n\n friend﻿  "), "hi there friend");
  assert.equal(normalise("a⠀⠀bㅤc"), "a b c");
  // fullwidth letters fold to ASCII (NFKC), so they cannot dodge the link check
  assert.equal(normalise("ｌａｄｌｅ"), "ladle");
  // stacked combining marks ("zalgo") keep at most two per letter
  assert.equal(codePoints(normalise("é́́́́")), 3);
});

test("moderate: empty, command, length", () => {
  assert.deepEqual(moderate("   ​ "), { ok: false, reason: "empty" });
  assert.deepEqual(moderate("!scoop 0.25"), { ok: false, reason: "command" });
  assert.deepEqual(moderate("x".repeat(161)), { ok: false, reason: "too-long" });
  assert.deepEqual(moderate("x".repeat(160)), { ok: true, text: "x".repeat(160) });
  // the limit counts characters, not UTF-16 units: 160 emoji fit
  assert.equal(moderate("🥣".repeat(160)).ok, true);
  assert.deepEqual(moderate("  good   evening\nall "), { ok: true, text: "good evening all" });
});

test("links are refused, however they are written", () => {
  for (const s of [
    "go to https://example.org now", "www.example.org", "useladle.fun", "visit LADLE.FUN", "ladle (dot) fun", "ladle [.] io",
    "ladle . com", "see t.me/somebody", "discord.gg/abc", "x.sol", "ipfs://bafy", "http://203.0.113.7:8080", "203.0.113.7",
    "ｌａｄｌｅ．ｆｕｎ", "xn--80ak6aa92e.com", "my-site.xyz/claim",
  ]) assert.equal(hasLink(normalise(s)), true, s);
  for (const s of [
    "0.25 SOL each round", "i.e. the same price", "e.g. round 1203", "great. fun round though", "1.5x of pro-rata, 0.4x the next",
    "v1.2 of the hall", "the sum in = sum out", "ok so what now", "a.m. or p.m.?",
  ]) assert.equal(hasLink(normalise(s)), false, s);
});

test("wallet-drain bait and pasted addresses are refused", () => {
  for (const s of [
    "send me your seed phrase", "never share your s33d phr4se", "Connect your wallet to claim", "wallet sync needed", "AIRDROP live",
    "claim now", "claim your reward", "free sol for the first 10", "giveaway in my profile", "DM me for help", "pm for tips",
    "find me on telegram", "add me on discord", "send 2 sol and get 4", "double your sol", "official support here", "support team: write me",
    "admin here, verify your wallet", "recover your funds fast", "send to 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "0x52908400098527886E0F7030069857D2E4169EE7",
  ]) assert.equal(isBait(normalise(s)), true, s);
  for (const s of [
    "same price for everyone, not the same scoop", "I sold back right after the split", "the seed came from the oracle",
    "how does the 20% cap work?", "my koala has a plum scarf", "that drum sound though", "round 1203 sum in = sum out",
  ]) assert.equal(isBait(normalise(s)), false, s);
  assert.deepEqual(moderate("connect your wallet at ladle-claim.xyz"), { ok: false, reason: "blocked", why: "link" });
  assert.deepEqual(moderate("connect your wallet here"), { ok: false, reason: "blocked", why: "bait" });
});

test("the insult mask keeps the first letter, catches simple leetspeak, leaves clean words alone", () => {
  const r13 = (s: string) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
  const bad = r13("fuvg"); // a common four-letter word
  assert.equal(maskProfanity(`oh ${bad}`), "oh s***");
  assert.equal(maskProfanity(`oh ${bad.replace("i", "1")}ty round`), "oh s***** round");
  assert.equal(maskProfanity(`${bad.toUpperCase()}!`), "S***!");
  // no Scunthorpe problem on the usual traps
  assert.equal(maskProfanity("class, bass, cocktail, shiitake, scunthorpe, sniggering"), "class, bass, cocktail, shiitake, scunthorpe, sniggering");
  assert.equal(maskProfanity("the bass and the class"), "the bass and the class");
  const r = moderate(`what the ${r13("shpx")} was that`);
  assert.deepEqual(r, { ok: true, text: "what the f*** was that" });
});
