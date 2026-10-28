/**
 * TEST 13 - honesty of the copy, enforced at build time.
 *
 * Scans everything a user can read (the app, the embeddable component, the SDK
 * docs, the brand config, the user-facing docs) for words that promise a gain
 * or hide a risk. Any hit fails the build.
 *
 * /research is excluded on purpose: it quotes third-party sources verbatim.
 * This file excludes itself.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOTS = ["app", "sdk", "config", "docs", "README.md"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "target", ".git"]);
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".md", ".mdx", ".json", ".html", ".css"]);

/** Lower-case, matched as whole words (fr/en). */
const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /\brisk[- ]free\b/i, why: "promises absence of risk" },
  { re: /\bsans risque\b/i, why: "promises absence of risk" },
  { re: /\bgaranti(e|es|s)?\b/i, why: "promises a guarantee" },
  { re: /\bguaranteed?\b/i, why: "promises a guarantee" },
  { re: /\bfree money\b/i, why: "promises free money" },
  { re: /\bargent gratuit\b/i, why: "promises free money" },
  { re: /\bjackpot\b/i, why: "casino vocabulary" },
  { re: /\btu gagnes\b/i, why: "promises a win" },
  { re: /\btu vas gagner\b/i, why: "promises a win" },
  { re: /\byou(?:'ll| will) win\b/i, why: "promises a win" },
  { re: /\bchance (?:de gagner|to win)\b/i, why: "frames the draw as winning" },
  { re: /\bgratuit(e|es|s)?\b/i, why: "free" },
  { re: /\bwinner\b/i, why: "frames the draw as winning" },
  { re: /\bno[- ]loss\b/i, why: "promises absence of loss" },
];

/**
 * Stricter list for the embeddable component and its docs (sdk/): the bare
 * words "win" and "free" are banned there too. (The app keeps its `win.*`
 * i18n keys - short for window - and the brand line "neither wins nor loses".)
 */
const FORBIDDEN_SDK: { re: RegExp; why: string }[] = [
  { re: /\bwins?\b/i, why: "frames the draw as winning (sdk)" },
  { re: /\bfree\b/i, why: "free (sdk)" },
];

const hits: string[] = [];
function scan(path: string) {
  const st = statSync(path);
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(path.split(sep).pop()!)) return;
    for (const f of readdirSync(path)) scan(join(path, f));
    return;
  }
  const ext = path.slice(path.lastIndexOf("."));
  if (!EXTS.has(ext)) return;
  if (path.endsWith("forbidden-words.ts")) return;
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  const rel = relative(process.cwd(), path);
  const rules = /^sdk[\\/]/.test(rel) ? [...FORBIDDEN, ...FORBIDDEN_SDK] : FORBIDDEN;
  lines.forEach((line, i) => {
    for (const f of rules) if (f.re.test(line)) hits.push(`${rel}:${i + 1}  [${f.why}]  ${line.trim().slice(0, 120)}`);
  });
}

for (const r of ROOTS) { try { scan(r); } catch { /* missing root is fine */ } }

if (hits.length) {
  console.error(`FORBIDDEN WORDS: ${hits.length} hit(s)\n` + hits.join("\n"));
  process.exit(1);
}
console.log(`forbidden-words PASS: scanned ${ROOTS.join(", ")} - no forbidden promise found`);
