// Measure ORAO VRF request -> fulfill latency from mainnet history.
// Usage: node measure-orao.js [targetPairs=220] [maxSignatures=6000]
// Output: ../data/orao-pairs.csv, ../data/orao-summary.json, ../data/orao-raw-txs.jsonl
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { rpc, b58decode, ixDisc, flattenInstructions, summarize, stats, ENDPOINTS } = require('./rpc.js');

const PROGRAM = 'VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y';
const DATA = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });

const TARGET_PAIRS = Number(process.argv[2] || 220);
const MAX_SIGS = Number(process.argv[3] || 6000);

const REQUEST_DISCS = { [ixDisc('request')]: 'request', [ixDisc('request_v2')]: 'request_v2' };
const FULFILL_DISCS = { [ixDisc('fulfill')]: 'fulfill', [ixDisc('fulfill_v2')]: 'fulfill_v2' };
// Well-known accounts that are never the randomness account
const SYSTEM = new Set([
  '11111111111111111111111111111111',
  'Sysvar1nstructions1111111111111111111111111',
  'SysvarRent111111111111111111111111111111111',
  'Ed25519SigVerify111111111111111111111111111',
  'ComputeBudget111111111111111111111111111111',
  PROGRAM,
]);

async function main() {
  console.log(`[orao] endpoints: ${ENDPOINTS.join(', ')}`);
  // 1. collect signatures (newest first), paginated
  const sigs = [];
  let before;
  while (sigs.length < MAX_SIGS) {
    const page = await rpc('getSignaturesForAddress', [PROGRAM, { limit: 1000, before, commitment: 'confirmed' }]);
    if (!page || !page.length) break;
    for (const s of page) if (!s.err) sigs.push(s);
    before = page[page.length - 1].signature;
    console.log(`[orao] signatures collected: ${sigs.length} (oldest slot ${page[page.length - 1].slot})`);
    if (page.length < 1000) break;
  }
  // we walk from oldest to newest so that a request's fulfill (which is newer) is seen after it
  sigs.reverse();

  // 2. fetch transactions and classify
  const requests = new Map();  // randomnessAccount -> {sig, slot, blockTime, kind, payer}
  const fulfills = new Map();  // randomnessAccount -> [{sig, slot, blockTime, kind, fulfiller}]
  const rawOut = fs.createWriteStream(path.join(DATA, 'orao-raw-txs.jsonl'));
  let fetched = 0, classified = { request: 0, fulfill: 0, other: 0 };
  const txVersions = {};
  let completePairs = 0;

  for (const s of sigs) {
    // NOTE: first run with maxSupportedTransactionVersion:0 failed with RPC error -32015
    // "Transaction version (1) is not supported by the requesting client" -> v1 transactions
    // (SIMD-0385, 4096-byte) are already present on mainnet in this program's history (2026-10-23).
    const tx = await rpc('getTransaction', [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 1, commitment: 'confirmed' }]);
    fetched++;
    if (!tx || !tx.meta || tx.meta.err) continue;
    txVersions[String(tx.version)] = (txVersions[String(tx.version)] || 0) + 1;
    let instructions;
    try { ({ instructions } = flattenInstructions(tx)); } catch (e) { console.log(`[orao] cannot flatten tx ${s.signature} (version ${tx.version}): ${e.message}`); continue; }
    let touched = false;
    for (const ix of instructions) {
      if (ix.programId !== PROGRAM) continue;
      let disc;
      try { disc = b58decode(ix.data).subarray(0, 8).toString('hex'); } catch { continue; }
      const accs = ix.accounts.filter(a => !SYSTEM.has(a));
      if (REQUEST_DISCS[disc]) {
        // accounts: payer, network_state, treasury, request, system_program  -> request is index 3
        const acct = ix.accounts[3];
        if (!acct) continue;
        requests.set(acct, { sig: s.signature, slot: tx.slot, blockTime: tx.blockTime, kind: REQUEST_DISCS[disc], payer: ix.accounts[0], inner: ix.inner });
        rawOut.write(JSON.stringify({ role: 'request', kind: REQUEST_DISCS[disc], sig: s.signature, slot: tx.slot, blockTime: tx.blockTime, account: acct, accounts: ix.accounts, inner: ix.inner, fee: tx.meta.fee, txVersion: tx.version, preBalances: tx.meta.preBalances, postBalances: tx.meta.postBalances, keys: flattenInstructions(tx).keys }) + '\n');
        classified.request++; touched = true;
      } else if (FULFILL_DISCS[disc]) {
        // accounts: payer, instruction_acc, network_state, request, (client, system_program) -> request is index 3
        const acct = ix.accounts[3];
        if (!acct) continue;
        if (!fulfills.has(acct)) fulfills.set(acct, []);
        fulfills.get(acct).push({ sig: s.signature, slot: tx.slot, blockTime: tx.blockTime, kind: FULFILL_DISCS[disc], fulfiller: ix.accounts[0] });
        rawOut.write(JSON.stringify({ role: 'fulfill', kind: FULFILL_DISCS[disc], sig: s.signature, slot: tx.slot, blockTime: tx.blockTime, account: acct, accounts: ix.accounts, inner: ix.inner, fee: tx.meta.fee, txVersion: tx.version, logs: (tx.meta.logMessages || []).filter(l => /Program log|Program data/.test(l)).slice(0, 12) }) + '\n');
        classified.fulfill++; touched = true;
        if (requests.has(acct) && fulfills.get(acct).length === 1) completePairs++;
      }
    }
    if (!touched) classified.other++;
    if (fetched % 25 === 0) {
      console.log(`[orao] fetched ${fetched}/${sigs.length} txs; requests=${classified.request} fulfills=${classified.fulfill} other=${classified.other} pairs=${completePairs} rpcCalls=${stats.calls} retries=${stats.retries}`);
    }
    if (completePairs >= TARGET_PAIRS && fetched > sigs.length * 0.25) {
      // keep going a bit to catch fulfills of the last requests, but stop when target reached
      break;
    }
  }
  rawOut.end();

  // 3. pair
  const rows = [];
  for (const [acct, req] of requests) {
    const fs_ = fulfills.get(acct);
    if (!fs_ || !fs_.length) continue;
    fs_.sort((a, b) => a.slot - b.slot);
    const first = fs_[0], last = fs_[fs_.length - 1];
    rows.push({
      account: acct,
      request_sig: req.sig, request_slot: req.slot, request_time: req.blockTime, request_kind: req.kind, request_via_cpi: req.inner,
      first_fulfill_sig: first.sig, first_fulfill_slot: first.slot, first_fulfill_time: first.blockTime,
      num_fulfills: fs_.length, last_fulfill_slot: last.slot, last_fulfill_time: last.blockTime,
      slot_delta_first: first.slot - req.slot, time_delta_first_s: (first.blockTime ?? 0) - (req.blockTime ?? 0),
      slot_delta_last: last.slot - req.slot, time_delta_last_s: (last.blockTime ?? 0) - (req.blockTime ?? 0),
      fulfiller: first.fulfiller,
    });
  }
  rows.sort((a, b) => a.request_slot - b.request_slot);
  const header = Object.keys(rows[0] || { none: 1 });
  fs.writeFileSync(path.join(DATA, 'orao-pairs.csv'), [header.join(','), ...rows.map(r => header.map(h => r[h]).join(','))].join('\n'));

  const unfulfilled = [...requests.keys()].filter(a => !fulfills.has(a));
  const summary = {
    program: PROGRAM,
    endpoints: ENDPOINTS,
    generated_at: new Date().toISOString(),
    signatures_scanned: fetched,
    signatures_collected_total: sigs.length,
    tx_versions_seen: txVersions,
    classified,
    requests_seen: requests.size,
    requests_with_fulfill: rows.length,
    requests_without_fulfill_in_window: unfulfilled.length,
    note_unfulfilled: 'Requests near the newest edge of the scan window may have fulfills outside the scanned range; this is not evidence of non-fulfillment.',
    time_range: rows.length ? { from: new Date(rows[0].request_time * 1000).toISOString(), to: new Date(rows[rows.length - 1].request_time * 1000).toISOString(), from_slot: rows[0].request_slot, to_slot: rows[rows.length - 1].request_slot } : null,
    slot_delta_first_fulfill: summarize(rows.map(r => r.slot_delta_first)),
    time_delta_first_fulfill_s: summarize(rows.map(r => r.time_delta_first_s)),
    slot_delta_last_fulfill: summarize(rows.map(r => r.slot_delta_last)),
    time_delta_last_fulfill_s: summarize(rows.map(r => r.time_delta_last_s)),
    num_fulfills_distribution: Object.fromEntries(Object.entries(rows.reduce((m, r) => (m[r.num_fulfills] = (m[r.num_fulfills] || 0) + 1, m), {}))),
    request_kinds: rows.reduce((m, r) => (m[r.request_kind] = (m[r.request_kind] || 0) + 1, m), {}),
    requests_via_cpi: rows.filter(r => r.request_via_cpi).length,
    distinct_fulfillers: [...new Set(rows.map(r => r.fulfiller))],
    rpc_stats: stats,
  };
  fs.writeFileSync(path.join(DATA, 'orao-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(e => { console.error('[orao] FATAL', e); process.exit(1); });
