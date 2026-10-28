import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import * as sdk from "../sdk/src/index.ts";
import { instructionDiscriminator, INSTRUCTION_NAMES, accountDiscriminator, eventDiscriminator, EVENT_NAMES, PULLED_ERRORS } from "../sdk/src/index.ts";
const idl = JSON.parse(readFileSync("target/idl/ladle.json", "utf8"));
let bad = 0;
const hex = (u: ArrayLike<number>) => Buffer.from(Uint8Array.from(u)).toString("hex");
for (const ix of idl.instructions) { const s = hex(instructionDiscriminator(ix.name)); if (s !== hex(ix.discriminator)) { bad++; console.log("ix mismatch", ix.name); } }
if (idl.instructions.length !== INSTRUCTION_NAMES.length) { bad++; console.log("ix count", idl.instructions.length, INSTRUCTION_NAMES.length); }
for (const a of idl.accounts) if (hex(accountDiscriminator(a.name)) !== hex(a.discriminator)) { bad++; console.log("account mismatch", a.name); }
for (const e of idl.events) if (hex(eventDiscriminator(e.name)) !== hex(e.discriminator)) { bad++; console.log("event mismatch", e.name); }
if (idl.events.length !== EVENT_NAMES.length) { bad++; console.log("event count", idl.events.length, EVENT_NAMES.length); }
idl.errors.forEach((e: { code: number; name: string }, i: number) => { if (e.code !== 6000 + i || PULLED_ERRORS[i] !== e.name) { bad++; console.log("error mismatch", e.code, e.name, PULLED_ERRORS[i]); } });
if (idl.errors.length !== PULLED_ERRORS.length) { bad++; console.log("error count", idl.errors.length, PULLED_ERRORS.length); }
// account count of every sdk builder == the IDL (any account object: a Proxy hands out keys)
const anyKeys = new Proxy({}, { get: () => Keypair.generate().publicKey }) as any;
const params = { windowSlots: 92n, vrfTimeoutSlots: 900n, maxEntryAmount: 1n, maxEntryBps: 10_000, entryFloorAmount: 0n, name: "A", symbol: "B", uri: "" };
const built: Record<string, any> = {
  create_integration: sdk.createIntegrationIx(anyKeys, 0),
  create_market: sdk.createMarketIx(anyKeys, params),
  open_window: sdk.openWindowIx(anyKeys),
  enter: sdk.enterIx(anyKeys, 1n),
  seal: sdk.sealIx(anyKeys),
  request_vrf: sdk.requestVrfIx(anyKeys),
  fulfill: sdk.fulfillIx(anyKeys),
  tally_page: sdk.tallyPageIx(anyKeys, 0, 1, [Keypair.generate().publicKey]),
  settle_page: sdk.settlePageIx(anyKeys, 0, 1, [Keypair.generate().publicKey]),
  refund_window: sdk.refundWindowIx(anyKeys),
  refund_entry: sdk.refundEntryIx(anyKeys),
  claim: sdk.claimIx(anyKeys),
  sell_back: sdk.sellBackIx(anyKeys, 1n),
  sell: sdk.sellIx(anyKeys, 1n),
  close_entry: sdk.closeEntryIx(anyKeys),
  close_window: sdk.closeWindowIx(anyKeys),
};
const pages = new Set(["tally_page", "settle_page"]); // + 1 remaining Entry account in the built page [0, 1)
for (const ix of idl.instructions) {
  const b = built[ix.name];
  if (!b) { bad++; console.log("no sdk builder checked for", ix.name); continue; }
  const expected = ix.accounts.length + (pages.has(ix.name) ? 1 : 0);
  if (b.keys.length !== expected) { bad++; console.log(`account count ${ix.name}: sdk ${b.keys.length} idl ${expected}`); }
  ix.accounts.forEach((a: any, i: number) => {
    if (!!a.writable !== b.keys[i].isWritable && !(a.optional)) { bad++; console.log(`writable ${ix.name}.${a.name}: sdk ${b.keys[i].isWritable} idl ${!!a.writable}`); }
    if (!!a.signer !== b.keys[i].isSigner && !(a.optional)) { bad++; console.log(`signer ${ix.name}.${a.name}: sdk ${b.keys[i].isSigner} idl ${!!a.signer}`); }
  });
}
console.log(bad ? `IDL/SDK MISMATCH: ${bad}` : `IDL/SDK consistent: ${idl.instructions.length} instructions, ${idl.accounts.length} accounts, ${idl.events.length} events, ${idl.errors.length} errors`);
process.exit(bad ? 1 : 0);
