# The room: chat and crowd (v21)

One shared room. Everyone on the site sees the same lines and the same crowd
in the hall. A line that starts with `!` is a **command** (`!scoop 0.25`,
`!odds`, `!pot`, `!verify`, `!sell`); everything else is **talk** between
people.

- **Commands never travel through the chat relay.** An entry reaches the
  other players from the chain: the round's entries become
  `name: !scoop 0.25` lines on every page (`useRoundChat`), so nobody can
  fake someone else's entry by typing. The read-only commands (`!odds`,
  `!pot`, `!verify`) are answered by each player's own page with the round's
  real figures, and are not broadcast.
- **Reading needs nothing.** A visitor without a profile is a spectator:
  counted, and seated in the stands as a guest.
- **Talking needs a profile and one wallet signature** of a plain text (no
  transaction, no SOL moves). The page asks for it the first time the viewer
  talks; a resume token then keeps the viewer signed in across reconnects
  and new tabs (12 h by default).

Code: the relay is `chat/` (`@ladle/chat`, Node >= 22, TypeScript run with
`--experimental-strip-types`, one dependency: `ws`). The page side is
`app/lib/chat/`.

## Run it locally

```
pnpm chat                       # the relay on ws://localhost:8787/ (repo root)
```

Then point the app at it, in `app/.env.local`:

```
NEXT_PUBLIC_LADLE_CHAT_URL=ws://localhost:8787
```

and restart `pnpm dev` (a `NEXT_PUBLIC_` variable is read at build time).
Without that variable the app picks its room by itself:

| `NEXT_PUBLIC_LADLE_CHAT_URL` | `NEXT_PUBLIC_DATA_SOURCE` | room |
|---|---|---|
| set | any | **live**: the relay |
| unset | demo (default) | **demo**: a simulated room of about fifty, marked as demo |
| unset | chain | **none**: talk is off, commands work (no simulated crowd next to real data) |

Health: `GET http://localhost:8787/health` returns the counts (sockets,
people, listed, lines, dropped slow sockets, refusals by reason, slow mode,
muted entries).

Tests: `pnpm test:chat` (also part of `pnpm test:all`): moderation, rate
limits, slow mode, the signature check with a generated ed25519 key, resume
tokens, presence caps and diffs, history replay, the relay end to end over
real sockets, the page's live client against the relay, and the parity
between the page and the relay (sign-in text, limits, profile rules) plus the
demo room's lines against the repo's copy rules.

Load run (not part of the suite):
`node chat/test/load.bench.ts [spectators] [talkers] [seconds] [every_ms] [processes]`.

## Settings (environment)

