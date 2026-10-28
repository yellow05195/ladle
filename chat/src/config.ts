/**
 * Relay settings, from the environment (docs/CHAT.md lists them all).
 * Every limit has a default that suits one small always-on process.
 */
import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HISTORY_SIZE, MAX_TEXT, PRESENCE_CAP } from "./protocol.ts";
import type { BucketSpec, SlowSpec } from "./ratelimit.ts";

export type LogLevel = "info" | "warn" | "error";

export interface RelayConfig {
  port: number;
  host: string;
  /** the relay's public host name, written into the sign-in text the wallet shows */
  publicHost: string;
  /** exact page origins allowed to connect ("*" allows any) */
  origins: string[];
  /** let clients without an Origin header in (tools, tests); browsers always send one */
  allowNoOrigin: boolean;
  /** read the client address from X-Forwarded-For (only behind your own proxy) */
  trustProxy: boolean;
  maxPerIp: number;
  maxConnections: number;
  muteFile: string | null;
  mutePollMs: number;
  resumeSecret: Buffer;
  resumeTtlMs: number;
  maxText: number;
  /** talk, per wallet */
  talk: BucketSpec;
  /** talk, per IP (several wallets behind one address) */
  ipTalk: BucketSpec;
  /** every frame, per connection */
  frames: BucketSpec;
  /** sign-in attempts, per IP */
  signins: BucketSpec;
  slow: SlowSpec;
  historySize: number;
  presenceCap: number;
  heartbeatMs: number;
  helloTimeoutMs: number;
  presenceFlushMs: number;
  /** what is said to everyone within this window goes out as one frame */
  batchMs: number;
  /** pending TCP connections the OS queues (a reconnect wave after a restart) */
  backlog: number;
  /** a client whose unsent backlog passes this many bytes is dropped (it reconnects and resumes) */
  slowConsumerBytes: number;
  maxPayload: number;
  trustGenesis: boolean;
  log: (level: LogLevel, msg: string, extra?: Record<string, unknown>) => void;
}

const HERE = dirname(fileURLToPath(import.meta.url));

export const jsonLog = (level: LogLevel, msg: string, extra?: Record<string, unknown>) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra });
  if (level === "info") console.log(line); else console.error(line);
};

export function defaults(): RelayConfig {
  return {
    port: 8787,
    host: "0.0.0.0",
    publicHost: "localhost:8787",
    origins: ["http://localhost:3000", "http://127.0.0.1:3000"],
    allowNoOrigin: false,
    trustProxy: false,
    maxPerIp: 8,
    maxConnections: 5000,
    muteFile: join(HERE, "..", "mute.txt"),
    mutePollMs: 2000,
    resumeSecret: randomBytes(32),
    resumeTtlMs: 12 * 3600_000,
    maxText: MAX_TEXT,
    talk: { capacity: 3, refillMs: 1500 },
    ipTalk: { capacity: 6, refillMs: 750 },
    frames: { capacity: 30, refillMs: 200 },
    signins: { capacity: 5, refillMs: 12_000 },
    slow: { windowMs: 10_000, above: 30, ms: 4000, coolMs: 20_000 },
    historySize: HISTORY_SIZE,
    presenceCap: PRESENCE_CAP,
    heartbeatMs: 20_000,
    helloTimeoutMs: 10_000,
    presenceFlushMs: 400,
    batchMs: 50,
    backlog: 2048,
    slowConsumerBytes: 1 << 20,
    maxPayload: 4096,
    trustGenesis: false,
    log: jsonLog,
  };
}

const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const bool = (v: string | undefined, d: boolean) => (v === undefined || v === "" ? d : v === "1" || v.toLowerCase() === "true");

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  const d = defaults();
  const port = num(env.CHAT_PORT ?? env.PORT, d.port);
  return {
    ...d,
    port,
    host: env.CHAT_HOST || d.host,
    publicHost: env.CHAT_PUBLIC_HOST || `localhost:${port}`,
    origins: env.CHAT_ORIGINS ? env.CHAT_ORIGINS.split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean) : d.origins,
    allowNoOrigin: bool(env.CHAT_ALLOW_NO_ORIGIN, d.allowNoOrigin),
    trustProxy: bool(env.CHAT_TRUST_PROXY, d.trustProxy),
    maxPerIp: num(env.CHAT_MAX_PER_IP, d.maxPerIp),
    maxConnections: num(env.CHAT_MAX_CONNECTIONS, d.maxConnections),
    muteFile: env.CHAT_MUTE_FILE === "" ? null : env.CHAT_MUTE_FILE ?? d.muteFile,
    resumeSecret: env.CHAT_RESUME_SECRET ? createHash("sha256").update(env.CHAT_RESUME_SECRET).digest() : d.resumeSecret,
    resumeTtlMs: num(env.CHAT_RESUME_TTL_H, 12) * 3600_000,
    talk: { capacity: num(env.CHAT_TALK_BURST, d.talk.capacity), refillMs: num(env.CHAT_TALK_EVERY_MS, d.talk.refillMs) },
    ipTalk: { capacity: num(env.CHAT_IP_BURST, d.ipTalk.capacity), refillMs: num(env.CHAT_IP_EVERY_MS, d.ipTalk.refillMs) },
    slow: { ...d.slow, above: num(env.CHAT_SLOW_ABOVE, d.slow.above), ms: num(env.CHAT_SLOW_MS, d.slow.ms) },
    historySize: num(env.CHAT_HISTORY, d.historySize),
    batchMs: num(env.CHAT_BATCH_MS, d.batchMs),
    presenceCap: num(env.CHAT_PRESENCE_CAP, d.presenceCap),
    trustGenesis: bool(env.CHAT_TRUST_GENESIS, d.trustGenesis),
  };
}
