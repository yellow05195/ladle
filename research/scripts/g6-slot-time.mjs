// G6 - Solana mainnet slot-time measurement over the last ~30 days.
// Usage: node g6-slot-time.mjs [outCsv] [samples] [days]
// Uses only public JSON-RPC (getSlot, getBlockTime). Handles HTTP 429 with exponential backoff.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ENDPOINTS = [
  process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
  'https://solana.drpc.org',
];
const OUT = process.argv[2] || 'G6-slot-samples.csv';
const N_SAMPLES = Number(process.argv[3] || 121);     // 121 points -> 120 intervals
const DAYS = Number(process.argv[4] || 30);
const MIN_GAP_MS = 220;                               // pacing between calls

let epIdx = 0;
let reqId = 0;
let lastCall = 0;
const stats = { calls: 0, retries429: 0, otherErrors: 0, endpointSwitches: 0 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(method, params, attempt = 0) {
  const wait = MIN_GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const url = ENDPOINTS[epIdx];
  stats.calls++;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++reqId, method, params }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    stats.otherErrors++;
    if (attempt > 6) throw e;
    await sleep(1000 * 2 ** attempt);
    return rpc(method, params, attempt + 1);
  }
  if (res.status === 429) {
    stats.retries429++;
    const ra = Number(res.headers.get('retry-after'));
    const backoff = ra > 0 ? ra * 1000 : Math.min(60000, 1000 * 2 ** attempt) + Math.random() * 500;
    if (attempt >= 3 && ENDPOINTS.length > 1) { epIdx = (epIdx + 1) % ENDPOINTS.length; stats.endpointSwitches++; }
    process.stderr.write('  429 from ' + url + ', backing off ' + Math.round(backoff) + ' ms\n');
    await sleep(backoff);
    return rpc(method, params, attempt + 1);
  }
  if (!res.ok) {
    stats.otherErrors++;
    if (attempt > 6) throw new Error('HTTP ' + res.status + ' from ' + url);
    await sleep(1000 * 2 ** attempt);
    return rpc(method, params, attempt + 1);
  }
  const j = await res.json();
  if (j.error) {
    // -32004 block not available, -32007 slot skipped, -32009 slot skipped/purged
    const e = new Error(j.error.message); e.code = j.error.code; throw e;
  }
  return j.result;
}

// Nearest non-skipped slot at/after `slot` (then before), probing up to +/- maxProbe.
async function blockTimeNear(slot, maxProbe = 32) {
  const order = [];
  for (let d = 0; d <= maxProbe; d++) { order.push(slot + d); if (d > 0) order.push(slot - d); }
  for (const s of order) {
    try {
      const t = await rpc('getBlockTime', [s]);
      if (typeof t === 'number') return { slot: s, time: t, probed: Math.abs(s - slot) };
    } catch (e) {
      if (e.code === -32004 || e.code === -32007 || e.code === -32009 || /skipped|not available|missing/i.test(e.message)) continue;
      throw e;
    }
  }
  return null;
}

function isoDay(unix) { return new Date(unix * 1000).toISOString().slice(0, 10); }
function iso(unix) { return new Date(unix * 1000).toISOString(); }