| variable | default | what |
|---|---|---|
| `CHAT_PORT` (or `PORT`) | `8787` | listening port |
| `CHAT_HOST` | `0.0.0.0` | listening address (`127.0.0.1` behind a local proxy) |
| `CHAT_PUBLIC_HOST` | `localhost:<port>` | the relay's public name, written into the sign-in text the wallet shows |
| `CHAT_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | page origins allowed to connect, comma separated (`*` allows any) |
| `CHAT_ALLOW_NO_ORIGIN` | `0` | let clients without an Origin header in (tools); browsers always send one |
| `CHAT_TRUST_PROXY` | `0` | read the client address from `X-Forwarded-For` (only behind your own proxy) |
| `CHAT_MAX_PER_IP` | `8` | open sockets per address |
| `CHAT_MAX_CONNECTIONS` | `5000` | open sockets in all |
| `CHAT_MUTE_FILE` | `chat/mute.txt` | the mute list (below); empty string turns it off |
| `CHAT_RESUME_SECRET` | random per start | HMAC key of the resume tokens; set it so a restart does not ask everyone to sign again |
| `CHAT_RESUME_TTL_H` | `12` | resume token lifetime, hours |
| `CHAT_TALK_BURST` / `CHAT_TALK_EVERY_MS` | `3` / `1500` | per-wallet token bucket: a burst of 3, then one line every 1.5 s |
| `CHAT_IP_BURST` / `CHAT_IP_EVERY_MS` | `6` / `750` | per-address token bucket (several wallets behind one address) |
| `CHAT_SLOW_ABOVE` / `CHAT_SLOW_MS` | `30` / `4000` | slow mode: on above 30 lines in 10 s; while on, one line every 4 s per wallet; off after 20 s under half the threshold |
| `CHAT_HISTORY` | `100` | lines kept for whoever arrives |
| `CHAT_PRESENCE_CAP` | `300` | people listed with their profile (everyone is counted) |
| `CHAT_BATCH_MS` | `50` | fan-out tick: what is said to everyone in one tick leaves as one frame |
| `CHAT_TRUST_GENESIS` | `0` | keep the Genesis number a profile claims (only with a profile registry that issues them) |

## Protocol v1

JSON objects in WebSocket text frames, the type in `t`. The relay's
definition is `chat/src/protocol.ts`; the page's copy is
`app/lib/chat/protocol.ts` (a test fails when they differ).

| from | frame | what |
|---|---|---|
| page | `hello {v:1, resume?, since?}` | first frame; `resume` = token, `since` = last line id seen |
| relay | `welcome {nonce, host, you, signed, resume?, history, reset, presence:{list, count}, limits, slowMs}` | the room as it is; `reset` = replace the log (relay restarted or gap wider than the history) |
| page | `signin {address, nonce, signature, profile:{nickname, species, scarf, genesis}}` | base64 ed25519 signature of the sign-in text |
| relay | `signed {you, resume, nonce}` or `error {code, nonce}` | each attempt spends the nonce and hands a fresh one |
| page | `say {text, cid}` | talk only |
| relay | `line {line}` to everyone, then `ack {cid, ok, id}` or `ack {cid, ok:false, reason, retryMs?}` to the sender | reasons: `no-profile`, `rate-limited`, `too-long`, `empty`, `blocked`, `muted`, `command` |
| page | `seat {seat}` | `stage` while the viewer's entry is in the current round |
| page | `signout`, `ping` | back to spectator; `pong {at}` |
| relay | `presence {join, leave, seat, count}` | batched diffs (joins are upserts, a leave of an unknown id is a no-op) |
| relay | `slow {ms}`, `hb {at, count}`, `bye {reason}` | slow mode on/off, heartbeat (every 20 s), restart notice |
| relay | `many {m:[...]}` | several of the above from one tick, in order |

The sign-in text (LF separators, no trailing newline):

```
Ladle chat sign-in
wallet: <address>
relay: <CHAT_PUBLIC_HOST>
nonce: <32 hex>
This signature lets you talk in the Ladle room. It moves no SOL and is not a transaction.
```

The relay rebuilds this text from the address, the nonce it issued to that
socket (5 minutes, one attempt) and its own public host, and checks the
signature with `node:crypto` against the address (ed25519, the key being the
32 bytes of the base58 address). A text signed for another relay host does
not pass.

Close codes: `4000` no hello in 10 s, `4001` wrong protocol version, `4002`
repeated malformed frames, `4008` flood (more than about 5 frames/s
sustained), `1012` relay restart (pages reconnect with backoff and jitter
and resume).

## Moderation

In order, for every talk line:

1. **Clean**: NFKC (full-width letters fold to ASCII), control, invisible
   and bidirectional characters removed, at most two combining marks per
   letter, one space between words.
2. **Refuse**: empty; starts with `!` (a command); more than 160 characters;
   a link however written (`useladle.fun`, `ladle (dot) fun`, `ladle . fun`,
   `www.`, `https://`, an IP address, punycode); wallet-drain bait (seed or
   recovery phrases, private keys, "connect / verify / sync your wallet",
   airdrop and giveaway pitches, "DM me", other messengers, "send me SOL",
   "double your", fake support or admin); a pasted Solana or EVM address.
3. **Mask** a short list of insults (first letter kept), with simple
   leetspeak caught and the usual false positives left alone.

Nicknames follow the profile rule of `app/lib/profile.ts` (`[a-z0-9_]{3,16}`,
the reserved list); on top, the room refuses names containing `ladle`,
`admin`, `support`, `official`, `moderator`, `staff`, `helpdesk`, or starting
with `guest` (posing as the house or as a spectator).

Limits: per wallet and per address token buckets, room-wide slow mode under
load, sockets per address, an origin allow-list, one sign-in attempt per
nonce and 5 sign-ins per address per minute.

**Mute list**: a plain text file, reloaded within 2 s of a change:

```
# comments and blank lines are ignored
7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU     a wallet: reads, cannot talk
ip:203.0.113.7                                   an address: no talk from it
```

What the relay does not decide: the seat (`stage` / `stands`) is the page's
claim and only places an avatar; the stage of the 3D hall is drawn from the
round's chain entries. Genesis numbers are dropped unless
`CHAT_TRUST_GENESIS=1`.

