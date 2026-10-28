'use strict';
// Decode ORAO NetworkState (fetched via getProgramAccounts dataSize=472) : fee, treasury, fulfillment authorities.
const { b58encode } = require('./rpc.js');
const fs = require('node:fs');
const b64 = process.argv[2];
const d = Buffer.from(b64, 'base64');
let o = 8; // anchor discriminator
const pk = () => { const k = b58encode(d.subarray(o, o + 32)); o += 32; return k; };
const u64 = () => { const v = d.readBigUInt64LE(o); o += 8; return Number(v); };
const u32 = () => { const v = d.readUInt32LE(o); o += 4; return v; };
const out = { account: '5ER1oENnV4srxYdAynUfRzWeQCPQaqMiAp4VqyMbSqnK', authority: pk(), treasury: pk(), request_fee_lamports: u64() };
const n = u32(); out.fulfillment_authorities = []; for (let i = 0; i < n; i++) out.fulfillment_authorities.push(pk());
const hasTok = d[o++]; if (hasTok) out.token_fee_config = { mint: pk(), treasury: pk(), fee: u64() }; else out.token_fee_config = null;
out.num_received = u64();
out.request_fee_sol = out.request_fee_lamports / 1e9;
out.majority_needed = Math.floor(n * 2 / 3) + 1;
out.fetched_at = new Date().toISOString();
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync('../data/orao-network-state-mainnet.json', JSON.stringify(out, null, 2));
