/** sfc32: small, fast, deterministic. Used only by the demo data source. */
export interface Prng {
  next(): number; // uniform in [0, 1)
  int(n: number): number; // uniform integer in [0, n)
  bytes(n: number): Uint8Array;
}

export function sfc32(seed: number): Prng {
  let a = 0x9e3779b9 ^ seed;
  let b = 0x243f6a88 ^ (seed * 7919);
  let c = 0xb7e15162 ^ (seed << 7);
  let d = 0xdeadbeef ^ (seed * 31);
  const next = (): number => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return {
    next,
    int: (n) => Math.floor(next() * n),
    bytes: (n) => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = Math.floor(next() * 256);
      return out;
    },
  };
}
