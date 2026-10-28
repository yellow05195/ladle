/**
 * Wallet sign-in without extra crypto dependencies: base58 for addresses,
 * ed25519 verification with node:crypto, and HMAC resume tokens so a page
 * that reconnects (network blip, relay restart with the same secret, a new
 * tab) does not ask the wallet to sign again.
 */
import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import type { WireProfile } from "./protocol.ts";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_MAP = new Map([...B58].map((c, i) => [c, i]));

export function base58Decode(s: string): Uint8Array | null {
  if (!s || s.length > 64) return null;
  let n = 0n;
  for (const c of s) {
    const v = B58_MAP.get(c);
    if (v === undefined) return null;
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.push(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c === "1") bytes.push(0); else break; }
  return Uint8Array.from(bytes.reverse());
}

export function base58Encode(b: Uint8Array): string {
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  let out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const x of b) { if (x === 0) out = "1" + out; else break; }
  return out;
}

/** A Solana address: base58 of exactly 32 bytes. */
export function addressBytes(address: string): Uint8Array | null {
  const b = base58Decode(address);
  return b && b.length === 32 ? b : null;
}

const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

/** ed25519 over the UTF-8 message, the public key being the wallet address. Never throws. */
export function verifyWalletSignature(address: string, message: string, signatureB64: string): boolean {
  const pk = addressBytes(address);
  if (!pk) return false;
  let sig: Buffer;
  try { sig = Buffer.from(signatureB64, "base64"); } catch { return false; }
  if (sig.length !== 64) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519, pk]), format: "der", type: "spki" });
    return verify(null, Buffer.from(message, "utf8"), key, sig);
  } catch { return false; }
}

export function newNonce(): string { return randomBytes(16).toString("hex"); }

const b64u = (b: Buffer) => b.toString("base64url");

/** `<payload>.<mac>`, payload = base64url(JSON {p: profile, exp}). */
export class ResumeTokens {
  private readonly secret: Buffer;
  private readonly ttlMs: number;
  constructor(secret: Buffer, ttlMs: number) { this.secret = secret; this.ttlMs = ttlMs; }

  issue(profile: WireProfile, now = Date.now()): string {
    const payload = b64u(Buffer.from(JSON.stringify({ p: profile, exp: now + this.ttlMs })));
    return `${payload}.${b64u(createHmac("sha256", this.secret).update(payload).digest())}`;
  }

  /** The profile the token was issued for, or null (forged, expired, malformed). */
  check(token: string, now = Date.now()): WireProfile | null {
    const dot = token.indexOf(".");
    if (dot <= 0) return null;
    const payload = token.slice(0, dot);
    const mac = Buffer.from(token.slice(dot + 1), "base64url");
    const want = createHmac("sha256", this.secret).update(payload).digest();
    if (mac.length !== want.length || !timingSafeEqual(mac, want)) return null;
    try {
      const o = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { p?: WireProfile; exp?: number };
      if (!o.p || typeof o.exp !== "number" || o.exp < now) return null;
      return o.p;
    } catch { return null; }
  }
}
