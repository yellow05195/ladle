/**
 * The Ladle room relay: one shared chat and one shared crowd.
 *
 * - Anyone can watch: a connection that says hello is a spectator, counted
 *   and seated in the stands as a guest.
 * - Talking needs a wallet: the client signs a plain text holding a nonce
 *   this relay gave it (no transaction, no SOL), and the relay checks the
 *   ed25519 signature against the address with node:crypto.
 * - Commands are not relayed. Entries reach the other players from the
 *   chain; !odds, !pot, !verify are answered by each player's own page.
 * - Fan-out is batched: what is said to everyone during one tick
 *   (`batchMs`, 50 ms) is serialised once into one frame ({t:"many"} when
 *   there is more than one message) and that one buffer is written to every
 *   socket, so the writes per socket stay at most 1000/batchMs a second
 *   however busy the room is. A socket that stops reading (backlog over
 *   `slowConsumerBytes`) is dropped instead of growing memory; its page
 *   reconnects and resumes.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { defaults, type RelayConfig } from "./config.ts";
import { History } from "./history.ts";
import { moderate } from "./moderation.ts";
import { MuteList } from "./mutes.ts";
import { Roster } from "./presence.ts";
import { NONCE_TTL_MS, PROTOCOL, parseClient, signInMessage, type ClientMsg, type ServerMsg, type WireLine, type WireProfile } from "./protocol.ts";
import { guestProfile, validateProfile } from "./profile.ts";
import { KeyedLimiter, SlowMode, TokenBucket } from "./ratelimit.ts";
import { ResumeTokens, addressBytes, newNonce, verifyWalletSignature } from "./signin.ts";

export { configFromEnv, defaults, type RelayConfig } from "./config.ts";

interface Conn {
  ws: WebSocket;
  ip: string;
  guestId: string;
  alive: boolean;
  helloed: boolean;
  nonce: string;
  nonceAt: number;
  /** the signed profile, null for a spectator */
  signed: WireProfile | null;
  /** the roster id this connection counts under (wallet or guest id) */
  memberId: string | null;
  frames: TokenBucket;
  errors: number;
  helloTimer: ReturnType<typeof setTimeout> | null;
}

export interface RelayStats {
  sockets: number;
  count: number;
  listed: number;
  lines: number;
  dropped: number;
  rejected: Record<string, number>;
  slowMs: number | null;
  muted: number;
}

export interface Relay {
  readonly config: RelayConfig;
  readonly server: Server;
  listen(port?: number, host?: string): Promise<AddressInfo>;
  close(reason?: string): Promise<void>;
  stats(): RelayStats;
}

