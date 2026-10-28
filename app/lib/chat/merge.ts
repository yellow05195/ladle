"use client";

/**
 * One log for the chat panel: the round's lines from useRoundChat (entries
 * as "name: !scoop 0.25", phases, the viewer's own commands and the host
 * bot's answers - all local to this page) interleaved with the room's talk
 * (useChat().lines), in arrival order.
 *
 * Round lines carry no time: each gets the moment it was first seen. Room
 * lines use their own time, or the moment they arrived when that is
 * earlier (a relay clock ahead of this one never pushes talk below newer
 * round lines).
 */
import { useMemo, useRef } from "react";
import type { Msg } from "../../components/game/types";
import type { ChatLine } from "./types";

export type RoomLogItem =
  | { key: string; at: number; src: "round"; msg: Msg }
  | { key: string; at: number; src: "room"; line: ChatLine };

export function useRoomLog(msgs: Msg[], lines: ChatLine[], max = 160): RoomLogItem[] {
  const seenRound = useRef(new Map<number, number>());
  const seenRoom = useRef(new Map<string, number>());
  return useMemo(() => {
    const now = Date.now();
    const out: RoomLogItem[] = [];
    for (const m of msgs) {
      let at = seenRound.current.get(m.id);
      if (at === undefined) { at = now; seenRound.current.set(m.id, at); }
      out.push({ key: `r${m.id}`, at, src: "round", msg: m });
    }
    for (const l of lines) {
      let seen = seenRoom.current.get(l.id);
      if (seen === undefined) { seen = now; seenRoom.current.set(l.id, seen); }
      out.push({ key: `c${l.id}`, at: Math.min(l.at, seen), src: "room", line: l });
    }
    // forget what scrolled out of both logs
    if (seenRound.current.size > msgs.length + 200) { const keep = new Set(msgs.map((m) => m.id)); for (const id of seenRound.current.keys()) if (!keep.has(id)) seenRound.current.delete(id); }
    if (seenRoom.current.size > lines.length + 200) { const keep = new Set(lines.map((l) => l.id)); for (const id of seenRoom.current.keys()) if (!keep.has(id)) seenRoom.current.delete(id); }
    out.sort((a, b) => a.at - b.at);
    return out.length > max ? out.slice(-max) : out;
  }, [msgs, lines, max]);
}
