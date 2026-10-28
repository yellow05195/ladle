// Measure Switchboard On-Demand randomness commit -> reveal latency from mainnet history.
// Strategy: getProgramAccounts(RandomnessAccountData discriminator, dataSlice 0) gave the list of
// randomness accounts (../data/sb-randomness-accounts.json). Sample N of them, pull each account's
// signature history, fetch the txs, classify commit/reveal by Anchor discriminator or log line.
// Usage: node measure-switchboard.js [sampleAccounts=400] [targetPairs=220]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { rpc, b58decode, ixDisc, flattenInstructions, summarize, stats, ENDPOINTS } = require('./rpc.js');

const PROGRAM = 'SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv';
const DATA = path.join(__dirname, '..', 'data');
const SAMPLE = Number(process.argv[2] || 400);
const TARGET = Number(process.argv[3] || 220);

const NAMES = ['randomness_init', 'randomness_commit', 'randomness_reveal', 'randomness_commit_v2', 'randomness_reveal_v2'];
const DISCS = Object.fromEntries(NAMES.map(n => [ixDisc(n), n]));
const LOGRE = /Instruction: (Randomness\w+)/;

function seededShuffle(arr, seed = 1234567) {
  // deterministic sample so the run is reproducible
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

async function main() {
  console.log(`[sb] endpoints: ${ENDPOINTS.join(', ')}`);
  const all = JSON.parse(fs.readFileSync(path.join(DATA, 'sb-randomness-accounts.json'), 'utf8'));
  console.log(`[sb] randomness accounts known: ${all.length}; sampling ${SAMPLE}`);
  const sample = seededShuffle(all).slice(0, SAMPLE);
  const rawOut = fs.createWriteStream(path.join(DATA, 'sb-raw-txs.jsonl'));
  const rows = [];
  const txVersions = {};
  let accountsDone = 0, accountsWithCommit = 0, accountsWithReveal = 0, txFetched = 0, txNull = 0;
  const kinds = {};

  for (const acct of sample) {
    // publicnode returns [] for per-account history and ankr needs an API key -> use the Solana Labs endpoint for signature lookups only
    const sigs = await rpc('getSignaturesForAddress', [acct, { limit: 25, commitment: 'confirmed' }], { endpoint: 'https://api.mainnet-beta.solana.com' });
    accountsDone++;
    const events = []; // {kind, slot, blockTime, sig, caller}
    for (const s of sigs.reverse()) {
      if (s.err) continue;
      const tx = await rpc('getTransaction', [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 1, commitment: 'confirmed' }]);
      txFetched++;
      if (!tx) { txNull++; continue; }
      if (!tx.meta || tx.meta.err) continue;
      txVersions[String(tx.version)] = (txVersions[String(tx.version)] || 0) + 1;
      let instructions;
      try { ({ instructions } = flattenInstructions(tx)); } catch { continue; }
      const logKinds = (tx.meta.logMessages || []).map(l => (l.match(LOGRE) || [])[1]).filter(Boolean);
      for (const ix of instructions) {
        if (ix.programId !== PROGRAM) continue;
        if (!ix.accounts.includes(acct)) continue;
        let disc; try { disc = b58decode(ix.data).subarray(0, 8).toString('hex'); } catch { continue; }
        const kind = DISCS[disc] || `unknown:${disc}`;
        kinds[kind] = (kinds[kind] || 0) + 1;
        events.push({ kind, slot: tx.slot, blockTime: tx.blockTime, sig: s.signature, inner: ix.inner, nAccounts: ix.accounts.length, fee: tx.meta.fee });
        rawOut.write(JSON.stringify({ account: acct, kind, logKinds, sig: s.signature, slot: tx.slot, blockTime: tx.blockTime, inner: ix.inner, accounts: ix.accounts, fee: tx.meta.fee, txVersion: tx.version, cu: tx.meta.computeUnitsConsumed }) + '\n');
      }
    }
    // pair: each commit followed by the next reveal on the same account
    events.sort((a, b) => a.slot - b.slot);
    const commits = events.filter(e => e.kind.startsWith('randomness_commit'));
    const reveals = events.filter(e => e.kind.startsWith('randomness_reveal'));
    if (commits.length) accountsWithCommit++;
    if (reveals.length) accountsWithReveal++;
    for (const c of commits) {
      const r = reveals.find(r => r.slot >= c.slot && !r.used);
      if (!r) { rows.push({ account: acct, commit_sig: c.sig, commit_slot: c.slot, commit_time: c.blockTime, reveal_sig: '', reveal_slot: '', reveal_time: '', slot_delta: '', time_delta_s: '', revealed: 0, commit_inner: c.inner }); continue; }
      r.used = true;
      rows.push({ account: acct, commit_sig: c.sig, commit_slot: c.slot, commit_time: c.blockTime, reveal_sig: r.sig, reveal_slot: r.slot, reveal_time: r.blockTime, slot_delta: r.slot - c.slot, time_delta_s: (r.blockTime ?? 0) - (c.blockTime ?? 0), revealed: 1, commit_inner: c.inner, reveal_inner: r.inner });
    }
    const paired = rows.filter(r => r.revealed).length;
    if (accountsDone % 10 === 0) console.log(`[sb] accounts ${accountsDone}/${sample.length} txs=${txFetched} null=${txNull} commits=${rows.length} revealedPairs=${paired} kinds=${JSON.stringify(kinds)} rpcCalls=${stats.calls} retries=${stats.retries}`);
    if (paired >= TARGET) break;
  }
  rawOut.end();

  const header = ['account', 'commit_sig', 'commit_slot', 'commit_time', 'reveal_sig', 'reveal_slot', 'reveal_time', 'slot_delta', 'time_delta_s', 'revealed', 'commit_inner', 'reveal_inner'];
  fs.writeFileSync(path.join(DATA, 'sb-pairs.csv'), [header.join(','), ...rows.map(r => header.map(h => r[h] ?? '').join(','))].join('\n'));
  const paired = rows.filter(r => r.revealed);
  paired.sort((a, b) => a.commit_slot - b.commit_slot);
  const summary = {
    program: PROGRAM, endpoints: ENDPOINTS, generated_at: new Date().toISOString(),
    randomness_accounts_total_on_mainnet: all.length, accounts_sampled: accountsDone, tx_fetched: txFetched, tx_null_from_rpc: txNull, tx_versions_seen: txVersions,
    instruction_kinds_seen: kinds, accounts_with_commit: accountsWithCommit, accounts_with_reveal: accountsWithReveal,
    commits_seen: rows.length, commits_revealed: paired.length, commits_never_revealed: rows.length - paired.length,
    time_range: paired.length ? { from: new Date(paired[0].commit_time * 1000).toISOString(), to: new Date(paired[paired.length - 1].commit_time * 1000).toISOString(), from_slot: paired[0].commit_slot, to_slot: paired[paired.length - 1].commit_slot } : null,
    slot_delta_commit_to_reveal: summarize(paired.map(r => r.slot_delta)),
    time_delta_commit_to_reveal_s: summarize(paired.map(r => r.time_delta_s)),
    reveals_in_same_tx_as_consumer_cpi: paired.filter(r => r.reveal_inner).length,
    rpc_stats: stats,
  };
  fs.writeFileSync(path.join(DATA, 'sb-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(e => { console.error('[sb] FATAL', e); process.exit(1); });