export function createRelay(overrides: Partial<RelayConfig> = {}): Relay {
  const cfg: RelayConfig = { ...defaults(), ...overrides };
  const log = cfg.log;
  const boot = randomBytes(3).toString("hex");
  const history = new History(cfg.historySize, boot);
  const roster = new Roster(cfg.presenceCap);
  const tokens = new ResumeTokens(cfg.resumeSecret, cfg.resumeTtlMs);
  const talkLimit = new KeyedLimiter(cfg.talk);
  const ipTalkLimit = new KeyedLimiter(cfg.ipTalk);
  const signinLimit = new KeyedLimiter(cfg.signins);
  const slow = new SlowMode(cfg.slow);
  const mutes = new MuteList(cfg.muteFile, (n) => log("info", "mute list loaded", { entries: n }));
  mutes.watch(cfg.mutePollMs);

  const conns = new Set<Conn>();
  const perIp = new Map<string, number>();
  const stats = { lines: 0, dropped: 0, rejected: {} as Record<string, number> };
  const reject = (why: string) => { stats.rejected[why] = (stats.rejected[why] ?? 0) + 1; };

  /* ---------------------------------------------------------------- sending */

  const frame = (m: ServerMsg) => Buffer.from(JSON.stringify(m));

  function write(c: Conn, buf: Buffer): void {
    const ws = c.ws;
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > cfg.slowConsumerBytes) {
      stats.dropped++;
      ws.terminate();
      return;
    }
    ws.send(buf, { binary: false });
  }

  const send = (c: Conn, m: ServerMsg) => write(c, frame(m));

  /* the tick's outbox: JSON strings for everyone, then what each sender is owed (acks after their line) */
  const outbox: string[] = [];
  const afterFlush: Array<() => void> = [];
  let tick: ReturnType<typeof setTimeout> | null = null;

  /** Queues a frame for every socket; the tick writes it (with whatever else was said) as one buffer. */
  function broadcast(m: ServerMsg): void {
    outbox.push(JSON.stringify(m));
    tick ??= setTimeout(flushOutbox, cfg.batchMs);
  }

  function flushOutbox(): void {
    tick = null;
    if (outbox.length) {
      const buf = Buffer.from(outbox.length === 1 ? outbox[0]! : `{"t":"many","m":[${outbox.join(",")}]}`);
      outbox.length = 0;
      for (const c of conns) if (c.helloed) write(c, buf);
    }
    for (const f of afterFlush.splice(0)) f();
  }

  function notice(text: string): void {
    const line: WireLine = { id: history.nextId(), at: Date.now(), kind: "notice", from: null, text };
    history.push(line);
    broadcast({ t: "line", line });
  }

  function announceSlow(on: boolean): void {
    broadcast({ t: "slow", ms: on ? cfg.slow.ms : null });
    notice(on ? `The room is busy: one line every ${Math.round(cfg.slow.ms / 1000)} s per player for now.` : "The room is calm again: slow mode is off.");
    log("info", on ? "slow mode on" : "slow mode off", { count: roster.count });
  }

  /* ---------------------------------------------------------------- identity */

  function becomeGuest(c: Conn): void {
    if (c.memberId) roster.remove(c.memberId);
    c.signed = null;
    c.memberId = c.guestId;
    roster.add(guestProfile(c.guestId), false);
  }

  function becomeSigned(c: Conn, p: WireProfile): void {
    if (c.memberId) roster.remove(c.memberId);
    c.signed = p;
    c.memberId = p.id;
    roster.add(p, true);
  }

  function rotateNonce(c: Conn): string {
    c.nonce = newNonce();
    c.nonceAt = Date.now();
    return c.nonce;
  }

  /* ---------------------------------------------------------------- frames */

  function protoError(c: Conn, message: string): void {
    reject("protocol");
    send(c, { t: "error", code: "protocol", message });
    if (++c.errors >= 5) c.ws.close(4002, "protocol");
  }

  function onHello(c: Conn, m: Extract<ClientMsg, { t: "hello" }>): void {
    if (c.helloed) return protoError(c, "hello twice");
    if (m.v !== PROTOCOL) { send(c, { t: "error", code: "protocol", message: `protocol ${PROTOCOL} only` }); c.ws.close(4001, "version"); return; }
    c.helloed = true;
    if (c.helloTimer) { clearTimeout(c.helloTimer); c.helloTimer = null; }
    let resume: string | undefined;
    const back = m.resume ? tokens.check(m.resume) : null;
    const valid = back && addressBytes(back.id) ? validateProfile(back.id, back, cfg.trustGenesis) : null;
    if (valid?.ok) { becomeSigned(c, valid.profile); resume = tokens.issue(valid.profile); }
    else becomeGuest(c);
    const h = history.since(m.since);
    send(c, {
      t: "welcome", v: PROTOCOL, nonce: rotateNonce(c), host: cfg.publicHost,
      you: c.signed ?? guestProfile(c.guestId), signed: !!c.signed, resume,
      history: h.lines, reset: h.reset,
      presence: roster.snapshot(),
      limits: { maxText: cfg.maxText, burst: cfg.talk.capacity, everyMs: cfg.talk.refillMs },
      slowMs: slow.on ? cfg.slow.ms : null,
      at: Date.now(),
    });
  }

  function onSignIn(c: Conn, m: Extract<ClientMsg, { t: "signin" }>): void {
    const fresh = m.nonce === c.nonce && Date.now() - c.nonceAt < NONCE_TTL_MS;
    const nonce = rotateNonce(c); // one attempt per nonce, whatever happens
    if (!signinLimit.take(c.ip).ok) { reject("signin-rate"); return send(c, { t: "error", code: "rate-limited", nonce }); }
    if (!fresh) { reject("bad-nonce"); return send(c, { t: "error", code: "bad-nonce", nonce }); }
    if (!addressBytes(m.address)) { reject("bad-address"); return send(c, { t: "error", code: "bad-address", nonce }); }
    const v = validateProfile(m.address, m.profile, cfg.trustGenesis);
    if (!v.ok) { reject(v.code); return send(c, { t: "error", code: v.code, nonce }); }
    const text = signInMessage({ address: m.address, nonce: m.nonce, host: cfg.publicHost });
    if (!verifyWalletSignature(m.address, text, m.signature)) { reject("bad-signature"); return send(c, { t: "error", code: "bad-signature", nonce }); }
    becomeSigned(c, v.profile);
    send(c, { t: "signed", you: v.profile, resume: tokens.issue(v.profile), nonce });
  }

  function onSay(c: Conn, m: Extract<ClientMsg, { t: "say" }>): void {
    // acks keep the order of the lines a connection sent: while a tick is pending, refusals wait for it too
    const no = (reason: Extract<ServerMsg, { t: "ack"; ok: false }>["reason"], retryMs?: number) => {
      reject(reason);
      const ack: ServerMsg = { t: "ack", cid: m.cid, ok: false, reason, retryMs };
      if (tick) afterFlush.push(() => send(c, ack)); else send(c, ack);
    };
    if (!c.signed) return no("no-profile");
    if (mutes.isMuted(c.signed.id, c.ip)) return no("muted");
    const v = moderate(m.text, cfg.maxText);
    if (!v.ok) return no(v.reason);
    const now = Date.now();
    const s = slow.check(c.signed.id, now);
    if (!s.ok) return no("rate-limited", s.retryMs);
    const wallet = talkLimit.bucket(c.signed.id, now);
    const w = wallet.take(now);
    if (!w.ok) return no("rate-limited", w.retryMs);
    const ip = ipTalkLimit.take(c.ip, now);
    if (!ip.ok) { wallet.refund(); return no("rate-limited", ip.retryMs); }
    const line: WireLine = { id: history.nextId(), at: now, kind: "talk", from: c.signed, text: v.text };
    history.push(line);
    stats.lines++;
    broadcast({ t: "line", line });
    // the ack leaves after the tick that carries the line: the sender sees its line, then the ack
    afterFlush.push(() => send(c, { t: "ack", cid: m.cid, ok: true, id: line.id }));
    const flip = slow.record(c.signed.id, now);
    if (flip !== null) announceSlow(flip);
  }

  function onFrame(c: Conn, data: RawData, isBinary: boolean): void {
    c.alive = true;
    if (!c.frames.take().ok) {
      reject("flood");
      send(c, { t: "error", code: "flood" });
      c.ws.close(4008, "flood");
      return;
    }
    if (isBinary) return protoError(c, "text frames only");
    const raw = Buffer.isBuffer(data) ? data.toString("utf8") : Array.isArray(data) ? Buffer.concat(data).toString("utf8") : Buffer.from(data).toString("utf8");
    const m = parseClient(raw);
    if (!m) return protoError(c, "malformed frame");
    if (!c.helloed && m.t !== "hello") return protoError(c, "hello first");
    switch (m.t) {
      case "hello": return onHello(c, m);
      case "signin": return onSignIn(c, m);
      case "say": return onSay(c, m);
      case "seat": if (c.signed) roster.setSeat(c.signed.id, m.seat); return; // spectators stay in the stands
      case "signout": becomeGuest(c); return send(c, { t: "signedout", you: guestProfile(c.guestId), nonce: rotateNonce(c) });
      case "ping": return send(c, { t: "pong", at: Date.now() });
    }
  }

  /* ---------------------------------------------------------------- connections */

  function clientIp(req: IncomingMessage): string {
    let ip = req.socket.remoteAddress ?? "?";
    if (cfg.trustProxy) {
      const xf = req.headers["x-forwarded-for"];
      const first = (Array.isArray(xf) ? xf[0] : xf)?.split(",")[0]?.trim();
      if (first) ip = first;
    }
    return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  }

  function refuse(socket: Duplex, code: number, text: string, why: string): void {
    reject(why);
    socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${text.length}\r\n\r\n${text}`);
    socket.destroy();
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: cfg.maxPayload, perMessageDeflate: false, clientTracking: false });

  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && path === "/health") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: true, v: PROTOCOL, ...api.stats() }));
      return;
    }
    res.writeHead(path === "/" || path === "/v1" ? 426 : 404, { "content-type": "text/plain" });
    res.end(path === "/" || path === "/v1" ? "WebSocket only" : "not found");
  });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", () => {});
    const path = (req.url ?? "/").split("?")[0];
    if (path !== "/" && path !== "/v1") return refuse(socket, 404, "Not Found", "path");
    const origin = req.headers.origin?.replace(/\/$/, "");
    const originOk = origin ? cfg.origins.includes("*") || cfg.origins.includes(origin) : cfg.allowNoOrigin;
    if (!originOk) return refuse(socket, 403, "Forbidden", "origin");
    if (conns.size >= cfg.maxConnections) return refuse(socket, 503, "Service Unavailable", "full");
    const ip = clientIp(req);
    if ((perIp.get(ip) ?? 0) >= cfg.maxPerIp) return refuse(socket, 429, "Too Many Requests", "per-ip");
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip));
  });

  function onConnection(ws: WebSocket, ip: string): void {
    const c: Conn = {
      ws, ip, guestId: `guest:${randomBytes(4).toString("hex")}`, alive: true, helloed: false,
      nonce: "", nonceAt: 0, signed: null, memberId: null,
      frames: new TokenBucket(cfg.frames), errors: 0, helloTimer: null,
    };
    conns.add(c);
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    c.helloTimer = setTimeout(() => {
      if (c.helloed) return;
      send(c, { t: "error", code: "hello-timeout" });
      ws.close(4000, "hello");
    }, cfg.helloTimeoutMs);
    ws.on("pong", () => { c.alive = true; });
    ws.on("message", (data, isBinary) => {
      try { onFrame(c, data, isBinary); }
      catch (e) { log("error", "frame handler", { err: String(e) }); }
    });
    ws.on("error", () => {});
    ws.on("close", () => {
      conns.delete(c);
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
      if (c.helloTimer) clearTimeout(c.helloTimer);
      if (c.memberId) roster.remove(c.memberId);
      c.memberId = null;
    });
  }

  /* ---------------------------------------------------------------- timers */

  let beats = 0;
  const heartbeat = setInterval(() => {
    for (const c of conns) {
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch { /* closing */ }
    }
    broadcast({ t: "hb", at: Date.now(), count: roster.count });
    const flip = slow.update();
    if (flip !== null) announceSlow(flip);
    if (++beats % 6 === 0) { talkLimit.sweep(); ipTalkLimit.sweep(); signinLimit.sweep(); }
  }, cfg.heartbeatMs);

  const flush = setInterval(() => {
    const d = roster.drain();
    if (d) broadcast({ t: "presence", ...d });
  }, cfg.presenceFlushMs);

  const api: Relay = {
    config: cfg,
    server,
    listen(port = cfg.port, host = cfg.host) {
      return new Promise((resolve, rejectP) => {
        server.once("error", rejectP);
        server.listen({ port, host, backlog: cfg.backlog }, () => { server.off("error", rejectP); resolve(server.address() as AddressInfo); });
      });
    },
    async close(reason = "restart") {
      clearInterval(heartbeat);
      clearInterval(flush);
      if (tick) clearTimeout(tick);
      mutes.close();
      broadcast({ t: "bye", reason });
      flushOutbox();
      for (const c of conns) c.ws.close(1012, reason);
      // give the closing handshakes a moment, then cut what is left
      for (let i = 0; i < 20 && conns.size; i++) await new Promise((r) => setTimeout(r, 25));
      for (const c of conns) c.ws.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections?.();
      });
    },
    stats() {
      return {
        sockets: conns.size, count: roster.count, listed: roster.listedCount, lines: stats.lines, dropped: stats.dropped,
        rejected: { ...stats.rejected }, slowMs: slow.on ? cfg.slow.ms : null, muted: mutes.size,
      };
    },
  };
  return api;
}
