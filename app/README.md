# Ladle — the site

Next.js 16 (App Router), React 19, Tailwind v4, TypeScript strict. Design direction **v18, Ladle: a dinner party at night** (`docs/DESIGN-BRIEF.md`, last section): warm charcoal (`#15110E`, cards `#221C17`, 1 px warm lines, radius 14 at most, no glow, no gradient text, no glass), cream ink `#F6EEE3`, tomato `#FF5A36` for the brand and the primary action (charcoal text on it), saffron `#FFB21A` the one accent. Six player colours (tomato, saffron, teal, sky, mint, plum) mark identity only; a result is always cream at the same size; *you* = a cream ring and the YOU tag; mint only for live. Bricolage Grotesque for headings, Geist for text, Geist Mono for every number and command, lucide icons at 1.75 px. The centrepiece is a 3D lottery drum in brushed copper on a walnut table under one warm lamp (three.js via react-three-fiber + drei); that lamp's pool is the site's only gradient. You join a round by typing `!scoop 0.25` in the round chat.

## Where things are

- `components/drum/` — the 3D world: `drum-sim.ts` (the round as state + a small sphere-in-sphere physics: drops through the chute, the cage lock, one turn on cubic-bezier(0.77, 0, 0.175, 1), the roll-out onto the rail at the real multipliers), `DrumScene.tsx` (the cage, stand, crank, chute, rail, RoomEnvironment lighting, contact shadow, pointer lean, hero scroll, crank drag, the DOM tags), `Drum.tsx` (client-only loading, the poster `public/drum-poster.webp` rendered from the scene, the reduced-motion / no-WebGL fallback with a flat rail), `MiniScenes.tsx` (the loader ball and the rail accent), `materials.ts` (one material library for all three). `components/game/` — the stream: `Stage.tsx` (drum + HUD + strip), `Chat.tsx`, `useRoundChat.ts` (snapshots → chat lines, the commands `!scoop` `!odds` `!pot` `!verify` `!sell`; the old `!pull` and `!sum` still answer), `ResultsBoard.tsx`, `StreamHero.tsx`. `scripts/make-brand.mjs` + `scripts/brand-lib.mjs` draw the Ladle mark and convert Bricolage Grotesque 800 to paths (opentype.js); `scripts/make-og.mjs` the Open Graph card; `scripts/render-art.mjs` the drum poster and the four stills.

- `app/(site)/` — `/` (the stream: stage + round chat + results board, how a round plays, chat commands, practice round, what the house cannot do, match history, integrate, questions), `/odds`, `/window/[id]` (verification), `/integrate`, `/security`, `/brand`, `/about` → 308 to `/security`. `app/embed/[mint]` serves the stage and the chat alone.
- `components/live/LiveProvider.tsx` — one subscription to the data source, shared by the stage and the chat.
- `components/sim/Simulator.tsx` + `lib/sim.ts` + `lib/sim.worker.ts` — "See what a draw looks like": sliders, 20,000 windows per move with `computeWeights`, `computeShares`, `splitFees`, `curveBuy` from `@pulled/sdk/law`, split across up to four Web Workers and merged. The roll source is a seeded PRNG with the law's formula (floor((ROLL_MAX+1)·u³)) instead of sha256.
- `components/dashboard/ExampleDashboard.tsx`, `HowItWorksNumbers.tsx`, `RecentWindows.tsx`, `project/GatesBand.tsx` (the seven gates, the two fee figures, the one photo), `fx/Faq.tsx`, `FinalCta.tsx`, `Loader.tsx` (first visit of the session, ≤ 900 ms, a segmented ring filling in slots).
- `components/ui/` — `Panel` (the card: radius 24, the layered shadow), `Button` (primary 52 px / radius 12, secondary, wallet, `size="sm"` 36 px), `Badge` (the pill), `Figure` (the only way a measured figure reaches the page: value, date, source), `Section` (h2 + "All … →"), `Icon` (thin inline SVG icons), `Ring` (the segmented ring), `Table`, `Feed`, `Chart`.
- `lib/data/` — the data layer (`mock.ts`: deterministic demo settled with the real law; `chain.ts`: not wired). `lib/measurements.ts` and `lib/project.ts` build every figure from the research JSON and the project files, dated and sourced. `i18n/` — EN and FR dictionaries, one key per string.

## Honesty rules (unchanged)

The draw is honest: balls fall in 300 ms, dead stop at seal, one seed in 600 ms, placement in 700 ms, under 2 s, no fake suspense. Every figure goes through `Figure` with its date and its source. Demo data is labelled. The simulator says "an estimate from the published law, not a promise" and shows its run. `tests/forbidden-words.ts` fails the build on any word that promises a gain or hides a risk. UNVERIFIED stays UNVERIFIED.

## Run, build, verify

```sh
pnpm --filter @pulled/app dev            # http://localhost:3000
pnpm --filter @pulled/app build          # prebuild regenerates public/og.png and app/icon.png
node --experimental-strip-types tests/forbidden-words.ts   # from the repo root
```

Captures: `SHOT_OUT=v10 node screenshots/shoot.mjs home=/ odds=/odds integrate=/integrate security=/security window=/window/demo-1099` (headless Chrome over CDP; `LOCALE=fr` for French, `REDUCED=1` for reduced motion). On the home route it also writes the hero mid-animation, the simulator after a slider move, the loading screen and the page bottom, and prints the drum's frame cost and the simulator's run time. `node screenshots/shoot.mjs --refs obvance=https://obvance.app/` captures the reference at 1280 and 375 into `screenshots/refs/`.
