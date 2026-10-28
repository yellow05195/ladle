"use client";

/**
 * The game room's HUD (v21.1, §8). Desktop: the round chat plate on the
 * left, the instruments free on the right scrim, the dock plate at the
 * bottom centre, name tags in between; the plates stop short of the drum.
 * Phones (and the embed at any width): the round band, the hall band, the
 * chat plate, the dock. Spectators (no profile, or ?watch=1) watch; taking a
 * seat is one main key.
 *
 * v21 r1. Rounds are pipelined: while the focused round seals, draws and
 * serves, its sibling is already open. The instruments and the dock follow
 * the open round (the focused one gets one line under the facts), so an
 * entry is open whenever some round is.
 *
 * Results (fix r2): the sheet rises by itself only for a round the viewer
 * played; it holds for the same time for every result, then folds to a stub
 * with Open, and that stub (the viewer's last own result) is kept apart, so
 * later rounds never take it away. A round the viewer only watched is a
 * stub with Open for the hold (the chat has the house line), so a seated
 * player never loses the countdown to someone else's result.
 */
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BRAND } from "../../../../config/brand";
import { useT } from "../../../i18n/client";
import type { LiveWindow } from "../../../lib/data/types";
import { setChatSeat } from "../../../lib/chat";
import { scarfHex } from "../../../lib/profile";
import { useRoundChat } from "../../game/useRoundChat";
import type { GameFacts } from "../../game/types";
import { useLive } from "../../live/LiveProvider";
import { Mark, RollingFigure, StateTag, Stem } from "../../ui/house";
import { useProfile } from "../profile/ProfileProvider";
import { hall, useHall } from "../store";
import { ladle, mult, roundNum, sol2 } from "../fmt";
import { Dock, dockState } from "./Dock";
import { Instruments } from "./Instruments";
import { ResultSheet } from "./ResultPanel";
import { RoomChat } from "./RoomChat";
import { entryRound, phaseWord, roundView, slotsLeft, stateWord, useMedia } from "./round";
import { AMOUNTS } from "./StakeSelector";
import { TicketStub } from "./TicketStub";
import { TopBar } from "./TopBar";

/** How long every result stays up before it folds, the same for every result and every viewer. */
const HOLD_MS = 10_000;

/**
 * §7.5 / §7.12: the view shift that centres the drum between the chat plate and the right column: the
 * instruments, or the result sheet's own column (440 px + its 24 px from the edge, with air) while it is up.
 */
function framing(embed: boolean, sheetUp: boolean): { viewShift: number; viewLift: number } {
  const W = window.innerWidth;
  if (W < 768 || embed) return { viewShift: 0, viewLift: 0 };
  const cs = getComputedStyle(document.documentElement);
  const g = parseFloat(cs.getPropertyValue("--gutter")) || 40;
  const chat = W >= 1024 ? g + (parseFloat(cs.getPropertyValue("--chat-w")) || 320) : 0;
  const iw = parseFloat(cs.getPropertyValue("--instr-w")) || 300;
  // the sheet's column measured from the right edge (24 px + its 440 px + 12 px of air); the gutter is already in it
  const instr = sheetUp && W >= 1024 ? (W >= 1280 ? 476 : 430) : g + iw;
  // 768-1023: the chat is a bottom-left drawer, so the drum stays centred rather than shifting toward it
  return { viewShift: W >= 1024 ? (chat - instr) / (2 * W) : 0, viewLift: W >= 1024 ? 28 : 0 };
}

function EmbedHead() {
  return (
    <header className="embed-head">
      <Mark size={20} />
      <span>{BRAND.name}</span>
    </header>
  );
}

