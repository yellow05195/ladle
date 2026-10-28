/**
 * What the viewer typed: a command ("!..."), talk, or nothing. Commands stay
 * on this page (useRoundChat answers them with the round's real figures and
 * the chain carries entries to everyone else); talk goes to the room.
 *
 * The relay is the authority on talk. The checks here are the cheap ones
 * (length, links) so the hint shows at once, without a round trip.
 *
 * Imports only ./protocol.ts (with its extension) so Node's test runner can
 * load this file too.
 */
import { MAX_TEXT, POSES_AS } from "./protocol.ts";

/** The commands useRoundChat understands (aliases included). */
export const COMMANDS = ["scoop", "pull", "join", "enter", "odds", "pot", "sum", "verify", "sell", "help", "commands"] as const;
export type CommandName = (typeof COMMANDS)[number];

/** NFKC, invisible and control characters out, one space between words. */
export function cleanText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[\t\n\r\v\f]/g, " ")
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/gu, "")
    .replace(/(\p{M}{2})\p{M}+/gu, "$1")
    .replace(/[\s⠀ㅤᅟᅠﾠ]+/g, " ")
    .trim();
}

export const charCount = (s: string) => [...s].length;

export type Classified =
  | { kind: "empty" }
  | { kind: "command"; known: true; name: CommandName; arg: string; text: string }
  | { kind: "command"; known: false; name: string; arg: string; text: string }
  | { kind: "talk"; text: string };

export function classify(raw: string): Classified {
  const text = cleanText(raw);
  if (!text) return { kind: "empty" };
  if (text.startsWith("!")) {
    const [head = "", ...rest] = text.slice(1).split(" ");
    const name = head.toLowerCase();
    const arg = rest.join(" ");
    return (COMMANDS as readonly string[]).includes(name)
      ? { kind: "command", known: true, name: name as CommandName, arg, text }
      : { kind: "command", known: false, name, arg, text };
  }
  return { kind: "talk", text };
}

/** A quick look for links ("useladle.fun", "x (dot) com", "https://", "www."); the relay checks more. */
const TLDS = "com|net|org|io|xyz|app|gg|me|co|fun|link|site|online|top|click|live|finance|money|ai|dev|info|biz|ru|cn|tk|ml|ga|cf|gq|pw|cc|ly|sh|vip|pro|store|shop|network|exchange|claims?|gift|today|world|sol|tv|us|uk|eu|de|fr|xxx|lol|wtf|bet|casino|games?|art|club|space|website|page|ws|su|zip|mov|icu|buzz|cloud|digital|agency";
const LINK = [
  /(?:https?|ftp|wss?|ipfs|file):\/\//,
  /(?:^|[^a-z0-9])www\./,
  /xn--/,
  new RegExp(`(?:^|[^a-z0-9-])[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})(?![a-z0-9-])`),
];
export function looksLikeLink(text: string): boolean {
  const s = text
    .toLowerCase()
    .replace(/\s*[([{<]\s*(?:dot|\.)\s*[)\]}>]\s*/g, ".")
    .replace(/\s+dot\s+(?=[a-z]{2,}\b)/g, ".")
    .replace(/\s+\.\s*/g, ".");
  return LINK.some((re) => re.test(s));
}

/** Would the room accept this nickname? (the app's rule, plus no posing as the house or as a guest) */
export function roomNicknameOk(nick: string): boolean {
  return !nick.startsWith("guest") && !POSES_AS.some((w) => nick.includes(w));
}

export type FailReason = "no-profile" | "rate-limited" | "too-long" | "empty" | "unknown-command" | "offline" | "blocked" | "muted" | "not-signed";

/** One short line under the input. Plain, never blaming, never urging to play. */
export function hintFor(reason: FailReason, x: { chars?: number; retryMs?: number; slowMs?: number | null; everyMs?: number; /** the command the viewer typed (unknown-command) */ cmd?: string } = {}): string {
  // "1.5 s" for a rule, whole seconds for a wait
  const every = (ms: number) => `${Math.max(0.5, Math.round(ms / 500) / 2)} s`;
  const s = (ms: number) => `${Math.max(1, Math.ceil(ms / 1000))} s`;
  switch (reason) {
    case "empty": return "Type a line, or a command like !odds.";
    case "unknown-command": {
      const c = (x.cmd ?? "").split(" ")[0]!.slice(0, 24);
      // (the chat draws the typed command as a token, so it needs no quotes)
      return `${c && c !== "!" ? `${c} isn’t a command.` : "That isn’t a command."} Try !scoop 0.25, !odds, !pot, !verify, !sell.`;
    }
    case "too-long": return `Keep it to ${MAX_TEXT} characters${x.chars ? ` (this one has ${x.chars})` : ""}.`;
    case "no-profile": return "Make a profile to talk. Reading the room needs nothing.";
    case "not-signed": return "Talking needs one signature from your wallet. It is not a transaction.";
    case "rate-limited":
      if (x.slowMs) return `The room is in slow mode, one line every ${every(x.slowMs)}${x.retryMs ? `. Next line in ${s(x.retryMs)}` : ""}.`;
      // (never "one line every 1.5 s, next in 2 s": the wait is rounded up, the rule is not)
      return x.retryMs ? `Slow down a little: next line in ${s(x.retryMs)}.` : `Slow down a little: one line every ${every(x.everyMs ?? 1500)}.`;
    case "offline": return "The room is reconnecting. That line was not sent.";
    case "blocked": return "Links, addresses and wallet requests stay out of the room.";
    case "muted": return "This wallet is muted in the room.";
  }
}
