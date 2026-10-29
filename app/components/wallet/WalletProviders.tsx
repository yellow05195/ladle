"use client";

/**
 * The wallet (v20): @solana/wallet-adapter-react with an empty adapter list.
 * Wallet Standard auto-detection finds Phantom, Solflare and Backpack (and
 * the mobile wallet adapter on Android); the connect sheet is our own.
 * `autoConnect` only reconnects a wallet the viewer approved before.
 * The endpoint is the build's cluster (lib/data/cluster.ts): the configured
 * RPC, else the cluster's public one (the chain source refuses mainnet
 * without a configured RPC and says so).
 */
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import type { ReactNode } from "react";
import { RPC_ENDPOINT, RPC_WS_URL } from "../../lib/data/cluster";
import { ChainBridge } from "./ChainBridge";

const CONFIG = { commitment: "confirmed" as const, ...(RPC_WS_URL ? { wsEndpoint: RPC_WS_URL } : {}) };

export function WalletProviders({ children }: { children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT} config={CONFIG}>
      <WalletProvider wallets={[]} autoConnect onError={() => { /* surfaced by the connect sheet */ }}>
        <ChainBridge />
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
