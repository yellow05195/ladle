'use strict';
// Is the Switchboard On-Demand program still active on mainnet after the 2026-09-25 shutdown?
const { rpc, b58decode, ixDisc, flattenInstructions } = require('./rpc.js');
const fs = require('node:fs');
const PROGRAM = 'SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv';
const MAIN = 'https://api.mainnet-beta.solana.com';
const DISCS = Object.fromEntries(['randomness_init', 'randomness_commit', 'randomness_reveal', 'pull_feed_submit_response', 'pull_feed_submit_response_many', 'oracle_heartbeat', 'oracle_heartbeat_v2', 'guardian_quote_verify'].map(n => [ixDisc(n), n]));
(async () => {
  const sigs = await rpc('getSignaturesForAddress', [PROGRAM, { limit: 60 }], { endpoint: MAIN });
  const out = { checked_at: new Date().toISOString(), newest: sigs[0] && { slot: sigs[0].slot, time: new Date(sigs[0].blockTime * 1000).toISOString() }, oldest_of_60: sigs[59] && { slot: sigs[59].slot, time: new Date(sigs[59].blockTime * 1000).toISOString() }, kinds: {}, sample: [] };
  for (const s of sigs.slice(0, 20)) {
    const tx = await rpc('getTransaction', [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 1 }]);
    if (!tx) continue;
    const { instructions } = flattenInstructions(tx);
    const names = [];
    for (const ix of instructions) if (ix.programId === PROGRAM) { let d; try { d = b58decode(ix.data).subarray(0, 8).toString('hex'); } catch { continue; } names.push(DISCS[d] || ('unknown:' + d)); }
    const logs = (tx.meta.logMessages || []).filter(l => /Instruction:/.test(l)).map(l => l.replace(/^Program log: /, ''));
    for (const n of names) out.kinds[n] = (out.kinds[n] || 0) + 1;
    out.sample.push({ sig: s.signature, slot: tx.slot, time: new Date(tx.blockTime * 1000).toISOString(), err: tx.meta.err, names, logs: logs.slice(0, 4) });
  }
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync('../data/sb-recent-activity.json', JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
