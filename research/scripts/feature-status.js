'use strict';
// Checks activation of the Transaction V1 feature gate (SIMD-0385 / SIMD-0296) on mainnet.
// Feature account data layout: Option<u64> activated_at => 1 byte tag (0=None,1=Some) + 8 bytes LE slot.
const { rpc } = require('./rpc.js');
const GATE = process.argv[2] || 'txv1aq4pp281K9um3tnPgkfX8UqtFT6wcVW3hNezGLL';
(async () => {
  const info = await rpc('getAccountInfo', [GATE, { encoding: 'base64' }]);
  const slot = await rpc('getSlot', []);
  const epoch = await rpc('getEpochInfo', []);
  if (!info || !info.value) { console.log(JSON.stringify({ gate: GATE, exists: false, note: 'feature account not found -> not activated (and not even pending)', currentSlot: slot })); return; }
  const data = Buffer.from(info.value.data[0], 'base64');
  const tag = data[0];
  const activatedAt = tag === 1 ? Number(data.readBigUInt64LE(1)) : null;
  console.log(JSON.stringify({ gate: GATE, exists: true, owner: info.value.owner, dataLen: data.length, dataHex: data.toString('hex'), activated: tag === 1, activatedAtSlot: activatedAt, currentSlot: slot, epoch: epoch.epoch, checkedAt: new Date().toISOString() }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
