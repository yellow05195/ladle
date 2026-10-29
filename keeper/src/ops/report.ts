#!/usr/bin/env -S node --experimental-strip-types
/**
 * Read-only: where the operator's SOL sits, as JSON (scripts/mainnet-recover.ps1
 * turns it into commands). Sends nothing, needs no keypair.
 *
 *   node --experimental-strip-types keeper/src/ops/report.ts \
 *     --cluster mainnet-beta --rpc <url> [--deployment config/deployments/mainnet-beta.json] \
 *     --deployer <address> --keeper <address> [--owner <address>] [--treasury <key>] [--notice-secs n]
 *
 * Reports: the program (data account rent, upgrade authority), buffers left
 * by an interrupted deploy, the deployer and keeper balances, the keeper's
 * and the treasury's wrapped SOL, and, for EVERY market of the program
 * (`create_market` is open to anyone: a market someone else created counts
 * as much as ours), its shutdown notice, the rent locked in rounds that are
 * not closed yet, and the players' money, which is theirs: the stakes still
 * in round escrows, the LADLE the curve has sold and not bought back
 * (`tokensOutstanding`: unsold shares, and LADLE a pre-v25 claim took to a
 * wallet), and every Entry account still open (a share to sell, a stake to
 * refund, or at least its owner's rent).
 *
 * `programClosable` is true only when closing the program locks nobody's
 * money or rent: the program scan worked and no Entry and no Window account
 * of any market is left (every entry paid out to its owner, every round
 * closed: what the wind-down build's notice and the keeper's `--shutdown`
 * drain do), nothing of an older layout this build cannot read is left, and
 * the program is the wind-down build (`windDown`: `start_wind_down`
 * simulated with `--owner`, else the deployer, as fee payer, which sends
 * nothing; the normal build does not have it), so no round or entry can
 * come in before the close. Markets still open then (closed by
 * `close_market` normally) are listed with what closing the program leaves
 * in them: their creator's rent, the quote in their vault, LADLE still in
 * wallets. A program with no market at all is closable right away (nothing
 * of anyone's can be in it; a market created in between would cost only its
 * own creator). Integration accounts (an integrator's rent, ~0.0012 SOL
 * each, no close instruction) are listed, not counted as blockers.
 *
 * Entries of a market already closed (`orphanEntries`; final review,
 * 2026-10-29): `close_market` is permissionless and does not count entries,
 * so whoever sends it first may leave entries open. They hold only their
 * owner's rent (every round closed, no LADLE out) and block the close like
 * any entry, until the keeper's `--shutdown` closes them (`close_entry`
 * needs no market; it sweeps the whole program, whoever closed the market).
 *
 * `--deployment` is optional: without it (a launch abandoned before its
 * market was created) the program id is the SDK's and the treasury
 * `--treasury` / LADLE_TREASURY. Every error text is scrubbed of the RPC URL
 * (a paid endpoint's key) before it is printed.
 */
import { readFileSync } from "node:fs";
import { PublicKey, Transaction, type Connection } from "@solana/web3.js";
import { AccountLayout, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  DISCRIMINATORS,
  INITIAL_VIRTUAL_Y,
  WIND_DOWN_NOTICE_SECS,
  PULLED_PROGRAM_ID,
  PulledClient,
  WindowState,
  ata,
  decodeEntry,
  decodeIntegration,
  decodeMarket,
  decodeWindow,
  isNativeQuote,
  resolveTreasury,
  type Entry,
  type Keyed,
  type LadleCluster,
  type Market,
  type Window,
} from "@pulled/sdk";
import { expandHome, scrubSecrets } from "../config.ts";
import { cluster as clusterOf, connect, isEntry, parseFlags, pubkey, runMain, str } from "./args.ts";

const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 of a few bytes (getProgramAccounts memcmp filters take base58). */
export function base58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = "1" + out; }
  return out;
}

async function lamportsOf(connection: Connection, keys: PublicKey[]): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const infos = await connection.getMultipleAccountsInfo(keys.slice(i, i + 100), { commitment: "confirmed", dataSlice: { offset: 0, length: 0 } });
    out.push(...infos.map((x) => x?.lamports ?? 0));
  }
  return out;
}

