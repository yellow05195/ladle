"use client";

/**
 * Hands the connected wallet to the chain data source (app/lib/data/chain.ts)
 * so it can sign entries, takes and sell-backs, when NEXT_PUBLIC_DATA_SOURCE=chain
 * and a market is configured. In demo mode entries always go to the demo
 * source, whichever wallet is connected.
 */
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect } from "react";
import { chainConfigured, setChainWallet } from "../../lib/data/chain";

const CHAIN = process.env.NEXT_PUBLIC_DATA_SOURCE === "chain";

export function ChainBridge() {
  const { publicKey, sendTransaction, connected } = useWallet();
  useEffect(() => {
    if (!CHAIN || !chainConfigured()) return;
    if (connected && publicKey) setChainWallet({ publicKey, sendTransaction: (tx, conn) => sendTransaction(tx, conn) });
    else setChainWallet(null);
    return () => setChainWallet(null);
  }, [connected, publicKey, sendTransaction]);
  return null;
}
