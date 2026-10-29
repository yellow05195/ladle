/**
 * Play one real round on a cluster with test SOL: N wallets enter the open
 * window, the keeper (running elsewhere) seals, draws and settles it, then
 * every wallet sells its share back and the extra wallets are swept home.
 * Prints the shares and the SOL in / out, so a devnet deployment is checked
 * end to end (docs/LAUNCH.md, step 2).
 *
 *   cd tests
 *   node --experimental-strip-types devnet/play-round.ts \
 *     --deployment ../config/deployments/devnet.json \
 *     --keypair %USERPROFILE%/.config/solana/pulled-devnet-deployer.json \
 *     [--players 2] [--amount 0.1] [--timeout 600]
 *
 * Devnet only: it refuses a deployment file whose cluster is mainnet-beta,
 * and an RPC (`--rpc`, or the file's) that serves mainnet-beta or another
 * cluster than the file's (genesis hash). The wallets it generates are
 * written to %USERPROFILE%\.config\ladle\play-round-<time>.json before any
 * SOL is sent to them, and swept home whatever happens (a refunded round is
 * refunded first); what a failed sweep leaves stays recoverable from that
 * file.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { PulledClient, WindowState, type Entry, type Keyed } from "@pulled/sdk";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} is required`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sol = (l: bigint | number) => (Number(l) / LAMPORTS_PER_SOL).toFixed(6);

/** Genesis hashes (`solana genesis-hash`), as keeper/src/config.ts GENESIS_HASH. */
const GENESIS: Record<string, string> = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
};

const dep = JSON.parse(readFileSync(arg("deployment"), "utf8")) as { cluster: string; rpc: string; programId: string; market: string; treasury: string };
if (dep.cluster === "mainnet-beta") throw new Error("play-round is a test tool: not on mainnet-beta");
const rpc = arg("rpc", dep.rpc);
const players = Number(arg("players", "2"));
// --keep 1: the home wallet (player 0) keeps its share, as a player who never comes back (the shutdown rehearsal)
const keep = Math.min(1, Number(arg("keep", "0")));
const amount = BigInt(Math.round(Number(arg("amount", "0.1")) * LAMPORTS_PER_SOL));
const timeoutMs = Number(arg("timeout", "600")) * 1000;
const home = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(arg("keypair"), "utf8")) as number[]));
const market = new PublicKey(dep.market);
const client = PulledClient.readOnly(rpc, { programId: new PublicKey(dep.programId), treasury: new PublicKey(dep.treasury) });
const conn: Connection = client.connection;
const stateName = (s: number) => Object.entries(WindowState).find(([, v]) => v === s)?.[0] ?? String(s);

// a 429 from the public RPC is retried, nothing else
async function send(tx: Transaction, signers: Keypair[], what: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try { return await sendAndConfirmTransaction(conn, tx, signers, { commitment: "confirmed" }); }
    catch (e) { if (attempt >= 6 || !/429|Too Many Requests|blockhash/i.test(String(e))) throw e; console.log(`  ${what}: retry ${attempt} (${String(e).slice(0, 80)})`); await sleep(1500 * attempt); }
  }
}

// the RPC must serve the deployment's cluster, and never mainnet-beta (it funds throwaway wallets)
const genesis = await conn.getGenesisHash();
if (genesis === GENESIS["mainnet-beta"]) throw new Error("this RPC serves mainnet-beta: play-round sends test SOL only");
if (GENESIS[dep.cluster] && genesis !== GENESIS[dep.cluster]) throw new Error(`this RPC does not serve ${dep.cluster} (genesis ${genesis})`);

const t0 = Date.now();
const before = await conn.getBalance(home.publicKey);
console.log(`home ${home.publicKey.toBase58()} ${sol(before)} SOL; ${players} players x ${sol(amount)} SOL on market ${market.toBase58()}`);

