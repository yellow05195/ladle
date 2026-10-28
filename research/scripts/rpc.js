// Shared minimal Solana JSON-RPC helpers (no dependencies, Node 24).
// Respects rate limits: fixed inter-call sleep, exponential backoff on 429 / 5xx,
// rotation across a list of public endpoints when one keeps refusing.
'use strict';
const crypto = require('node:crypto');

const ENDPOINTS = (process.env.RPC_ENDPOINTS || [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
  'https://rpc.ankr.com/solana',
].join(',')).split(',').map(s => s.trim()).filter(Boolean);

let epIndex = 0;
const stats = { calls: 0, retries: 0, rotations: 0, perEndpoint: {} };

const sleep = ms => new Promise(r => setTimeout(r, ms));

const BASE_SLEEP_MS = Number(process.env.RPC_SLEEP_MS || 120);

async function rpc(method, params, { tries = 8, endpoint } = {}) {
  let delay = 600;
  for (let attempt = 0; attempt < tries; attempt++) {
    const url = endpoint || ENDPOINTS[epIndex % ENDPOINTS.length];
    stats.calls++;
    stats.perEndpoint[url] = (stats.perEndpoint[url] || 0) + 1;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (res.status === 429 || res.status >= 500) {
        stats.retries++;
        const ra = Number(res.headers.get('retry-after'));
        const wait = ra ? ra * 1000 : delay;
        process.stderr.write(`[rpc] ${res.status} from ${url} (${method}); waiting ${wait}ms\n`);
        await sleep(wait);
        delay = Math.min(delay * 2, 15000);
        if (attempt >= 2) { epIndex++; stats.rotations++; }
        continue;
      }
      const j = await res.json();
      if (j.error) {
        // -32429 / -32005 style throttling or "too many requests" messages
        const msg = String(j.error.message || '');
        if (/rate|too many|limit|429|busy|overload/i.test(msg)) {
          stats.retries++;
          process.stderr.write(`[rpc] error ${j.error.code} "${msg}" from ${url}; waiting ${delay}ms\n`);
          await sleep(delay); delay = Math.min(delay * 2, 15000);
          if (attempt >= 2) { epIndex++; stats.rotations++; }
          continue;
        }
        throw new Error(`${method}: ${j.error.code} ${msg}`);
      }
      await sleep(BASE_SLEEP_MS);
      return j.result;
    } catch (e) {
      if (e.message && e.message.startsWith(method + ':')) throw e; // real RPC error, not transport
      stats.retries++;
      process.stderr.write(`[rpc] transport error ${e.message} on ${url}; waiting ${delay}ms\n`);
      await sleep(delay); delay = Math.min(delay * 2, 15000);
      epIndex++; stats.rotations++;
    }
  }
  throw new Error(`${method}: gave up after ${tries} tries`);
}

// ---- base58 ----
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58MAP = Object.fromEntries([...B58].map((c, i) => [c, i]));
function b58decode(s) {
  const bytes = [0];
  for (const c of s) {
    let carry = B58MAP[c];
    if (carry === undefined) throw new Error('bad base58');
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (let k = 0; k < s.length && s[k] === '1'; k++) bytes.push(0);
  return Buffer.from(bytes.reverse());
}
function b58encode(buf) {
  const digits = [0];
  for (const byte of buf) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = '';
  for (let k = 0; k < buf.length && buf[k] === 0; k++) out += '1';
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

// Anchor discriminators
const ixDisc = name => crypto.createHash('sha256').update(`global:${name}`).digest().subarray(0, 8).toString('hex');
const accDisc = name => crypto.createHash('sha256').update(`account:${name}`).digest().subarray(0, 8).toString('hex');

// Flatten all instructions (top-level + inner) of a "json"-encoded getTransaction result
// into [{programId, accounts:[pubkey...], data(base58 string), inner:boolean}]
function flattenInstructions(tx) {
  const msg = tx.transaction.message;
  const keys = [...msg.accountKeys.map(k => (typeof k === 'string' ? k : k.pubkey))];
  if (tx.meta && tx.meta.loadedAddresses) {
    keys.push(...(tx.meta.loadedAddresses.writable || []));
    keys.push(...(tx.meta.loadedAddresses.readonly || []));
  }
  const out = [];
  const conv = (ix, inner) => {
    if (ix.programIdIndex === undefined) return; // parsed form not used here
    out.push({
      programId: keys[ix.programIdIndex],
      accounts: (ix.accounts || []).map(i => keys[i]),
      data: ix.data,
      inner,
    });
  };
  for (const ix of msg.instructions) conv(ix, false);
  for (const grp of (tx.meta && tx.meta.innerInstructions) || []) for (const ix of grp.instructions) conv(ix, true);
  return { keys, instructions: out };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
function summarize(values) {
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    min: s[0], max: s[s.length - 1],
    median: percentile(s, 50), p90: percentile(s, 90), p95: percentile(s, 95), p99: percentile(s, 99),
    mean: s.reduce((a, b) => a + b, 0) / s.length,
  };
}

module.exports = { rpc, sleep, b58decode, b58encode, ixDisc, accDisc, flattenInstructions, summarize, stats, ENDPOINTS };