/** Lamports and token amounts of token accounts (0 / 0 when missing). */
async function tokenAccounts(connection: Connection, keys: PublicKey[]): Promise<{ lamports: number; amount: bigint }[]> {
  const out: { lamports: number; amount: bigint }[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const infos = await connection.getMultipleAccountsInfo(keys.slice(i, i + 100), "confirmed");
    out.push(...infos.map((x) => (x && x.data.length >= 165 ? { lamports: x.lamports, amount: AccountLayout.decode(x.data).amount } : { lamports: x?.lamports ?? 0, amount: 0n })));
  }
  return out;
}

async function wsol(connection: Connection, owner: PublicKey) {
  const address = ata(NATIVE_MINT, owner, TOKEN_PROGRAM_ID);
  const info = await connection.getAccountInfo(address);
  const amount = info ? AccountLayout.decode(info.data).amount : 0n;
  return { address: address.toBase58(), exists: !!info, lamports: info?.lamports ?? 0, wrapped: Number(amount) };
}

/**
 * Every account of the program with this Anchor discriminator, decoded;
 * `unreadable` counts those of another layout (made by an earlier build),
 * which this build cannot judge: they may hold stakes or rent.
 */
async function scan<T>(connection: Connection, programId: PublicKey, name: keyof typeof DISCRIMINATORS, decode: (d: Uint8Array) => T): Promise<{ list: Keyed<T>[]; unreadable: string[] }> {
  const accs = await connection.getProgramAccounts(programId, {
    commitment: "confirmed",
    filters: [{ memcmp: { offset: 0, bytes: base58(DISCRIMINATORS[name]) } }],
  });
  const list: Keyed<T>[] = [];
  const unreadable: string[] = [];
  for (const a of accs) {
    try { list.push({ pubkey: a.pubkey, account: decode(new Uint8Array(a.account.data)) }); } catch { unreadable.push(a.pubkey.toBase58()); }
  }
  return { list, unreadable };
}

/**
 * Is the deployed program the wind-down build? `start_wind_down` simulated
 * with `payer` as fee payer (no signature checked, nothing sent): the
 * normal build does not have the instruction (InstructionFallbackNotFound);
 * the wind-down build runs it (success, or NoticeAlreadyStarted). null when
 * the simulation stopped before the program (the payer's balance): unknown.
 */
export async function isWindDown(client: PulledClient, payer: PublicKey, marketPk: PublicKey): Promise<boolean | null> {
  try {
    const tx = new Transaction({ feePayer: payer }).add(...client.startWindDownInstructions(marketPk));
    const sim = await client.connection.simulateTransaction(tx);
    return windDownFromLogs(sim.value.err, sim.value.logs ?? []);
  } catch { return null; }
}

/**
 * Entries whose market account is gone (closed by `close_market`, which does
 * not count entries): only their owners' rent is left in them, and
 * `close_entry` returns it without the market.
 */
export function orphanEntries(markets: readonly PublicKey[], entries: readonly Keyed<Entry>[]): Keyed<Entry>[] {
  const live = new Set(markets.map((m) => m.toBase58()));
  return entries.filter((e) => !live.has(e.account.market.toBase58()));
}

/** The verdict of `isWindDown` from a simulation's error and logs. */
export function windDownFromLogs(err: unknown, logs: readonly string[]): boolean | null {
  const text = logs.join("\n");
  if (/InstructionFallbackNotFound|Fallback functions are not supported/.test(text)) return false;
  if (!err || /NoticeAlreadyStarted/.test(text)) return true;
  return null;
}

