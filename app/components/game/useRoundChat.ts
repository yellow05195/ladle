"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { T } from "../../i18n";
import type { DataSource, LiveWindow } from "../../lib/data/types";
import { formatInt, formatMultiplier, formatPct, formatSol } from "../../lib/format";
import { entryRound } from "../hall/hud/round";
import { multiplierOf } from "../../lib/law-settle";
import { roundNo, type GameFacts, type Msg, type MsgIn } from "./types";

const MAX_MSGS = 140;

/** "0.250000000" → "0.25", "1.000" → "1" */
export const solStr = (l: bigint) => formatSol(l, 3).replace(/\.?0+$/, "");

interface Tracker { entries: number; said: Set<string> }

/**
 * The round chat as a hook. Fix r2, so the chat reads as people talking and
 * not as a log: each round is ONE room notice that keeps its place and is
 * updated in place ("Round No. 1111 · 12 in", then "· sealed at slot 92");
 * other players' entries are counted there, not written one by one; the
 * open and seed-in notices are gone (the instruments show them). The
 * viewer's own entry is their line and a cream note; the serve is one house
 * line (players, one price, the smallest and the largest scoop, a Recompute
 * link); the commands typed by the viewer get an answer with real figures
 * (the demo source and the law). The demo marker is the tag and the chat's
 * header, never a chat line. Nothing here decides a result: it only reads
 * the snapshots.
 */
