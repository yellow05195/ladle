"use client";

/**
 * The round chat (v21.1, §7.14): one charcoal plate, one stream for people
 * talking, commands and the house, in time order. Talk goes to the room
 * (lib/chat useChat); commands stay on this page (useRoundChat answers them
 * with the round's real figures; entries reach others only through the
 * chain). One field for both. Each kind of line has its own shape, readable
 * in greyscale: talk (the player's pet portrait, name, text), command (the
 * same, then a token that reads as a key), the house (a speaker named Ladle
 * with the ladle mark for portrait), room notices (no disc, on the text
 * column) and personal notes (a cream note, never sent).
 *
 * Built for a full hall, and so that people talking stay the chat (fix r2):
 * each round is one room notice updated in place (useRoundChat), other
 * players' entries are counted there (their typed !scoop lines too),
 * arrivals are the presence row's count (no "took a seat" lines), other
 * command bursts fold, the last 200 lines are kept, row objects are reused
 * so only new rows render, new lines only at the bottom, and the log stays
 * pinned to its newest line whatever height that line takes once drawn.
 */
import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../../i18n/client";
import { playerColor } from "../../../lib/colors";
import { SCARVES, SPECIES, type Species } from "../../../lib/profile";
import { MAX_TEXT, hintFor, signInToChat, useChat, usePresence, useRoomLog, type ChatLine, type SendResult } from "../../../lib/chat";
import type { Msg } from "../../game/types";
import { HIcon } from "../../ui/icons";
import { Arr, Mark } from "../../ui/house";
import { speciesOf } from "../pets";
import { useProfile } from "../profile/ProfileProvider";
import { thumbUrl } from "../profile/thumb";

const KEYS = ["!scoop 0.25", "!odds", "!pot", "!verify", "!sell"] as const;
const AHEAD = [
  { cmd: "!scoop 0.25", key: "h.ta.scoop" },
  { cmd: "!odds", key: "h.ta.odds" },
  { cmd: "!pot", key: "h.ta.pot" },
  { cmd: "!verify", key: "h.ta.verify" },
  { cmd: "!sell", key: "h.ta.sell" },
] as const;

type Extra = { key: string; at: number; kind: "notice"; text: string } | { key: string; at: number; kind: "personal"; text: string; action?: "profile" | "sign" };

/** One rendered row (species + colour make the portrait). */
type Row =
  | { key: string; kind: "talk"; name: string; color: string; species: Species; text: string; mine: boolean; cont: boolean }
  | { key: string; kind: "cmd"; name: string; color: string; species: Species; cmd: string; mine: boolean }
  | { key: string; kind: "sys"; text: string; href?: string; hrefLabel?: string; first: boolean }
  | { key: string; kind: "notice"; text: string; href?: string; hrefLabel?: string }
  | { key: string; kind: "personal"; text: string; action?: "profile" | "sign" };

