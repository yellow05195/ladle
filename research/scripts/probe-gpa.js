'use strict';
// Probe: can public RPC serve getProgramAccounts for (a) ORAO network state (dataSize 472),
// (b) Switchboard On-Demand RandomnessAccountData (discriminator filter, dataSlice 0)?
const { rpc, accDisc, b58encode } = require('./rpc.js');
const ORAO = 'VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y';
const SB = 'SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv';
(async () => {
  try {
    const ns = await rpc('getProgramAccounts', [ORAO, { encoding: 'base64', filters: [{ dataSize: 472 }] }]);
    console.log('ORAO dataSize=472 accounts:', ns.length);
    for (const a of ns) console.log(JSON.stringify({ pubkey: a.pubkey, lamports: a.account.lamports, dataB64: a.account.data[0] }));
  } catch (e) { console.log('ORAO gPA error:', e.message); }
  try {
    const disc = Buffer.from(accDisc('RandomnessAccountData'), 'hex');
    console.log('SB RandomnessAccountData disc hex', disc.toString('hex'), 'b58', b58encode(disc));
    const t0 = Date.now();
    const r = await rpc('getProgramAccounts', [SB, { encoding: 'base64', dataSlice: { offset: 0, length: 0 }, filters: [{ memcmp: { offset: 0, bytes: b58encode(disc) } }] }]);
    console.log('SB randomness accounts:', r.length, 'in', Date.now() - t0, 'ms');
    require('node:fs').writeFileSync('../data/sb-randomness-accounts.json', JSON.stringify(r.map(x => x.pubkey)));
  } catch (e) { console.log('SB gPA error:', e.message); }
})();
