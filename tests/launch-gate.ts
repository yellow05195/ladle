/**
 * TEST - the site's launch gate (app/next.config.ts), third review.
 *
 * A mainnet chain build must stop while the site still states something
 * false on an upgradeable mainnet program. The third review found what the
 * gate missed: the security page's own copy (no mainnet without a legal
 * answer, revocation or a timelock chosen before mainnet, "no third option",
 * some Token-2022 mints accepted, the seed fixed at seal), a seed formula with
 * the old domain tag, and a round length COMPUTED from the demo's research
 * figure (92 slots, about 20 s) that no string pattern can see.
 *
 *  1. On the real site with every mainnet variable set, none of those is left,
 *     and nothing calls the demo's research figures outside their two files.
 *  2. Without NEXT_PUBLIC_LADLE_WINDOW_SLOTS / _VRF_TIMEOUT_SLOTS the gate
 *     names both (the pages would state the demo's round).
 *  3. On a fake site carrying the old copy, the old formula, calls to
 *     windowSlots() / vrfTimeoutSlots() (one inside a template literal) and
 *     settings that disagree with config/deployments/mainnet-beta.json, the
 *     gate names every one, and nothing in a comment or a string.
 *
 * Run: node --experimental-strip-types tests/launch-gate.ts
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeOf, launchGate } from "../app/next.config.ts";

const REPO = "https://github.com/owner/ladle";
const SETTINGS = { NEXT_PUBLIC_LADLE_WINDOW_SLOTS: "560", NEXT_PUBLIC_LADLE_VRF_TIMEOUT_SLOTS: "900" };
const REWRITTEN = ["risks.r1", "sec.authIntro", "sec.noThird", "sec.token2022", "sec.randIntro"];
let checks = 0;
const ok = (cond: boolean, what: string, items: string[] = []) => {
  assert.ok(cond, `${what}\n  ${items.join("\n  ")}`);
  checks++;
};

// 1. the real site
const appDir = fileURLToPath(new URL("../app/", import.meta.url));
const real = launchGate(appDir, { NEXT_PUBLIC_LADLE_REPO: REPO, ...SETTINGS });
for (const k of REWRITTEN) ok(!real.some((l) => l.includes(` ${k}: `)), `${k} still has its pre-launch text`, real);
ok(!real.some((l) => /calls (windowSlots|vrfTimeoutSlots)\(\)/.test(l)), "a page states the demo's round length", real);
ok(!real.some((l) => /pulled:vrf|no third option|nothing goes to mainnet|Token-2022 mint (carrying|with)/i.test(l)), "the security page's pre-launch copy is back", real);
ok(!real.some((l) => l.startsWith("NEXT_PUBLIC_")), "a variable is flagged although every one is set", real);

// 2. the market's settings missing
const bare = launchGate(appDir, { NEXT_PUBLIC_LADLE_REPO: REPO });
ok(bare.some((l) => l.startsWith("NEXT_PUBLIC_LADLE_WINDOW_SLOTS is unset")), "a missing window_slots passes", bare);
ok(bare.some((l) => l.startsWith("NEXT_PUBLIC_LADLE_VRF_TIMEOUT_SLOTS is unset")), "a missing vrf_timeout_slots passes", bare);
ok(bare.length === real.length + 2, `unset settings add ${bare.length - real.length} items, not 2`, bare);
const junk = launchGate(appDir, { NEXT_PUBLIC_LADLE_REPO: REPO, NEXT_PUBLIC_LADLE_WINDOW_SLOTS: "560 slots", NEXT_PUBLIC_LADLE_VRF_TIMEOUT_SLOTS: "0" });
ok(junk.filter((l) => /^NEXT_PUBLIC_LADLE_(WINDOW|VRF_TIMEOUT)_SLOTS is "/.test(l)).length === 2, "a malformed setting passes", junk);

// 3. a fake site with everything the third review found
const root = mkdtempSync(join(tmpdir(), "ladle-gate-"));
try {
  const app = join(root, "app");
  for (const d of ["i18n", "components", "lib", "app", join("config", "deployments")]) mkdirSync(join(d.startsWith("config") ? root : app, d), { recursive: true });
  // the pre-launch text of the five keys rewritten in the third review, verbatim
  writeFileSync(join(app, "i18n", "en.ts"), [
    "export const en = {",
    `  "risks.r1": "The legal question is not resolved. Until a written professional answer exists, nothing goes to mainnet.",`,
    `  "sec.authIntro": "Before mainnet one of the two will be chosen and stated here and on the home page. Until then, the operator can still change the program.",`,
    `  "sec.noThird": "There is no third option.",`,
    `  "sec.randIntro": "ORAO VRF. The seed is fixed at seal from sealed data; every roll is derived from it, the owner and the entry index, recomputable by anyone.",`,
    `  "sec.token2022": "create_market rejects any quote mint with a freeze authority, and any Token-2022 mint carrying a transfer fee, a transfer hook or a permanent delegate: each would break the exact accounting or let a third party block the escrow.",`,
    "};",
    "",
  ].join("\n"));
  writeFileSync(join(app, "components", "Round.tsx"), [
    `import { roundSlots, vrfTimeoutSlots, windowSlots } from "../lib/measurements";`,
    `// windowSlots() in a comment is prose`,
    `const s = "windowSlots() in a string is copy";`,
    `export const a = () => <p>{t("how.r1", { slots: windowSlots().value })}</p>;`,
    "export const b = `refund after ${vrfTimeoutSlots().value} slots`;",
    `export const c = roundSlots().value;`,
    "",
  ].join("\n"));
  writeFileSync(join(app, "lib", "measurements.ts"), "export function windowSlots() { return 92; }\nexport function vrfTimeoutSlots() { return 900; }\nexport const x = windowSlots();\n");
  writeFileSync(join(app, "lib", "data-demo.ts"), "export const DEMO_SLOTS = windowSlots();\n");
  writeFileSync(join(app, "app", "formula.tsx"), 'export const f = [`vrf_seed = sha256("pulled:vrf:v1"`, `    ‖ window`].join("\\n");\n');
  writeFileSync(join(root, "config", "deployments", "mainnet-beta.json"), JSON.stringify({ market: "RecordedMarket1111111111111111111111111111111", params: { windowSlots: "560", vrfTimeoutSlots: "900" } }));
  const env = { NEXT_PUBLIC_LADLE_REPO: REPO, NEXT_PUBLIC_LADLE_WINDOW_SLOTS: "92", NEXT_PUBLIC_LADLE_VRF_TIMEOUT_SLOTS: "900", NEXT_PUBLIC_LADLE_MARKET: "OtherMarket11111111111111111111111111111111" };
  const fake = launchGate(app, env);
  for (const k of REWRITTEN) ok(fake.some((l) => l.includes(` ${k}: `) && l.endsWith("(still its pre-launch text)")), `the old ${k} passes`, fake);
  // the phrase net too, on its own (a key renamed or copied elsewhere keeps the phrase, not the pin)
  const phrase: [number, string][] = [
    [2, "says mainnet waits for a legal answer"],
    [3, "says mainnet waits for a legal answer"],
    [4, "says the authority will be revoked or timelocked"],
    [6, "says some Token-2022 quote mints are accepted (every"],
  ];
  for (const [line, why] of phrase) ok(fake.some((l) => l.startsWith(`i18n/en.ts:${line} "`) && l.includes(`: ${why}`)), `en.ts line ${line} passes the phrase net`, fake);
  ok(fake.some((l) => l.startsWith("app/formula.tsx:1 ") && l.includes("old domain tag")), "the pulled:vrf formula passes", fake);
  const calls = fake.filter((l) => l.startsWith("components/Round.tsx:"));
  ok(calls.length === 2, `Round.tsx: ${calls.length} items, expected the two calls (not the comment, the string or roundSlots)`, fake);
  ok(calls.some((l) => l.startsWith("components/Round.tsx:4 calls windowSlots()")), "windowSlots() in a page passes", fake);
  ok(calls.some((l) => l.startsWith("components/Round.tsx:5 calls vrfTimeoutSlots()")), "vrfTimeoutSlots() in a template expression passes", fake);
  ok(fake.some((l) => l.startsWith("lib/data-demo.ts:1 calls windowSlots()")), "windowSlots() outside its two files passes", fake);
  ok(!fake.some((l) => l.startsWith("lib/measurements.ts:")), "lib/measurements.ts is flagged for its own figures", fake);
  ok(fake.some((l) => l.startsWith("NEXT_PUBLIC_LADLE_WINDOW_SLOTS is 92, config/deployments/mainnet-beta.json records windowSlots = 560")), "a window_slots that is not the market's passes", fake);
  ok(!fake.some((l) => l.startsWith("NEXT_PUBLIC_LADLE_VRF_TIMEOUT_SLOTS")), "a vrf_timeout_slots equal to the record is flagged", fake);
  ok(fake.some((l) => l.startsWith("NEXT_PUBLIC_LADLE_MARKET is OtherMarket")), "a market other than the record's passes", fake);
} finally {
  rmSync(root, { recursive: true, force: true });
}

// codeOf keeps the code of template expressions and the line count, blanks comments and strings
const src = 'a("windowSlots()") // windowSlots()\n/* windowSlots() */ b(`x ${windowSlots()} y`)\n`multi\nline ${c("windowSlots()")}`';
const code = codeOf(src);
ok(code.split("\n").length === src.split("\n").length, "codeOf changes the line count");
ok((code.match(/windowSlots\(/g) ?? []).length === 1 && code.split("\n")[1]!.includes("windowSlots("), `codeOf: ${JSON.stringify(code)}`);

console.log(`launch-gate PASS: ${checks} checks (the real site with and without the market's settings, a fake site with every third-review case)`);
