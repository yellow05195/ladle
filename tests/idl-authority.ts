/**
 * TEST 12 - no residual authority.
 *
 * Proves on the program's public surface that no instruction can move a stake,
 * modify a roll, change the law, the cap, the window length, the timeout or
 * the fee rate after creation, and that nothing can pause claim / sell_back /
 * refund.
 *
 * Two sources are checked:
 *  1. target/idl/ladle.json if an `anchor build` produced it (the authoritative
 *     surface); every instruction must be in the allow-list, every account
 *     field in the mutable-after-creation allow-list.
 *  2. programs/ladle/src/lib.rs always (works without the SBF toolchain):
 *     the instruction names declared in the #[program] module.
 *
 * Run: node --experimental-strip-types tests/idl-authority.ts
 */
import { existsSync, readFileSync } from "node:fs";

/** The complete, closed list of instructions. Anything else fails. */
const ALLOWED_INSTRUCTIONS = new Set([
  "create_integration", "create_market", "open_window", "enter", "seal", "request_vrf", "fulfill",
  "tally_page", "settle_page", "refund_window", "refund_entry", "claim", "sell_back", "sell",
  // permissionless rent recovery: the rent always goes to the entry owner / window opener, never to the caller
  "close_entry", "close_window",
]);

/** Names that must never appear as an instruction (or part of one). */
const FORBIDDEN_FRAGMENTS = [
  "set_", "update_", "pause", "unpause", "freeze", "thaw", "admin", "authority", "withdraw", "sweep",
  "cancel", "rescue", "emergency", "upgrade", "migrate", "override", "force", "owner_", "collect", "mint_to", "burn",
];

/** Instructions that must exist for the product to be honest (refund + exit paths). */
const REQUIRED = ["refund_window", "refund_entry", "claim", "sell_back", "request_vrf", "settle_page"];

/** Account fields that may legitimately change after creation. Everything else on these accounts is immutable. */
const MUTABLE_FIELDS: Record<string, Set<string>> = {
  Market: new Set(["curve", "window_count", "next_settle_index", "active_window", "has_active_window"]),
  Integration: new Set([]),
  Window: new Set(["state", "sealed_slot", "total_amount", "entry_count", "entries_commitment", "vrf_seed", "vrf_requested", "vrf_request", "vrf_requested_slot", "seed", "roll_sum",
    "tally_cursor", "settle_cursor", "cum_weight", "tokens_out", "fee_platform", "fee_host", "to_curve",
    // counter of entries closed by close_entry (rent recovery); gates close_window only
    "closed_entries"]),
  Entry: new Set(["roll", "share", "claimed", "refunded"]),
};
/** Fields that encode the law / economics and must be written only by the creating instruction. */
const LAW_FIELDS: Record<string, string[]> = {
  Market: ["window_slots", "vrf_timeout_slots", "max_entry_amount", "max_entry_bps", "entry_floor_amount", "quote_mint", "token_mint", "integration"],
  Integration: ["host_fee_bps", "host"],
  Entry: ["amount", "owner", "index"],
};

let failures = 0;
const fail = (m: string) => { failures++; console.error("FAIL:", m); };

