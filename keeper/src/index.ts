#!/usr/bin/env -S node --experimental-strip-types
/**
 * pulled-keeper CLI.
 *
 *   node --experimental-strip-types keeper/src/index.ts \
 *     --rpc https://api.devnet.solana.com --keypair ~/.config/solana/id.json \
 *     --market <MARKET_PDA> [--market <MARKET_PDA> ...] [--dry-run] [--interval 2000] [--page 48]
 *
 *   or, from a deployment file written by tests/devnet/create-market.ts:
 *     --deployment config/deployments/devnet.json --keypair <keeper keypair>
 *
 * `--market` also accepts a token mint: the market PDA is derived when the
 * given key is not a Market account.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { PulledClient, isAccountOf, marketPda } from "@pulled/sdk";
import { Keeper } from "./loop.ts";

interface Args {
  rpc: string;
  keypair: string;
  markets: string[];
  dryRun: boolean;
  interval: number;
  page: number;
  programId?: string;
  once: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { rpc: "", keypair: "", markets: [], dryRun: false, interval: 2000, page: 48, once: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    const v = () => { const x = argv[++i]; if (x === undefined) throw new Error(`${k} needs a value`); return x; };
    switch (k) {
      case "--rpc": a.rpc = v(); break;
      case "--keypair": a.keypair = v(); break;
      case "--market": a.markets.push(v()); break;
      case "--dry-run": a.dryRun = true; break;
      case "--interval": a.interval = Number(v()); break;
      case "--page": a.page = Number(v()); break;
      case "--program": a.programId = v(); break;
      case "--once": a.once = true; break;
      case "--deployment": {
        // config/deployments/<cluster>.json written by tests/devnet/create-market.ts
        const d = JSON.parse(readFileSync(v(), "utf8")) as { rpc?: string; market?: string; programId?: string };
        if (d.rpc && !a.rpc) a.rpc = d.rpc;
        if (d.market) a.markets.push(d.market);
        if (d.programId && !a.programId) a.programId = d.programId;
        break;
      }
      case "-h": case "--help": usage(); process.exit(0);
      default: throw new Error(`unknown flag ${k}`);
    }
  }
  if (!a.rpc) a.rpc = process.env.RPC_URL ?? "";
  // No default to ~/.config/solana/id.json: that file is often shared with other
  // projects; the keeper must be given its own funded keypair explicitly.
  if (!a.keypair) a.keypair = process.env.KEYPAIR ?? "";
  if (!a.keypair) throw new Error("--keypair (or KEYPAIR) is required: use a dedicated keeper keypair");
  if (!a.rpc) throw new Error("--rpc (or RPC_URL) is required");
  if (a.markets.length === 0) throw new Error("at least one --market is required");
  return a;
}

function usage() {
  process.stdout.write(`pulled-keeper --rpc <url> --keypair <file> --market <pda|mint> [--market ...] [--dry-run] [--interval ms] [--page n] [--once]\n`);
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path.replace(/^~/, homedir()), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const connection = new Connection(args.rpc, "confirmed");
  const keypair = loadKeypair(args.keypair);
  const programId = args.programId ? new PublicKey(args.programId) : undefined;
  const client = new PulledClient({ connection, programId });

  const markets: PublicKey[] = [];
  for (const m of args.markets) {
    const key = new PublicKey(m);
    const info = await connection.getAccountInfo(key);
    if (info && isAccountOf(new Uint8Array(info.data), "Market")) markets.push(key);
    else markets.push(marketPda(key, client.programId)[0]);
  }

  const keeper = new Keeper({ connection, keypair, markets, programId, intervalMs: args.interval, dryRun: args.dryRun, pageSize: args.page });
  process.on("SIGINT", () => { keeper.stop(); });
  process.on("SIGTERM", () => { keeper.stop(); });
  if (args.once) await keeper.tickOnce();
  else await keeper.run();
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: "error", action: "main", err: e instanceof Error ? e.message : String(e) }) + "\n");
  process.exit(1);
});
