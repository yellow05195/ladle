/**
 * Which Solana cluster the app reads and writes (public, baked at build
 * time, so a change needs a redeploy). No secret belongs in any of these:
 * every NEXT_PUBLIC_ value ships to the browser.
 *
 *   NEXT_PUBLIC_SOLANA_CLUSTER  mainnet-beta | devnet: required for a chain
 *                               build (next.config.ts stops one without it);
 *                               the chain source checks that the RPC's
 *                               genesis hash is this cluster's
 *   NEXT_PUBLIC_RPC_URL         required on mainnet-beta: a paid RPC whose
 *                               key only works from the site's origin
 *   NEXT_PUBLIC_RPC_WS_URL      optional: the provider's websocket, when it
 *                               is not the RPC url with wss://; "off" when
 *                               the RPC has none (the relay app/api/rpc)
 *   NEXT_PUBLIC_LADLE_PROGRAM   optional: the sdk's program id otherwise
 *   NEXT_PUBLIC_LADLE_MARKET    required in chain mode: the market PDA
 *   NEXT_PUBLIC_LADLE_REPO      the public repository (lib/links.ts): a
 *                               mainnet build refuses the placeholder
 *   NEXT_PUBLIC_LADLE_WINDOW_SLOTS, NEXT_PUBLIC_LADLE_VRF_TIMEOUT_SLOTS
 *                               the market's window_slots and
 *                               vrf_timeout_slots, as config/deployments
 *                               records them: the round length and refund
 *                               delay the pages state (lib/measurements.ts
 *                               roundSlots); a mainnet build requires both
 *                               and checks them against the record
 *
 * Kept free of imports: the footer and the explorer links read it on the
 * server, the chain source in the browser.
 */
export type Cluster = "mainnet-beta" | "devnet";

const rawCluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "").trim().toLowerCase();

/** mainnet-beta only when the build says so; anything else reads as devnet (and `clusterProblem` says why). */
export const CLUSTER: Cluster = rawCluster === "mainnet-beta" || rawCluster === "mainnet" ? "mainnet-beta" : "devnet";
export const MAINNET = CLUSTER === "mainnet-beta";

/** The public endpoints: devnet's is fine for a test; mainnet's is rate limited and not for a site, so it is never a fallback for reads. */
export const PUBLIC_RPC: Record<Cluster, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
};

export const RPC_URL = (process.env.NEXT_PUBLIC_RPC_URL ?? "").trim();
const rawWs = (process.env.NEXT_PUBLIC_RPC_WS_URL ?? "").trim();
/** "off": the RPC has no websocket (the site's relay, app/api/rpc): no subscription, the polls carry everything. */
export const RPC_WS_OFF = rawWs.toLowerCase() === "off";
export const RPC_WS_URL = RPC_WS_OFF ? "" : rawWs;
export const PROGRAM_ENV = (process.env.NEXT_PUBLIC_LADLE_PROGRAM ?? "").trim();
export const MARKET_ENV = (process.env.NEXT_PUBLIC_LADLE_MARKET ?? "").trim();

/** A whole, positive number of slots, or null (unset or malformed); the launch gate (next.config.ts) reads them the same way. */
export function slotsSetting(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  return /^[1-9]\d{0,5}$/.test(s) ? Number(s) : null;
}
/** The deployed market's window_slots, when the build was given it. */
export const WINDOW_SLOTS_ENV = slotsSetting(process.env.NEXT_PUBLIC_LADLE_WINDOW_SLOTS);
/** The deployed market's vrf_timeout_slots, when the build was given it. */
export const VRF_TIMEOUT_SLOTS_ENV = slotsSetting(process.env.NEXT_PUBLIC_LADLE_VRF_TIMEOUT_SLOTS);

/** The endpoint the wallet adapter and the chain source use: the configured RPC, else the cluster's public one (devnet only for reads). */
export const RPC_ENDPOINT = RPC_URL || PUBLIC_RPC[CLUSTER];

/** A cluster value the build did not mean (e.g. "testnet"), or null. */
export function clusterProblem(): string | null {
  if (rawCluster && rawCluster !== "mainnet-beta" && rawCluster !== "mainnet" && rawCluster !== "devnet") {
    return `NEXT_PUBLIC_SOLANA_CLUSTER is "${rawCluster}": use mainnet-beta or devnet.`;
  }
  return null;
}