// ---- 1. source surface
const lib = readFileSync("programs/ladle/src/lib.rs", "utf8");
const programMod = lib.slice(lib.indexOf("#[program]"));
const fns = Array.from(programMod.matchAll(/pub fn\s+([a-z_0-9]+)\s*(?:<[^>]*>)?\s*\(/g)).map((m) => m[1]!);
if (fns.length === 0) fail("no instructions found in lib.rs #[program] module");
for (const f of fns) {
  if (!ALLOWED_INSTRUCTIONS.has(f)) fail(`instruction not in the closed allow-list: ${f}`);
  for (const frag of FORBIDDEN_FRAGMENTS) if (f.includes(frag)) fail(`instruction name carries a power word "${frag}": ${f}`);
}
for (const r of REQUIRED) if (!fns.includes(r)) fail(`required exit path missing: ${r}`);

// no pause / admin flag anywhere in state, no global config account
const state = readFileSync("programs/ladle/src/state.rs", "utf8");
for (const bad of [/\bpaused?\b/i, /\badmin\b/i, /\bupdate_authority\b/i, /\bis_frozen\b/i]) {
  if (bad.test(state.replace(/\/\/.*$/gm, ""))) fail(`state.rs contains a forbidden field pattern ${bad}`);
}

// the program must not read chain entropy
const src = ["lib.rs", "law.rs", "state.rs", "vrf.rs"].map((f) => `programs/ladle/src/${f}`).filter(existsSync)
  .map((f) => readFileSync(f, "utf8")).join("\n");
const instrDir = "programs/ladle/src/instructions";
let instrSrc = "";
if (existsSync(instrDir)) {
  for (const f of (await import("node:fs")).readdirSync(instrDir)) instrSrc += readFileSync(`${instrDir}/${f}`, "utf8") + "\n";
}
const all = (src + instrSrc).replace(/\/\/.*$/gm, "");
for (const bad of ["recent_blockhashes", "SlotHashes", "slot_hashes", "unix_timestamp", "RecentBlockhashes", "epoch_schedule"]) {
  if (all.includes(bad)) fail(`program reads chain entropy / wall clock: ${bad}`);
}

// law fields are written only in the creating instruction (textual check: `market.<field> =` only in create_market.rs, etc.)
const files: Record<string, string> = {};
if (existsSync(instrDir)) for (const f of (await import("node:fs")).readdirSync(instrDir)) files[f] = readFileSync(`${instrDir}/${f}`, "utf8").replace(/\/\/.*$/gm, "");
const creators: Record<string, string> = { Market: "create_market", Integration: "create_integration", Entry: "enter" };
for (const [acct, fields] of Object.entries(LAW_FIELDS)) {
  const varName = acct.toLowerCase();
  for (const field of fields) {
    const re = new RegExp(`\\b${varName}\\.${field}\\s*=[^=]`);
    for (const [file, text] of Object.entries(files)) {
      if (re.test(text) && !file.includes(creators[acct]!)) fail(`${acct}.${field} is assigned outside ${creators[acct]} (in ${file})`);
    }
  }
}
// mutable allow-list: any `window.<x> =` / `market.<x> =` / `entry.<x> =` outside the creator must be in MUTABLE_FIELDS
for (const [acct, allowed] of Object.entries(MUTABLE_FIELDS)) {
  const varName = acct.toLowerCase();
  const re = new RegExp(`\\b${varName}\\.([a-z_0-9]+)\\s*=[^=]`, "g");
  for (const [file, text] of Object.entries(files)) {
    if (creators[acct] && file.includes(creators[acct]!)) continue;
    if (acct === "Window" && file.includes("open_window")) continue;
    for (const m of text.matchAll(re)) {
      if (!allowed.has(m[1]!)) fail(`${acct}.${m[1]} is written after creation in ${file} - not in the mutable allow-list`);
    }
  }
}

// ---- 2. IDL surface, when available
const idlPath = "target/idl/ladle.json";
if (existsSync(idlPath)) {
  const idl = JSON.parse(readFileSync(idlPath, "utf8"));
  const names: string[] = (idl.instructions ?? []).map((i: any) => i.name.replace(/([A-Z])/g, "_$1").toLowerCase());
  for (const n of names) if (!ALLOWED_INSTRUCTIONS.has(n)) fail(`IDL instruction not in allow-list: ${n}`);
  for (const r of REQUIRED) if (!names.includes(r)) fail(`IDL misses required instruction ${r}`);
  console.log(`IDL checked: ${names.length} instructions`);
} else {
  console.log("IDL not present (no SBF toolchain here) - checked the Rust source surface only");
}

if (failures) { console.error(`idl-authority FAIL: ${failures}`); process.exit(1); }
console.log(`idl-authority PASS: ${fns.length} instructions, all in the closed list; no admin, pause, authority or chain-entropy pattern; law fields written only at creation`);
