/**
 * One real round on mainnet, for the OWNER to run (desktop "Tester une mise Ladle.cmd"): it spends real SOL, so no
 * tool or agent runs it. From the wallet --keypair (the keeper's float, by default), it enters the open round with
 * --amount SOL, waits for the round to seal, draw and settle, prints the roll and the scoop, sells the scoop back to
 * the curve (1 % slippage cap) and prints what came back. A round that does not settle in time is refunded instead.
 * Anything left behind (a crash in the middle) is printed with the command that finishes it:
 *   node --experimental-strip-types keeper/src/ops/test-entry.ts --deployment config/deployments/mainnet-beta.json \
 *     --keypair %USERPROFILE%\.config\ladle\ladle-mainnet-keeper.json [--amount 0.1] [--rpc <url>] [--finish <entry>]
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, type Transaction } from "@solana/web3.js";
import { PulledClient, WindowState, type Entry, type Keyed } from "@pulled/sdk";

const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); const v = i >= 0 ? process.argv[i + 1] : undefined; if (v) return v; if (d !== undefined) return d; throw new Error(`--${n} is required`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sol = (l: bigint | number) => (Number(l) / LAMPORTS_PER_SOL).toFixed(6);
const dep = JSON.parse(readFileSync(arg("deployment"), "utf8")) as { cluster: string; rpc: string; programId: string; market: string; treasury: string; params: { windowSlots: string } };
let rpc = arg("rpc", "");
if (!rpc) { try { rpc = readFileSync(join(homedir(), ".config", "ladle", "helius-rpc.txt"), "utf8").trim(); } catch { rpc = dep.rpc; } }
const owner = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(arg("keypair"), "utf8")) as number[]));
const amount = BigInt(Math.round(Number(arg("amount", "0.1")) * LAMPORTS_PER_SOL));
const market = new PublicKey(dep.market);
const c = PulledClient.readOnly(rpc, { programId: new PublicKey(dep.programId), treasury: new PublicKey(dep.treasury) });
const conn = c.connection;
const st = (s: number) => Object.entries(WindowState).find(([, v]) => v === s)?.[0] ?? String(s);
const t0 = Date.now(), say = (m: string) => console.log(`[${Math.round((Date.now() - t0) / 1000)} s] ${m}`);
const send = async (tx: Transaction, what: string) => {
  for (let i = 1; ; i++) {
    try { return await sendAndConfirmTransaction(conn, tx, [owner], { commitment: "confirmed" }); }
    catch (e) { if (i >= 5 || !/429|blockhash|Too Many/i.test(String(e))) throw e; say(`${what}: retry ${i}`); await sleep(1500 * i); }
  }
};

/** the entry, settled (or refundable): sell it back (or take the refund) and say what came back */
async function finish(entry: PublicKey, before: number) {
  for (;;) {
    // a read the RPC refuses (429, a timeout) is retried; an account that is not there any more is the entry closed
    let cur: Keyed<Entry> | null, m: Awaited<ReturnType<typeof c.getMarket>>["account"], w: Awaited<ReturnType<typeof c.getWindow>> | null, slot: number;
    try {
      cur = await c.getEntry(entry).catch((err) => { if (/429|Too Many|fetch failed|timeout/i.test(String(err))) throw err; return null; });
      if (!cur) { say("the entry is already closed"); break; }
      m = (await c.getMarket(market)).account;
      w = await c.getWindow(cur.account.window).catch(() => null);
      slot = await conn.getSlot();
    } catch (err) { say(`read refused (${String(err).slice(0, 60)}), retrying`); await sleep(8000); continue; }
    try {
      if (cur.account.settled) {
        say(`settled: roll ${cur.account.roll} of 10000, scoop ${cur.account.share} LADLE (base units)${cur.account.refunded ? " (refunded round)" : ""}`);
        const q = await c.quoteSellBack(cur).catch(() => null);
        if (q) say(`sell back quote: ${JSON.stringify(q, (_, x) => (typeof x === "bigint" ? x.toString() : x)).slice(0, 200)}`);
        const sig = await send(await c.sellBack({ entry: cur.pubkey, owner: owner.publicKey, slippageBps: 100 }), "sell back");
        say(`sold back: ${sig}`);
        break;
      }
      if (w && PulledClient.entryRefundable(m, w.account, cur.account, slot)) {
        say("the round did not settle in time: taking the refund");
        say(`refunded: ${await send(await c.refund({ entry: cur.pubkey, owner: owner.publicKey }), "refund")}`);
        break;
      }
    } catch (err) { say(`not through (${String(err).slice(0, 80)}): trying again`); await sleep(8000); continue; }
    if (Date.now() - t0 > 25 * 60_000) throw new Error(`not settled after 25 min: rerun with --finish ${cur.pubkey.toBase58()}`);
    say(`round #${cur.account.windowIndex}: ${w ? st(w.account.state) : "closed"}, waiting…`);
    await sleep(10_000);
  }
  const after = await conn.getBalance(owner.publicKey);
  say(`wallet ${owner.publicKey.toBase58()}: ${sol(before)} -> ${sol(after)} SOL (${after >= before ? "+" : ""}${sol(after - before)})`);
}

// (devnet too: the same steps with test SOL, which is how this tool is checked before an owner runs it on mainnet)
if (dep.cluster !== "mainnet-beta" && dep.cluster !== "devnet") throw new Error(`unknown cluster ${dep.cluster}`);
const before = await conn.getBalance(owner.publicKey);
say(`wallet ${owner.publicKey.toBase58()}: ${sol(before)} SOL; market ${market.toBase58()}`);
const done = process.argv.indexOf("--finish");
if (done >= 0) {
  await finish(new PublicKey(process.argv[done + 1]!), before);
} else {
  if (BigInt(before) < amount + 20_000_000n) throw new Error(`the wallet needs ${sol(amount + 20_000_000n)} SOL (it has ${sol(before)})`);
  // an open round with room left (the entry must land before the seal)
  let entry: PublicKey | null = null;
  for (;;) {
    let w: Awaited<ReturnType<typeof c.getLiveWindow>>, slot: number;
    try { w = await c.getLiveWindow(market); slot = await conn.getSlot(); }
    catch (err) { say(`read refused (${String(err).slice(0, 60)}), retrying`); await sleep(8000); continue; }
    if (w && w.account.state === WindowState.Open && Number(w.account.closeSlot) - slot > 60) {
      // the entry's address is known before it is sent: printed first, so a stop at any point can be finished
      entry = c.entryAddress(w.pubkey, owner.publicKey);
      say(`entering round #${w.account.index} with ${sol(amount)} SOL (${Number(w.account.closeSlot) - slot} slots left); entry ${entry.toBase58()}`);
      say(`(if this stops from here on, finish it with --finish ${entry.toBase58()})`);
      const sig = await send(await c.enter({ market, amount, owner: owner.publicKey }), "enter");
      say(`entered: ${sig}`);
      break;
    }
    say("waiting for an open round with room left…");
    await sleep(8000);
  }
  await finish(entry, before);
}
