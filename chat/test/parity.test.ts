/**
 * The page and the relay must agree: the sign-in text (byte for byte), the
 * limits, the nickname rule, the six colours, the twelve animals, the
 * cleaning and the link check. And the demo room's lines must pass the
 * repo's copy rules (the lists are read from tests/forbidden-words.ts and
 * app/scripts/copy-lint.mjs, so a word added there is checked here too)
 * and the relay's own moderation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as relayProto from "../src/protocol.ts";
import { POSES_AS, RESERVED, SCARVES } from "../src/profile.ts";
import { hasLink, moderate, normalise } from "../src/moderation.ts";
import * as appProto from "../../app/lib/chat/protocol.ts";
import { classify, cleanText, looksLikeLink, roomNicknameOk } from "../../app/lib/chat/text.ts";
import * as lines from "../../app/lib/chat/demo-lines.ts";
import { wallet } from "./helpers.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

test("the sign-in text and the limits are the same on both sides", () => {
  for (let i = 0; i < 5; i++) {
    const p = { address: wallet().address, nonce: Math.random().toString(16).slice(2).padEnd(32, "0"), host: `chat${i}.example` };
    assert.equal(appProto.signInMessage(p), relayProto.signInMessage(p));
  }
  assert.equal(appProto.PROTOCOL, relayProto.PROTOCOL);
  assert.equal(appProto.MAX_TEXT, relayProto.MAX_TEXT);
  assert.equal(appProto.HISTORY_SIZE, relayProto.HISTORY_SIZE);
  assert.equal(appProto.PRESENCE_CAP, relayProto.PRESENCE_CAP);
  assert.deepEqual(appProto.POSES_AS, POSES_AS);
});

test("profiles: the relay's species, colours and reserved names are the app's (app/lib/profile.ts)", () => {
  const src = read("app/lib/profile.ts");
  const list = (name: string) => [...src.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`))![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(list("SPECIES"), [...relayProto.SPECIES]);
  assert.deepEqual(list("RESERVED"), RESERVED);
  const scarves = [...src.matchAll(/\{\s*id:\s*"(\w+)",\s*hex:\s*"(#[0-9A-Fa-f]{6})"\s*\}/g)].map((m) => ({ id: m[1], hex: m[2] }));
  assert.deepEqual(scarves, SCARVES.map((s) => ({ ...s })));
  assert.match(src, /\/\^\[a-z0-9_\]\*\$\//, "the nickname charset rule");
  assert.match(src, /nick\.length < 3/);
  assert.match(src, /nick\.length > 16/);
  assert.equal(roomNicknameOk("marlo"), true);
  assert.equal(roomNicknameOk("ladle_help"), false);
  assert.equal(roomNicknameOk("guest_7"), false);
});

test("the page cleans text like the relay, and its quick link check never lets through what the relay refuses as a link", () => {
  const samples = [
    "  hi​ there‮ \u0007\n friend﻿ ", "ｌａｄｌｅ", "é́́́", "a⠀⠀b",
    "go to https://example.org", "www.example.org", "useladle.fun", "ladle (dot) fun", "ladle . com", "t.me/x", "x.sol",
    "0.25 SOL", "i.e. same price", "great. fun round", "v1.2 hall",
  ];
  for (const s of samples) {
    assert.equal(cleanText(s), normalise(s), s);
    const clean = normalise(s);
    if (looksLikeLink(clean)) assert.equal(hasLink(clean), true, `page says link, relay agrees: ${s}`);
    if (!/\d{1,3}(\.\d{1,3}){3}/.test(clean)) assert.equal(looksLikeLink(clean), hasLink(clean), s);
  }
});

test("the classifier: commands stay local, talk goes to the room", () => {
  assert.deepEqual(classify("   "), { kind: "empty" });
  assert.deepEqual(classify("!scoop 0.25"), { kind: "command", known: true, name: "scoop", arg: "0.25", text: "!scoop 0.25" });
  assert.deepEqual(classify("!ODDS"), { kind: "command", known: true, name: "odds", arg: "", text: "!ODDS" });
  for (const c of ["!pot", "!verify 1203", "!sell", "!help", "!pull 1", "!sum"]) assert.equal(classify(c).kind === "command" && (classify(c) as { known: boolean }).known, true, c);
  assert.deepEqual(classify("!dance"), { kind: "command", known: false, name: "dance", arg: "", text: "!dance" });
  assert.deepEqual(classify("  good  evening "), { kind: "talk", text: "good evening" });
});

/* ------------------------------------------------------------------ the demo room's copy */