export function RoomHud({ facts, embed = false }: { facts: GameFacts; embed?: boolean }) {
  const t = useT();
  const params = useSearchParams();
  const watch = params.get("watch") === "1";
  const host = params.get("host");
  const live = useLive();
  const { w, source } = live;
  const { profile, pubkey, takeSeat } = useProfile();
  const reveal = useHall((s) => s.reveal);
  const reduced = useHall((s) => s.reduced);
  const quality = useHall((s) => s.quality);
  const phone = useMedia("(max-width: 767px)");
  const tablet = useMedia("(min-width: 768px) and (max-width: 1023px)");
  const compact = phone || embed;
  const seated = !!(pubkey && profile) && !watch;
  const [amount, setAmount] = useState<bigint>(AMOUNTS[1]!);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  /** the round the sheet shows (any round, opened or risen) */
  const [result, setResult] = useState<LiveWindow | null>(null);
  /** the viewer's last own result: its stub stays until their next entry is served (a watched round never replaces it) */
  const [myResult, setMyResult] = useState<LiveWindow | null>(null);
  /** a round the viewer only watched, as a stub with Open for the hold */
  const [spect, setSpect] = useState<LiveWindow | null>(null);
  const [sheet, setSheet] = useState(false);
  /** the sheet rose by itself (it folds after the hold); a sheet the viewer reopened stays until closed */
  const [auto, setAuto] = useState(false);
  const closedFor = useRef("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // the shot: the room (the seat shot eases to it); the reveal shot while the ladle serves
  useEffect(() => { if (hall.get().shot !== "seat") hall.set({ shot: "room" }); }, []);
  useEffect(() => {
    if (!reveal || reveal.done) {
      if (hall.get().shot === "reveal") {
        // v21.1 §7.12: when the result sheet is about to rise, the camera's return to the room already frames the
        // drum clear of the sheet's column, so the sheet never lands over the drum while the camera glides
        const cur = wRef.current;
        const rises = !!cur && !!reveal && reveal.id === cur.id && cur.mineIndex !== null && closedFor.current !== cur.id && window.innerWidth >= 1024 && !embed;
        hall.set(rises ? { shot: "room", ...framing(embed, true) } : { shot: "room" });
      }
      return;
    }
    if (!reduced) hall.set({ shot: "reveal" });
  }, [reveal, reduced, embed]);

  // §7.5: the view shift centres the drum between the chat and the instrument column (or the result column while it is up)
  const sheetUp = sheet && !!result;
  useEffect(() => {
    const set = () => hall.set(framing(embed, sheetUp));
    set();
    window.addEventListener("resize", set);
    return () => { window.removeEventListener("resize", set); hall.set({ viewShift: 0, viewLift: 0 }); };
  }, [embed, sheetUp]);

  // phones and the embed: the drum in the hall band
  const band = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!compact || !mounted) { hall.set({ visibleTop: 0, visibleH: 0 }); return; }
    const put = () => { const r = band.current?.getBoundingClientRect(); if (r) hall.set({ visibleTop: Math.round(r.top), visibleH: Math.round(r.bottom) }); };
    put();
    const ro = new ResizeObserver(put);
    if (band.current) ro.observe(band.current);
    window.addEventListener("resize", put);
    return () => { ro.disconnect(); window.removeEventListener("resize", put); hall.set({ visibleTop: 0, visibleH: 0 }); };
  }, [compact, mounted]);

  // 768-1023: the chat drawer sits above the dock, whatever the dock's height
  const dockRO = useRef<{ ro: ResizeObserver; el: Element | null } | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    if (!tablet) { if (dockRO.current?.el) { dockRO.current.ro.unobserve(dockRO.current.el); dockRO.current.el = null; } root.style.removeProperty("--dock-h"); return; }
    if (!dockRO.current) dockRO.current = { ro: new ResizeObserver((es) => { for (const e of es) root.style.setProperty("--dock-h", `${Math.round((e.target as HTMLElement).offsetHeight)}px`); }), el: null };
    const el = document.querySelector(".hud-root > .dock");
    if (el !== dockRO.current.el) {
      if (dockRO.current.el) dockRO.current.ro.unobserve(dockRO.current.el);
      dockRO.current.el = el;
      if (el) dockRO.current.ro.observe(el);
    }
  });
  useEffect(() => () => { dockRO.current?.ro.disconnect(); document.documentElement.style.removeProperty("--dock-h"); }, []);

  // the chat knows the viewer's seat
  useEffect(() => { setChatSeat(w?.mineIndex != null && w.phase !== "settled" && w.phase !== "sold" ? "stage" : "stands"); }, [w?.id, w?.mineIndex, w?.phase]);

  const settled = !!w && (w.phase === "settled" || w.phase === "sold") && !!w.settlement && w.entries.length > 0;
  const revealed = !!w && (quality === "none" || (reveal?.id === w.id && !!reveal?.done));
  /** the viewer's own round is on the drum: no entry elsewhere until its result is out */
  const myServe = !!w && w.mineIndex !== null && settled && !revealed;
  const wRef = useRef(w);
  wRef.current = w;
  const myServeRef = useRef(myServe);
  myServeRef.current = myServe;

  const enterNow = useCallback(async (lamports: bigint) => {
    const cur = wRef.current;
    if (!entryRound(cur, { serving: myServeRef.current })) { setReason(t("h.reason.sealed", { slots: cur?.slotsTotal ?? 92 })); return; }
    setBusy(true); setReason(null);
    try {
      await live.enter(lamports);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/reject|denied|cancel|declin/i.test(msg)) setReason(t("h.reason.declined"));
      else if (/seal/i.test(msg)) setReason(t("h.reason.sealed", { slots: cur?.slotsTotal ?? 92 }));
      else setReason(t("h.reason.other"));
    } finally { setBusy(false); }
  }, [live, t]);

  const chatEnter = useCallback((lamports: bigint) => {
    const max = live.maxEntry();
    const a = lamports > max ? max : lamports;
    setAmount(a);
    void enterNow(a);
  }, [live, enterNow]);
  const { msgs, send } = useRoundChat({ w, source, enter: chatEnter, sellBack: () => { void live.sellBack(); }, facts, t, seated, myName: profile?.nickname, onSeat: takeSeat, serving: myServe });
  // one stable function for the memoised chat (send changes with every snapshot)
  const sendRef = useRef(send);
  sendRef.current = send;
  const sendRound = useCallback((text: string) => sendRef.current(text), []);

  // the result: once every ball has landed (400 ms after the tags change, the same for every result), the sheet
  // rises for a round the viewer played; a round they only watched becomes a stub with Open for the hold
  const rising = useRef("");
  const resultRef = useRef(result);
  resultRef.current = result;
  useEffect(() => {
    if (!w || !settled || !revealed) return;
    // a later snapshot of a round already shown (a sell back): every view of it follows
    if (result?.id === w.id || myResult?.id === w.id || spect?.id === w.id) {
      if (result?.id === w.id && result !== w) setResult(w);
      if (myResult?.id === w.id && myResult !== w) setMyResult(w);
      if (spect?.id === w.id && spect !== w) setSpect(w);
      return;
    }
    if (closedFor.current === w.id || rising.current === w.id) return;
    rising.current = w.id;
    const snap = w;
    window.setTimeout(() => {
      const cur = wRef.current;
      const r = cur && cur.id === snap.id ? cur : snap;
      rising.current = "";
      closedFor.current = r.id;
      if (r.mineIndex === null) {
        setSpect(r);
        window.setTimeout(() => setSpect((x) => (x && x.id === r.id ? null : x)), HOLD_MS);
        return;
      }
      setMyResult(r);
      setResult(r);
      setSheet(true);
      setAuto(true);
    }, reduced ? 0 : 400);
  }, [w, settled, revealed, result, myResult, spect, reduced]);

  // folding: the sheet goes (the viewer's own result keeps its stub); the hall follows the live rounds again
  // stable across snapshots (the live context changes on every one), so the hold below is not restarted by them
  const liveRef = useRef(live);
  liveRef.current = live;
  const fold = useCallback(() => {
    setSheet(false);
    setAuto(false);
    const r = resultRef.current;
    if (!r) return;
    closedFor.current = r.id;
    setResult(null);
    const cur = wRef.current;
    if (cur && cur.id === r.id) liveRef.current.release();
  }, []);
  // the hold, the same for every result; a reader at work on the sheet (pointer, focus, confirm, share) keeps it up
  useEffect(() => {
    if (!sheet || !auto) return;
    let id = 0;
    const tick = () => {
      const el = document.querySelector(".rsheet");
      // (hover only where there is one: a touch screen keeps :hover on the last tapped element)
      const hover = window.matchMedia("(hover: hover)").matches && !!el?.matches(":hover");
      const reading = !!document.getElementById("share-title") || !!el?.querySelector(".confirm") || hover || !!el?.matches(":focus-within");
      if (reading) { id = window.setTimeout(tick, 2000); return; }
      fold();
    };
    id = window.setTimeout(tick, HOLD_MS);
    return () => clearTimeout(id);
  }, [sheet, auto, result?.id, fold]);
  // the viewer entered the next round: the sheet folds at once
  useEffect(() => {
    if (sheet && result && w && w.id !== result.id && w.mineIndex !== null) { setSheet(false); setAuto(false); closedFor.current = result.id; setResult(null); }
  }, [w, sheet, result]);
  const openSheet = useCallback((x: LiveWindow) => { setResult(x); setSheet(true); setAuto(false); setSpect((s) => (s && s.id === x.id ? null : s)); }, []);

  if (!mounted || !w) return null;
  const myScarf = profile ? scarfHex(profile.scarf) : undefined;
  // the viewer's entry in the focused round, from the entry until its result is out
  const mine = w.mineIndex !== null && (w.phase === "open" || w.phase === "sealed" || w.phase === "seeded" || myServe) ? w.entries[w.mineIndex] : undefined;
  const r = roundView(w);
  // rounds are pipelined: the dial may already count the next round while the viewer's own one draws
  const followsOther = r.id !== w.id;
  const stubTop = !!mine && followsOther;
  const stub = mine ? <TicketStub n={roundNum(w.id)} entry={mine} hostBps={w.hostFeeBps} phone={compact} state={w.phase === "open" ? undefined : stateWord(t, w.phase)} /> : null;
  const canEnter = !!entryRound(w, { serving: myServe });
  const ds = myServe ? "none" : dockState(w, seated, canEnter);
  const showSheet = sheet && !!result;
  const max = live.maxEntry();
  // phones: while the cream strip shows, it is the one line about the viewer's entry (no dock line repeating it)
  const dock = compact && stub ? null : myServe ? (
    <section className={compact ? "pdock" : "dock hud-pane hud-in"}><p className="line soft" role="status"><span className="me-dot" aria-hidden="true" /><span>{t("h.dock.serving", { n: roundNum(w.id) })}</span></p></section>
  ) : (
    <Dock w={w} state={ds} amount={amount} setAmount={setAmount} max={max} busy={busy} reason={reason} setReason={setReason} onScoop={() => void enterNow(amount)} onSeat={takeSeat} host={host} phone={compact} />
  );

  // the focused round when the dial follows its open sibling (one line; the receipt says it when the round is the viewer's)
  let note: string | null = null;
  if (followsOther && !mine && w.phase === "sealed") note = t("h.room.waitSeed", { n: roundNum(w.id) });
  else if (followsOther && !mine && (w.phase === "seeded" || (settled && !revealed))) note = t("h.room.serving", { n: roundNum(w.id) });
  // the folded results: the viewer's last own result (kept apart), else a watched round's stub for the hold
  let foldText: string | null = null;
  let foldOpen: LiveWindow | null = null;
  if (!showSheet && !stub) {
    const st = myResult?.settlement;
    if (myResult && st && st.myMultiplier !== null) {
      foldText = st.myShare !== null ? t("h.rs.stubMine", { n: roundNum(myResult.id), m: mult(st.myMultiplier), tokens: ladle(st.myShare) }) : t("h.rs.lineMine", { n: roundNum(myResult.id), m: mult(st.myMultiplier) });
      foldOpen = myResult;
    } else if (spect) {
      foldText = t(spect.entries.length === 1 ? "h.rs.stubSpectOne" : "h.rs.stubSpect", { n: roundNum(spect.id), players: spect.entries.length });
      foldOpen = spect;
    }
  }
  const openLine = r.phase === "open" ? t("h.room.openLine", { n: r.n, phase: phaseWord(t, r.phase, r.total), left: slotsLeft(t, r.left) }) : `${t("h.room.roundNo", { n: r.n })} · ${phaseWord(t, r.phase, r.total)}`;
  const results = showSheet ? <ResultSheet w={result!} myScarf={myScarf} live={result!.id === w.id} head={openLine} onClose={fold} /> : null;

  if (compact) {
    // one 36 px row under the stem: the viewer's own result first, then what the hall is drawing, then a watched round
    const row = foldOpen && foldOpen === myResult
      ? { text: foldText!, open: foldOpen }
      : note ? { text: note, open: null }
      : foldOpen ? { text: foldText!, open: foldOpen } : null;
    return (
      <>
        {embed ? <EmbedHead /> : <TopBar room />}
        <div className="pplay">
          <div className="strip">
            <div className="l"><b>{t("h.room.roundNo", { n: r.n })}</b><StateTag word={stateWord(t, r.phase)} /></div>
            <div className="c"><RollingFigure text={String(r.left)} className="num-dial" mode="swap" /><span className="label">{t(r.left === 1 ? "h.dial.shortOne" : "h.dial.short")}</span></div>
            <div className="r"><span className="num-m"><RollingFigure text={sol2(r.pot)} /><span className="unit">SOL</span></span><span className="label">{t(r.players === 1 ? "h.room.phonePotOne" : "h.room.phonePot", { players: r.players })}</span></div>
          </div>
          <div className="stem-wrap"><Stem elapsed={r.elapsed} total={r.total} thin /></div>
          {row ? (
            <div className="pnote" aria-live="polite">
              <span className="t">{row.text}</span>
              {row.open ? <button type="button" className="key sec xs" onClick={() => openSheet(row.open!)}>{t("h.rs.open")}</button> : null}
            </div>
          ) : null}
          <div ref={band} className="hall-band" aria-hidden="true" />
          <div className="plow">
            {!embed ? <RoomChat msgs={msgs} sendRound={sendRound} myName={profile?.nickname ?? ""} myScarf={myScarf} variant="phone" /> : null}
            {stub ? <div className="pdock pstub">{stub}</div> : null}
            {dock}
          </div>
        </div>
        {results}
      </>
    );
  }
  const folded = foldText && foldOpen ? (
    <div className="rs-stub" aria-live="polite"><span>{foldText}</span><button type="button" className="key sec s" onClick={() => openSheet(foldOpen!)}>{t("h.rs.open")}</button></div>
  ) : null;
  return (
    <>
      {embed ? <EmbedHead /> : <TopBar room />}
      <div className="hud-root">
        {!embed ? <RoomChat msgs={msgs} sendRound={sendRound} myName={profile?.nickname ?? ""} myScarf={myScarf} /> : null}
        <Instruments w={w} transient={null} note={note} stub={stub} stubTop={stubTop} folded={folded} />
        {dock}
        {results}
      </div>
    </>
  );
}
