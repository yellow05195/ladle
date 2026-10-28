/** Test helpers: a throwaway ed25519 wallet that signs like a Solana wallet's signMessage. */
import { generateKeyPairSync, sign } from "node:crypto";
import { base58Encode } from "../src/signin.ts";

export function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  const address = base58Encode(raw);
  return { address, sign: (text: string) => sign(null, Buffer.from(text, "utf8"), privateKey).toString("base64") };
}
