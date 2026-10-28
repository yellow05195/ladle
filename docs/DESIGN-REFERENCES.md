# Design references — measured in the browser

Every rhythm value of the site (sizes, spacings, radii, durations) comes from a real site, measured with `getComputedStyle` on 23 Oct 2026 in Chrome at a 1280 px viewport. One screenshot per site is in `app/screenshots/refs/`. Where a site could not be reached, it is said so and the next site of the same row of the brief (§11.2) was used.

Colours are never taken from the references: the palette is ours (DESIGN-BRIEF §3).

## Summary table

| element of our site | source | measured | what we keep (in `app/app/globals.css` unless noted) |
|---|---|---|---|
| Floating capsule header | FomoEven (`themes/light/decor.css` `.capsule`, `.nav a`, `.site-header.scrolled .capsule`) | `min-height 64px`, `padding 8px 8px 8px 12px`, `border-radius 999px`, `backdrop-filter blur(18px) saturate(1.4)`, border `1px`, sticky `top 14px`, width `min(1080px, 100%)`; scrolled: `min-height 54px`, width `min(1000px, 100%)`, 300 ms; `.nav a` `padding 8px 16px`, `14px/600` | `.capsule`: 62 px, same padding, blur and radius, sticky 14 px, tightens to 54 px / 1000 px when scrolled (`CapsuleScroll`) |
| Nav pills | linear.app header: links `32px` tall, `padding 0 8px`, `border-radius 6px`, `16px/400`; family.co nav: `34px`, `padding 8px 12px`, `radius 6px`, `16px/500`, `transition 0.2s ease-out` | `.nav-pills a`: 32 px, `0 12px`, 14 px / 500, 160 ms |
| Column guide lines with crosses | vercel.com home: guide borders `1px solid rgb(26,26,26)` on `#0a0a0a` (7 % lighter than the ground), crosses are `24px` SVGs at the corners | `.guides`: 1 px `rgba(107,74,43,.12)` lines at the column edges; `.plus-rule` crosses 24 px drawn with two 1 px strokes |
| Hero | apple.com/iphone: `h1 80px/84px`, weight `600`, `letter-spacing -1.2px` (-0.015 em); sub `28px/32px/400`; hero picture `1260×612` under the words. teenage.engineering: body `16px/24px` weight 300, labels lowercase, price `27.66px`, product on a plain ground, no decoration | `h1` `clamp(44px, 6.1vw, 80px)`, weight 600, line-height 1.05, `-0.015em`; lead 20 px / 1.5; one object (the drum) on the plain paper, no halo; two floaters at most, parallax on scroll (`.parallax`), no loop |
| Live card | jup.ag swap panel: inner panel `border-radius 16px`, `padding 16px`, border `1px`, amount `32px/39px` weight `600` `letter-spacing -0.6px`, main button `58px`, `radius 16px`, `18px/600`. pump.fun feed: amounts `12px/18px` weight `500`, avatars `16px` round, cards `radius 16px` `padding 24px`, body Geist `16/24` | `.glow-inner` panels 16 px radius / 16 px padding; countdown 56 px (Fraunces) with its unit at 12 px; feed rows 44 px, 24 px identicons, amount 13 px / 500, time 12 px (`LiveCard`) |
| Live ticker | pump.fun top bar: `12px/18px` weight `500`, ~36 px tall, items separated by a dot. polymarket.com: **not reachable** from this browser (navigation refused by policy), so pump.fun alone | `.ticker`: 36 px, mono 12 px, a 4 px dot between items, 60 s per loop (about 60 px/s), paused on hover |
| Stat numbers | stripe.com/en-fr numbers: figure `48px/48px` weight `300` `letter-spacing -0.96px` (-0.02 em); legend `16px/22.4px`. linear.app `h2 40px/44px` weight `510` | `.numbers` row: figure 48 px Fraunces 500 `-0.02em` / legend 16 px / 22 px ink-2, hairline between columns (FomoEven `.lp-stat` border-left) |
| Sections, rhythm, titles | linear.app: `section padding 128px 0`; `h1 64px/64px/510 -1.408px`; `h2 40px/44px/510 -0.88px` (-0.022 em); body `15px/24px -0.165px`, measure `378px` (~48 ch); link hover `color 0.1s cubic-bezier(.25,.46,.45,.94)` | `.sec` 128 px (96 px under 720 px); `h2` 40/44, weight 600, `-0.022em`; lead 15/24 max 48 ch; transitions 100–160 ms with Linear's curve |
| Tables | linear.app has no public table; pump.fun rows: `12px/18px`, 16 px avatars, hairline `rgb(35,35,39)` on `rgb(11,11,14)` | `.tbl`: rows 44 px (`padding 12px 0`), mono 13 px, hairline `rgba(107,74,43,.12)`, figures right-aligned (`WindowDetail`, `/odds`) |
| Buttons | linear.app: primary `32px` pill, `13px/510`, `padding 0 12px`, `transition 0.16s cubic-bezier(.25,.46,.45,.94)`; vercel.com: `40px` pill `16px/500` `padding 0 12px` `.15s cubic-bezier(.4,0,.2,1)`; stripe.com: `40–48px`, `radius 4px`, `14–16px/400`, `padding 12–16px 20–24px`, `0.24s` | `.btn-stamp` 44 px (48 px in the hero), `radius 8px`, 15 px / 500, `padding 0 16px`, 160 ms with Linear's curve, press scale .97 (family.co 0.2 s ease-out); `.btn-ghost` same box with a hairline |
| FAQ accordion | docs.stripe.com and linear.app/pricing expose no `<details>` to measure; the rhythm of Linear's controls was used (32 px controls, 0.16 s) | `.faq summary` 56 px (16 px / 500 + 18 px padding), chevron as a 1.5 px stroke SVG turning in 200 ms |
| `/integrate` | docs.stripe.com/payments/quickstart at 1004 px: article `715px` wide from `left 56`, text column `222px`, code column `429px` from `left 342`; `pre` Menlo `13px/20px`, radius `4px`; `h1 32px/700`, `h2 21px/700`, `p 16px/26px` | two columns: sticky left nav 220 px, text 16/26, code right in `.code-plate` 13 px / 20 px, radius 6 px, light ground (`/integrate`) |
| Footer | FomoEven `.footer-big` `clamp(3rem, 11vw, 9rem)` `letter-spacing -0.05em` line-height 0.95; vercel.com footer `padding 40px 24px`, column heads `14px/500`, links `14px/20px` 24 px tall, grey on dark | `.footer-word` same clamp and tracking; three columns at 14 px, heads 14 px / 500, links 24 px tall, hairline above the status line |
| Motion | family.co: `transition 0.2s ease-out` (nav), `background 0.2s, color 0.2s` (buttons); linear.app: `0.1s` and `0.16s cubic-bezier(0.25, 0.46, 0.45, 0.94)` | `--ease-fx: cubic-bezier(.25,.46,.45,.94)`; hover 100–160 ms; press 160 ms; nothing at 600 ms `ease-in-out`; the only loops: the glow border (8 s) and the ticker |
| "The world" photo band | apple.com/iphone: full-width picture `1260×612` at 1280, `h2 56px/60px/600`, `p 28px/32px/400` under it | band 420 px (brief §5.6), sentence `clamp(28px, 3.6vw, 44px)` / 1.15 in paper over a veil, caption 15 px mono |