function forbiddenRules(): RegExp[] {
  const src = read("tests/forbidden-words.ts");
  const block = src.slice(src.indexOf("const FORBIDDEN"), src.indexOf("const FORBIDDEN_SDK"));
  return [...block.matchAll(/re:\s*\/(.+?)\/([a-z]*),\s*why/g)].map((m) => new RegExp(m[1]!, m[2]));
}

function avoidRules(): RegExp[] {
  const src = read("app/scripts/copy-lint.mjs");
  const block = src.slice(src.indexOf("const AVOID"), src.indexOf("const ALLOW"));
  const words = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return words.map((w) => new RegExp(`(^|[^a-z0-9_])${esc(w).replace(/\\ /g, "[\\s\\u00a0]+")}(?=$|[^a-z0-9_])`, "i"));
}

function allDemoLines(): string[] {
  const out: string[] = [...lines.IDLE_LINES, ...lines.ENTRY_LINES, ...lines.GREETINGS, ...lines.HELP_REPLIES];
  for (const [q, a] of lines.DIALOGUES) out.push(q, a);
  for (const [, a] of lines.HELP_TOPICS) out.push(a);
  for (const list of Object.values(lines.PHASE_LINES)) out.push(...list);
  const fill = { n: "1203", prev: "1202", nick: "marlo", species: "koala", e: "9", sol: "0.25", seed: "a1b2c3d4" } as Record<string, string>;
  return out.map((t) => t.replace(/\{(\w+)\}/g, (_, k: string) => fill[k] ?? ""));
}

test("demo lines pass the repo's copy rules (forbidden words and the copy-lint avoid list)", () => {
  const forbidden = forbiddenRules();
  const avoid = avoidRules();
  assert.ok(forbidden.length >= 10 && avoid.length >= 40, "the lists were read");
  const allow = /neither wins nor loses/gi;
  const hits: string[] = [];
  for (const l of allDemoLines()) {
    for (const re of forbidden) if (re.test(l)) hits.push(`${l}  [${re}]`);
    const s = l.replace(allow, " ");
    for (const re of avoid) if (re.test(s)) hits.push(`${l}  [${re}]`);
  }
  assert.deepEqual(hits, []);
});

test("demo lines stay honest: no celebrating results, no promises, no chasing a loss", () => {
  const banned = [
    /\blucky\b/i, /\bluck\b/i, /\bbig (scoop|one|win)\b/i, /\bhuge\b/i, /\bwon\b/i, /\bget it back\b/i, /\bwin it back\b/i, /\bdue\b/i,
    /\bnext one'?s mine\b/i, /\bgoing up\b/i, /\bprice (will|is going)\b/i, /\bbefore (it|the price)\b/i, /\bhurry\b/i, /\bdon'?t miss\b/i,
    /\bstreak\b/i, /\bbest\b.*\bscoop\b/i, /\btop scoop\b/i, /\b\d+x\b/i, /\bx\d+\b/i,
  ];
  const hits = allDemoLines().filter((l) => banned.some((re) => re.test(l)));
  assert.deepEqual(hits, []);
});

test("demo lines would pass the relay's moderation unchanged, and none reads as a command", () => {
  for (const l of allDemoLines()) assert.deepEqual(moderate(l), { ok: true, text: l }, l);
  for (const n of lines.DEMO_NAMES) assert.match(n, /^[a-z0-9_]{3,16}$/, n);
  for (const n of lines.DEMO_NAMES) assert.equal(RESERVED.includes(n) || !roomNicknameOk(n), false, n);
  for (const t of lines.DEMO_TALKERS) assert.ok(lines.DEMO_NAMES.includes(t), t);
});
