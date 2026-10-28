'use strict';
// Post-process ORAO raw data: rent locked per request, tx fees, tx versions, fulfill structure.
const fs = require('node:fs');
const { summarize } = require('./rpc.js');
const lines = fs.readFileSync('../data/orao-raw-txs.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const req = lines.filter(l => l.role === 'request'), ful = lines.filter(l => l.role === 'fulfill');
const rentLocked = [];
for (const r of req) {
  const i = r.keys.indexOf(r.account);
  if (i >= 0) rentLocked.push(r.postBalances[i] - r.preBalances[i]);
}
const out = {
  requests: req.length, fulfills: ful.length,
  request_tx_versions: req.reduce((m, r) => (m[r.txVersion] = (m[r.txVersion] || 0) + 1, m), {}),
  fulfill_tx_versions: ful.reduce((m, r) => (m[r.txVersion] = (m[r.txVersion] || 0) + 1, m), {}),
  requests_via_cpi: req.filter(r => r.inner).length,
  request_kinds: req.reduce((m, r) => (m[r.kind] = (m[r.kind] || 0) + 1, m), {}),
  fulfill_kinds: ful.reduce((m, r) => (m[r.kind] = (m[r.kind] || 0) + 1, m), {}),
  randomness_account_lamports_after_request: summarize(rentLocked),
  request_tx_fee_lamports: summarize(req.map(r => r.fee)),
  fulfill_tx_fee_lamports: summarize(ful.map(r => r.fee)),
  distinct_fulfill_payers: [...new Set(ful.map(f => f.accounts[0]))],
  fulfill_payer_counts: ful.reduce((m, f) => (m[f.accounts[0]] = (m[f.accounts[0]] || 0) + 1, m), {}),
  sample_fulfill_logs: ful.slice(0, 2).map(f => f.logs),
  distinct_request_payers: new Set(req.map(r => r.accounts[0])).size,
};
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync('../data/orao-raw-analysis.json', JSON.stringify(out, null, 2));
