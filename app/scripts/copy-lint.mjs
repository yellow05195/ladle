/**
 * v20 copy gate (runs in prebuild). tests/forbidden-words.ts bans a first
 * list across the repo; this one bans the full avoid list of the v20 brief
 * in what a user can read: every string of app/i18n/en.ts and
 * config/brand.ts, and the JSX text and string literals of app/app and
 * app/components. Comments and identifiers are not copy. Whole words,
 * case-insensitive. (This file is .mjs, which the repo-wide gate does not
 * scan, so the list can live here.)
 *
 * Prices and results are never projected either: no target price, no
 * "price after this round", no ROI or APY, no unrealized gain figure.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(APP, "..");

const AVOID = [
  "pump", "pumps", "pumping", "moon", "to the moon", "100x", "x100", "10x", "lfg", "wagmi", "send it", "ape in", "gem", "gems", "alpha",
  "jackpot", "win big", "winner", "winners", "you'll win", "you will win", "chance to win", "guaranteed", "guarantee", "risk-free", "risk free",
  "no-loss", "no loss", "free", "free money", "passive income", "profit", "profits", "earn", "earns", "earning", "number go up",
  "still early", "get in early", "be early", "don't miss out", "dont miss out", "last chance", "before it's too late", "before the price goes up",
  "gratuit", "roi", "apy", "price target", "target price", "price after this round", "unrealized", "market cap", "fdv",
];
const ALLOW = [/neither wins nor loses/gi];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RULES = AVOID.map((w) => ({ w, re: new RegExp(`(^|[^a-z0-9_])${esc(w).replace(/\\ /g, "[\\s\\u00a0]+")}(?=$|[^a-z0-9_])`, "i") }));

/** Strings and JSX text of a TS/TSX source, comments removed. */
function copyOf(src, tsx) {
  const out = [];
  let i = 0, n = src.length;
  let jsxDepth = 0;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; let s = ""; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === "\\") { s += src[i + 1] ?? ""; i += 2; continue; }
        if (q === "`" && src[i] === "$" && src[i + 1] === "{") { let depth = 1; i += 2; while (i < n && depth) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; i++; } s += " "; continue; }
        s += src[i++];
      }
      i++;
      out.push(s);
      continue;
    }
    if (tsx && c === ">") {
      // JSX text: from a tag's end to the next tag or expression, when it reads like prose
      let j = i + 1, s = "";
      while (j < n && src[j] !== "<" && src[j] !== "{" && src[j] !== "}" && src[j] !== ";" && src[j] !== "(" && src[j] !== ")" && src[j] !== "=") s += src[j++];
      if ((src[j] === "<" || src[j] === "{") && /[a-z]{2,}/i.test(s) && !/[&|?:]/.test(s)) out.push(s);
      i++;
      continue;
    }
    void jsxDepth;
    i++;
  }
  return out;
}

const hits = [];
function check(file, strings) {
  for (const raw of strings) {
    let s = raw;
    for (const a of ALLOW) s = s.replace(a, " ");
    if (/^(https?:|\/|#|[.\w-]+\.(?:glb|webp|png|svg|hdr|woff2|json|ts|tsx|mjs|js)$)/i.test(s.trim())) continue;
    for (const r of RULES) if (r.re.test(s)) hits.push(`${relative(ROOT, file)}  [${r.w}]  ${s.trim().slice(0, 120)}`);
  }
}

function walk(dir, fn) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!["node_modules", ".next", "art"].includes(f)) walk(p, fn); }
    else fn(p);
  }
}

// the dictionary and the brand: every string value
for (const f of [join(APP, "i18n", "en.ts"), join(ROOT, "config", "brand.ts")]) {
  const src = readFileSync(f, "utf8");
  const values = [];
  const re = /:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  let m;
  while ((m = re.exec(src))) values.push(m[1].slice(1, -1));
  check(f, values);
}
// rendered copy in the app and the components
for (const dir of [join(APP, "app"), join(APP, "components")]) {
  walk(dir, (p) => {
    if (!/\.(tsx|ts)$/.test(p)) return;
    check(p, copyOf(readFileSync(p, "utf8"), p.endsWith(".tsx")));
  });
}

if (hits.length) {
  console.error(`copy-lint: ${hits.length} hit(s)\n` + hits.join("\n"));
  process.exit(1);
}
console.log("copy-lint PASS: en.ts, brand.ts, app/app and app/components carry none of the avoid list");