/** Same fields, same values: the previous row object is reused, so memo(ChatRow) skips it. */
function sameRow(a: Row, b: Row): boolean {
  const ka = Object.keys(a) as Array<keyof Row>;
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

/** Memoised: the room re-renders on every round snapshot; the chat only when its own inputs change. */
export const RoomChat = memo(function RoomChat({ msgs, sendRound, myName, myScarf, variant = "desk" }: { msgs: Msg[]; sendRound: (text: string) => void; myName: string; myScarf?: string; variant?: "desk" | "phone" }) {
  const t = useT();
  const room = useChat();
  const present = usePresence();
  const { profile, openProfile } = useProfile();
  // who is who in the room: the round's own lines carry a name only; the room knows its animal
  const whoBy = useMemo(() => new Map(present.map((p) => [p.profile.nickname, p.profile])), [present]);
  const log = useRoomLog(msgs, room.lines, 200);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [value, setValue] = useState("");
  const [active, setActive] = useState(0);
  const [navigated, setNavigated] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pending, setPending] = useState(false);
  const [slowWait, setSlowWait] = useState<{ ms: number; at: number } | null>(null);
  const [full, setFull] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const addExtra = useCallback((x: { kind: "notice"; text: string } | { kind: "personal"; text: string; action?: "profile" | "sign" }) => {
    setExtras((cur) => {
      // the same personal notice twice in a row (two quick rejected lines) replaces the first
      const last = cur[cur.length - 1];
      const same = !!last && last.kind === "personal" && x.kind === "personal" && last.text.replace(/\d+/g, "#") === x.text.replace(/\d+/g, "#");
      return [...(same ? cur.slice(0, -1) : cur), { ...x, key: `x${++seq.current}`, at: Date.now() } as Extra].slice(-60);
    });
  }, []);

  // the 72 portrait thumbs, fetched once the room is idle, so a disc rarely waits for its picture
  useEffect(() => {
    const go = () => { for (const sp of SPECIES) for (const s of SCARVES) { const i = new Image(); i.decoding = "async"; i.src = thumbUrl(sp, s.id); } };
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) { const id = w.requestIdleCallback(go, { timeout: 2500 }); return () => w.cancelIdleCallback?.(id); }
    const id = window.setTimeout(go, 1200);
    return () => clearTimeout(id);
  }, []);

  // the merged stream, folded for a crowd
  const cache = useRef(new Map<string, Row>());
  const rows = useMemo<Row[]>(() => {
    type It = { at: number; key: string; row: Row; burstCmd?: string };
    const items: It[] = [];
    const myId = room.me?.id;
    let lastTalk: { id: string; at: number } | null = null;
    let lastSys = false;
    const mySpecies: Species | null = profile?.species ?? null;
    const speciesFor = (name: string, mine: boolean): Species => (mine && mySpecies ? mySpecies : whoBy.get(name)?.species ?? speciesOf(name || "you"));
    for (const it of log) {
      if (it.src === "round") {
        const m = it.msg;
        // other players' entries are counted in their round's notice
        if (m.kind === "drop" && !m.mine) continue;
        if (m.kind === "user" || m.kind === "drop") {
          const name = m.mine ? myName : m.name;
          const cmd = m.kind === "user" ? m.cmd : m.cmd ?? `!scoop ${m.sol}`;
          const verb = cmd.split(" ")[0]!;
          items.push({ at: it.at, key: it.key, row: { key: it.key, kind: "cmd", name, color: m.mine && myScarf ? myScarf : whoBy.get(name)?.scarf ?? playerColor(name || "you"), species: speciesFor(name, m.mine), cmd, mine: m.mine }, burstCmd: m.mine ? undefined : verb });
          lastTalk = null; lastSys = false;
        } else if (m.kind === "notice") {
          items.push({ at: it.at, key: it.key, row: { key: it.key, kind: "notice", text: m.text, href: m.href, hrefLabel: m.hrefLabel } });
          lastTalk = null; lastSys = false;
        } else if (m.personal) {
          // the viewer's own entry or scoop: a cream note (the same cream for any result)
          items.push({ at: it.at, key: it.key, row: { key: it.key, kind: "personal", text: m.text } });
          lastTalk = null; lastSys = false;
        } else {
          items.push({ at: it.at, key: it.key, row: { key: it.key, kind: "sys", text: m.text, href: m.href, hrefLabel: m.hrefLabel, first: !lastSys } });
          lastTalk = null; lastSys = true;
        }
      } else {
        const l: ChatLine = it.line;
        if (l.kind === "notice") { items.push({ at: it.at, key: it.key, row: { key: it.key, kind: "notice", text: l.text } }); lastTalk = null; lastSys = false; continue; }
        if (l.kind === "system" || !l.from) { items.push({ at: it.at, key: it.key, row: { key: it.key, kind: "sys", text: l.text, first: !lastSys } }); lastTalk = null; lastSys = true; continue; }
        const mine = !!myId && l.from.id === myId;
        if (l.kind === "command") {
          const verb = l.text.split(" ")[0]!.toLowerCase();
          // another player's !scoop: their entry reaches the round's notice through the chain
          if (!mine && verb === "!scoop") continue;
          items.push({ at: it.at, key: it.key, row: { key: it.key, kind: "cmd", name: l.from.nickname, color: l.from.scarf, species: l.from.species, cmd: l.text, mine }, burstCmd: mine ? undefined : verb });
          lastTalk = null; lastSys = false; continue;
        }
        const cont = !!lastTalk && lastTalk.id === l.from.id && it.at - lastTalk.at < 30_000;
        items.push({ at: it.at, key: it.key, row: { key: it.key, kind: "talk", name: l.from.nickname, color: l.from.scarf, species: l.from.species, text: l.text, mine, cont } });
        lastTalk = { id: l.from.id, at: it.at }; lastSys = false;
      }
    }
    for (const x of extras) items.push({ at: x.at, key: x.key, row: x.kind === "notice" ? { key: x.key, kind: "notice", text: x.text } : { key: x.key, kind: "personal", text: x.text, action: x.action } });
    items.sort((a, b) => a.at - b.at);
    const out: Row[] = [];
    // other commands: more than 3 from others within 1 s, the rest fold into "+4 more !odds"
    let burstAt = -1e15, shown = 0;
    let folded = new Map<string, number>();
    const flush = (k: string) => { for (const [cmd, n] of folded) out.push({ key: `${k}:${cmd}`, kind: "notice", text: t("h.chat.fold", { n, cmd }) }); folded = new Map(); };
    let lastKey = "f0";
    for (const it of items) {
      if (it.burstCmd) {
        if (it.at - burstAt > 1000) { flush(lastKey); burstAt = it.at; shown = 0; }
        if (shown < 3) { shown++; out.push(it.row); }
        else folded.set(it.burstCmd, (folded.get(it.burstCmd) ?? 0) + 1);
        lastKey = it.key;
        continue;
      }
      if (folded.size && it.at - burstAt > 1000) flush(lastKey);
      out.push(it.row);
    }
    flush(lastKey);
    // reuse the previous objects: memo(ChatRow) then renders only the rows that are new or changed
    const prev = cache.current;
    const next = new Map<string, Row>();
    const kept = out.slice(-200).map((r) => { const o = prev.get(r.key); const v = o && sameRow(o, r) ? o : r; next.set(r.key, v); return v; });
    cache.current = next;
    return kept;
  }, [log, extras, myName, myScarf, room.me?.id, t, whoBy, profile?.species]);

  // scrolling: pinned to the bottom while the reader is within 24 px of it
  const logRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [behind, setBehind] = useState(false);
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (pinned.current) { el.scrollTop = el.scrollHeight; setBehind(false); }
    else setBehind(true);
  }, [rows, full]);
  // a new row is first laid out at its placeholder height and only then at its real 2-3 lines: whenever the rows
  // change height, a pinned log follows its newest line again (it is never left cut under the input)
  useEffect(() => {
    const el = logRef.current, inner = rowsRef.current;
    if (!el || !inner) return;
    const ro = new ResizeObserver(() => { if (pinned.current) el.scrollTop = el.scrollHeight; });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [full]);
  // only the reader's own scrolling unpins (new rows, trims and anchoring never do)
  const intent = useRef(0);
  const markIntent = () => { intent.current = performance.now(); };
  const onScroll = () => {
    const el = logRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (near) { pinned.current = true; setBehind(false); return; }
    if (performance.now() - intent.current < 800) pinned.current = false;
  };
  // a jump, not a glide: a smooth scroll aims at the height it read when it started and stops short of rows still growing
  const toBottom = () => { const el = logRef.current; if (!el) return; pinned.current = true; el.scrollTop = el.scrollHeight; setBehind(false); };

  // the typeahead
  const ahead = value.startsWith("!") && !value.includes(" ") ? AHEAD.filter((a) => a.cmd.startsWith(value.toLowerCase())) : [];
  const showAhead = focus && ahead.length > 0;
  useEffect(() => { setActive(0); setNavigated(false); }, [value]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (pending) return;
    let timer: number | null = null;
    if (!text.startsWith("!")) timer = window.setTimeout(() => setPending(true), 400);
    const r: SendResult = await room.send(text);
    if (timer !== null) clearTimeout(timer);
    setPending(false);
    if (r.ok) {
      if (r.kind === "command") sendRound(text);
      setValue("");
      pinned.current = true;
      return;
    }
    const hint = r.hint ?? hintFor(r.reason, { retryMs: r.retryMs, slowMs: room.slowMs ?? null });
    if (r.reason === "rate-limited" && r.retryMs) setSlowWait({ ms: r.retryMs, at: Date.now() });
    if (r.reason === "rate-limited" || r.reason === "too-long") { /* the line stays in the field */ }
    else if (r.reason !== "no-profile" && r.reason !== "not-signed" && r.reason !== "offline" && r.reason !== "muted") setValue("");
    addExtra({ kind: "personal", text: hint, action: r.reason === "no-profile" ? "profile" : r.reason === "not-signed" ? "sign" : undefined });
  };

  const fill = (k: string) => {
    setValue(k);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (k.startsWith("!scoop ")) el.setSelectionRange(7, k.length);
      else el.setSelectionRange(k.length, k.length);
    });
  };

  // a suggestion taken: !scoop only fills the field (an entry is never two keystrokes away); the others send
  const take = (cmd: string) => { if (cmd.startsWith("!scoop")) fill(cmd); else void send(cmd); };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showAhead) {
      if (e.key === "ArrowDown") { e.preventDefault(); setNavigated(true); setActive((a) => (a + 1) % ahead.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setNavigated(true); setActive((a) => (a - 1 + ahead.length) % ahead.length); return; }
      if (e.key === "Tab") { e.preventDefault(); fill(ahead[active]!.cmd); return; }
      // Escape closes the list only (never the phone's full chat sheet around it)
      // (React listens on the document itself, next to the sheet's own Escape listener: stop the native event there too)
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setValue(""); return; }
      // Enter takes the highlighted command when the field is only the start of it ("!ve" → !verify) or the
      // reader moved through the list; a command typed out in full ("!odds") is sent as typed
      const typed = value.trim().toLowerCase();
      const partial = !typed.includes(" ") && typed !== ahead[active]!.cmd && ahead[active]!.cmd.startsWith(typed);
      if (e.key === "Enter" && (navigated || partial)) { e.preventDefault(); take(ahead[active]!.cmd); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(value); }
    if (e.key === "Escape" && full) setFull(false);
  };

  const chars = [...value].length;
  const onStage = present.filter((p) => p.seat === "stage").length;
  const online = room.online || 0;
  const count = online > 0 ? t("h.chat.count", { n: online, stage: onStage }) : "";
  const statusBits: string[] = [];
  if (online > 0 && room.status === "demo") statusBits.push(t("h.chat.simulated"));
  if (room.slowMs) statusBits.push(t("h.chat.slow", { s: Math.round(room.slowMs / 1000) }));
  if (room.status === "offline" || room.status === "connecting") statusBits.push(t("h.chat.reconnecting"));
  const newest = useMemo(() => [...present].sort((a, b) => b.since - a.since).slice(0, 4), [present]);
  const more = Math.max(0, Math.max(online, present.length) - newest.length);
  const canTalk = !!profile;
  const placeholder = canTalk ? t("h.chat.placeholder") : t("h.chat.readFreely");

  const head = (
    <div className="rchat-head">
      <div className="hrow">
        <h2 className="title">{t("h.chat.folio")}</h2>
        {count ? <span className="count">{count}</span> : null}
      </div>
      {newest.length || statusBits.length ? (
        <div className="who">
          {newest.length ? (
            <span className="presence" aria-hidden="true">
              {newest.map((p) => <Thumb key={p.profile.id} species={p.profile.species} color={p.profile.scarf} size={34} />)}
            </span>
          ) : null}
          <span className="n" style={newest.length ? undefined : { marginLeft: 0 }}>
            {more > 0 ? <span>{t("h.chat.more", { n: more })}</span> : null}
            {statusBits.length ? <small>{statusBits.join(" · ")}</small> : null}
          </span>
        </div>
      ) : null}
    </div>
  );

  // the row elements, rebuilt only when the rows change (typing, focus and the typeahead never rebuild 200 rows)
  const me = profile?.nickname ?? null;
  const rowEls = useMemo(() => rows.map((r) => <ChatRow key={r.key} r={r} me={me} onProfile={openProfile} />), [rows, me, openProfile]);
  /** the last n rows, with at most one room notice among them (the phone plate shows people, not the log) */
  const lastRows = (n: number) => {
    const pick: ReactNode[] = [];
    let notices = 0;
    for (let i = rows.length - 1; i >= 0 && pick.length < n; i--) {
      if (rows[i]!.kind === "notice") { if (notices) continue; notices++; }
      pick.push(rowEls[i]);
    }
    return pick.reverse();
  };
  const lines = (n?: number) => (
    <div ref={logRef} className="rchat-log" role="log" aria-live="polite" aria-relevant="additions" aria-label={t("h.chat.folio")} tabIndex={0} onScroll={onScroll} onWheel={markIntent} onTouchMove={markIntent} onKeyDown={markIntent} onPointerDown={markIntent}
      onClick={variant === "phone" && !full ? () => setFull(true) : !full ? () => setDrawer((d) => !d) : undefined}>
      <span className="spacer" />
      <div ref={rowsRef} className="rchat-rows">{n ? lastRows(n) : rowEls}</div>
    </div>
  );

  const input = (
    <div className="rchat-in">
      {behind ? <div className="rchat-new"><button type="button" className="key sec s" onClick={toBottom}>{t("h.chat.newLines")} ↓</button></div> : null}
      {showAhead ? (
        <ul className="typeahead" role="listbox" id="chat-ahead" aria-label={t("h.chat.commands")}>
          {ahead.map((a, i) => (
            <li key={a.cmd} id={`ahead-${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); take(a.cmd); }} onMouseEnter={() => setActive(i)}>
              <b>{a.cmd}</b><span>{t(a.key)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <label htmlFor={`chat-in-${variant}`} className="sr-only">{t("chat.label")}</label>
      <div className="well">
        <input id={`chat-in-${variant}`} ref={inputRef} value={value} placeholder={placeholder} autoComplete="off" spellCheck={false} maxLength={200} enterKeyHint="send"
          role="combobox" aria-expanded={showAhead} aria-controls="chat-ahead" aria-autocomplete="list" aria-activedescendant={showAhead ? `ahead-${active}` : undefined}
          onChange={(e) => setValue(e.target.value)} onKeyDown={onKey} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} />
        <button type="button" className={`send ${value.trim() ? "on" : ""}`} aria-label={t("chat.send")} onClick={() => void send(value)}>
          <HIcon name="arrow-up" size={18} />
          {slowWait ? (
            <svg key={slowWait.at} className="drain" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20" style={{ animationDuration: `${slowWait.ms}ms` }} onAnimationEnd={() => setSlowWait(null)} /></svg>
          ) : null}
        </button>
      </div>
      <div className="meta-row">
        {pending ? <span className="fine">{t("h.chat.checkWallet")}</span> : focus && !canTalk ? <span className="fine">{t("h.chat.needProfile")}</span> : null}
        {chars > 120 ? <span className="fine" style={chars > MAX_TEXT ? { color: "var(--ink)" } : undefined}>{chars} / {MAX_TEXT}</span> : null}
      </div>
    </div>
  );

  const keys = <QuickKeys label={t("h.chat.commands")} onPick={fill} />;

  if (variant === "phone") {
    return (
      <>
        <section className="pchat" aria-label={t("h.chat.folio")}>
          <button type="button" className="head" onClick={() => setFull(true)} aria-expanded={full}>
            <span className="title">{t("h.chat.folio")}</span>
            {count ? <span className="count fine">{count}</span> : null}
          </button>
          {!full ? lines(3) : null}
          {!full ? input : null}
        </section>
        {full ? <PhoneChatSheet head={head} onClose={() => setFull(false)}>{lines()}{keys}{input}</PhoneChatSheet> : null}
      </>
    );
  }
  return (
    <section className={`rchat hud-pane hud-in ${drawer ? "open" : ""}`} aria-label={t("h.chat.folio")}>
      {head}
      {lines()}
      {input}
      {keys}
    </section>
  );
});

/** The quick commands: wells that fill the field (they never send); the row fades at its right edge only when it scrolls. */
function QuickKeys({ label, onPick }: { label: string; onPick: (k: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const put = () => setOver(el.scrollWidth > el.clientWidth + 1 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    put();
    const ro = new ResizeObserver(put);
    ro.observe(el);
    el.addEventListener("scroll", put, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", put); };
  }, []);
  return (
    <div ref={ref} className={`cmd-row ${over ? "fade" : ""}`} role="group" aria-label={label}>
      {KEYS.map((k) => <button key={k} type="button" onClick={() => onPick(k)}>{k}</button>)}
    </div>
  );
}

/** The full-screen phone chat: a sheet between the top bar and the rail that rides above the keyboard (visualViewport). */
function PhoneChatSheet({ head, children, onClose }: { head: ReactNode; children: ReactNode; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    // the custom properties hold calc() (the rail adds the safe area): resolve them through a probe
    const px = (v: string, d: number) => { const el = document.createElement("div"); el.style.cssText = `position:absolute;visibility:hidden;height:var(${v})`; document.body.appendChild(el); const h = el.getBoundingClientRect().height; el.remove(); return h || d; };
    const rail = px("--rail-h", 64), top = px("--top-h", 56);
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      const h = (vv?.height ?? window.innerHeight) - top - (vv && vv.height < window.innerHeight - 80 ? 0 : rail);
      el.style.height = `${Math.max(200, h)}px`;
      el.style.transform = `translateY(${vv?.offsetTop ?? 0}px)`;
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => { vv?.removeEventListener("resize", fit); vv?.removeEventListener("scroll", fit); document.removeEventListener("keydown", k); };
  }, [onClose]);
  // in a portal: above the result sheet and every room layer, below the top bar's own band
  return createPortal(
    <div ref={ref} className="pchat-full" role="dialog" aria-modal="true" aria-label={t("h.chat.folio")}>
      <div className="pchat-top">
        {head}
        <button type="button" className="icon-btn round" aria-label={t("h.chat.close")} onClick={onClose}><HIcon name="close" /></button>
      </div>
      {children}
    </div>,
    document.body,
  );
}

/**
 * A pet portrait (the presence row, chat discs). Until its picture is decoded the disc holds the player's
 * colour dot, so a slow network never shows an empty circle. Rows are in view when added: no lazy loading.
 */
function Thumb({ species, color, size }: { species: Species; color: string; size: number }) {
  const [ok, setOk] = useState(false);
  return (
    <span className={ok ? "" : "wait"} style={ok ? undefined : { ["--pc" as string]: color }}>
      {ok ? null : <i className="pdot" aria-hidden="true" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumbUrl(species, color)} alt="" width={size} height={size} decoding="async" onLoad={() => setOk(true)} />
    </span>
  );
}

/** A pet portrait in a 24 px disc (yours with a cream ring). */
function Face({ species, color, mine }: { species: Species; color: string; mine: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <span className={`face ${mine ? "me" : ""} ${ok ? "" : "wait"}`} aria-hidden="true" style={ok ? undefined : { ["--pc" as string]: color }}>
      {ok ? null : <i className="pdot" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumbUrl(species, color)} alt="" width={24} height={24} decoding="async" onLoad={() => setOk(true)} />
    </span>
  );
}

/** Commands named in the house's text read as tokens (a comma right after a token is left out: the token's own box separates them); in a cream note the figures are heavier. */
const RICH = /(![a-z]+(?: \d+(?:\.\d+)?)?|×\d+(?:\.\d+)?)/g;
function Rich({ text, bold = false }: { text: string; bold?: boolean }) {
  const parts = text.split(RICH);
  return <>{parts.map((p, i) => {
    if (i % 2 === 0) return i > 0 && parts[i - 1]!.startsWith("!") && p.startsWith(",") ? p.slice(1) : p;
    return p.startsWith("!") ? <span key={i} className="tok">{p}</span> : bold ? <b key={i}>{p}</b> : p;
  })}</>;
}

const ChatRow = memo(function ChatRow({ r, me, onProfile }: { r: Row; me: string | null; onProfile: () => void }) {
  const t = useT();
  if (r.kind === "talk") {
    return (
      <p className={`ln talk ${r.cont ? "cont" : ""}`}>
        {r.cont ? <span aria-hidden="true" /> : <Face species={r.species} color={r.color} mine={r.mine} />}
        <span className="tx">
          {r.cont ? null : <span className="nm">{r.name}</span>}
          <Talk text={r.text} me={me} />
        </span>
      </p>
    );
  }
  if (r.kind === "cmd") {
    return (
      <p className="ln cmd">
        <Face species={r.species} color={r.color} mine={r.mine} />
        <span className="tx">{r.name ? <span className="nm">{r.name}</span> : null}<span className="tok">{r.cmd}</span></span>
      </p>
    );
  }
  if (r.kind === "sys") {
    return (
      <p className={`ln sys ${r.first ? "" : "cont"}`}>
        {r.first ? <span className="face house" aria-hidden="true"><Mark size={16} /></span> : <span aria-hidden="true" />}
        <span className="tx">
          {r.first ? <span className="nm">{t("chat.bot")}</span> : null}
          <Rich text={r.text} />
          {r.href ? <Link href={r.href}>{r.hrefLabel}<Arr /></Link> : null}
        </span>
      </p>
    );
  }
  if (r.kind === "notice") return <p className="ln notice">{r.text}{r.href ? <>{" · "}<Link href={r.href}>{r.hrefLabel}</Link></> : null}</p>;
  return (
    <p className="ln mine-note" role="status">
      <Rich text={r.text} bold />
      {r.action ? <br /> : null}
      {r.action === "profile" ? <button type="button" className="key char xs" onClick={onProfile}>{t("h.chat.makeProfile")}</button> : null}
      {r.action === "sign" ? <button type="button" className="key char xs" onClick={() => { void signInToChat(); }}>{t("h.chat.signOnce")}</button> : null}
    </p>
  );
});

/** Plain text, never HTML, never linked; an @mention of the viewer is heavier. */
function Talk({ text, me }: { text: string; me: string | null }) {
  if (!me || !text.includes("@")) return <>{text}</>;
  const parts = text.split(/(@[a-z0-9_]{3,16})/gi);
  return <>{parts.map((p, i) => (p.toLowerCase() === `@${me.toLowerCase()}` ? <span key={i} className="mention">{p}</span> : p))}</>;
}