## Deploy: an always-on process next to the keeper

The relay holds no keys, sends no transactions and needs no RPC. Run it on
the same small machine as the keeper, as its own service, behind a TLS proxy
so pages connect with `wss://`.

```
# /etc/systemd/system/ladle-chat.service
[Unit]
Description=Ladle room relay
After=network-online.target

[Service]
WorkingDirectory=/srv/ladle
ExecStart=/usr/bin/node --experimental-strip-types chat/src/index.ts
Environment=CHAT_HOST=127.0.0.1
Environment=CHAT_PORT=8787
Environment=CHAT_PUBLIC_HOST=chat.example.org
Environment=CHAT_ORIGINS=https://example.org
Environment=CHAT_TRUST_PROXY=1
Environment=CHAT_MUTE_FILE=/srv/ladle/chat/mute.txt
EnvironmentFile=/etc/ladle/chat.env          # CHAT_RESUME_SECRET=<32+ random bytes>
LimitNOFILE=65536
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

```
# Caddyfile: TLS and the WebSocket upgrade are handled by reverse_proxy
chat.example.org {
  reverse_proxy 127.0.0.1:8787
}
```

Then build the app with `NEXT_PUBLIC_LADLE_CHAT_URL=wss://chat.example.org`.
`SIGTERM` (systemd stop / restart) sends `bye` to every page and closes with
`1012`; pages reconnect over the next second or two (backoff with jitter),
resume their sign-in with the token, and get only the lines they missed.
Logs are JSON lines on stdout (`relay up`, `stats` every minute, `slow mode
on/off`, `mute list loaded`).

## Scaling notes

The hall is one place: everyone in the same room, everyone seeing the same
crowd. Fifty people is a light load; the relay is built for thousands in
one room on one process.

- **Batched fan-out.** Whatever is said to everyone during one 50 ms tick is
  serialised once into one frame and that one buffer is written to every
  socket, so writes per socket stay at most 20 a second whatever the room's
  pace. No per-message compression (it costs CPU per socket).
- **Presence is capped and diffed.** At most 300 people are listed with a
  profile (signed players first, spectators fill the rest); everyone is
  counted. Changes go out as one diff per 400 ms, not one frame per arrival.
- **Slow sockets are dropped**, not buffered: a socket whose unsent backlog
  passes 1 MB is closed; its page reconnects and replays what it missed.
- **Slow mode** keeps the room readable and caps the line rate near 3/s.
- **The page renders at most every 50 ms** (the store coalesces) and the
  crowd hook (`usePresence`) does not re-render on talk.

Measured with `chat/test/load.bench.ts` on the development machine (Windows,
loopback, the relay in one process, spectators in 4 to 5 other processes):

| sockets | talk rate | relay CPU (one core) | relay memory (RSS) | line to every socket p50 / p99 | dropped |
|---|---|---|---|---|---|
| 50 (the hall's crowd) | 2.5 lines/s | 1 % | 80 MB | 49 / 68 ms | 0 |
| 500 | 14.6 lines/s (stress, slow mode off) | 2 % | 90 MB | 54 / 89 ms | 0 |
| 2 000 | 14.6 lines/s (stress, slow mode off) | 8 % | 138 MB | 123 / 423 ms | 0 |
| 5 000 | 2.5 lines/s (the slow-mode pace) | 5 % | 114 MB | 144 / 277 ms | 0 |

Latency includes the 50 ms tick. Before batching, 2 000 sockets at about
10 lines/s took 44 % of a core and 1.4 s (p50) to reach everyone; the tick
fixed that. Production numbers on a Linux host behind a TLS proxy will
differ (TLS costs CPU per socket); measure there before announcing a size.

Beyond one process:

- Raise `CHAT_MAX_CONNECTIONS`, `LimitNOFILE`, and the OS accept queue
  (`net.core.somaxconn`; the relay asks for a backlog of 2048 for reconnect
  waves).
- Rooms shard naturally: one relay per host (streamer) room, or by mint.
  Resume tokens are stateless (HMAC with `CHAT_RESUME_SECRET`), so any
  relay sharing the secret accepts them; no sticky sessions needed.
- One room larger than a process: put a pub/sub between relays (each relay
  publishes accepted lines and presence diffs, and fans out what it
  receives); history then lives in the shared store instead of each
  process's ring. Not built: one process holds well past the hall's size.
