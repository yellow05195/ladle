/**
 * What a talk line may carry. In order: clean (NFKC, no control or invisible
 * characters, no stacked combining marks, one space between words), refuse
 * (empty, a command, too long, a link, wallet-drain bait, a pasted address),
 * then mask a short list of insults. The relay is the authority; the app
 * repeats the cheap checks (length, links) for an instant hint.
 */
import { MAX_TEXT } from "./protocol.ts";

/** NFKC, invisible and control characters out, at most two combining marks per letter, single spaces. */
export function normalise(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[\t\n\r\v\f]/g, " ")
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/gu, "")
    .replace(/(\p{M}{2})\p{M}+/gu, "$1")
    .replace(/[\s⠀ㅤᅟᅠﾠ]+/g, " ")
    .trim();
}

export const codePoints = (s: string) => [...s].length;

const TLDS = [
  "com", "net", "org", "io", "xyz", "app", "gg", "me", "co", "fun", "link", "site", "online", "top", "click", "live", "finance", "money",
  "ai", "dev", "info", "biz", "ru", "cn", "tk", "ml", "ga", "cf", "gq", "pw", "cc", "ly", "sh", "vip", "pro", "store", "shop", "network",
  "exchange", "claim", "claims", "gift", "today", "world", "sol", "tv", "us", "uk", "eu", "de", "fr", "xxx", "lol", "wtf", "bet", "casino",
  "game", "games", "art", "club", "space", "website", "page", "ws", "su", "zip", "mov", "icu", "buzz", "cloud", "digital", "agency",
];
const DOMAIN = new RegExp(`(?:^|[^a-z0-9-])[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLDS.join("|")})(?![a-z0-9-])`);
const LINK_RES = [
  /(?:https?|ftp|wss?|ipfs|file):\/\//,
  /(?:^|[^a-z0-9])www\./,
  /(?:^|[^0-9])\d{1,3}(?:\.\d{1,3}){3}(?![0-9])/,
  /xn--/,
  DOMAIN,
];

/** "ladle (dot) fun", "ladle [.] fun", "ladle . fun", "ladle .fun" all read as "ladle.fun". */
function linkSkeleton(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*[([{<]\s*(?:dot|\.)\s*[)\]}>]\s*/g, ".")
    .replace(/\s+dot\s+(?=[a-z]{2,}\b)/g, ".")
    .replace(/\s+\.\s*/g, ".");
}

export function hasLink(text: string): boolean {
  const s = linkSkeleton(text);
  return LINK_RES.some((re) => re.test(s));
}

/** 1:1 per UTF-16 unit, so indexes found in the mapped copy are valid in the original. */
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i", "|": "l" };
function leet(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const l = c.toLowerCase();
    // "!" and "|" stand for letters only inside a word ("sh!t"), not at its end ("wow!")
    if ((c === "!" || c === "|") && !/\p{L}/u.test(s[i + 1] ?? "")) { out += c; continue; }
    // a few letters lower-case to two units ("İ"): keep those as they are so indexes stay aligned
    out += LEET[c] ?? (l.length === 1 ? l : c);
  }
  return out;
}

const BAIT: RegExp[] = [
  /\b(?:seed|secret|recovery|backup|wallet)\s*(?:phrase|words?)\b/,
  /\bprivate\s*keys?\b/,
  /\bmnemonic\b/,
  /\b(?:12|24)\s*words\b/,
  /\b(?:connect|validate|verify|sync|link|import|restore|rectify|unlock)\s+(?:your\s+|ur\s+|the\s+|my\s+)?wallets?\b/,
  /\bwallets?\s*(?:connect|sync|validation|verification|restore|rectif\w*|unlock)\b/,
  /\bair\s*drops?\b/,
  /\bclaim\s+(?:now|here|free)\b/,
  /\bclaim\s+(?:your|ur)\s+(?:reward|airdrop|tokens?|prize|bonus|allocation)s?\b/,
  /\bfree\s+(?:sol|solana|mint|tokens?|nfts?|airdrop|crypto|money|ladle)\b/,
  /\bgive\s*aways?\b/,
  /\b(?:dm|pm|inbox|message|msg|text)\s+me\b/,
  /\b(?:dm|pm)\s+(?:for|to)\b/,
  /\b(?:telegram|whatsapp|wechat)\b/,
  /\badd\s+me\s+on\b/,
  /\bsend\s+(?:me\s+)?(?:\d+(?:[.,]\d+)?\s*)?(?:sol|usdc|usdt|tokens?|crypto|ladle)\b/,
  /\b(?:double|triple)\s+(?:your|ur)\b/,
  /\b(?:support|help)\s*(?:team|desk|ticket)\b/,
  /\b(?:official|customer)\s+support\b/,
  /\badmin\s+here\b/,
  /\brecover\s+(?:your|ur|lost|my)\s+(?:funds|wallet|sol|crypto|tokens)\b/,
  /\bdrainer\b/,
];
/** a pasted Solana address or EVM address: the usual "send it here" */
const ADDRESS_RES = [/(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z])/, /\b0x[0-9a-fA-F]{40}\b/];

export function isBait(text: string): boolean {
  const plain = text.toLowerCase();
  const mapped = leet(text);
  if (BAIT.some((re) => re.test(plain) || re.test(mapped))) return true;
  return ADDRESS_RES.some((re) => re.test(text));
}

/*
 * A small insult list, ROT13 so the source reads clean. `any`: masked
 * anywhere inside a word; `pre`: words starting with it; `word`: whole words.
 */
const rot13 = (s: string) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
const ANY = ["shpx"].map(rot13);
const PRE = ["phag", "avtt", "sntt", "fuvg", "ovgpu", "nffubyr", "onfgneq", "fyhg", "jube", "ergneq", "jnax", "gjng", "chffl", "qbhpur"].map(rot13);
const WORD = ["qvpx", "qvpxf", "pbpx", "pbpxf", "snt", "sntf", "nff", "gvgf"].map(rot13);

export function maskProfanity(text: string): string {
  // UTF-16 indexes: `mapped` has the same length as `text`
  const mapped = leet(text);
  let out = text;
  const re = /[\p{L}\p{N}_]+/gu;
  let m: RegExpExecArray | null;
  const spans: Array<[number, number]> = [];
  while ((m = re.exec(mapped))) {
    const w = m[0];
    const hit = ANY.some((x) => w.includes(x)) || PRE.some((x) => w.startsWith(x)) || WORD.includes(w);
    if (hit) spans.push([m.index, m.index + w.length]);
  }
  for (const [a, b] of spans.reverse()) out = out.slice(0, a + 1) + "*".repeat(Math.max(1, b - a - 1)) + out.slice(b);
  return out;
}

export type Verdict =
  | { ok: true; text: string }
  | { ok: false; reason: "empty" | "command" | "too-long" | "blocked"; why?: "link" | "bait" };

/** The whole gate for one talk line. */
export function moderate(raw: string, max = MAX_TEXT): Verdict {
  const text = normalise(raw);
  if (!text) return { ok: false, reason: "empty" };
  if (text.startsWith("!")) return { ok: false, reason: "command" };
  if (codePoints(text) > max) return { ok: false, reason: "too-long" };
  if (hasLink(text)) return { ok: false, reason: "blocked", why: "link" };
  if (isBait(text)) return { ok: false, reason: "blocked", why: "bait" };
  return { ok: true, text: maskProfanity(text) };
}
