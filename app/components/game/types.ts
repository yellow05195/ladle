/** Figures the chat bot quotes, computed on the server from the sdk law and the research files (never typed). */
export interface GameFacts {
  rollMax: string;
  belowPct: string;
  p50: string;
  p90: string;
  capPct: string;
  slots: number;
  seconds: number;
  medianS: number;
  p99S: number;
  feePct: string;
}

/**
 * A chat line (v17). `user`: a player typed a command. `drop`: an entry
 * landed in the drum (one line: "natep: !scoop 0.141"). `sys` / `reply`: the host bot.
 */
export type Msg =
  | { id: number; kind: "user"; name: string; mine: boolean; cmd: string }
  | { id: number; kind: "drop"; name: string; mine: boolean; sol: string; cmd?: string }
  | { id: number; kind: "sys" | "reply"; title: string; text: string; href?: string; hrefLabel?: string; /** v21.1: about the viewer's own entry or scoop (a cream note in the chat) */ personal?: boolean }
  /** v21: a room notice (a phase of the round), on the chat's text column */
  | { id: number; kind: "notice"; text: string; href?: string; hrefLabel?: string };

/** A player in the round, for the avatar strip. */
export interface Player { key: string; name: string; mine: boolean }

export interface ResultRow { key: string; label: string; initials: string; mine: boolean; amount: bigint; roll: bigint; m: number }

/** One settled round as the results board shows it. */
export interface RoundResult {
  id: string;
  n: string;
  live: boolean;
  rows: ResultRow[];
  total: bigint;
  tokensOut: bigint;
  toCurve: bigint;
  fee: bigint;
  sumShares: bigint;
  lowest: number;
  highest: number;
}

export const roundNo = (id: string) => id.replace(/^demo-/, "");

/** A message before it gets its id (the Omit distributed over the union). */
export type MsgIn = Msg extends infer M ? (M extends unknown ? Omit<M, "id"> : never) : never;
