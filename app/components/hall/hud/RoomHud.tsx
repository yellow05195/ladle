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
 *
 * v21.4 (perf): the room renders when the round's frame changes (sameFrame:
 * its phase, the viewer's entry, the halt, the result), never on a slot or an
 * arrival. The countdown, the stem, the facts, the dock's cap and the chat
 * read their own slices of the live window (LiveFigures, Dock, LiveChat).
 */
import { useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BRAND } from "../../../../config/brand";
import { useT } from "../../../i18n/client";
import type { Halt, LiveWindow, ScoopOutcome, SettlementView } from "../../../lib/data/types";
import { setChatSeat } from "../../../lib/chat";
import { scarfHex } from "../../../lib/profile";
import { chatMem, useRoundChat, type ChatMem } from "../../game/useRoundChat";
import type { GameFacts } from "../../game/types";
import { useLiveActions, useLiveSelect, useLiveStatus } from "../../live/LiveProvider";
import { Mark, StateTag } from "../../ui/house";
import { useProfile } from "../profile/ProfileProvider";
import { hall, useHall } from "../store";
import { ladle, mult, roundNum } from "../fmt";
import { Dock, dockState } from "./Dock";
import { Instruments } from "./Instruments";
import { BackStub, LeftStub, ResultSheet } from "./ResultPanel";
import { RoomChat } from "./RoomChat";
import { entryRound, haltLine, roundView, stateWord, useMedia } from "./round";
import { LiveStem, OpenLine, PotPlayers, StripCount } from "./LiveFigures";
import { ChainDown } from "./ChainDown";
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

/*
 * v21.4 (perf): the room's frame of the live window: what decides its layout, its lines, its keys and its results. Two
 * snapshots with the same frame are the same to the room, which keeps the earlier one and does not re-render; the
 * slots left, the players and the pot move every slot and every arrival, and those are the LiveFigures' own.
 */
const frameOf = (x: LiveWindow | null) => x;
const sameHalt = (a?: Halt | null, b?: Halt | null) => (!a && !b) || (!!a && !!b && a.kind === b.kind && a.round === b.round && a.late === b.late && a.stalled === b.stalled);
function sameSettlement(a: SettlementView | null, b: SettlementView | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.tokensOut === b.tokensOut && a.platformFee === b.platformFee && a.hostFee === b.hostFee && a.toCurve === b.toCurve && a.myMultiplier === b.myMultiplier
    && a.myShare === b.myShare && a.mySellBack === b.mySellBack && a.curveAfter.x === b.curveAfter.x && a.curveAfter.y === b.curveAfter.y;
}
function sameList<T>(a: T[] | undefined, b: T[] | undefined, eq: (x: T, y: T) => boolean): boolean {
  if (a === b) return true;
  if ((a?.length ?? 0) !== (b?.length ?? 0)) return false;
  return (a ?? []).every((x, i) => eq(x, b![i]!));
}
function sameOutcomes(a?: Record<string, ScoopOutcome>, b?: Record<string, ScoopOutcome>): boolean {
  if (a === b) return true;
  const ka = Object.keys(a ?? {});
  if (ka.length !== Object.keys(b ?? {}).length) return false;
  return ka.every((k) => { const x = a![k]!, y = b?.[k]; return !!y && x.kind === y.kind && x.tokens === y.tokens && x.sol === y.sol; });
}
function sameFrame(a: LiveWindow | null, b: LiveWindow | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.phase === b.phase && a.source === b.source && a.mineIndex === b.mineIndex
    && a.slotsTotal === b.slotsTotal && a.slotMs === b.slotMs && a.capBps === b.capBps && a.hostFeeBps === b.hostFeeBps
    && a.seedHex === b.seedHex && a.soldFor === b.soldFor
    // an open round's arrivals are the figures' and the chat's; once it takes no more, its list is the result's
    && (a.phase === "open" || a.entries.length === b.entries.length)
    && a.sibling?.id === b.sibling?.id && a.sibling?.phase === b.sibling?.phase
    && sameHalt(a.halt, b.halt) && sameSettlement(a.settlement, b.settlement)
    && sameList(a.scoopsLeft, b.scoopsLeft, (x, y) => x.id === y.id && x.tokens === y.tokens && x.sellBack === y.sellBack)
    && sameList(a.stakesBack, b.stakesBack, (x, y) => x.id === y.id && x.amount === y.amount)
    && sameOutcomes(a.outcomes, b.outcomes);
}
/** The chat's frame: the room's and every arrival (the round's notice counts them, the commands read the pot). */
const sameChat = (a: LiveWindow | null, b: LiveWindow | null) => sameFrame(a, b) && (!a || !b || (a.entries.length === b.entries.length && a.total === b.total));

/**
 * v21.4 (perf): the round chat reads the live window itself (each arrival is its notice's count), so the room around it
 * re-renders only with the round's frame. Its memory is the room's: a switch between the phone and desk layouts remounts
 * it and keeps the log.
 */
