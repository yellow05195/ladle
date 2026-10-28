'use strict';
// Per-node response latency + tail attribution + time-of-day pattern for the quorum tail.
const fs = require('node:fs');
const { summarize } = require('./rpc.js');
const lines = fs.readFileSync('../data/orao-raw-txs.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const req = new Map(lines.filter(l => l.role === 'request').map(r => [r.account, r]));
const perNode = {}; const slowest = {}; const rows = [];
const byAcct = new Map();
for (const f of lines.filter(l => l.role === 'fulfill')) { if (!byAcct.has(f.account)) byAcct.set(f.account, []); byAcct.get(f.account).push(f); }
for (const [acct, fs_] of byAcct) {
  const r = req.get(acct); if (!r || fs_.length < 3) continue;
  let worst = null;
  for (const f of fs_) {
    const node = f.accounts[0]; const d = f.blockTime - r.blockTime;
    (perNode[node] = perNode[node] || []).push(d);
    if (!worst || d > worst.d) worst = { node, d };
  }
  slowest[worst.node] = (slowest[worst.node] || 0) + 1;
  rows.push({ hourUtc: new Date(r.blockTime * 1000).toISOString().slice(0, 13), quorum_s: worst.d });
}
const out = { per_node_response_latency_s: Object.fromEntries(Object.entries(perNode).map(([k, v]) => [k, summarize(v)])), slowest_node_in_request_count: slowest };
// tail by hour
const byHour = {};
for (const r of rows) { (byHour[r.hourUtc] = byHour[r.hourUtc] || []).push(r.quorum_s); }
out.quorum_latency_by_hour_utc = Object.fromEntries(Object.entries(byHour).sort().map(([h, v]) => [h, { n: v.length, median: summarize(v).median, p90: summarize(v).p90, max: summarize(v).max, share_over_20s: +(v.filter(x => x > 20).length / v.length).toFixed(2) }]));
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync('../data/orao-fulfiller-analysis.json', JSON.stringify(out, null, 2));
