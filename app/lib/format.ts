/** Display helpers. All amounts are bigint lamports; nothing here is used for arithmetic that matters. */

export const LAMPORTS_PER_SOL = 1_000_000_000n;

export function formatSol(lamports: bigint, decimals = 3): string {
  const neg = lamports < 0n;
  const abs = neg ? -lamports : lamports;
  const whole = abs / LAMPORTS_PER_SOL;
  const frac = abs % LAMPORTS_PER_SOL;
  const fracStr = frac.toString().padStart(9, "0").slice(0, decimals);
  return `${neg ? "-" : ""}${whole.toString()}${decimals > 0 ? "." + fracStr : ""}`;
}

/** One formatter for the whole page (building an Intl.NumberFormat per call cost a crowd's chat 4 % of a frame). */
const NF_INT = new Intl.NumberFormat("en-US");
export function formatInt(n: bigint | number, locale = "en"): string {
  void locale;
  return NF_INT.format(typeof n === "bigint" ? n : Math.round(n));
}

export function formatMultiplier(m: number): string {
  return `×${m.toFixed(3)}`;
}

export function formatPct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function formatSigned(x: number, digits = 4): string {
  const s = x.toFixed(digits);
  return x > 0 ? `+${s}` : s;
}

export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i]!.toString(16).padStart(2, "0");
  return s;
}

export function shortHex(hex: string, head = 6, tail = 4): string {
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${tail > 0 ? hex.slice(-tail) : ""}`;
}

export function formatDate(iso: string, locale = "en"): string {
  const d = new Date(iso);
  void locale;
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d);
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 encoding of a 32-byte key (display only). */
export function base58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    const r = Number(n % 58n);
    out = BASE58[r] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

export function shortKey(bytes: Uint8Array): string {
  const s = base58(bytes);
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
