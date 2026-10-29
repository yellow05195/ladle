"use client";

/**
 * The home's first screen (v21.1, §7.16), as in slither.io: the hall is
 * the page. Desktop (>= 1100): one playbill column on the left over its
 * scrim (the live round, the headline, the name, the one main key), the drum
 * shifted right (view shift 0.13), nothing but name tags right of the
 * column. Stacked and phones: the hall band, then the playbill on the
 * ground. No cards, no stats rail, no sparkline.
 */
import Link from "next/link";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BRAND } from "../../../../config/brand";
import { useT } from "../../../i18n/client";
import { checkNickname, cleanNickname, getNick, setNick } from "../../../lib/profile";
import { useLiveSelect, useLiveStatus } from "../../live/LiveProvider";
import { Arr, StateTag } from "../../ui/house";
import { useProfile } from "../profile/ProfileProvider";
import { hall, useHall } from "../store";
import { stateWord, useMedia } from "./round";
import { LeftFact, LiveStem, PlayersFact, PotFact, ShortLine, useHead } from "./LiveFigures";
import { TopBar } from "./TopBar";
import { onScrollY, rescroll, scrollState } from "../tour/scroll";

const [TAG_A, TAG_B] = (() => { const i = BRAND.tagline.indexOf(". "); return i < 0 ? [BRAND.tagline, ""] : [BRAND.tagline.slice(0, i + 1), BRAND.tagline.slice(i + 2)]; })();
/** "Same price for everyone." on two lines: "Same price" / "for everyone." */
const LINE_1 = TAG_A.replace(/\s+for\s+.*$/, "");
const LINE_2 = TAG_A.slice(LINE_1.length).trim();
/** "Not the same scoop." on two lines: "Not the same" / "scoop", its full stop the saffron ball */
const TAG_B0 = TAG_B.replace(/\.$/, "");
const LINE_3 = TAG_B0.replace(/\s+\S+$/, "");
const LINE_4 = TAG_B0.slice(LINE_3.length).trim();

/**
 * The playbill's live round: the round and its state tag, the facts, the one-line short form and the stem. v21.4 (perf):
 * memoised, and each figure subscribes to its own slice of the live window (LiveFigures), so a tick re-renders the one
 * figure that changed, never the playbill around it. While the playbill is scrolled away (`active` false) its round is
 * frozen, so the tour below does not re-render it on every slot; the facts and the short line follow the round only at
 * the widths that show them (hall.css: the short line under 1100 px wide or 760 px high, the facts elsewhere).
 */
const LiveBlock = memo(function LiveBlock({ wide, active }: { wide: boolean; active: boolean }) {
  const t = useT();
  const short = useMedia("(max-width: 1099px), (max-height: 759px)");
  const r = useHead(active);
  if (!r) return null;
  return (
    <>
      <p className="rno hud-in"><b>{t("h.room.roundNo", { n: r.n })}</b><StateTag word={stateWord(t, r.phase, r.halt)} /></p>
      <div className="facts hud-in" style={{ animationDelay: "50ms" }}>
        {/* slots left ticks every slot (about 4 a second): it swaps, it never rolls */}
        <LeftFact active={active && !short} />
        <PlayersFact active={active && !short} />
        <PotFact active={active && !short} />
      </div>
      {/* chain: a round closed without its seal, or none opened yet, says so instead of "0 slots left" */}
      <ShortLine wide={wide} active={active && short} />
      <LiveStem active={active} className="hud-in" />
    </>
  );
});

const hasRound = (w: unknown) => !!w;

