import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { BRAND } from "../../../../config/brand";
import { SCARVES, SPECIES } from "../../../lib/profile";
import { Arr, PageHead, Sec, SecHead } from "../../../components/hall/sections/kit";
import { P } from "../../../components/hall/sections/copy";

export const metadata: Metadata = { title: "Brand" };

/** What ships in the hall (app/public/assets/ASSETS.md), credited. */
const CREDITS: Array<{ what: string; author: string; href: string; host: string; licence: string }> = [
  { what: "Cube Pets: the 12 player characters", author: "Kenney", href: "https://kenney.nl/assets/cube-pets", host: "kenney.nl/assets/cube-pets", licence: "CC0 1.0" },
  { what: "Furniture Kit: wall lamps, round tables, table lamps, potted plants", author: "Kenney", href: "https://kenney.nl/assets/furniture-kit", host: "kenney.nl/assets/furniture-kit", licence: "CC0 1.0" },
  { what: "Double curtains", author: "Quaternius", href: "https://poly.pizza/m/kkeII96j9N", host: "poly.pizza/m/kkeII96j9N", licence: "CC0 1.0" },
  { what: "Columns", author: "Quaternius", href: "https://poly.pizza/m/wLubNpOTX4", host: "poly.pizza/m/wLubNpOTX4", licence: "CC0 1.0" },
  { what: "Small couch (the booths)", author: "Quaternius", href: "https://poly.pizza/m/ZOPP3KzNIk", host: "poly.pizza/m/ZOPP3KzNIk", licence: "CC0 1.0" },
  { what: "Armchair", author: "CreativeTrio", href: "https://poly.pizza/m/myd1WSucAz", host: "poly.pizza/m/myd1WSucAz", licence: "CC0 1.0" },
  { what: "Hanging lantern (over the doors)", author: "Kay Lousberg", href: "https://poly.pizza/m/3jzk3YShv1", host: "poly.pizza/m/3jzk3YShv1", licence: "CC0 1.0" },
  { what: "Spotlight (the rig above the drum)", author: "iPoly3D", href: "https://poly.pizza/m/t0roJdkhIa", host: "poly.pizza/m/t0roJdkhIa", licence: "CC0 1.0" },
  { what: "warm_bar HDRI (the brass reflections)", author: "Greg Zaal, Jarod Guest", href: "https://polyhaven.com/a/warm_bar", host: "polyhaven.com/a/warm_bar", licence: "CC0 1.0" },
  { what: "WoodFloor064, Marble016, Fabric026 (floor, gallery ring, felt, velvet)", author: "ambientCG", href: "https://ambientcg.com/view?id=WoodFloor064", host: "ambientcg.com", licence: "CC0 1.0" },
  { what: "Drum cradle, bear host, fox bellhop, velvet-rope stanchions", author: "Ladle, generated with Higgsfield", href: "https://higgsfield.ai", host: "higgsfield.ai", licence: "project-owned" },
  { what: "Figtree, the one typeface", author: "Erik Kennedy, via github.com/google/fonts", href: "https://github.com/google/fonts/tree/main/ofl/figtree", host: "github.com/google/fonts", licence: "OFL 1.1" },
];

const A = BRAND.assets;
const DOWNLOADS: Array<{ label: string; href: string }> = [
  { label: "Wordmark, cream and saffron · SVG", href: A.wordmark },
  { label: "Wordmark, for light grounds · SVG", href: A.wordmarkDark },
  { label: "Wordmark, brass · SVG", href: A.wordmarkBrass },
  { label: "Wordmark, one colour · SVG", href: A.wordmarkMono },
  { label: "Wordmark · PNG 2400", href: A.wordmarkPng },
  { label: "Mark, cream and saffron · SVG", href: A.mark },
  { label: "Mark, for light grounds · SVG", href: A.markLight },
  { label: "Mark, brass · SVG", href: A.markBrass },
  { label: "Mark, one colour · SVG", href: A.markMono },
  { label: "Mark · PNG 1024", href: A.markPng },
  { label: "Lockup with the tagline · SVG", href: A.lockup },
  { label: "Lockup, for light grounds · SVG", href: A.lockupDark },
  { label: "App icon · PNG 1024", href: A.appIcon },
  { label: "Avatar, charcoal · PNG 1000", href: A.avatar },
  { label: "Avatar, brass · PNG 1000", href: A.avatarBrass },
  { label: "Avatar: charcoal ladle, cream ball, on tomato · PNG 1000", href: A.avatarTomato },
  { label: "Header banner · PNG 1500 × 500", href: A.banner },
  { label: "Geometry of the mark and the word · JSON", href: A.geometry },
  { label: "Favicon · SVG", href: "/favicon.svg" },
];

const WORD = BRAND.logo.word;
const BALL_D = WORD.ball.r * 2;

