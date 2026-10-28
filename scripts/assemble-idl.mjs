/**
 * Assemble the Anchor IDL from the sections printed by the program's
 * `idl-build` test, the same way the Anchor CLI does (`anchor idl build`),
 * without the CLI (which insists on installing a pinned Solana release).
 *
 *   cd programs/ladle
 *   set ANCHOR_IDL_BUILD_PROGRAM_PATH=<this dir>  &  set ANCHOR_IDL_BUILD_SKIP_LINT=TRUE
 *   cargo test __anchor_private_print_idl --features idl-build -- --show-output --quiet --test-threads=1 > idl-raw.txt
 *   node scripts/assemble-idl.mjs idl-raw.txt target/idl/ladle.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [, , rawPath, outPath] = process.argv;
if (!rawPath || !outPath) throw new Error("usage: assemble-idl.mjs <raw> <out.json>");
const lines = readFileSync(rawPath, "utf8").replace(/^﻿/, "").split(/\r?\n/);

let address = null, program = null;
const events = [], types = new Map(), errorSets = [];
for (let i = 0; i < lines.length; i++) {
  const m = /^--- IDL begin (\w+) ---$/.exec(lines[i].trim());
  if (!m) continue;
  const kind = m[1];
  const body = [];
  for (i++; i < lines.length && !/^--- IDL end \w+ ---$/.test(lines[i].trim()); i++) body.push(lines[i]);
  const text = body.join("\n").trim();
  if (kind === "address") address = text;
  else if (kind === "program") program = JSON.parse(text);
  else if (kind === "errors") errorSets.push(JSON.parse(text));
  else if (kind === "event") {
    const e = JSON.parse(text);
    events.push(e.event);
    for (const t of e.types ?? []) types.set(t.name, t);
  } else throw new Error(`unknown IDL section ${kind}`);
}
if (!program || !address) throw new Error("missing program or address section");

for (const t of program.types ?? []) types.set(t.name, t);

// The test prints full paths ("ladle::state::Market"); the Anchor CLI shortens
// every name to its last segment when that is unambiguous, and computes the
// discriminators from the short name. Do the same everywhere, references included.
const short = (n) => (typeof n === "string" && n.includes("::") ? n.split("::").pop() : n);
const shorten = (v) => {
  if (Array.isArray(v)) return v.map(shorten);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = (k === "name" || k === "defined") && typeof x === "string" ? short(x) : (k === "defined" && x && typeof x === "object" && typeof x.name === "string" ? { ...shorten(x), name: short(x.name) } : shorten(x));
    return o;
  }
  return v;
};
// the program's own #[error_code] enum is the one whose codes start at 6000
const errors = errorSets.find((s) => s.length && s[0].code === 6000) ?? errorSets[0] ?? [];
const idl = shorten({
  ...program,
  address: address.replace(/[\\"]/g, ""),
  events: events.sort((a, b) => a.name.localeCompare(b.name)),
  errors,
  types: [...types.values()].sort((a, b) => short(a.name).localeCompare(short(b.name))),
});
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(idl, null, 2) + "\n");
console.log(`IDL ${idl.metadata?.name} ${idl.address}: ${idl.instructions.length} instructions, ${idl.accounts?.length ?? 0} accounts, ${idl.events.length} events, ${idl.errors.length} errors, ${idl.types.length} types -> ${outPath}`);
