'use strict';
// Program upgradeability (who can change the on-chain code) + ORAO devnet network state.
const { rpc, b58encode } = require('./rpc.js');
const fs = require('node:fs');
const MAIN = 'https://api.mainnet-beta.solana.com', DEV = 'https://api.devnet.solana.com';
async function programMeta(pid, endpoint) {
  const acc = await rpc('getAccountInfo', [pid, { encoding: 'base64' }], { endpoint });
  if (!acc.value) return { pid, exists: false };
  const data = Buffer.from(acc.value.data[0], 'base64');
  const out = { pid, owner: acc.value.owner, executable: acc.value.executable };
  if (acc.value.owner === 'BPFLoaderUpgradeab1e11111111111111111111111' && data.length >= 36) {
    const programdata = b58encode(data.subarray(4, 36));
    const pd = await rpc('getAccountInfo', [programdata, { encoding: 'base64', dataSlice: { offset: 0, length: 45 } }], { endpoint });
    const d = Buffer.from(pd.value.data[0], 'base64');
    out.programdata = programdata;
    out.last_deploy_slot = Number(d.readBigUInt64LE(4));
    out.upgrade_authority = d[12] === 1 ? b58encode(d.subarray(13, 45)) : null;
  }
  return out;
}
function decodeOraoState(b64) {
  const d = Buffer.from(b64, 'base64'); let o = 8;
  const pk = () => { const k = b58encode(d.subarray(o, o + 32)); o += 32; return k; };
  const u64 = () => { const v = d.readBigUInt64LE(o); o += 8; return Number(v); };
  const out = { authority: pk(), treasury: pk(), request_fee_lamports: u64() };
  const n = d.readUInt32LE(o); o += 4; out.fulfillment_authorities = []; for (let i = 0; i < n; i++) out.fulfillment_authorities.push(pk());
  const hasTok = d[o++]; out.token_fee_config = hasTok ? { mint: pk(), treasury: pk(), fee: u64() } : null; out.num_received = u64();
  return out;
}
(async () => {
  const out = { checked_at: new Date().toISOString() };
  out.orao_mainnet_program = await programMeta('VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y', MAIN);
  out.orao_callback_mainnet_program = await programMeta('VRFCBePmGTpZ234BhbzNNzmyg39Rgdd6VgdfhHwKypU', MAIN);
  out.switchboard_ondemand_mainnet_program = await programMeta('SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv', MAIN);
  const devState = await rpc('getProgramAccounts', ['VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y', { encoding: 'base64', filters: [{ dataSize: 472 }] }], { endpoint: DEV });
  out.orao_devnet_network_state = devState.length ? { account: devState[0].pubkey, ...decodeOraoState(devState[0].account.data[0]) } : null;
  out.orao_devnet_program = await programMeta('VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y', DEV);
  out.switchboard_ondemand_devnet_program = await programMeta('Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2', DEV);
  // Switchboard mainnet queue + oracle count (QueueAccountData) : just confirm existence/size
  for (const q of ['A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w']) {
    const a = await rpc('getAccountInfo', [q, { encoding: 'base64' }], { endpoint: MAIN });
    out.switchboard_mainnet_default_queue = { pubkey: q, exists: !!a.value, owner: a.value && a.value.owner, dataLen: a.value && Buffer.from(a.value.data[0], 'base64').length };
  }
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync('../data/program-meta.json', JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