/** The drawn word, inline (the geometry of /brand/ladle-wordmark.svg), so a tile can misuse it on purpose. */
function Word({ ink = "var(--ink)", ball = "var(--saffron)", className = "word", style }: { ink?: string; ball?: string; className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} viewBox={WORD.viewBox} aria-hidden="true" style={style}>
      <path d={WORD.ink} fill={ink} />
      <circle cx={WORD.ball.cx} cy={WORD.ball.cy} r={WORD.ball.r} fill={ball} />
    </svg>
  );
}

/** One crossed-out misuse: the tile with one diagonal strike, the sentence under it. */
function Dont({ children, text, photo = false }: { children: ReactNode; text: string; photo?: boolean }) {
  return (
    <li>
      <div className={`tile ${photo ? "photo" : ""}`}>
        {children}
        <svg className="strike" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true"><line x1="4" y1="56" x2="96" y2="4" stroke="var(--ink-2)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>
      </div>
      <p className="body">{text}</p>
    </li>
  );
}

const SRC: Record<string, string> = { mark: A.mark, markLight: A.markLight, markBrass: A.markBrass, avatarTomato: A.avatarTomato, markMono: A.markMono };

/**
 * /brand (v21.1, §7.23): the kit. The wordmark large with its clear space,
 * the mark at its sizes, the five colourways as plates with their samples,
 * the palette with one job per colour (tomato the one action, saffron the
 * ball and never a state or a result, cream text and everything that is
 * yours; lacquer retired from the interface), the one type family set in
 * its own roles, the rules, the characters, every file to download and
 * the credits.
 */