## Per site

### FomoEven (local port, `C:\Users\Utilisateur\Nouveau dossier (12)\app\themes\light\`)
Read from `decor.css`, `f100.css`, `light.css` (not a running site, so measured from the stylesheets). Capsule, nav, scrolled state, `.footer-big`, `--lt-shadow: 0 1px 2px rgba(40,48,120,.05), 0 18px 40px -18px rgba(60,70,170,.22)` (we use the same shape with our brown: `--panel-shadow`), `.glow-card` 8 s conic border, `.loader` 600 ms fade, `.reveal` 760 ms (not kept), `.marquee` mask `8 %/92 %`.

### linear.app (`refs/linear.png`, `refs/linear-pricing.png`)
Header 73 px, `backdrop-filter blur(20px)`; nav links 32 px / radius 6 / `0 8px`; h1 64/64 weight 510 `-1.408px`; body 15/24 `-0.165px`, measure 378 px; sections `padding 128px 0`; h2 40/44 weight 510 `-0.88px`; "Sign up" 32 px pill 13/510 `0 12px`, `transition border .16s, background-color .16s cubic-bezier(.25,.46,.45,.94)`; "Log in" 32 px, `0 12px`, 13/400, `color .1s`. Footer links 16/24 (not kept, Vercel's used).

### vercel.com (`refs/vercel.png`)
h1 64/64 weight 400 `-3.84px` (not kept: too tight for a serif); h2 56/56 weight 450 `-3.36px`; guide cell `border-left/right 1px solid rgb(26,26,26)`; corner crosses 24 px SVG; "Deploy now" 40 px pill 16/500 `0 12px` `.15s cubic-bezier(.4,0,.2,1)`; footer `padding 40px 24px`, heads 14/500, links 14/20 grey.

### family.co (`refs/family.png`)
Header 94 px (`padding 30px 0`), nav links 34 px radius 6 `8px 12px` 16/500 `transition .2s ease-out`; "Developers" 33 px white radius 6 15/500 `background .2s, color .2s`; h1 68/74.8 weight 500 `-1.36px`; sub 16 px.

### stripe.com/en-fr (`refs/stripe.png`)
h1 48/55.2 weight 300; h2 32/35.2 weight 300; "Get started" 48 px radius 4 16/400 `15.5px 24px 16.5px` `.3s cubic-bezier(.25,1,.5,1)`; "Contact sales" 40 px radius 4 14/400 `11.5px 20px 12.5px` `.24s`; numbers 48/48 weight 300 `-0.96px` with 16/22.4 legends.

### docs.stripe.com/payments/quickstart (`refs/stripe-docs.png`)
At 1004 px: article 715 px wide at left 56; text column 222 px; code column 429 px at left 342; `pre` Menlo 13/20, radius `0 0 4px 4px`; h1 32/700, h2 21/700, p 16/26. No `<details>` on the page.

### apple.com/iphone (`refs/apple-iphone.png`)
h1 80/84 weight 600 `-1.2px`; section h2 56/60 weight 600 `-0.28px`; sub 28/32 weight 400; hero picture 1260×612.

### teenage.engineering (`refs/teenage-engineering.png`)
Ground `rgb(0,0,0)` with the product photo alone; body `te-20` 16/24 weight 100–300; nav labels lowercase 16 px weight 100; price `TechnoType` 27.66 px weight 700. The product page `/products/op-1-field` is a 404 now; the home page was measured.

### jup.ag (`refs/jup.png`)
Swap inner panel radius 16, padding 16, border 1 px; amount input 32/39 weight 600 `-0.6px`; "Connect" 58 px radius 16 18/600 `20px 16px`; side nav links 36–40 px radius 6–8 14/500.

### pump.fun (`refs/pump.png`)
Body Geist 16/24 on `rgb(11,11,14)`; feed amounts 12/18 weight 500; avatars 16 px round; cards radius 16 padding 24; hairline `rgb(35,35,39)`.

### polymarket.com
Not reachable from this browser (navigation refused by policy); nothing measured. The ticker and row values come from pump.fun.

## v4 (DESIGN-BRIEF v4): where each value of the final site comes from

The same references, re-read for the v4 system (`app/app/globals.css`, `app/components/ui/`, `app/lib/motion.ts`). Colours are the brief's own (§1); only rhythm, sizes, radii and durations come from the measurements above.

| our value | source line above |
|---|---|
| capsule: sticky 14 px, `min(1080px, 100%)`, 999 px, `rgba(255,255,255,.78)` + blur 18 px, 1 px line, `--shadow`; pills 32 px / `0 12px` / 14 px 500, active cobalt | FomoEven `.capsule` `.nav a`; linear.app header pills 32 px radius 6 |
| h1 `clamp(44px, 6.4vw, 84px)` / 1.0 / −0.035 em, 700; h2 `clamp(28px, 3.2vw, 40px)` / 1.1 / −0.025 em | apple.com h1 80/84 600 −0.015 em (brief v4 tightens it to −0.035 em, like vercel.com's −0.06 em range); linear.app h2 40/44 −0.022 em |
| body 16/26 (15/24 on a phone), lead 18/28, secondary 14/22 | linear.app body 15/24 and lead; docs.stripe.com p 16/26 |
| `Section` padding 96 px (64 px on a phone), hairline above, mono section number | linear.app sections 128 px (v4 asks 96), vercel.com hairline rows |
| `Figure` xl 56 px / lg 32 px / md 20 px in Geist Mono 500 −0.03 em; countdown `clamp(56px, 8vw, 112px)` −0.04 em | stripe.com numbers 48 px −0.02 em over 16/22 legends; jup.ag amount 32 px 600 −0.6 px; teenage.engineering price in mono-like TechnoType |
| `Button` 44 px, radius 10, 15 px 600, press scale .98 | linear.app 32 px pills 13/510; vercel.com 40 px 16/500; stripe.com 40–48 px radius 4 (v4 fixes 44 / 10) |
| `Panel` radius 16, 1 px `--line`, `--shadow`, padding 24 (20) | FomoEven `.fx-panel` 24 px / `--lt-shadow`; jup.ag inner panel radius 16 padding 16 (v4 fixes 16) |
| `Feed` rows 56 px, identicon 28 px, name 14 px 600, time mono 12 px, amount mono 14 px 500 | pump.fun feed 12/18 500, 16 px avatars, cards radius 16 (v4 scales the row to 56 px) |
| `Table` rows 44 px, head mono 12 px, hairlines only | pump.fun rows; linear.app has no public table |
| ticker 40 px, mono 13 px, 40 s linear, pause on hover | pump.fun top bar 12/18 500 |
| `/integrate` two columns, sticky nav, code 13/20 on `--surface-2`, radius 10 | docs.stripe.com article 715 px, code column 429 px, Menlo 13/20 |
| footer `--surface-2`, columns 14 px, wordmark `clamp(3rem, 11vw, 9rem)` −0.05 em | FomoEven `.footer-big`; vercel.com footer 14/500 heads, 14/20 links |
| motion: GSAP `power3.out`, 0.2 / 0.5 / 0.9 s, reveals at 82 % once, 160 ms hovers, scrubbed pin 300vh | linear.app 0.1–0.16 s `cubic-bezier(.25,.46,.45,.94)` hovers and scroll reveals; family.co 0.2 s ease-out; FomoEven arrival timeline |

---

# v7 — HUD sci-fi: references measured on 2026-10-23

Captures in `app/screenshots/refs/` (1280×900, headless Chrome, Chrome UA): `linear.png`, `vercel.png`, `hyperliquid.png`, `axiom.png`, `teenage-engineering.png`, `stripe-docs.png`, `lusion.png`, `igloo.png`. Values below come from `getComputedStyle` on the live pages the same day (body, first `h1`, first button, first nav link); a site that serves a bot wall or a WebGL-only page gives partial values, noted as such.

| site | ground | text | h1 | button | what v7 takes from it |
|---|---|---|---|---|---|
| linear.app | `rgb(8,9,10)` near-black | Inter Variable 16/24, `rgb(247,248,248)` | 64 px / 64 px, weight 510, letter-spacing −1.4 px | 32 px high, 13 px, pill | the rhythm: one idea per band, a quiet near-black ground, text at 16/24, headings tight (−0.02em); v7 keeps the rhythm and the tracking, squares the corners |
| vercel.com | `rgb(250,250,250)` (light by default) | Geist 16/24 | 64 px / 64 px, weight 400, letter-spacing −3.84 px | radius 6 px, 14 px | the grid discipline and the footer in mono columns; v7's footer and rulers follow its column widths, not its light ground |
| app.hyperliquid.xyz | `rgb(48,48,48)` panels on dark | custom sans 16, white | none (an app) | 33 px high, 12 px, radius 8 | data density: 12 px mono figures in tight rows, status squares, dark panels; v7's feed, tables and telemetry line take the density and the 12 px figures, square the radius |
| axiom.trade | `rgb(6,7,11)` blue-black | Geist Variable 16/24, `rgb(252,252,252)` | 61 px / 79 px, weight 500 | 32 px, pill | the exact ground: v7's `--bg #05070B` is this blue-black; the panel glass (`rgba(11,15,23,.72)` + blur) comes from its trading panels |
| teenage.engineering | `rgb(0,0,0)` | te-20 16/24, lowercase labels | none on the landing (products) | 13 px, radius 0, weight 100 | instruments and labels: square corners, 1 px, lowercase/uppercase mono labels as readouts; v7's bracket frames and `SPIN · NO EFFECT` readouts |
| docs.stripe.com | transparent on white | system sans 14, `rgb(60,66,87)` | 32 px / 40 px, 700 | 14 px | `/integrate`: sticky left nav, text left / code right, 14 px nav; kept |
| lusion.co | white (WebGL page) | Aeonik 16/18.4 | 32 px / 35 px | pill 100 px | 3D wireframe and motion restraint: lines, not surfaces; v7's drum is lines only, slow rotation, no idle wobble |
| igloo.inc | `rgb(160,165,177)` (WebGL canvas page; no DOM text measured) | — | — | — | the single hero object with the page built around it; v7 gives the drum the hero's full height and ties the readouts to it with leader lines |

HUD vocabulary (Alien: Isolation, Oblivion 2013, The Expanse) is used as vocabulary only: bracket corners, reticle for "you", graduated rulers, segmented bars, a slow scan on living panels, mono caps readouts with leading-zero counters. Nothing is copied.

## v7 mapping

- Ground `#05070B` + dot grid 24 px `rgba(130,170,220,.10)` + one radial cyan halo top-right (`rgba(77,216,255,.07)`, 900×600): axiom's ground, linear's quiet.
- Type: Chakra Petch 600/700 (display, original Google latin woff2), Inter (text 16/26), Geist Mono (data 12–13 px; HUD labels 11 px caps, 0.12em): linear's tracking on h1 (−0.02em), hyperliquid's 12 px figures.
- Panels: glass `rgba(11,15,23,.72)` + blur 8 px, no full border, four 12 px brackets 1 px `--line-2`; full 1 px line on hover/active; the live panel and the pinned scene carry the scan line: teenage's instruments, axiom's panels.
- Buttons 44 px, mono caps, square corners, cyan fill, glow on hover only: teenage's radius 0, hyperliquid's 12–13 px labels.
- Two accents: cyan `#4DD8FF` = me / the system, amber `#FFB347` = the others; results in `--ink`; no green/red/magenta/violet.

---

# v8 — in dots: references captured on 2026-10-24

Captures in `app/screenshots/refs/`: `nothing.png` (nothing.tech: the dot-matrix type, black, one accent, interactive dot screens), `resend.png` (black, matte, sober), `teenage-engineering.png` (instruments, labels, restraint), `vercel.png` (guide lines, grid, rhythm); FomoEven (local) for the capsule, the loader, the big figures, the giant wordmark and the soft motion. Vocabulary, not copy.

## v8 mapping

- Ground `#0A0A0A`, panels `#111111` at radius 20 with 1 px `rgba(255,255,255,.10)`, two full-height guide lines at the 1200 container's edges (Vercel), a floating pill capsule with blur (FomoEven), pill buttons (white, amber on hover), the wordmark giant in `#181818` (FomoEven).
- Type: Doto (Google's variable dot-matrix face, `ROND 60`) for titles and figures, Inter 16/26 for text, Geist Mono lowercase for labels and tables (Nothing's dot type as the one display voice; no spaced caps, no typewriter).
- One accent, amber `#FFB000`: me and the primary button's hover; the others are white; results without colour. Unlit dots always visible at 8 %: a display, not a texture.
- Everything that is an image is drawn by `DotField` on a 2D canvas: the hero drum (ring, scrolling bars, 3×3-dot balls, crank), the live drum, the LED board, the archive halftone, the icons, the loader; charts are columns of dots and dotted lines; reveals are an ordered 4×4 Bayer dither in 8 steps.

## v9 — the Obvance register (2026-10-24)

- **obvance.app** (`app/screenshots/refs/obvance-1280.png`, `obvance-1280-full.png`, `obvance-375.png`, `obvance-375-full.png`, captured fully scrolled): the dark fintech register the owner asked for. Taken: the 64 px bar with a 36 px secondary and a deep-blue wallet button, the two-column hero (copy + animated SVG diagram with lettered nodes, dotted curves carrying particles, numbered badges and a legend), the "Live · updated every …" band, the framed example dashboard, the numbered "How it works" cards with a mono result line and a statement card, the slider instrument that recomputes a giant figure and a chart, the trust cards with icon boxes and two large fee figures, the "+" accordion, the radial-glow CTA card, the column footer. Measured values (§0 of the brief) are the tokens of `app/app/globals.css`.
- Ours, not theirs: the objects are the window (a 92-segment disc that fills in slots), the seed (a white dot falling at close) and the shares (cards with mono multipliers computed by the real law); me = periwinkle, the others = amber, green only on "live"/"open", results uncoloured; the drum stays a thin-line 2D instrument; every figure is dated and sourced; the simulator runs the published law in Web Workers and says it is an estimate.

## v10 — pixel objects on the v9 chrome (2026-10-24)

- The owner asked for the pixel side back ("take inspiration from my projects"): the PEAKED v6 pixel craft notes (`Nouveau dossier (13)/research/DESIGN.md`) set the rules — integer scale from the viewport, one logical pixel = whole device pixels, ordered dither, hand-drawn sprites, identicons from a hash. Applied here as the illustration and live-display language only: the drum in the hero ring, 2×2 particles, the 3×3 seed, 12×12 balls in the nodes, the live drum at 160×100 with 3×5 labels, the 5×7 matrix countdown and slot, the pixel loader, 26 two-colour icons, seven gate vignettes, the pixelated photo, 8×8 identicons, two-frame step sprites, the footer drum, the 4 % Bayer texture. Geist stays on every word and figure; cards, buttons, bar and layout stay Obvance.

## v11 — the FomoEven skin, measured (2026-10-24)

Source: FomoEven's original dark skin, `Nouveau dossier (12)/app/themes/light/globals.css` and `decor.css` (read in full; values from its first layers, before its own v6 waterline / v7 "no boxes" / v13 "sober pass" overrides, as §10 of the brief lists them). Ours: `getComputedStyle` on http://localhost:3000/ at 1280, 2026-10-24.

| element | FomoEven (CSS) | ours (computed) |
|---|---|---|
| page | `#05070f` + radial 1100×600 at 85 % −10 % rgba(47,107,255,.18) + radial 900×500 at −10 % 35 % .07, fixed | rgb(5,7,15), the same two radials, attachment fixed |
| cards | `--card #0c1122`, `--card-2 #111830`, `--card-3 #1a2447`; `.card` linear(card-2→card), border rgba(255,255,255,.07), radius 24, rim inset 0 1px 0 .06, lit hairline ::after | linear-gradient(rgb(17,24,48), rgb(12,17,34)), rgba(255,255,255,.07), 24px, inset 0 1px 0 rgba(255,255,255,.06), ::after present |
| text | `#f4f6ff` / `#a2aac6` / `#737c9b` | #f4f6ff / #a2aac6 / #737c9b |
| me / the others / live | blue `#2f6bff` (text `#6a95ff`) / sun `#ffb547` / (their up #33d17a) | #2f6bff (text #6a95ff) / #ffb547 / #4fd394 kept (brief: unchanged) |
| capsule | width min(1080px,100%), 64 px, radius 999, linear(rgba(22,30,60,.8)→rgba(10,14,30,.8)), border .1, blur(18px) saturate(1.4), shadow inset .12 + 0 18 50 −20 .9 + 0 0 40 −12 blue .45, sticky top 14 | 64px, 999px, same gradient, border, backdrop-filter and shadow, top 14px. **Width min(1180px,100%)**: our capsule carries the slot display and two actions more; at 1080 it overflowed by 160 px. The scrolled state keeps the width (FomoEven narrows it to 1000) and only tightens height/padding/colour |
| nav | tray rgba(255,255,255,.04), radius 999, padding 4; links 8×16 600 14 px; active linear(#3b77ff→#2458e6) white + inset .25 + 0 6 18 −8 blue .9 | tray, 999px, 4px; links 8×12 (their own compact value, for width); active gradient and shadow identical |
| primary button | `.pill-primary` + light sweep; §10: gradient #3b77ff→#2458e6, inset .25, 0 6 18 −8 .9 | linear-gradient(rgb(59,119,255), rgb(36,88,230)), radius 999px, 52 px, that shadow, the sweep |
| secondary | rgba(255,255,255,.04), border .12 | rgba(255,255,255,.04), rgba(255,255,255,.12), 999px |
| titles | display face, 800, −0.05em, line-height .95 | Sora 800 (FomoEven's `--font-display` per its DESIGN.md), −0.05em, 0.95; text Inter; figures Geist Mono |
| grad-num | linear(180deg,#9fbaff,#2f6bff) clip text | same, on 3 home figures (×1.000 expected, the two fees) and the three latency figures on /security; never on a draw result |
| kicker | rgba(47,107,255,.12), border rgba(106,149,255,.3), #6a95ff, 999 | identical, exactly one (hero) |
| glow card | radius 28, padding 1, conic(from --angle …#2f6bff, #7ad7ff…), angle 8s, shadow 0 30 80 −40 .8; inner radius 27, radial + linear(#111a38→#0a1022) | 28px, conic from --angle, "angle 8s", same shadow; inner 27px, same backgrounds |
| marquee | linear(90deg, .1/.03/.1), mask 8 %/92 %, items 14×28, scroll 40s, 22 px sprite | identical; sprite is our 8×8 identicon at ×3 = **24 px** (22 would break the integer pixel scale) |
| floaters | drop-shadow(0 18 30 .55) drop-shadow(0 0 24 blue .35), bob 7s / drift-up 11s | identical filters and animations, on the container of pixel sprites (3 balls, the ticket, the seed) |
| bubbles | round glossy bubbles rising | 18 pixel squares 2–4 px, #9fbaff, ≤ 0.35 |
| loader | radial 560×380 .2 on --bg, buoy, word base + fill clip by --p, mono % | same, our pixel drum spinning instead of the buoy, 600 ms + 300 ms |
| footer | footer-sea linear(#0a1433 → #060a1c 60 % → #04060f); footer-big 800 −0.05em clamp(3rem,11vw,9rem) gradient text | identical (112 px at 1280), pixel drum beside, two pixel balls falling |
| motion | page-in 560 ms cubic-bezier(.22,1,.36,1); fx-fade-up / fx-card-in; nav-progress 2 px; capsule tightening 300 ms | page-in 0.56s cubic-bezier(0.22,1,0.36,1); the same keyframes once on scroll; nav-progress 2 px gradient; capsule transition 300 ms; all cut under reduced motion |

Not taken (no equivalent in our structure): their waves, the waterline/buoy scene, the moon and stars, the dashed spinning rings, the token grid, the fee bar.
