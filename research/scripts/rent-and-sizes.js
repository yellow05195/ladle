'use strict';
// Rent-exemption figures relevant to cost estimates + Switchboard randomness account size.
const { rpc } = require('./rpc.js');
const fs = require('node:fs');
(async () => {
  const sb = JSON.parse(fs.readFileSync('../data/sb-randomness-accounts.json', 'utf8'));
  const sample = sb.slice(0, 3);
  const out = { checked_at: new Date().toISOString(), rent: {}, switchboard_randomness_accounts: [] };
  for (const pk of sample) {
    const info = await rpc('getAccountInfo', [pk, { encoding: 'base64' }]);
    const data = Buffer.from(info.value.data[0], 'base64');
    out.switchboard_randomness_accounts.push({ pubkey: pk, lamports: info.value.lamports, dataLen: data.length, owner: info.value.owner });
  }
  // ORAO RandomnessV2: PENDING_SIZE = 1 + 32 + 32 + 4 + majority(10)=7 * 96 = 741 ; +8 disc = 749 ; FULFILLED = 1+32+32+64 = 129 ; +8 = 137
  for (const n of [137, 749, out.switchboard_randomness_accounts[0]?.dataLen].filter(Boolean)) {
    out.rent[n] = await rpc('getMinimumBalanceForRentExemption', [n]);
  }
  out.notes = {
    orao_pending_749: 'ORAO RandomnessV2 pending account: 8 + 1 + 32 + 32 + 4 + 7*96 bytes',
    orao_fulfilled_137: 'ORAO RandomnessV2 fulfilled account after realloc: 8 + 1 + 32 + 32 + 64 bytes',
  };
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync('../data/rent-and-sizes.json', JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
