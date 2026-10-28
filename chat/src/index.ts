#!/usr/bin/env -S node --experimental-strip-types
/**
 * ladle-chat: the room relay as an always-on process.
 *
 *   pnpm chat                        (from the repo root)
 *   node --experimental-strip-types chat/src/index.ts
 *
 * Settings come from the environment (docs/CHAT.md). Logs are JSON lines:
 * {"ts","level","msg",...}. SIGINT / SIGTERM say "bye" to every page (they
 * reconnect on their own) and stop.
 */
import { configFromEnv } from "./config.ts";
import { createRelay } from "./relay.ts";

const cfg = configFromEnv();
const relay = createRelay(cfg);
const addr = await relay.listen();
cfg.log("info", "relay up", {
  at: `ws://${addr.address}:${addr.port}/`, publicHost: cfg.publicHost, origins: cfg.origins,
  muteFile: cfg.muteFile, maxPerIp: cfg.maxPerIp, maxConnections: cfg.maxConnections,
  resumeSecret: process.env.CHAT_RESUME_SECRET ? "from env" : "random (pages re-sign after a restart)",
});

const statsEvery = setInterval(() => cfg.log("info", "stats", { ...relay.stats() }), 60_000);
statsEvery.unref();

let stopping = false;
async function stop(sig: string) {
  if (stopping) return;
  stopping = true;
  cfg.log("info", "stopping", { sig });
  await relay.close("restart");
  process.exit(0);
}
process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));