export default function BrandPage() {
  const b = P.brand;
  return (
    <>
      <PageHead label={b.label} title={b.title} lede={b.lede} />

      <Sec id="wordmark" labelledBy="wm-h">
        <h2 id="wm-h" className="sr-only">The wordmark</h2>
        <div className="pg-split">
          <div className="c7 pg-col">
            <div className="plate pg-brand-word">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={A.wordmark} alt="Ladle" width={560} height={218} />
            </div>
            <p className="fine">The word, drawn from scratch: 242 × 94.3 units, x-height 56.</p>
            <figure className="pg-clear">
              <svg viewBox={`${-BALL_D - 4} ${-BALL_D - 4} ${WORD.w + 2 * BALL_D + 8} ${WORD.h + 2 * BALL_D + 8}`} role="img" aria-label={b.clearAria}>
                <rect x={-BALL_D} y={-BALL_D} width={WORD.w + 2 * BALL_D} height={WORD.h + 2 * BALL_D} rx={BALL_D / 2} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
                <path d={WORD.ink} fill="var(--ink)" />
                <circle cx={WORD.ball.cx} cy={WORD.ball.cy} r={WORD.ball.r} fill="var(--saffron)" />
                <circle cx={-WORD.ball.r} cy={-WORD.ball.r} r={WORD.ball.r} fill="var(--ground-3)" />
                <circle cx={WORD.w + WORD.ball.r} cy={WORD.h + WORD.ball.r} r={WORD.ball.r} fill="var(--ground-3)" />
              </svg>
              <figcaption className="fine">{b.clearNote}</figcaption>
            </figure>
          </div>
          <div className="c5 pg-col">
            <h3 className="title">{b.markTitle}</h3>
            <ul className="pg-sizes">
              <li>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={A.mark} alt="The Ladle mark" width={64} height={64} />
                <span className="label">64 px</span>
              </li>
              <li>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={A.mark} alt="" width={24} height={24} />
                <span className="label">24 px</span>
              </li>
              <li>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <span className="tile16"><img src={A.mark} alt="" width={16} height={16} /></span>
                <span className="label">{b.size16}</span>
              </li>
            </ul>
            <p className="body">{b.markBody}</p>
          </div>
        </div>
      </Sec>

      <Sec id="colourways" labelledBy="cw-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={1} id="cw-h">{b.waysTitle}</SecHead>
          </div>
          <div className="c8 pg-col pg-col-r">
            <ul className="pg-ways">
              {b.ways.map((w) => (
                <li key={w.name}>
                  <span className="sw" style={{ ["--sw" as string]: w.sample }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {w.src === "markMono" ? <span style={{ width: 40, height: 40, background: "var(--ink)", WebkitMask: `url(${SRC[w.src]}) center / contain no-repeat`, mask: `url(${SRC[w.src]}) center / contain no-repeat` }} /> : <img src={SRC[w.src]} alt="" />}
                  </span>
                  <span className="tx">
                    <span className="title">{w.name}</span>
                    <span className="hex">{w.hex}</span>
                  </span>
                  <span className="role">{w.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Sec>

      <Sec id="palette" labelledBy="pl-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={2} id="pl-h">{b.paletteTitle}</SecHead>
            <p className="body">{b.paletteBody}</p>
          </div>
          <div className="c8 pg-col pg-col-r">
            <ul className="pg-palette">
              {b.palette.map((p) => ({ ...p, hex: BRAND.colors[p.key] })).map((c) => (
                <li key={c.name} data-retired={c.key === "lacquer" ? "" : undefined}>
                  <span className="sw" style={{ ["--sw" as string]: c.hex }} />
                  <span className="nm">{c.name}</span>
                  <span className="seed">{c.hex}</span>
                  <span className="role">{c.role}</span>
                </li>
              ))}
            </ul>
            <div className="pg-col pg-gap-s">
              <span className="label">The six scarf colours: identities, never values</span>
              <ul className="pg-scarves">
                {SCARVES.map((s) => (
                  <li key={s.id}>
                    <span className="face">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/assets/pets/fox-${s.id}.webp`} alt={`fox, ${s.id} scarf`} width={64} height={64} loading="lazy" />
                    </span>
                    <span className="label">{s.id}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Sec>

      <Sec id="type" labelledBy="ty-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={3} id="ty-h">{b.typeTitle}</SecHead>
          </div>
          <div className="c8 pg-col pg-col-r">
            <div className="plate pg-spec">
              <span className="big-d">Same price for everyone. Not the same scoop.</span>
              <p className="label">{b.typeDisplay} Display 44 to 76 px, figures 24 to 132 px.</p>
            </div>
            <div className="plate pg-spec">
              <span className="big-t">Scoop in · 0.25 SOL</span>
              <p className="body">When the round closes, one verifiable seed splits a single LADLE buy among the players.</p>
              <p className="label">{b.typeText} Text 17 px, interface 15 px, labels 14 px, fine print 13 px; nothing smaller.</p>
            </div>
            <div className="plate pg-spec">
              <span className="seed big-s">seed 8a2e ac93 0f1l … 41ee · Il1 0O</span>
              <p className="label">{b.typeSeed}</p>
            </div>
          </div>
        </div>
      </Sec>

      <Sec id="rules" labelledBy="dn-h">
        <SecHead n={4} id="dn-h">{b.dontTitle}</SecHead>
        <ol className="pg-donts">
          <Dont text={b.donts[0]}><span className="typed" aria-hidden="true">ladle</span></Dont>
          <Dont text={b.donts[1]}><Word ball="var(--ink-3)" /></Dont>
          <Dont text={b.donts[2]}><Word style={{ transform: "scale(1.35, 0.72)" }} /></Dont>
          <Dont text={b.donts[3]}><span style={{ display: "flex", alignItems: "center", gap: 2, width: "78%" }}><Word style={{ width: "74%" }} /><span className="label" style={{ color: "var(--ink-2)", lineHeight: 1.1 }}>{b.dontCrowd}</span></span></Dont>
          <Dont text={b.donts[4]} photo><Word /></Dont>
        </ol>
      </Sec>

      <Sec id="characters" labelledBy="ch-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={5} id="ch-h">{b.charTitle}</SecHead>
            <p className="body">{b.charBody}</p>
          </div>
          <div className="c8 pg-col pg-col-r">
            <ol className="pg-faces" aria-label="The twelve characters">
              {SPECIES.map((sp, i) => (
                <li key={sp}>
                  <span className="face">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/assets/pets/${sp}-${SCARVES[i % SCARVES.length]!.id}.webp`} alt={`${sp}, ${SCARVES[i % SCARVES.length]!.id} scarf`} width={64} height={64} loading="lazy" />
                  </span>
                  <span className="nm">{sp}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Sec>

      <Sec id="downloads" labelledBy="dl-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={6} id="dl-h">{b.dlTitle}</SecHead>
            <p className="body">{b.dlBody}</p>
          </div>
          <div className="c8 pg-col pg-col-r">
            <ul className="pg-dl-rows">
              {DOWNLOADS.map((d) => <li key={d.href}><span className="f">{d.label}</span><a className="act" href={d.href} download>{b.download}<Arr c="↓" /></a></li>)}
            </ul>
          </div>
        </div>
      </Sec>

      <Sec id="credits" labelledBy="cr-h">
        <div className="pg-split">
          <div className="c4 pg-col">
            <SecHead n={7} id="cr-h">{b.creditsTitle}</SecHead>
            <p className="body">{b.creditsBody}</p>
          </div>
          <div className="c8 pg-col pg-col-r">
            <ul className="pg-credits">
              {CREDITS.map((c) => (
                <li key={c.what}>
                  <span><b>{c.what}</b> · {c.author} · <a className="pg-a" href={c.href} target="_blank" rel="noreferrer">{c.host}<Arr c="↗" /></a></span>
                  <span className="label">{c.licence}</span>
                </li>
              ))}
            </ul>
            <p className="fine">The full list, file by file: app/public/assets/ASSETS.md.</p>
          </div>
        </div>
      </Sec>
    </>
  );
}