// the extra wallets, written to a file before any SOL goes to them, then funded from home
// (entry + fees + the entry's rent, which comes back on sell-back)
const extra = Array.from({ length: Math.max(0, players - 1) }, () => Keypair.generate());
const keyFile = join(homedir(), ".config", "ladle", `play-round-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
mkdirSync(join(homedir(), ".config", "ladle"), { recursive: true });
writeFileSync(keyFile, JSON.stringify(extra.map((kp) => ({ address: kp.publicKey.toBase58(), secretKey: Array.from(kp.secretKey) })), null, 1), { mode: 0o600 });
if (extra.length) console.log(`player wallets saved to ${keyFile} (devnet test wallets; swept home at the end)`);
const wallets: Keypair[] = [home, ...extra];
let windowPk: PublicKey | null = null;
let settled: Keyed<Entry>[] = [];
const sold = new Set<number>();
try {
for (const [i, kp] of extra.entries()) {
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: home.publicKey, toPubkey: kp.publicKey, lamports: amount + 20_000_000n }));
  await send(tx, [home], `fund ${i + 1}`);
  console.log(`funded player ${i + 1}: ${kp.publicKey.toBase58()}`);
}

// enter the open window (wait for one if the keeper is between rounds)
for (const [i, kp] of wallets.entries()) {
  for (;;) {
    try {
      const tx = await client.enter({ market, amount, owner: kp.publicKey });
      const sig = await send(tx, [kp], `enter ${i}`);
      const w = await client.getLiveWindow(market);
      windowPk = w!.pubkey;
      console.log(`player ${i} entered window ${w!.account.index} (${sig.slice(0, 12)}…)`);
      break;
    } catch (e) {
      if (!/no open window/.test(String(e))) throw e;
      if (Date.now() - t0 > timeoutMs) throw new Error("timeout waiting for an open window");
      console.log("  no open window yet, waiting…"); await sleep(5000);
    }
  }
}

// the keeper's job: seal, draw, tally, settle; we watch the window and the entries
let last = "";
for (;;) {
  if (Date.now() - t0 > timeoutMs) throw new Error(`timeout: window ${last}`);
  // a read the public RPC refuses (429) is just retried on the next poll: the round goes on without us
  let w: Awaited<ReturnType<typeof client.getWindowByIndex>> | null, es: (Keyed<Entry> | null)[];
  try {
    w = await client.getWindowByIndex(market, (await client.getEntry(client.entryAddress(windowPk!, wallets[0]!.publicKey))).account.windowIndex).catch(() => null);
    es = await Promise.all(wallets.map((kp) => client.getEntryOf(windowPk!, kp.publicKey)));
  } catch (e) {
    console.log(`  read failed, retrying (${String(e).slice(0, 80)})`); await sleep(8000); continue;
  }
  const st = w ? `${stateName(w.account.state)} total ${sol(w.account.totalAmount)} SOL` : "closed";
  if (st !== last) { console.log(`  window: ${st} (+${Math.round((Date.now() - t0) / 1000)} s)`); last = st; }
  if (es.every((e) => e && e.account.settled)) { settled = es as Keyed<Entry>[]; break; }
  await sleep(5000);
}
let sum = 0n;
for (const [i, e] of settled.entries()) { sum += e.account.share; console.log(`player ${i}: paid ${sol(e.account.amount)} SOL, roll ${e.account.roll}, share ${e.account.share} LADLE${e.account.refunded ? " (refunded)" : ""}`); }
console.log(`shares sum ${sum} LADLE`);

// every player sells back (closes the entry, its rent comes back), the extra wallets go home
for (const [i, kp] of wallets.entries()) {
  const e = settled[i]!;
  if (i < keep) { console.log(`player ${i} keeps its share (--keep): entry ${e.pubkey.toBase58()}`); continue; }
  const tx = await client.sellBack({ entry: e.pubkey, owner: kp.publicKey });
  const sig = await send(tx, [kp], `sell ${i}`);
  sold.add(i);
  console.log(`player ${i} sold back (${sig.slice(0, 12)}…): ${sol(await conn.getBalance(kp.publicKey))} SOL`);
}
} finally {
  // whatever happened: a refunded round's stakes back first, any share left sold back, then every extra wallet swept home
  for (const [j, kp] of extra.entries()) {
    const i = j + 1;
    try {
      const e = windowPk ? await client.getEntryOf(windowPk, kp.publicKey).catch(() => null) : null;
      if (e && !sold.has(i)) {
        const w = await client.getWindow(e.account.window).catch(() => null);
        const m = w ? (await client.getMarket(e.account.market)).account : null;
        if (w && m && PulledClient.entryRefundable(m, w.account, e.account, await conn.getSlot())) {
          await send(await client.refund({ entry: e.pubkey, owner: kp.publicKey }), [kp], `refund ${i}`);
          console.log(`player ${i}: stake refunded`);
        } else if (m && PulledClient.entryClaimable(m, e.account)) {
          await send(await client.sellBack({ entry: e.pubkey, owner: kp.publicKey }), [kp], `sell ${i}`);
          console.log(`player ${i}: share sold back`);
        } else if (w) {
          console.log(`player ${i}: round ${w.account.index} still ${stateName(w.account.state)}; its stake stays until then (key in ${keyFile})`);
        }
      }
      const bal = await conn.getBalance(kp.publicKey);
      if (bal > 10_000) await send(new Transaction().add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: home.publicKey, lamports: bal - 5_000 })), [kp], "sweep");
    } catch (err) {
      console.log(`player ${i} ${kp.publicKey.toBase58()}: sweep failed (${String(err).slice(0, 120)}); its key is in ${keyFile}`);
    }
  }
}
const after = await conn.getBalance(home.publicKey);
console.log(`home ${sol(after)} SOL: ${sol(before - after)} SOL spent on the round (fees, the curve's spread, the 1 % platform fee) in ${Math.round((Date.now() - t0) / 1000)} s`);
