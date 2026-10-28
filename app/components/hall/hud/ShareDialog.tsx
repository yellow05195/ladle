"use client";

/**
 * The share sheet (v21.1, §7.13): a right plate 440 wide (a bottom sheet on
 * phones) with its title, the card preview and three equal secondary keys:
 * copy the round's link, post on X (intent URL with the post text, no
 * personal data), download the card. No main key. The same sheet and copy
 * whatever the result.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BRAND } from "../../../../config/brand";
import { useT } from "../../../i18n/client";
import { HIcon } from "../../ui/icons";
import { drawScoopCard, type CardTile } from "../scoopCard";
import { mult } from "../fmt";

export function ShareDialog({ n, id, players, tiles, mine, myTokens = null, myName = null, sum = "", seed8, demo, onClose }: { n: string; id: string; players: number; tiles: CardTile[]; mine: number | null; myTokens?: string | null; myName?: string | null; sum?: string; seed8: string; demo: boolean; onClose: () => void }) {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  const min = Math.min(...tiles.map((x) => x.m)), max = Math.max(...tiles.map((x) => x.m));
  const link = `https://${BRAND.domain}/window/${id}`;
  const text = mine !== null
    ? t("h.sh.post", { n, x: BRAND.xHandle, players, min: mult(min), max: mult(max), m: mult(mine), url: link })
    : t("h.sh.postSpec", { n, x: BRAND.xHandle, players, min: mult(min), max: mult(max), url: link });
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    void drawScoopCard(c, {
      n, players, tiles, seed8, demo,
      head: t("h.card.head2", { players }), head2: t("h.card.price"),
      foot: BRAND.secondLine,
      mineLine: mine !== null && myName ? `${myName} · ${mult(mine)}${myTokens ? ` · ${myTokens} LADLE` : ""}` : null,
      extremes: t("h.rs.extremes", { min: mult(min), max: mult(max) }),
      sumLine: sum ? t("h.card.sum", { tokens: sum }) : "",
      demoL1: t("h.demo.l1"), demoL2: t("h.demo.l2"),
    }).then(() => { setDrawn(true); try { setUrl(c.toDataURL("image/png")); } catch { setUrl(null); } });
  }, [n, id, players, tiles, seed8, demo, t, mine, myName, myTokens, min, max, sum]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="sheet-backdrop" onMouseDown={onClose} aria-hidden="true" />
      <div className="sheet narrow share" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <button type="button" className="icon-btn round x" aria-label={t("h.close")} onClick={onClose}><HIcon name="close" /></button>
        <div className="scroll">
          <h2 id="share-title" className="display-m" style={{ paddingRight: 44 }}>{t("h.rs.share", { n })}</h2>
          {/* the card is drawn off screen; until its image is ready, a box of the card's ratio holds its place */}
          <canvas ref={canvas} className="share-prev" aria-label={t("h.sh.preview", { n })} role="img" hidden={!drawn || !!url} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img className="share-prev" src={url} alt={t("h.sh.preview", { n })} width={1200} height={630} /> : !drawn ? <div className="share-prev" aria-hidden="true" /> : null}
          <div className="trio">
            <button type="button" className="key sec s" onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => {}); }}>{copied ? t("h.sh.copied") : t("h.sh.copy")}</button>
            <a className="key sec s" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">{t("h.sh.x")}</a>
            {url ? <a className="key sec s" href={url} download={`ladle-round-${n}.png`}>{t("h.sh.download")}</a> : <span className="key sec s" aria-disabled="true">{t("h.sh.download")}</span>}
          </div>
          <p className="fine">{text}</p>
        </div>
      </div>
    </>,
    document.body,
  );
}