(async () => {
  console.log('Endpoints: ' + ENDPOINTS.join(', '));
  const nowSlot = await rpc('getSlot', [{ commitment: 'finalized' }]);
  const head = await blockTimeNear(nowSlot);
  if (!head) throw new Error('could not read head block time');
  console.log('Head: slot ' + head.slot + ' @ ' + iso(head.time));

  // Calibrate: assume ~400 ms/slot, find a slot ~DAYS ago, then recompute from the real rate.
  const targetSpanSec = DAYS * 86400;
  let guessSlotsBack = Math.round(targetSpanSec / 0.4);
  let tail = await blockTimeNear(head.slot - guessSlotsBack, 64);
  if (!tail) throw new Error('could not read calibration block time (history too short on this endpoint?)');
  const rate0 = (head.time - tail.time) / (head.slot - tail.slot); // s/slot
  guessSlotsBack = Math.round(targetSpanSec / rate0);
  tail = await blockTimeNear(head.slot - guessSlotsBack, 64);
  if (!tail) throw new Error('could not read calibrated tail block time');
  console.log('Tail: slot ' + tail.slot + ' @ ' + iso(tail.time) + ' (calibration ' + (rate0 * 1000).toFixed(2) + ' ms/slot)');

  const step = (head.slot - tail.slot) / (N_SAMPLES - 1);
  const samples = [];
  for (let i = 0; i < N_SAMPLES; i++) {
    const target = Math.round(tail.slot + i * step);
    let r;
    if (i === 0) r = tail; else if (i === N_SAMPLES - 1) r = head; else r = await blockTimeNear(target);
    if (!r) { console.log('  sample ' + i + ': no block near ' + target + ', skipped'); continue; }
    samples.push({ i, target, ...r });
    if (i % 10 === 0) console.log('  sample ' + i + '/' + (N_SAMPLES - 1) + ': slot ' + r.slot + ' ' + iso(r.time));
  }

  const rows = [];
  for (let k = 0; k < samples.length; k++) {
    const s = samples[k];
    const prev = k > 0 ? samples[k - 1] : null;
    const msPerSlot = prev ? ((s.time - prev.time) * 1000) / (s.slot - prev.slot) : null;
    rows.push([s.i, s.target, s.slot, s.probed, s.time, iso(s.time), msPerSlot === null ? '' : msPerSlot.toFixed(3)]);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  const csv = ['idx,target_slot,slot,probe_offset,block_time_unix,block_time_iso,ms_per_slot_from_prev', ...rows.map((r) => r.join(','))].join('\n');
  writeFileSync(OUT, csv + '\n');

  // Daily aggregation: each interval is attributed to the UTC day of its start sample; weighted by slots.
  const days = new Map();
  for (let k = 1; k < samples.length; k++) {
    const a = samples[k - 1], b = samples[k];
    const d = isoDay(a.time);
    const e = days.get(d) || { slots: 0, secs: 0, n: 0 };
    e.slots += b.slot - a.slot; e.secs += b.time - a.time; e.n++;
    days.set(d, e);
  }
  const daily = [...days.entries()]
    .map(([d, e]) => ({ day: d, ms_per_slot: (e.secs * 1000) / e.slots, intervals: e.n, slots: e.slots }))
    .sort((x, y) => x.day.localeCompare(y.day));
  const first = samples[0], last = samples[samples.length - 1];
  const overall = ((last.time - first.time) * 1000) / (last.slot - first.slot);
  const intervalRates = samples.slice(1).map((s, k) => ((s.time - samples[k].time) * 1000) / (s.slot - samples[k].slot));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
  const dailyVals = daily.map((d) => d.ms_per_slot);
  const summary = {
    measured_from: iso(first.time), measured_to: iso(last.time),
    first_slot: first.slot, last_slot: last.slot, slots_spanned: last.slot - first.slot, seconds_spanned: last.time - first.time,
    samples: samples.length, intervals: intervalRates.length,
    overall_ms_per_slot: +overall.toFixed(3),
    interval_min: +Math.min(...intervalRates).toFixed(3), interval_max: +Math.max(...intervalRates).toFixed(3), interval_sd: +sd(intervalRates).toFixed(3),
    daily_min: +Math.min(...dailyVals).toFixed(3), daily_max: +Math.max(...dailyVals).toFixed(3),
    daily_spread: +(Math.max(...dailyVals) - Math.min(...dailyVals)).toFixed(3), daily_sd: +sd(dailyVals).toFixed(3),
    rpc_stats: stats, endpoint_used_last: ENDPOINTS[epIdx],
  };
  const sumPath = OUT.replace(/\.csv$/, '-summary.json');
  writeFileSync(sumPath, JSON.stringify({ summary, daily }, null, 2));
  console.log('\nDAILY ms/slot:');
  for (const d of daily) console.log('  ' + d.day + '  ' + d.ms_per_slot.toFixed(2) + '  (' + d.intervals + ' intervals, ' + d.slots + ' slots)');
  console.log('\nSUMMARY: ' + JSON.stringify(summary, null, 2));
  console.log('\nWrote ' + OUT + ' and ' + sumPath);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