const LiveChat = memo(function LiveChat({ mem, facts, enter, sellBack, seated, myName, myScarf, onSeat, serving, variant = "desk" }: {
  mem: ChatMem; facts: GameFacts; enter: (lamports: bigint) => void; sellBack: () => void; seated: boolean; myName?: string; myScarf?: string;
  onSeat: () => void; serving: boolean; variant?: "desk" | "phone";
}) {
  const t = useT();
  const { source } = useLiveActions();
  const w = useLiveSelect(frameOf, { equal: sameChat });
  const { msgs, send } = useRoundChat({ w, source, enter, sellBack, facts, t, seated, myName, onSeat, serving, mem });
  // one stable function for the memoised chat (send changes with every snapshot)
  const sendRef = useRef(send);
  sendRef.current = send;
  const sendRound = useCallback((text: string) => sendRef.current(text), []);
  return <RoomChat msgs={msgs} sendRound={sendRound} myName={myName ?? ""} myScarf={myScarf} variant={variant} />;
});

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
  const w = useLiveSelect(frameOf, { equal: sameFrame });
  const actions = useLiveActions();
  const { failed, error } = useLiveStatus();
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

  // phones and the embed: the drum in the hall band (measured again once the first snapshot, or the down plate, renders the band:
  // the chain source answers after the first render)
  const band = useRef<HTMLDivElement>(null);
  const hasRound = !!w;
  useLayoutEffect(() => {
    if (!compact || !mounted) { hall.set({ visibleTop: 0, visibleH: 0 }); return; }
    const put = () => { const r = band.current?.getBoundingClientRect(); if (r) hall.set({ visibleTop: Math.round(r.top), visibleH: Math.round(r.bottom) }); };
    put();
    const ro = new ResizeObserver(put);
    if (band.current) ro.observe(band.current);
    window.addEventListener("resize", put);
    return () => { ro.disconnect(); window.removeEventListener("resize", put); hall.set({ visibleTop: 0, visibleH: 0 }); };
  }, [compact, mounted, hasRound, failed]);

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
    const into = entryRound(cur, { serving: myServeRef.current });
    if (!into) {
      // chain: no round takes entries (the halt line says why), else the round sealed
      setReason(cur?.halt ? haltLine(t, cur.halt, cur.slotMs, cur.slotsTotal) : t("h.reason.sealed", { slots: cur?.slotsTotal ?? 92 }));
      return;
    }
    const target = roundNum(into);
    setBusy(true); setReason(null);
    try {
      await actions.enter(lamports);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/reject|denied|cancel|declin/i.test(msg)) setReason(t("h.reason.declined"));
      else if (/seal/i.test(msg)) setReason(t("h.reason.sealed", { slots: cur?.slotsTotal ?? 92 }));
      // chain: the close slot passed while the wallet was open (the program refuses entries from it)
      else if (/closed to new entries|no open window|no round is open/i.test(msg)) setReason(t("h.reason.closed", { n: target }));
      else setReason(t("h.reason.other"));
    } finally { setBusy(false); }
  }, [actions, t]);

  const chatEnter = useCallback((lamports: bigint) => {
    const max = actions.maxEntry();
    const a = lamports > max ? max : lamports;
    setAmount(a);
    void enterNow(a);
  }, [actions, enterNow]);
  const chatSell = useCallback(() => { void actions.sellBack(); }, [actions]);
  const [mem] = useState(chatMem);

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
  // stable across snapshots, so the hold below is not restarted by them
  const fold = useCallback(() => {
    setSheet(false);
    setAuto(false);
    const r = resultRef.current;
    if (!r) return;
    closedFor.current = r.id;
    setResult(null);
    const cur = wRef.current;
    if (cur && cur.id === r.id) actions.release();
  }, [actions]);
  // the hold, the same for every result; a reader at work on the sheet (pointer, focus, confirm, share) keeps it up
  useEffect(() => {
    if (!sheet || !auto) return;
    let id = 0;
    const tick = () => {
      const el = document.querySelector(".rsheet");
      // (hover only where there is one: a touch screen keeps :hover on the last tapped element)
      const hover = window.matchMedia("(hover: hover)").matches && !!el?.matches(":hover");
      // (a key at work: the wallet is open for a take or a sell back)
      const reading = !!document.getElementById("share-title") || !!el?.querySelector(".confirm, .busy") || hover || !!el?.matches(":focus-within");
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

  if (!mounted) return null;
  if (!w) {
    // chain: rounds cannot be read (configuration, a missing market, the RPC down): say so instead of an empty room
    if (!failed) return null;
    return compact ? (
      <>
        {embed ? <EmbedHead /> : <TopBar room />}
        <div className="pplay">
          <div ref={band} className="hall-band" aria-hidden="true" />
          <div className="plow"><ChainDown error={error} phone /></div>
        </div>
      </>
    ) : (
      <>
        {embed ? <EmbedHead /> : <TopBar room />}
        <div className="hud-root"><ChainDown error={error} /></div>
      </>
    );
  }
  const myScarf = profile ? scarfHex(profile.scarf) : undefined;
  // the viewer's entry in the focused round, from the entry until its result is out
  const mine = w.mineIndex !== null && (w.phase === "open" || w.phase === "sealed" || w.phase === "seeded" || myServe) ? w.entries[w.mineIndex] : undefined;
  const r = roundView(w);
  // rounds are pipelined: the dial may already count the next round while the viewer's own one draws
  const followsOther = r.id !== w.id;
  const stubTop = !!mine && followsOther;
  const stub = mine ? <TicketStub n={roundNum(w.id)} entry={mine} hostBps={w.hostFeeBps} phone={compact} state={w.phase === "open" ? undefined : stateWord(t, w.phase, w.halt?.kind === "closing" && w.halt.round === w.id ? w.halt : null)} /> : null;
  const canEnter = !!entryRound(w, { serving: myServe });
  const ds = myServe ? "none" : dockState(w, seated, canEnter);
  const showSheet = sheet && !!result;
  // phones: while the cream strip shows, it is the one line about the viewer's entry (no dock line repeating it)
  const dock = compact && stub ? null : myServe ? (
    <section className={compact ? "pdock" : "dock hud-pane hud-in"}><p className="line soft" role="status"><span className="me-dot" aria-hidden="true" /><span>{t("h.dock.serving", { n: roundNum(w.id) })}</span></p></section>
  ) : (
    <Dock w={w} state={ds} amount={amount} setAmount={setAmount} busy={busy} reason={reason} setReason={setReason} onScoop={() => void enterNow(amount)} onSeat={takeSeat} host={host} phone={compact} />
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
  // the live round in one line over the sheet (its own slice: the slots left move every slot)
  const results = showSheet ? <ResultSheet w={result!} myScarf={myScarf} live={result!.id === w.id} head={<OpenLine />} onClose={fold} /> : null;
  const chat = <LiveChat mem={mem} facts={facts} enter={chatEnter} sellBack={chatSell} seated={seated} myName={profile?.nickname} myScarf={myScarf} onSeat={takeSeat} serving={myServe} variant={compact ? "phone" : "desk"} />;
  // chain: the viewer's scoops still in the program from rounds whose result is not on screen (the round in focus and the
  // folded result have their own sheet, with the same take key)
  const leftOver = (w.scoopsLeft ?? []).filter((x) => x.id !== w.id && x.id !== foldOpen?.id && !(showSheet && x.id === result!.id));
  // chain: stakes waiting in rounds that were not drawn (the round in focus included: it has no result to show)
  const back = w.stakesBack ?? [];

  if (compact) {
    // one 36 px row under the stem: the viewer's own result first, then what the hall is drawing, then a watched round, then a scoop left in the program
    const row = foldOpen && foldOpen === myResult
      ? { text: foldText!, open: foldOpen }
      : note ? { text: note, open: null }
      : foldOpen ? { text: foldText!, open: foldOpen } : null;
    return (
      <>
        {embed ? <EmbedHead /> : <TopBar room />}
        <div className="pplay">
          <div className="strip">
            <div className="l"><b>{t("h.room.roundNo", { n: r.n })}</b><StateTag word={stateWord(t, r.phase, r.halt)} /></div>
            <div className="c"><StripCount /></div>
            <div className="r"><PotPlayers /></div>
          </div>
          <div className="stem-wrap"><LiveStem thin /></div>
          {row ? (
            <div className="pnote" aria-live="polite">
              <span className="t">{row.text}</span>
              {row.open ? <button type="button" className="key sec xs" onClick={() => openSheet(row.open!)}>{t("h.rs.open")}</button> : null}
            </div>
          ) : back.length ? <BackStub back={back} phone /> : leftOver.length ? <LeftStub left={leftOver} phone /> : null}
          <div ref={band} className="hall-band" aria-hidden="true" />
          <div className="plow">
            {!embed ? chat : null}
            {stub ? <div className="pdock pstub">{stub}</div> : null}
            {dock}
          </div>
        </div>
        {results}
      </>
    );
  }
  const folded = foldText && foldOpen ? (
    <>
      <div className="rs-stub" aria-live="polite"><span>{foldText}</span><button type="button" className="key sec s" onClick={() => openSheet(foldOpen!)}>{t("h.rs.open")}</button></div>
      {back.length ? <BackStub back={back} /> : leftOver.length ? <LeftStub left={leftOver} /> : null}
    </>
  ) : back.length ? <BackStub back={back} /> : leftOver.length ? <LeftStub left={leftOver} /> : null;
  return (
    <>
      {embed ? <EmbedHead /> : <TopBar room />}
      <div className="hud-root">
        {!embed ? chat : null}
        <Instruments capBps={w.capBps} transient={null} note={note} stub={stub} stubTop={stubTop} folded={folded} />
        {dock}
        {results}
      </div>
    </>
  );
}
