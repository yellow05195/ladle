/**
 * The six player colours (v18, Ladle): tomato, saffron, teal, sky, mint,
 * plum. A colour is an IDENTITY: it comes from a hash of the player's name,
 * never from a result. Balls, avatars, chat names and confetti use it; a
 * multiplier, a share or a rank never does (results stay neutral cream).
 * "You" keeps your own colour and is marked by a cream ring and the YOU tag.
 */
export const PLAYER_COLORS = ["#FF5A36", "#FFB21A", "#2EC4B6", "#5AA9FF", "#7ED957", "#C77DFF"] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];

/** The same six, by name (kept for callers that still name an accent; v18 draws no section accents). */
export const ACCENTS = { tomato: "#FF5A36", saffron: "#FFB21A", teal: "#2EC4B6", sky: "#5AA9FF", mint: "#7ED957", plum: "#C77DFF", blue: "#5AA9FF", amber: "#FFB21A", pink: "#FF5A36", violet: "#C77DFF", cyan: "#2EC4B6" } as const;
export type Accent = keyof typeof ACCENTS;

/** Text on any of the six fills: charcoal (AA on all six). */
export const ON_PLAYER = "#16120F";

/** FNV-1a over the name: stable across sessions and pages. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** The player's colour, from their name only. */
export function playerColor(name: string): PlayerColor {
  return PLAYER_COLORS[hash(name.toLowerCase()) % PLAYER_COLORS.length]!;
}

/** Two letters for an avatar or a ball. */
export function initialsOf(name: string): string {
  return name.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "··";
}

/** A neutral "new" badge for about a third of the demo names (a first-time chatter, nothing about a result). */
export function isNewChatter(name: string): boolean {
  return hash(`new:${name}`) % 3 === 0;
}