async function main() {
  const f = parseFlags(process.argv.slice(2), []);
  const c = clusterOf(f);
  const rpc = str(f, "--rpc");
  // web3.js quotes the URL (a paid endpoint's key included) in its fetch errors
  const scrub = (e: unknown) => scrubSecrets(e instanceof Error ? e.message : String(e), [rpc]);
  const connection = await connect(f, c);
  // optional: a launch abandoned before its market has no deployment file (or a pending one only)
  const dep = (f.has("--deployment") ? JSON.parse(readFileSync(expandHome(str(f, "--deployment")), "utf8")) : {}) as { market?: string; programId?: string; treasury?: string };
  const noticeSecs = f.has("--notice-secs") ? BigInt(str(f, "--notice-secs")) : WIND_DOWN_NOTICE_SECS;
  const programId = new PublicKey(dep.programId ?? PULLED_PROGRAM_ID);
  const deployer = pubkey(str(f, "--deployer"), "--deployer");
  const keeper = pubkey(str(f, "--keeper"), "--keeper");
  const owner = f.has("--owner") ? pubkey(str(f, "--owner"), "--owner") : null;
  // the deployment file records the treasury the market was created with
  const treasury = resolveTreasury(c as LadleCluster, f.has("--treasury") ? str(f, "--treasury") : (dep.treasury ?? process.env.LADLE_TREASURY));
  const client = new PulledClient({ connection, programId, treasury });

  // program: Program { programdata } -> ProgramData { slot, Option<authority> }
  const program: Record<string, unknown> = { id: programId.toBase58(), deployed: false };
  const prog = await connection.getAccountInfo(programId);
  if (prog?.executable && prog.owner.equals(LOADER)) {
    const programData = new PublicKey(prog.data.subarray(4, 36));
    const pd = await connection.getAccountInfo(programData, { commitment: "confirmed", dataSlice: { offset: 0, length: 45 } });
    const authority = pd && pd.data[12] === 1 ? new PublicKey(pd.data.subarray(13, 45)).toBase58() : null;
    Object.assign(program, {
      deployed: true,
      programLamports: prog.lamports,
      programData: programData.toBase58(),
      programDataLamports: pd?.lamports ?? 0,
      upgradeAuthority: authority,
      authorityIsDeployer: authority === deployer.toBase58(),
    });
  }

  // buffers whose authority is the deployer (an interrupted deploy)
  let buffers: { address: string; lamports: number }[] | null = null;
  let buffersError: string | null = null;
  try {
    const accs = await connection.getProgramAccounts(LOADER, {
      commitment: "confirmed",
      dataSlice: { offset: 0, length: 5 },
      filters: [{ memcmp: { offset: 5, bytes: deployer.toBase58() } }],
    });
    // Buffer = enum tag 1, then Some(authority)
    buffers = accs.filter((a) => a.account.data[0] === 1 && a.account.data[4] === 1).map((a) => ({ address: a.pubkey.toBase58(), lamports: a.account.lamports }));
  } catch (e) { buffersError = scrub(e); }

  // every market, round and entry of the program: whoever created them
  const blockers: string[] = [];
  let scanError: string | null = null;
  let allMarkets: Keyed<Market>[] = [];
  let allWindows: Keyed<Window>[] = [];
  let allEntries: Keyed<Entry>[] = [];
  let integrations: { address: string; host: string; lamports: number }[] = [];
  const unreadable: Record<string, string[]> = {};
  if (program.deployed) {
    try {
      const markets = await scan(connection, programId, "Market", decodeMarket);
      const windows = await scan(connection, programId, "Window", decodeWindow);
      const entries = await scan(connection, programId, "Entry", decodeEntry);
      const ints = await scan(connection, programId, "Integration", decodeIntegration);
      allMarkets = markets.list; allWindows = windows.list; allEntries = entries.list;
      const intLamports = await lamportsOf(connection, ints.list.map((i) => i.pubkey));
      integrations = ints.list.map((i, k) => ({ address: i.pubkey.toBase58(), host: i.account.host.toBase58(), lamports: intLamports[k]! }));
      for (const [name, r] of [["Market", markets], ["Window", windows], ["Entry", entries]] as const) {
        if (!r.unreadable.length) continue;
        unreadable[name] = r.unreadable;
        blockers.push(`${r.unreadable.length} ${name} account(s) of an older layout (an earlier build made them; this one cannot read them, so they may hold stakes or rent): ${r.unreadable.slice(0, 5).join(", ")}${r.unreadable.length > 5 ? ", ..." : ""}`);
      }
    } catch (e) {
      scanError = scrub(e);
      blockers.push(`the program's accounts could not be listed (${scanError}): rerun with a paid RPC (getProgramAccounts)`);
    }
  }
  // a recorded market that is gone was closed by close_market (wind-down build): fine
  const recordedFound = !dep.market || allMarkets.some((m) => m.pubkey.toBase58() === dep.market);
  const now = await new PulledClient({ connection, programId }).getClusterTime().catch(() => null);

  const markets: Record<string, unknown>[] = [];
  for (const { pubkey: marketPk, account: m } of allMarkets) {
    const mk = marketPk.toBase58();
    const windows = allWindows.filter((w) => w.account.market.equals(marketPk));
    const vault = await connection.getAccountInfo(m.quoteVault);
    const native = isNativeQuote(m);
    const escrows = await tokenAccounts(connection, windows.map((w) => w.account.escrow));
    // a stake sits in the escrow from enter until finalize or its refund; after finalize only what
    // a stranger sent there can (dust, swept into the vault by close_window)
    const paidOut = (s: WindowState) => s === WindowState.Tallied || s === WindowState.Settled;
    let stakes = 0n, dust = 0n;
    windows.forEach((w, i) => { if (paidOut(w.account.state)) dust += escrows[i]!.amount; else stakes += escrows[i]!.amount; });
    const unfinished = windows.filter((w) =>
      w.account.state === WindowState.Refunding ? w.account.refundedEntries < w.account.entryCount : !paidOut(w.account.state) && w.account.entryCount > 0);
    const mineIdx = windows.map((w, i) => [w, i] as const).filter(([w]) => w.account.opener.equals(keeper));
    const mine = mineIdx.map(([w]) => w);
    const winLamports = await lamportsOf(connection, mine.map((w) => w.pubkey));
    // a wSOL escrow's lamports are its rent plus the stakes: count only the rent as the keeper's
    const escrowRent = mineIdx.map(([, i]) => escrows[i]!.lamports - (native ? Number(escrows[i]!.amount) : 0));
    const finished = (s: WindowState) => s === WindowState.Settled || s === WindowState.Refunding;
    // v22: a Settled window closes at once (the active one too since the second review); only a Refunding one waits, for its last refund
    const blocked = mine.filter((w) => finished(w.account.state) && !PulledClient.isWindowClosable(m, w.account));
    const tokensOutstanding = INITIAL_VIRTUAL_Y - m.curve.y;
    const entries = allEntries.filter((e) => e.account.market.equals(marketPk));
    const recorded = mk === dep.market;
    const who = recorded ? "the deployment's market" : `market ${mk} (created by ${m.creator.toBase58()})`;
    // LADLE out of entries: in wallets (a pre-v25 claim); not blocking: their holders had the notice to sell
    const inEntries = entries.reduce((a, e) => a + (e.account.settled ? e.account.share - e.account.claimed : 0n), 0n);
    const inWallets = tokensOutstanding - inEntries;
    if (stakes > 0n || unfinished.length > 0) blockers.push(`${who}: ${unfinished.length} round(s) hold players' stakes`);
    if (inEntries > 0n) blockers.push(`${who}: ${Number(inEntries) / 1e6} LADLE of unsold shares in its entries (force_exit sells them for their owners after the notice)`);
    if (windows.length > unfinished.length) blockers.push(`${who}: ${windows.length - unfinished.length} other round account(s) left, an empty open round or finished ones (close_window returns each one's rent to its opener once it is finished; the drain does it)`);
    const noticeEnd = PulledClient.noticeEnd(m, noticeSecs);
    const vaultLamports = vault?.lamports ?? 0;
    const marketLamports = (await lamportsOf(connection, [marketPk, m.tokenVault]));
    markets.push({
      address: mk,
      recorded,
      creator: m.creator.toBase58(),
      quoteVault: m.quoteVault.toBase58(),
      playersVaultLamports: vault?.lamports ?? 0,
      playersVaultWrapped: vault ? Number(AccountLayout.decode(vault.data).amount) : 0,
      windowCount: Number(m.windowCount),
      // rounds opened and not out of the settlement queue (the program stops opening rounds at 8)
      windowsPending: Number(m.windowCount - m.nextSettleIndex),
      windowsOpen: windows.length,
      keeperWindows: mine.length,
      keeperWindowRentLamports: winLamports.reduce((a, b) => a + b, 0) + escrowRent.reduce((a, b) => a + b, 0),
      keeperWindowsWaitingForRefunds: blocked.length,
      // rounds whose players' money is still in play: entries not finalized, or stakes not all refunded
      windowsHoldingStakes: unfinished.length,
      // the players' stakes in round escrows (quote base units), and quote a stranger sent to finished escrows
      stakesInEscrows: Number(stakes),
      escrowDust: Number(dust),
      // LADLE sold by the curve and not bought back: unclaimed scoops plus wallets (base units)
      tokensOutstanding: Number(tokensOutstanding),
      // of which in wallets (a pre-v25 claim): closing the program leaves their backing in the vault
      tokensInWallets: Number(inWallets),
      entriesOpen: entries.length,
      // shutdown (wind-down build): the notice, and whether close_market would pass now
      noticeStart: Number(m.noticeStart),
      noticeEnd: noticeEnd === null ? null : Number(noticeEnd),
      noticeOver: noticeEnd !== null && now !== null && now >= noticeEnd,
      countsWindows: m.countsWindows,
      liveWindows: Number(m.liveWindows),
      closableByCloseMarket: now !== null && PulledClient.isMarketClosable(m, now, noticeSecs),
      // what stays if the program is closed with this market open: its accounts (rents to its creator) and the vault's quote
      leftIfProgramClosed: { marketAndVaultsLamports: marketLamports[0]! + marketLamports[1]! + vaultLamports },
    });
  }

  // entries: a share to sell, a stake to refund, or only the owner's rent (closable by anyone: close_entry pays the owner)
  const holdingShares = allEntries.filter((e) => e.account.settled && e.account.claimed < e.account.share).length;
  const holdingStakes = allEntries.filter((e) => !e.account.settled && !e.account.refunded).length;
  const closableEntries = allEntries.filter((e) => PulledClient.isEntryClosable(e.account)).length;
  const orphans = orphanEntries(allMarkets.map((m) => m.pubkey), allEntries);
  if (allEntries.length) {
    blockers.push(`${allEntries.length} entry account(s) open: ${holdingShares} with a share to sell, ${holdingStakes} with a stake, ${closableEntries} with only their owner's rent (after the notice the keeper's --shutdown pays every one of them out: force_exit / close_entry)`);
  }
  if (orphans.length) {
    const markets = [...new Set(orphans.map((e) => e.account.market.toBase58()))];
    blockers.push(`of which ${orphans.length} belong to market(s) already closed (${markets.slice(0, 3).join(", ")}${markets.length > 3 ? ", ..." : ""}): only their owners' rent is left in them; the keeper's --shutdown closes them program-wide (close_entry needs no market)`);
  }

  // the race between this snapshot and the close: only the wind-down build refuses new rounds and entries
  let windDown: boolean | null = null;
  const probe = allMarkets.find((m) => m.pubkey.toBase58() === dep.market) ?? allMarkets[0];
  if (program.deployed && probe) windDown = await isWindDown(client, owner ?? deployer, probe.pubkey);
  if (program.deployed && allMarkets.length > 0 && windDown !== true) {
    blockers.push(windDown === false
      ? "the program is the normal build: rounds and entries can still come in; upgrade to the wind-down build first (scripts/mainnet-shutdown.ps1)"
      : "could not tell whether the wind-down build is live (the start_wind_down simulation did not run): rerun");
  }

  const programClosable = !!program.deployed && !!program.upgradeAuthority && blockers.length === 0;
  // what closing the program would leave behind that is not a player's: markets not closed, integrations
  const leftBehind = {
    marketsOpen: markets.map((m) => ({ address: m.address, creator: m.creator, lamports: (m.leftIfProgramClosed as { marketAndVaultsLamports: number }).marketAndVaultsLamports, tokensInWallets: m.tokensInWallets })),
    integrations,
  };
  const report = {
    cluster: c,
    program,
    buffers,
    buffersError,
    deployer: { address: deployer.toBase58(), lamports: await connection.getBalance(deployer) },
    keeper: { address: keeper.toBase58(), lamports: await connection.getBalance(keeper), wsol: await wsol(connection, keeper) },
    treasury: { address: treasury.toBase58(), lamports: await connection.getBalance(treasury), wsol: await wsol(connection, treasury) },
    markets,
    marketsOfOthers: markets.filter((m) => !m.recorded).length,
    recordedMarketFound: recordedFound,
    entries: { open: allEntries.length, holdingShares, holdingStakes, closable: closableEntries, ofClosedMarkets: orphans.length },
    // entries left by a market someone closed (the first 20): closable by anyone, rent to their owner
    orphanEntries: orphans.slice(0, 20).map((e) => ({
      address: e.pubkey.toBase58(),
      market: e.account.market.toBase58(),
      owner: e.account.owner.toBase58(),
      closable: PulledClient.isEntryClosable(e.account),
    })),
    clusterTime: now === null ? null : Number(now),
    noticeSecs: Number(noticeSecs),
    scanError,
    unreadable,
    windDown,
    closeBlockers: blockers,
    programClosable,
    leftBehind,
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

if (isEntry(import.meta.url)) runMain(main);
