'use strict';
// Which of the (up to 3) fulfill txs per request emits the Anchor `Fulfill` event (= quorum reached, value usable)?
// Recomputes latency to THAT tx. Also verifies rent refund to `client` on the fulfilling tx.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { rpc, summarize } = require('./rpc.js');
const evDisc = n => crypto.createHash('sha256').update(`event:${n}`).digest().subarray(0, 8).toString('hex');
const FULFILL = evDisc('Fulfill'), RESPONSE = evDisc('Response');
const lines = fs.readFileSync('../data/orao-raw-txs.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const req = new Map(lines.filter(l => l.role === 'request').map(r => [r.account, r]));
const byAcct = new Map();
for (const f of lines.filter(l => l.role === 'fulfill')) {
  const evs = (f.logs || []).filter(l => l.startsWith('Program data: ')).map(l => Buffer.from(l.slice(14), 'base64').subarray(0, 8).toString('hex'));
  f.events = evs.map(h => h === FULFILL ? 'Fulfill' : h === RESPONSE ? 'Response' : 'other:' + h);
  if (!byAcct.has(f.account)) byAcct.set(f.account, []);
  byAcct.get(f.account).push(f);
}
const rows = [], idxHist = {};
for (const [acct, fs_] of byAcct) {
  const r = req.get(acct); if (!r) continue;
  fs_.sort((a, b) => a.slot - b.slot || a.sig.localeCompare(b.sig));
  const i = fs_.findIndex(f => f.events.includes('Fulfill'));
  idxHist[i] = (idxHist[i] || 0) + 1;
  if (i < 0) continue;
  const f = fs_[i];
  rows.push({ account: acct, request_sig: r.sig, request_slot: r.slot, request_time: r.blockTime, fulfill_event_sig: f.sig, fulfill_event_slot: f.slot, fulfill_event_time: f.blockTime, fulfill_index: i + 1, responses_before: i, slot_delta: f.slot - r.slot, time_delta_s: f.blockTime - r.blockTime, request_via_cpi: r.inner });
}
rows.sort((a, b) => a.request_slot - b.request_slot);
const header = Object.keys(rows[0]);
fs.writeFileSync('../data/orao-pairs-quorum.csv', [header.join(','), ...rows.map(r => header.map(h => r[h]).join(','))].join('\n'));
const slots = rows.map(r => r.slot_delta), secs = rows.map(r => r.time_delta_s);
const out = {
  note: 'Latency from request_v2 tx to the fulfill_v2 tx that emitted the Anchor `Fulfill` event (quorum reached; fulfilled_randomness() becomes Some). This is the latency that matters for a consumer.',
  fulfill_event_discriminator: FULFILL, response_event_discriminator: RESPONSE,
  which_fulfill_tx_emits_Fulfill_event_index_histogram_0based: idxHist,
  n: rows.length,
  time_range: { from: new Date(rows[0].request_time * 1000).toISOString(), to: new Date(rows[rows.length - 1].request_time * 1000).toISOString() },
  slot_delta: summarize(slots), time_delta_s: summarize(secs),
  share_within_20s: secs.filter(s => s <= 20).length / secs.length,
  share_within_30s: secs.filter(s => s <= 30).length / secs.length,
  share_within_60s: secs.filter(s => s <= 60).length / secs.length,
  share_within_120s: secs.filter(s => s <= 120).length / secs.length,
  share_within_50_slots: slots.filter(s => s <= 50).length / slots.length,
  share_within_100_slots: slots.filter(s => s <= 100).length / slots.length,
  share_within_300_slots: slots.filter(s => s <= 300).length / slots.length,
  share_within_600_slots: slots.filter(s => s <= 600).length / slots.length,
};
// histogram of seconds
const buckets = [1, 2, 3, 5, 10, 20, 30, 60, 90, 120, 180];
out.time_histogram_s = {}; let prev = -1;
for (const b of buckets) { out.time_histogram_s[`<=${b}`] = secs.filter(s => s > prev && s <= b).length; prev = b; }
out.time_histogram_s[`>${prev}`] = secs.filter(s => s > prev).length;
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync('../data/orao-quorum-summary.json', JSON.stringify(out, null, 2));

// Rent-refund check on one quorum-reaching fulfill tx
(async () => {
  const r = rows[Math.floor(rows.length / 2)];
  const tx = await rpc('getTransaction', [r.fulfill_event_sig, { encoding: 'json', maxSupportedTransactionVersion: 1 }], { endpoint: 'https://api.mainnet-beta.solana.com' });
  const keys = tx.transaction.message.accountKeys;
  const diff = keys.map((k, i) => ({ key: k, pre: tx.meta.preBalances[i], post: tx.meta.postBalances[i], delta: tx.meta.postBalances[i] - tx.meta.preBalances[i] })).filter(d => d.delta !== 0);
  const requestAcct = tx.meta.postTokenBalances; // unused
  const res = { sig: r.fulfill_event_sig, randomness_account: r.account, balance_changes: diff, randomness_account_data_len_after: null };
  const ai = await rpc('getAccountInfo', [r.account, { encoding: 'base64' }], { endpoint: 'https://api.mainnet-beta.solana.com' });
  res.randomness_account_now = ai.value ? { lamports: ai.value.lamports, dataLen: Buffer.from(ai.value.data[0], 'base64').length, first9hex: Buffer.from(ai.value.data[0], 'base64').subarray(0, 9).toString('hex') } : 'closed';
  console.log(JSON.stringify(res, null, 2));
  fs.writeFileSync('../data/orao-fulfill-rent-check.json', JSON.stringify(res, null, 2));
})().catch(e => console.error('rent check failed:', e.message));
