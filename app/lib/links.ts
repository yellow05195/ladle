/**
 * Every outbound link template lives here. Placeholders are marked TODO and
 * must be replaced at deployment; nothing else in the UI hard-codes a URL.
 */

/** Solana explorer, address view. `{address}` is replaced. */
export const EXPLORER_ADDRESS = "https://explorer.solana.com/address/{address}?cluster=devnet";
/** Solana explorer, transaction view. `{sig}` is replaced. */
export const EXPLORER_TX = "https://explorer.solana.com/tx/{sig}?cluster=devnet";

/** TODO: replace with the deployed program id. */
export const PROGRAM_ID_PLACEHOLDER = "PULLEDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

/** TODO: replace with the public repository once published. */
export const GITHUB_REPO = "https://github.com/pulled-fun/pulled";
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
/** On-chain link for the program constants (fee, cap). Placeholder until deployed. */
export function programLink(): string {
  return explorerAddress(PROGRAM_ID_PLACEHOLDER);
}
export const GITHUB_G2 = `${GITHUB_REPO}/blob/main/research/G2.md`;
export const GITHUB_G6 = `${GITHUB_REPO}/blob/main/research/G6.md`;
export const GITHUB_G6_DATA = `${GITHUB_REPO}/blob/main/research/data/G6-slot-samples-summary.json`;
export const GITHUB_ORAO_DATA = `${GITHUB_REPO}/blob/main/research/data/orao-summary.json`;
export const GITHUB_G1 = `${GITHUB_REPO}/blob/main/research/G1.md`;
export const GITHUB_G5 = `${GITHUB_REPO}/blob/main/research/G5.md`;
export const GITHUB_G7 = `${GITHUB_REPO}/blob/main/research/G7.md`;
export const GITHUB_SECURITY = `${GITHUB_REPO}/blob/main/SECURITY.md`;
export const GITHUB_PROGRAM_README = `${GITHUB_REPO}/blob/main/programs/pulled/README.md`;
export const GITHUB_RISKS = `${GITHUB_REPO}/blob/main/docs/RISKS.md`;
export const GITHUB_MECHANICS = `${GITHUB_REPO}/blob/main/docs/MECHANICS.md`;
export const GITHUB_PROPS = `${GITHUB_REPO}/blob/main/tests/props/run.ts`;
