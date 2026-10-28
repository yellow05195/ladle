# @ladle/chat

The Ladle room relay: one shared chat and one shared crowd over WebSocket.
Reading is open; talking needs a wallet signature of a plain text (no
transaction). Commands (`!scoop`, `!odds`...) never pass through here.

```
pnpm chat                                   # ws://localhost:8787/, from the repo root
pnpm test:chat                              # node:test suites
node chat/test/load.bench.ts 2000 25 12     # rough load run
```

Protocol, settings, moderation, deployment and scaling notes: `docs/CHAT.md`.