export function useRoundChat({ w, source, enter, sellBack, facts, t, seated = true, myName, onSeat, serving = false }: { w: LiveWindow | null; source: DataSource; enter: (amount: bigint) => void; sellBack: () => void; facts: GameFacts; t: T; seated?: boolean; myName?: string; onSeat?: () => void; serving?: boolean }) {
  // a spectator's own command lines go unsigned (never "you", which reads as a player called you)
  const me = myName ?? "";
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const nextId = useRef(1);
  const tracker = useRef(new Map<string, Tracker>());
  const pending = useRef<{ lamports: bigint; id: string } | null>(null);
  const wRef = useRef(w);
  wRef.current = w;
  const servingRef = useRef(serving);
  servingRef.current = serving;

  const push = useCallback((items: Array<MsgIn>) => {
    if (!items.length) return;
    const withIds = items.map((m) => ({ ...m, id: nextId.current++ }) as Msg);
    setMsgs((cur) => [...cur, ...withIds].slice(-MAX_MSGS));
  }, []);
  /** each round's one notice: its message id and its current text */
  const roundNote = useRef(new Map<string, { id: number; text: string }>());

  // the snapshots → chat lines
  useEffect(() => {
    if (!w) return;
    const out: Array<MsgIn> = [];
    const n = roundNo(w.id);
    const sys = (text: string, title = t("chat.system"), link?: { href: string; hrefLabel: string }, personal?: boolean) => out.push({ kind: "sys", title, text, ...link, ...(personal ? { personal } : {}) });
    let tr = tracker.current.get(w.id);
    if (!tr) {
      tr = { entries: 0, said: new Set() };
      tracker.current.set(w.id, tr);
    }
    // the round's one notice: written at its first entry, then its text changes in place (count, then sealed)
    const k = w.entries.length;
    if (k > 0) {
      const text = w.phase === "open" ? t(k === 1 ? "chat.nRoundOne" : "chat.nRound", { n, k }) : t(k === 1 ? "chat.nRoundSealedOne" : "chat.nRoundSealed", { n, k, slots: w.slotsTotal });
      const note = roundNote.current.get(w.id);
      if (!note) {
        const id = nextId.current++;
        roundNote.current.set(w.id, { id, text });
        setMsgs((cur) => [...cur, { id, kind: "notice", text, round: w.id } as Msg].slice(-MAX_MSGS));
        if (roundNote.current.size > 40) { const first = roundNote.current.keys().next().value; if (first !== undefined) roundNote.current.delete(first); }
      } else if (note.text !== text) {
        note.text = text;
        setMsgs((cur) => cur.map((m) => (m.id === note.id && m.kind === "notice" ? { ...m, text } : m)));
      }
    }
    for (let i = tr.entries; i < w.entries.length; i++) {
      const e = w.entries[i]!;
      if (e.mine) {
        const p = pending.current;
        if (p && p.id === w.id) {
          pending.current = null;
          // the viewer's own line ("you: !scoop 0.25") is already in the log: only the bot answers
          out.push({ kind: "reply", title: t("chat.bot"), personal: true, text: e.amount < p.lamports ? t("chat.rCapped", { cap: facts.capPct, n, sol: solStr(e.amount) }) : t("chat.rEntered", { n, sol: solStr(e.amount) }) });
        } else {
          // entered from the dock: the same line as a chat entry, and the bot's usual reply
          out.push({ kind: "drop", name: me, mine: true, sol: solStr(e.amount), cmd: `!scoop ${solStr(e.amount)}` });
          out.push({ kind: "reply", title: t("chat.bot"), personal: true, text: t("chat.rEntered", { n, sol: solStr(e.amount) }) });
        }
      }
      // other players' entries are counted in the round's notice (one line per round, not one per entry)
    }
    tr.entries = w.entries.length;

    const once = (key: string, fn: () => void) => { if (!tr!.said.has(key)) { tr!.said.add(key); fn(); } };
    const ph = w.phase;
    if ((ph === "settled" || ph === "sold") && w.settlement && w.entries.length) once("split", () => {
      const s = w.settlement!;
      let lo = Infinity, hi = -Infinity;
      for (const e of w.entries) {
        if (e.share === undefined) continue;
        const m = multiplierOf(e.share, e.amount, w.total, s.tokensOut);
        lo = Math.min(lo, m); hi = Math.max(hi, m);
      }
      if (Number.isFinite(lo)) sys(t("chat.sServed", { n, players: w.entries.length, lo: formatMultiplier(lo), hi: formatMultiplier(hi) }), t("game.round", { n }), { href: `/window/${w.id}#recompute`, hrefLabel: t("chat.recompute") });
      if (w.mineIndex !== null && s.myMultiplier !== null && s.mySellBack !== null) sys(t("chat.sysYours", { m: formatMultiplier(s.myMultiplier), sol: formatSol(s.mySellBack, 4) }), t("chat.bot"), undefined, true);
    });
    if (ph === "sold" && w.soldFor !== null) once("sold", () => sys(t("chat.sysSold", { sol: formatSol(w.soldFor!, 4) }), t("chat.bot"), undefined, true));
    push(out);
  }, [w, t, facts.capPct, push, me]);

  const send = useCallback((text: string) => {
    const raw = text.trim().replace(/\s+/g, " ");
    if (!raw) return;
    const cur = wRef.current;
    const reply = (s: string, extra?: { href: string; hrefLabel: string }) => ({ kind: "reply" as const, title: t("chat.bot"), text: s, ...extra });
    const items: Array<MsgIn> = [{ kind: "user", name: me, mine: true, cmd: raw }];
    const [cmd = "", arg] = raw.toLowerCase().split(" ");
    if (!seated && (cmd === "!scoop" || cmd === "!pull" || cmd === "!join" || cmd === "!enter")) { items.push(reply(t("chat.rWatchScoop"))); push(items); onSeat?.(); return; }
    if (!seated && cmd === "!sell") { items.push(reply(t("chat.rSeatFirst"))); push(items); return; }
    if (!cur && cmd !== "!help") { items.push(reply(t("chat.rLoading"))); push(items); return; }
    const n = cur ? roundNo(cur.id) : "";
    const mine = cur && cur.mineIndex !== null ? cur.entries[cur.mineIndex] : undefined;
    switch (cmd) {
      case "!scoop": case "!pull": case "!join": case "!enter": {
        const x = Number((arg ?? "").replace(",", "."));
        if (cur!.phase === "open" && mine) { items.push(reply(t("chat.rAlready", { n, sol: solStr(mine.amount) }))); break; }
        // rounds are pipelined: while this one draws, its open sibling takes the entry
        const target = entryRound(cur, { serving: servingRef.current });
        if (!target) { items.push(reply(mine ? t("chat.rPending", { n }) : t("chat.rClosed", { n }))); break; }
        if (!Number.isFinite(x) || x < 0.01 || x > 5) { items.push(reply(t("chat.rBadAmount"))); break; }
        if (typeof source.enter !== "function") { items.push(reply(t("chat.rLoading"))); break; }
        const lamports = BigInt(Math.round(x * 1000)) * 1_000_000n;
        pending.current = { lamports, id: target };
        push(items);
        enter(lamports);
        return;
      }
      case "!odds": {
        items.push(reply(t("chat.rOdds", { max: facts.rollMax, below: facts.belowPct, p50: facts.p50, p90: facts.p90 })));
        if (mine && cur!.total > 0n) items.push(reply(t("chat.rOddsMe", { n, sol: solStr(mine.amount), pct: formatPct(Number(mine.amount) / Number(cur!.total), 1) })));
        break;
      }
      case "!pot": case "!sum": {
        const s = cur!.settlement;
        if ((cur!.phase === "settled" || cur!.phase === "sold") && s) {
          const tokens = cur!.entries.reduce((a, e) => a + (e.share ?? 0n), 0n);
          items.push(reply(t("chat.rSumDone", { n, tokens: formatInt(tokens / 1_000_000n), sol: formatSol(cur!.total, 3) })));
        } else items.push(reply(t("chat.rSumOpen", { sol: formatSol(cur!.total, 3), e: cur!.entries.length })));
        break;
      }
      case "!verify": {
        const current = Number(n);
        const last = cur!.phase === "settled" || cur!.phase === "sold" ? current : current - 1;
        const want = arg ? Number(arg.replace(/^#/, "")) : last;
        if (!Number.isInteger(want) || want < 1 || want > last) { items.push(reply(t("chat.rVerifyBad", { n: arg ?? "", last }))); break; }
        items.push(reply(t("chat.rVerify", { n: want }), { href: `/window/demo-${want}`, hrefLabel: t("chat.open") }));
        break;
      }
      case "!sell": {
        if (cur!.phase === "sold" && cur!.soldFor !== null) { items.push(reply(t("chat.rSoldAlready", { sol: formatSol(cur!.soldFor, 4) }))); break; }
        if (cur!.phase === "settled" && mine && cur!.settlement?.mySellBack != null && typeof source.sellBack === "function") { push(items); sellBack(); return; }
        items.push(reply(t("chat.rCantSell")));
        break;
      }
      case "!help": case "!commands": items.push(reply(t("chat.rHelp"))); break;
      default: items.push(reply(t("chat.rUnknown", { cmd: raw.slice(0, 24) })));
    }
    push(items);
  }, [enter, sellBack, source, facts, t, push, seated, me, onSeat]);

  return { msgs, send };
}
