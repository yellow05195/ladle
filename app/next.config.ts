import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const nextConfig: NextConfig = {
  // The sdk is a workspace package shipped as TypeScript source; compile it with the app.
  transpilePackages: ["@pulled/sdk"],
  // The app imports research JSON and the sdk from the monorepo root.
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  async headers() {
    return [
      {
        // The embed route is meant to live inside third-party iframes.
        // No X-Frame-Options anywhere; frame-ancestors * only here.
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

/**
 * Launch gate: what the site says about the program before launch. A
 * production build that reads mainnet (chain mode) stops while any of it is
 * still there: real-money players would read that nobody can change the
 * program while its upgrade authority can replace it at any moment
 * (SECURITY.md section 2), that it is not deployed, that the draw's rules can
 * never change, or see 20-second rounds next to 2-minute ones. Five nets
 * (second review: the first gate read four patterns in en.ts only; third
 * review: computed round lengths and the security page's own copy):
 *
 *  1. PRE_LAUNCH_KEYS: en.ts keys whose text is pinned here by its sha256.
 *     The build stops while a key still has that exact text: rewrite it for
 *     an upgradeable mainnet program (what the deployed code does, and that
 *     the upgrade authority can replace it).
 *  2. PRE_LAUNCH_COPY: phrases that are false on an upgradeable mainnet,
 *     searched in every string of i18n/en.ts, components/ (the About,
 *     Security and home tour copy in components/hall/sections/copy.ts
 *     included), app/ and lib/.
 *  3. The repository link (NEXT_PUBLIC_LADLE_REPO) must be the real one, not
 *     the placeholder organisation the "verify the law" links point to.
 *  4. The market's settings: NEXT_PUBLIC_LADLE_WINDOW_SLOTS and
 *     NEXT_PUBLIC_LADLE_VRF_TIMEOUT_SLOTS must be set, and equal to
 *     config/deployments/mainnet-beta.json when that record exists. The
 *     round length and refund delay the pages state are computed from them
 *     (lib/measurements.ts roundSlots, roundTimeoutSlots), so no string
 *     pattern can see a wrong one.
 *  5. RESEARCH_ONLY_CALLS: the research figures behind the demo's 92-slot
 *     (~20 s) rounds, windowSlots() and vrfTimeoutSlots(), are called only
 *     where the demo or the research needs them; a page that calls them
 *     states the demo's round, not the market's.
 *
 * Any production build in chain mode also needs NEXT_PUBLIC_SOLANA_CLUSTER
 * set explicitly (the page checks its RPC's genesis hash against it too).
 */
export const PRE_LAUNCH_COPY: [RegExp, string][] = [
  [/\bnot (yet )?deployed\b|until the program is deployed|while the program is tested/i, "says the program is not deployed"],
  [/\brevok(e|ed|es|ing|ation)\b/i, "says the upgrade authority is or will be revoked (it stays upgradeable)"],
  [/\btimelock\b/i, "promises a timelock on upgrades (there is none)"],
  [/after (the )?audit|not audited|audited yet/i, "plans around an audit (there is none)"],
  [/\b92 slots\b|\bslot 92\b|roughly 20 s|twenty seconds/i, "gives the 92-slot (~20 s) rounds of the test market (mainnet rounds: 560 slots, ~2 min)"],
  [/not compiled for SBF|no SBF build|never executed on a (validator|cluster)|no validator run/i, "says the program never ran"],
  [/us included|including us|\bnobody (can|picks|pick)\b|what nobody can do/i, "says nobody, the operator included, can do it: the upgrade authority can replace the program"],
  [/placeholder program id|estimated, not measured/i, "describes the build before deployment"],
  [/\bdemo data in your browser\b/i, "says the site runs on demo data"],
  [/nothing goes to mainnet|will be chosen and stated|before mainnet,? one of the two/i, "says mainnet waits for a legal answer or an authority decision (the owner launches upgradeable, without a legal opinion)"],
  [/\bno third option\b/i, "says the authority will be revoked or timelocked (it stays upgradeable)"],
  [/\bpulled:vrf\b/, "gives the seed with the old domain tag (the program hashes \"ladle:vrf:v1\", then \"ladle:vrf:req\" with the request's salt)"],
  [/\bToken-2022 mint (carrying|with)\b/i, "says some Token-2022 quote mints are accepted (every Token-2022 mint is refused)"],
];

/** The research figures of the demo's round (lib/measurements.ts), and the only files allowed to call them. */
export const RESEARCH_ONLY_CALLS: [RegExp, string[], string][] = [
  [/\bwindowSlots\s*\(/, ["lib/measurements.ts", "lib/data/demo-plan.ts"], "states the demo's 92-slot (~20 s) round: use roundSlots(), the market's window_slots"],
  [/\bvrfTimeoutSlots\s*\(/, ["lib/measurements.ts"], "states G2's refund delay: use roundTimeoutSlots(), the market's vrf_timeout_slots"],
];

/** sha256 (hex, first 16) of the pre-launch text of en.ts keys that must be rewritten for mainnet, and why. */
export const PRE_LAUNCH_KEYS: Record<string, [string, string]> = {
  "cannot.notDeployed": ["ae97e8ca8c285d5d", "says NOT YET DEPLOYED"],
  "hud.connectNote": ["ae97e8ca8c285d5d", "says NOT YET DEPLOYED"],
  "common.notDeployed": ["b307cbcb79f05079", "says NOT YET DEPLOYED"],
  "cannot.title": ["ce31817689778e96", "lists what nobody can do: the upgrade authority can do all of it"],
  "cannot.sub": ["92e2f083f01d8a79", "says not the house, not a keeper, not us: the upgrade authority can"],
  "cannot.authority": ["53de054076a84e5d", "describes the update authority before launch"],
  "cannot.authorityStatus": ["f12b8edd9a1ae086", "promises revocation after an audit or a timelock"],
  "house.cannotTitle": ["23b14d598a736808", "says nobody can: the upgrade authority can"],
  "house.note": ["1974a3af11511fe0", "says the update authority is not yet deployed"],
  "status.programValue": ["174044e4df44dc54", "says not compiled for SBF, not deployed"],
  "status.deployValue": ["140bedbf9c3f6d56", "says no deployment"],
  "faq.a6": ["dbaee77f4b509344", "says nobody once revoked after the audit, and not deployed"],
  "about.optA": ["17ae09858aad6733", "recommends revocation after the audit as the plan"],
  "about.optB": ["276e5d79828999b1", "offers a 72-hour timelock as the alternative"],
  "sec.lead": ["c8e424de501b2106", "says not deployed, never executed"],
  "sec.optAWhy": ["03f10603b80834cd", "argues for revocation, which is not the launch configuration"],
  "sec.optBWhy": ["8139bc3747f95b00", "presents the timelock as the interim stage"],
  "sec.lim1": ["e5d90dc5b7a57156", "says no SBF build, no devnet test"],
  "sec.lim3": ["e088314cead2bdb6", "says compute budgets are estimated"],
  "sec.lim4": ["7caea9b1105800e0", "says placeholder program id and treasury"],
  "glossary.windowDef": ["c339517d9d27dceb", "gives 92-slot, ~20 s rounds"],
  "project.p2": ["da35e891b6a43904", "says the round seals at slot 92; nobody can choose the outcome (the upgrade authority can replace the program)"],
  "faq.a2": ["970e6a06ae0e5ff0", "says nobody can pick a roll (the upgrade authority can replace the program)"],
  "chat.sysRequest": ["d8aadf61ac353193", "says nobody can choose the outcome (the upgrade authority can replace the program)"],
  "h.faq.r4a": ["2995c00fe4d43b43", "says nobody can set the draw (the upgrade authority can replace the program)"],
  "footer.status": ["82c1325801c23472", "says demo data until the program is deployed"],
  "footer.demo": ["24bc67f8781539a5", "says demo data until the program is deployed"],
  // third review: rewritten already; pinned so the old text cannot come back
  "risks.r1": ["131a09be75b3d2af", "says nothing goes to mainnet without a legal answer (the owner launches without one)"],
  "sec.authIntro": ["dc418385d7990c25", "says revocation or a timelock will be chosen before mainnet (it stays upgradeable)"],
  "sec.noThird": ["8bad64ddb7b009e7", "says there is no third option (upgradeable is the one taken)"],
  "sec.token2022": ["7b9d9a2ecf22cb15", "says some Token-2022 quote mints are accepted (all are refused)"],
  "sec.randIntro": ["68dc23d19db8fa60", "says the seed is fixed at seal (the first request salts it)"],
};

/** Placeholder of the repository link (lib/links.ts REPO_PLACEHOLDER). */
const REPO_PLACEHOLDER = "https://github.com/pulled-fun/pulled";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);

/** `key -> value` of en.ts (one `"key": "value",` per line), with the line number. */
export function enEntries(source: string): Map<string, { value: string; line: number }> {
  const out = new Map<string, { value: string; line: number }>();
  source.split(/\r?\n/).forEach((l, i) => {
    const m = /^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$/.exec(l);
    if (m) out.set(m[1]!, { value: m[2]!, line: i + 1 });
  });
  return out;
}

/** The string literals of a source file, comments left out, with their line numbers. */
export function stringsOf(source: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  let i = 0, line = 1;
  const n = source.length;
  while (i < n) {
    const c = source[i]!, d = source[i + 1];
    if (c === "\n") { line++; i++; continue; }
    if (c === "/" && d === "/") { while (i < n && source[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(source[i] === "*" && source[i + 1] === "/")) { if (source[i] === "\n") line++; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const start = line;
      let s = "";
      i++;
      while (i < n && source[i] !== c) {
        if (source[i] === "\\") { s += source[i + 1] ?? ""; i += 2; continue; }
        if (source[i] === "\n") { if (c !== "`") break; line++; }
        s += source[i++];
      }
      i++;
      out.push({ text: s, line: start });
      continue;
    }
    i++;
  }
  return out;
}

function sources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!["node_modules", ".next", "art", "screenshots"].includes(f)) out.push(...sources(p)); }
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

/**
 * A source file with its comments and the text of its string literals
 * blanked (newlines kept, so line numbers hold): the code alone, the
 * `${...}` expressions of template literals included.
 */
export function codeOf(source: string): string {
  const n = source.length;
  let out = "";
  const keep = (s: string) => { out += s; };
  const blank = (s: string) => { out += s.replace(/[^\n]/g, " "); };
  // code from i to the end, or (inExpr) to the `}` closing a template expression; returns the index after it
  const code = (from: number, inExpr: boolean): number => {
    let i = from, depth = 0;
    while (i < n) {
      const c = source[i]!, d = source[i + 1];
      if (c === "/" && d === "/") { let j = i; while (j < n && source[j] !== "\n") j++; blank(source.slice(i, j)); i = j; continue; }
      if (c === "/" && d === "*") { const e = source.indexOf("*/", i + 2); const j = e < 0 ? n : e + 2; blank(source.slice(i, j)); i = j; continue; }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n && source[j] !== c && source[j] !== "\n") j += source[j] === "\\" ? 2 : 1;
        j = Math.min(j + 1, n);
        blank(source.slice(i, j)); i = j; continue;
      }
      if (c === "`") { i = template(i); continue; }
      if (inExpr && c === "{") depth++;
      if (inExpr && c === "}") { if (depth === 0) { keep(c); return i + 1; } depth--; }
      keep(c); i++;
    }
    return i;
  };
  const template = (from: number): number => {
    let i = from + 1;
    blank("`");
    while (i < n && source[i] !== "`") {
      if (source[i] === "\\") { blank(source.slice(i, i + 2)); i += 2; continue; }
      if (source[i] === "$" && source[i + 1] === "{") { keep("${"); i = code(i + 2, true); continue; }
      blank(source[i]!); i++;
    }
    if (i < n) { blank("`"); i++; }
    return i;
  };
  code(0, false);
  return out;
}

/** The market's settings the pages state (gate net 4): `[env name, deployment record field, what]`. */
const MARKET_SETTINGS: [string, string, string][] = [
  ["NEXT_PUBLIC_LADLE_WINDOW_SLOTS", "windowSlots", "the round length the security page and the checks state"],
  ["NEXT_PUBLIC_LADLE_VRF_TIMEOUT_SLOTS", "vrfTimeoutSlots", "the refund delay the security page states"],
];

/** Every pre-launch statement left in the site, as `file:line what: why`. */
export function launchGate(appDir: string, env: Readonly<Record<string, string | undefined>>): string[] {
  const found: string[] = [];
  const enPath = join(appDir, "i18n", "en.ts");
  const entries = enEntries(readFileSync(enPath, "utf8"));
  for (const [key, [pinned, why]] of Object.entries(PRE_LAUNCH_KEYS)) {
    const e = entries.get(key);
    if (e && pinned && sha(e.value) === pinned) found.push(`i18n/en.ts:${e.line} ${key}: ${why} (still its pre-launch text)`);
  }
  const files = [enPath, ...sources(join(appDir, "components")), ...sources(join(appDir, "app")), ...sources(join(appDir, "lib"))];
  for (const file of files) {
    const rel = relative(appDir, file).replace(/\\/g, "/");
    const source = readFileSync(file, "utf8");
    for (const { text, line } of stringsOf(source)) {
      for (const [re, why] of PRE_LAUNCH_COPY) {
        if (re.test(text)) { found.push(`${rel}:${line} "${text.slice(0, 70)}${text.length > 70 ? "..." : ""}": ${why}`); break; }
      }
    }
    const code = codeOf(source).split("\n");
    for (const [re, allowed, why] of RESEARCH_ONLY_CALLS) {
      if (allowed.includes(rel)) continue;
      code.forEach((l, i) => { const m = re.exec(l); if (m) found.push(`${rel}:${i + 1} calls ${m[0].replace(/\s+/g, "")}): ${why}`); });
    }
  }
  // net 4: the market's settings, which the pages compute their round length and refund delay from
  const recordPath = join(appDir, "..", "config", "deployments", "mainnet-beta.json");
  let record: { market?: string; params?: Record<string, unknown> } | null = null;
  if (existsSync(recordPath)) {
    try { record = JSON.parse(readFileSync(recordPath, "utf8")); }
    catch (e) { found.push(`config/deployments/mainnet-beta.json cannot be read (${(e as Error).message}): the market's settings cannot be checked`); }
  }
  const marketEnv = (env.NEXT_PUBLIC_LADLE_MARKET ?? "").trim();
  if (record?.market && marketEnv && record.market !== marketEnv) {
    found.push(`NEXT_PUBLIC_LADLE_MARKET is ${marketEnv}, config/deployments/mainnet-beta.json records ${record.market}: the slot settings below are checked against the record, not against the market this site reads`);
  }
  for (const [name, field, what] of MARKET_SETTINGS) {
    const raw = (env[name] ?? "").trim();
    const value = /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : null;
    if (value == null) {
      found.push(`${name} is ${raw ? `"${raw}"` : "unset"}: ${what} would be the demo's (set it to params.${field} of config/deployments/mainnet-beta.json; scripts/mainnet-up.ps1 writes it)`);
      continue;
    }
    const recorded = record?.params?.[field];
    if (record && String(recorded) !== String(value)) {
      found.push(`${name} is ${value}, config/deployments/mainnet-beta.json records ${field} = ${String(recorded)}: ${what} would not be the market's`);
    }
  }
  const repo = (env.NEXT_PUBLIC_LADLE_REPO ?? "").trim().replace(/\/+$/, "");
  if (!repo || repo === REPO_PLACEHOLDER || !/^https:\/\//.test(repo) || /replace/i.test(repo)) {
    found.push(`NEXT_PUBLIC_LADLE_REPO is ${repo ? `"${repo}"` : "unset"}: the security, odds and verify links would point at the placeholder ${REPO_PLACEHOLDER}`);
  }
  return [...new Set(found)];
}

/** The pins of PRE_LAUNCH_KEYS from the current en.ts (to refresh them on purpose: node scripts, never at build). */
export function pinsOf(appDir: string): Record<string, string> {
  const entries = enEntries(readFileSync(join(appDir, "i18n", "en.ts"), "utf8"));
  const out: Record<string, string> = {};
  for (const key of Object.keys(PRE_LAUNCH_KEYS)) { const e = entries.get(key); if (e) out[key] = sha(e.value); }
  return out;
}

/** `PHASE_PRODUCTION_BUILD` of next/constants (kept literal: plain Node can load this file to test the gate). */
const PHASE_PRODUCTION_BUILD = "phase-production-build";

export default function config(phase: string): NextConfig {
  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "").trim().toLowerCase();
  const chain = process.env.NEXT_PUBLIC_DATA_SOURCE === "chain";
  if (phase === PHASE_PRODUCTION_BUILD && chain && !["mainnet-beta", "mainnet", "devnet"].includes(cluster)) {
    // unset used to read as devnet: a mainnet RPC would then take real SOL under a "test SOL" footer and devnet explorer links
    throw new Error(`chain build stopped: NEXT_PUBLIC_SOLANA_CLUSTER must be set to mainnet-beta or devnet (it is ${cluster ? `"${cluster}"` : "unset"})`);
  }
  const mainnetChain = chain && (cluster === "mainnet-beta" || cluster === "mainnet");
  if (phase === PHASE_PRODUCTION_BUILD && mainnetChain) {
    const stale = launchGate(here, process.env);
    if (stale.length) {
      throw new Error(`mainnet build stopped: the site still describes the program before launch (next.config.ts, launch gate):\n  ${stale.join("\n  ")}`);
    }
  }
  return nextConfig;
}
