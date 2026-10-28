"use client";

/**
 * The wallet (v20): @solana/wallet-adapter-react with an empty adapter list.
 * Wallet Standard auto-detection finds Phantom, Solflare and Backpack (and
 * the mobile wallet adapter on Android); the connect sheet is our own.
 * `autoConnect` only reconnects a wallet the viewer approved before.
 */
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";
import type { ReactNode } from "react";
import { ChainBridge } from "./ChainBridge";

const ENDPOINT = process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet");

export function WalletProviders({ children }: { children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={ENDPOINT}>
      <WalletProvider wallets={[]} autoConnect onError={() => { /* surfaced by the connect sheet */ }}>
        <ChainBridge />
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
