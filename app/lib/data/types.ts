/**
 * Data layer contract. Two implementations: `mock.ts` (deterministic demo,
 * settled with the real sdk law) and `chain.ts` (Solana, not wired yet).
 * Every amount is bigint lamports; every share is bigint base units of the token.
 */

export type Phase = "open" | "sealed" | "seeded" | "settled" | "sold";
export type Source = "demo" | "chain";

export interface EntryView {
  /** Position in the window (u32). Rolls are derived from seed || owner || index. */
  index: number;
  /** 32-byte owner pubkey. */
  owner: Uint8Array;
  /** Short pseudonym shown in the live window. */
  label: string;
  amount: bigint;
  /** True when this is the viewer's own entry. */
  mine: boolean;
  /** ms since the window opened. */
  arrivedAt: number;
  /** Present once the window is seeded. */
  roll?: bigint;
  /** Present once the window is settled. */
  share?: bigint;
}

export interface SettlementView {
  tokensOut: bigint;
  platformFee: bigint;
  hostFee: bigint;
  toCurve: bigint;
  /** share / pro-rata for the viewer's entry, display only. */
  myMultiplier: number | null;
  myShare: bigint | null;
  /** What the curve pays right now for my share (zero fee). */
  mySellBack: bigint | null;
  curveAfter: { x: bigint; y: bigint };
}

/** Another window of the same mint that is not the one in focus (windows are pipelined). */
export interface SiblingView {
  id: string;
  phase: Phase;
  slotsRemaining: number;
  slotsSinceSeal: number;
  entries: number;
  total: bigint;
}

export interface LiveWindow {
  id: string;
  mint: string;
  source: Source;
  phase: Phase;
  /** Epoch ms when the window opened and when it closes. Windows open on a fixed slot grid. */
  openedAt: number;
  closeAt: number;
  slotsTotal: number;
  slotsRemaining: number;
  /** Measured ms per slot; the UI labels any seconds figure as an estimate. */
  slotMs: number;
  /** Slots elapsed since the window was sealed (waiting for the oracle), frozen once the seed arrives. */
  slotsSinceSeal: number;
  /** Demo only: the sampled oracle delay for this window, ms after seal. null on chain. */
  seedDelayMs: number | null;
  capBps: bigint;
  hostFeeBps: bigint;
  entries: EntryView[];
  total: bigint;
  /** Has the viewer entered this window? */
  mineIndex: number | null;
  seedHex: string | null;
  vrfAccount: string | null;
  settlement: SettlementView | null;
  /** Amount received when the viewer sold back (phase "sold"). */
  soldFor: bigint | null;
  /** The other window in flight, if any: the open one while this one waits, or the waiting one while this one is open. */
  sibling: SiblingView | null;
}

export interface WindowView {
  id: string;
  mint: string;
  source: Source;
  closedAt: string; // ISO
  seedHex: string;
  vrfAccount: string;
  settleTx: string;
  hostFeeBps: bigint;
  capBps: bigint;
  curveBefore: { x: bigint; y: bigint };
  entries: Array<{
    index: number;
    owner: Uint8Array;
    amount: bigint;
    roll: bigint;
    share: bigint;
  }>;
  total: bigint;
  tokensOut: bigint;
}

export interface DistributionBucket {
  /** 1..10, by stake fraction of the window. */
  decile: number;
  lo: number;
  hi: number;
  n: number;
  meanMultiplier: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface PastDistribution {
  buckets: DistributionBucket[];
  /** the smallest and the largest scoop of the sample (share ÷ pro-rata), when the source knows them */
  min?: number;
  max?: number;
  measuredAt: string;
  sampleSize: number;
  source: Source;
}

export interface DataSource {
  getLiveWindow(): Promise<LiveWindow>;
  subscribe(cb: (w: LiveWindow) => void): () => void;
  getWindow(id: string): Promise<WindowView | null>;
  listRecentWindows(): Promise<WindowView[]>;
  getPastDistribution(): Promise<PastDistribution>;
  /** Demo only: place the viewer's entry in the open window. Absent on read-only sources. */
  enter?(amount: bigint): Promise<void>;
  /** Demo only: sell the viewer's share back at the curve price. */
  sellBack?(): Promise<void>;
}

/* ------------------------------ v20: history, books, Genesis ------------------------------ */

/**
 * One move of the LADLE curve. Prices are SOL per 1M LADLE (`x * 1e3 / y`,
 * x in lamports, y in 6-decimal base units): `before` / `after` are the spot
 * price around the trade, `roundPrice` the price the round paid
 * (`toCurve / tokensOut`, buys only).
 */
export interface CurvePoint {
  kind: "buy" | "sell";
  round: number | null;
  at: number;
  before: number;
  after: number;
  roundPrice: number | null;
  tokens: bigint;
  sol: bigint;
  players: number | null;
  /** sells: who sold (display pseudonym) */
  name?: string;
}

export interface ActivityItem {
  id: string;
  at: number;
  kind: "join" | "close" | "seed" | "served" | "sellback" | "sell" | "milestone";
  round?: string;
  name?: string;
  sol?: bigint;
  tokens?: bigint;
  players?: number;
  min?: number;
  max?: number;
  seed8?: string;
  milestone?: { what: "rounds" | "players" | "sol"; value: number };
  /** the viewer's own entry or sell */
  mine?: boolean;
}

export interface Books {
  rounds: number;
  players: number;
  solEntered: bigint;
  solToCurve: bigint;
  platformFees: bigint;
  hostFees: bigint;
  keeperBounties: bigint;
  solSoldBack: bigint;
  solInCurve: bigint;
  ladleHeld: bigint;
  last24h: { hourStart: number; rounds: number; sol: bigint }[];
}

export interface GenesisCount { claimed: number; cap: number }

export interface HistorySource {
  source: Source;
  getCurve(): Promise<CurvePoint[]>;
  /** Called with the whole current list (newest first, at most 30) on every change. */
  subscribeActivity(cb: (items: ActivityItem[]) => void): () => void;
  getBooks(): Promise<Books>;
  getGenesis(): Promise<GenesisCount | null>;
  /** Called on every curve change (a round served, a sell). */
  subscribeCurve?(cb: () => void): () => void;
}