export function HomeHud() {
  const t = useT();
  // v21.4 (perf): no live window here: the playbill's figures read their own slices (a tick re-rendered this whole HUD)
  const { failed, error } = useLiveStatus();
  const live = useLiveSelect(hasRound);
  const { profile, pubkey, takeSeat } = useProfile();
  const scroll = useHall((s) => s.scroll);
  const wide = useMedia("(min-width: 1100px)");
  const band = useRef<HTMLDivElement>(null);
  const [nick, setN] = useState("");
  const [why, setWhy] = useState<string | null>(null);

  useEffect(() => { hall.set({ shot: hall.get().lit || hall.get().shot !== "emblem" ? "home" : hall.get().shot }); }, []);
  useEffect(() => { setN(profile?.nickname ?? getNick()); }, [profile]);
  // v21 r1: the bar takes its ground at the first pixels of scroll; on wide screens the playbill (and its scrim)
  // fade with the scroll itself, gone before its top reaches the bar. v21.3: from the hall's one scroll reader, in the
  // scroll event itself (writes only: no layout read, no React render, no extra rAF hop)
  const pbRef = useRef<HTMLDivElement>(null);
  const wideRef = useRef(wide);
  wideRef.current = wide;
  useEffect(() => {
    const de = document.documentElement;
    let lastK = -1;
    const sc = document.querySelector<HTMLElement>(".hall-scrims .s-home");
    const off = onScrollY((y) => {
      const v = y > 4 ? "1" : "0";
      if (de.dataset.scrolled !== v) de.dataset.scrolled = v;
      const pb = pbRef.current;
      const k = wideRef.current ? Math.min(1, Math.max(0, y / (0.28 * (scrollState.vh || 800)))) : 0;
      if (k === lastK || !pb) return;
      lastK = k;
      pb.style.opacity = k ? (1 - k).toFixed(3) : "";
      pb.style.transform = k ? `translateY(${(-12 * k).toFixed(1)}px)` : "";
      pb.style.visibility = k >= 1 ? "hidden" : "";
      if (sc) { sc.style.transition = "none"; sc.style.opacity = (1 - k).toFixed(3); }
    });
    return () => {
      off();
      delete de.dataset.scrolled;
      if (sc) { sc.style.transition = ""; sc.style.opacity = ""; }
    };
  }, []);
  // re-read once when the layout switches between the column and the stacked playbill
  useEffect(() => { rescroll(); }, [wide]);
  // §7.5: the drum at about 63 % of the width beside the playbill; centred in the band when stacked
  useEffect(() => { hall.set({ viewShift: wide ? 0.13 : 0 }); return () => hall.set({ viewShift: 0 }); }, [wide]);
  useLayoutEffect(() => {
    if (wide) { hall.set({ visibleTop: 0, visibleH: 0 }); return; }
    const put = () => { const r = band.current?.getBoundingClientRect(); if (r && r.height > 0) hall.set({ visibleTop: Math.round(r.top + window.scrollY), visibleH: Math.round(r.bottom + window.scrollY) }); };
    put();
    const ro = new ResizeObserver(put);
    if (band.current) ro.observe(band.current);
    return () => { ro.disconnect(); hall.set({ visibleTop: 0, visibleH: 0 }); };
  }, [wide]);

  const go = () => {
    const n = cleanNickname(nick);
    const state = checkNickname(n, () => false);
    if (n && state !== "ok" && !(pubkey && profile)) {
      setWhy(state === "short" ? t("h.play.whyShort") : state === "chars" ? t("h.play.whyChars") : state === "reserved" ? t("h.play.whyReserved") : t("h.play.whyShort"));
      return;
    }
    if (n) setNick(n);
    setWhy(null);
    takeSeat();
  };

  return (
    <>
      <TopBar />
      <section className="first" aria-labelledby="play-h">
        <div ref={band} className="hall-band" aria-hidden="true" />
        <div ref={pbRef} className="playbill halo" style={wide ? undefined : { textShadow: "none" }}>
          {/* the live round, frozen while the playbill is scrolled away */}
          {live ? <LiveBlock wide={wide} active={scroll === 0} /> : failed ? (
            // chain: rounds cannot be read (configuration, a missing market, the RPC down): said where the round would be
            <>
              <p className="rno hud-in" role="status"><b>{t("h.down.title")}</b></p>
              {error ? <p className="pb-short fine hud-in">{error}</p> : null}
            </>
          ) : null}
          <h1 id="play-h" className="display-xl hud-in" style={{ animationDelay: "120ms" }}>
            <span>{LINE_1}</span>
            <span>{LINE_2}</span>
            <span>{LINE_3}</span>
            <span>{LINE_4}<span className="stop" aria-hidden="true" /><span className="sr-only">.</span></span>
          </h1>
          <p className="lede hud-in" style={{ animationDelay: "170ms" }}>{wide ? t("h.play.lead") : t("h.play.leadShort")}</p>
          <form className="pb-form hud-in" style={{ animationDelay: "220ms" }} onSubmit={(e) => { e.preventDefault(); go(); }}>
            <label htmlFor="nick" className="sr-only">{t("h.play.nickLabel")}</label>
            <div className={`well l ${why ? "bad" : ""}`}>
              <input id="nick" value={nick} maxLength={16} autoComplete="nickname" spellCheck={false} placeholder={t("h.play.placeholder")} onChange={(e) => { setN(cleanNickname(e.target.value)); setWhy(null); }} enterKeyHint="go" aria-describedby="nick-why" aria-invalid={why ? true : undefined} />
            </div>
            <button type="submit" className="key main" data-enter>{t("h.play.cta")}</button>
          </form>
          {why ? <p id="nick-why" className="reason bad" aria-live="polite">{why}</p> : <span id="nick-why" hidden />}
          <p className="pb-fine fine hud-in" style={{ animationDelay: "270ms" }}>{t(wide ? "h.play.fine" : "h.play.finePhone")}</p>
          <p className="pb-watch hud-in" style={{ animationDelay: "300ms" }}>
            <Link className="act" href="/play?watch=1">{t("h.play.watch")}<Arr /></Link>
            <span className="label">{t("h.play.watchNote")}</span>
          </p>
        </div>
      </section>
    </>
  );
}
