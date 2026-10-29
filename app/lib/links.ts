/**
 * Every outbound link template lives here. Placeholders are marked TODO and
 * must be replaced at deployment; nothing else in the UI hard-codes a URL.
 * Explorer links follow NEXT_PUBLIC_SOLANA_CLUSTER (lib/data/cluster.ts):
 * `?cluster=devnet` on devnet, nothing on mainnet.
 */
import { PULLED_PROGRAM_ID } from "@pulled/sdk";
import { CLUSTER, PROGRAM_ENV } from "./data/cluster";

const CLUSTER_QUERY = CLUSTER === "devnet" ? "?cluster=devnet" : "";

/** Solana explorer, address view. `{address}` is replaced. */
export const EXPLORER_ADDRESS = `https://explorer.solana.com/address/{address}${CLUSTER_QUERY}`;
/** Solana explorer, transaction view. `{sig}` is replaced. */
export const EXPLORER_TX = `https://explorer.solana.com/tx/{sig}${CLUSTER_QUERY}`;

/** The program the app talks to: NEXT_PUBLIC_LADLE_PROGRAM, else the sdk's id. */
export const PROGRAM_ID = PROGRAM_ENV || PULLED_PROGRAM_ID.toBase58();

/** Placeholder of the repository link: a mainnet build refuses it (next.config.ts, launch gate). */
export const REPO_PLACEHOLDER = "https://github.com/pulled-fun/pulled";
/**
 * The public repository the security, odds, integrate and verify pages link
 * to ("verify the law"): NEXT_PUBLIC_LADLE_REPO, else the placeholder (an
 * organisation the owner may not hold: on mainnet those links must point at
 * the real repository).
 */
export const GITHUB_REPO = (process.env.NEXT_PUBLIC_LADLE_REPO ?? "").trim().replace(/\/+$/, "") || REPO_PLACEHOLDER;
export const GITHUB_G3 = `${GITHUB_REPO}/blob/main/research/G3.md`;
export const GITHUB_G4 = `${GITHUB_REPO}/blob/main/research/G4.md`;
export const GITHUB_LAW = `${GITHUB_REPO}/blob/main/sdk/src/law.ts`;
export const GITHUB_G3_DATA = `${GITHUB_REPO}/blob/main/research/data/G3-results.json`;
export const GITHUB_G4_DATA = `${GITHUB_REPO}/blob/main/research/data/G4-results.json`;

export function explorerAddress(address: string): string {
  return EXPLORER_ADDRESS.replace("{address}", address);
}
export function explorerTx(sig: string): string {
  return EXPLORER_TX.replace("{sig}", sig);
}
/** On-chain link for the program constants (fee, cap). */
export function programLink(): string {
  return explorerAddress(PROGRAM_ID);
}
export const GITHUB_G2 = `${GITHUB_REPO}/blob/main/research/G2.md`;
export const GITHUB_G6 = `${GITHUB_REPO}/blob/main/research/G6.md`;
export const GITHUB_G6_DATA = `${GITHUB_REPO}/blob/main/research/data/G6-slot-samples-summary.json`;
export const GITHUB_ORAO_DATA = `${GITHUB_REPO}/blob/main/research/data/orao-summary.json`;
export const GITHUB_G1 = `${GITHUB_REPO}/blob/main/research/G1.md`;
export const GITHUB_G5 = `${GITHUB_REPO}/blob/main/research/G5.md`;
export const GITHUB_G7 = `${GITHUB_REPO}/blob/main/research/G7.md`;
export const GITHUB_SECURITY = `${GITHUB_REPO}/blob/main/SECURITY.md`;
export const GITHUB_PROGRAM_README = `${GITHUB_REPO}/blob/main/programs/ladle/README.md`;
export const GITHUB_RISKS = `${GITHUB_REPO}/blob/main/docs/RISKS.md`;
export const GITHUB_MECHANICS = `${GITHUB_REPO}/blob/main/docs/MECHANICS.md`;
export const GITHUB_PROPS = `${GITHUB_REPO}/blob/main/tests/props/run.ts`;
