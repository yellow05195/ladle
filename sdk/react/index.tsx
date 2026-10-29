/**
 * <PullWindow /> - the embeddable live window of a PULLED market.
 *
 * Self-contained: one scoped stylesheet injected once per document, no
 * Tailwind, no dependency on the host page's styles, works inside an iframe.
 * Wallet: pass `publicKey` + `signTransaction` (wallet-adapter compatible);
 * nothing is bundled. Without them, or with `readOnly`, everything that reads
 * still works.
 *
 * Copy rules: light theme, two accent colours only (mine / others), no emoji,
 * no sound, no confetti; "draw", "share", "result" - never a promise.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { Connection, PublicKey, type Transaction } from "@solana/web3.js";
import { PulledClient } from "../src/client.ts";
import { ESTIMATED_MS_PER_SLOT, marketPda, PULLED_PROGRAM_ID } from "../src/pda.ts";
import { multiplierOf } from "../src/law.ts";
import type { LiveState } from "../src/watch.ts";
import { WindowState, type Entry, type Keyed } from "../src/types.ts";
import { describeError } from "../src/errors.ts";

/* ------------------------------- props ------------------------------- */

export interface PullWindowProps {
  /** The launched token mint (base58). The market PDA is derived from it. */
  mint: string;
  /** Optional host key, for display/attribution only (fees are decided by the market's integration). */
  host?: string;
  /** HTTP RPC endpoint. */
  rpc: string;
  /** Websocket endpoint when it differs from the default derivation. */
  wsRpc?: string;
  lang?: "en" | "fr";
  /** Hide every write action. */
  readOnly?: boolean;
  /** Connected wallet (wallet-adapter `publicKey`). */
  publicKey?: PublicKey | string | null;
  /** wallet-adapter `signTransaction`. */
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
  /** Override the program id (base58). */
  programId?: string;
  pollMs?: number;
  style?: CSSProperties;
  className?: string;
}

/* -------------------------------- i18n -------------------------------- */

const DICT = {
  en: {
    conserved: "The sum is conserved. So for someone to take more, someone takes less. That someone can be you.",
    noWindow: "No window open yet.",
    loading: "Reading the chain...",
    open: "Window open",
    closesIn: "closes in",
    slots: "slots",
    about: "about",
    seconds: "s",
    entries: "entries",
    total: "total",
    you: "you",
    beat1: "Closed. Waiting for the seed.",
    beat2: "Seed landed.",
    beat3: "Your roll",
    rollOf: "roll",
    tallying: "Rolls done. Computing shares...",
    yourShare: "Your share",
    tokens: "tokens",
    multiplier: "pro-rata",
    sellBack: "Sell back now for",
    worst: "Smallest result of this window",
    best: "Largest result of this window",
    refunding: "No seed arrived in time. Every stake goes back in full.",
    refunded: "refunded",
    amount: "Amount",
    enter: "Enter the draw",
    connect: "Connect a wallet to enter.",
    readOnly: "Read-only view.",
    pending: "Sending...",
    sent: "Sent",
    noEntry: "You have no entry in this window.",
    settledNoShare: "Window settled.",
    slotNote: "1 slot is about 217 ms (measured 2026-10-23); the program counts slots, not seconds.",
    verify: "Recompute",
    verifyOk: "Every roll and share recomputed off chain matches the chain.",
    verifyKo: "Mismatch found. See the console.",
    error: "Error",
    retry: "Retry",
  },
  fr: {
    conserved: "La somme est conservée. Pour que quelqu'un prenne plus, quelqu'un prend moins. Ce quelqu'un peut être vous.",
    noWindow: "Aucune fenêtre ouverte pour l'instant.",
    loading: "Lecture de la chaîne...",
    open: "Fenêtre ouverte",
    closesIn: "ferme dans",
    slots: "slots",
    about: "environ",
    seconds: "s",
    entries: "entrées",
    total: "total",
    you: "vous",
    beat1: "Fermée. En attente de la graine.",
    beat2: "La graine est arrivée.",
    beat3: "Votre tirage",
    rollOf: "tirage",
    tallying: "Tirages faits. Calcul des parts...",
    yourShare: "Votre part",
    tokens: "jetons",
    multiplier: "pro-rata",
    sellBack: "Revendre maintenant pour",
    worst: "Plus petit résultat de cette fenêtre",
    best: "Plus grand résultat de cette fenêtre",
    refunding: "Aucune graine n'est arrivée à temps. Chaque mise revient en entier.",
    refunded: "remboursée",
    amount: "Montant",
    enter: "Entrer dans le tirage",
    connect: "Connectez un portefeuille pour entrer.",
    readOnly: "Vue en lecture seule.",
    pending: "Envoi...",
    sent: "Envoyé",
    noEntry: "Vous n'avez pas d'entrée dans cette fenêtre.",
    settledNoShare: "Fenêtre réglée.",
    slotNote: "1 slot dure environ 217 ms (mesuré le 2026-10-23) ; le programme compte des slots, pas des secondes.",
    verify: "Recalculer",
    verifyOk: "Chaque tirage et chaque part recalculés hors chaîne correspondent à la chaîne.",
    verifyKo: "Écart trouvé. Voir la console.",
    error: "Erreur",
    retry: "Réessayer",
  },
} as const;
type Dict = { readonly [K in keyof (typeof DICT)["en"]]: string };

/* -------------------------------- styles -------------------------------- */

const STYLE_ID = "pulled-pullwindow-styles";
const CSS = `
.pw-root{--pw-mine:#1d4ed8;--pw-other:#6b7280;--pw-ink:#111827;--pw-ink2:#4b5563;--pw-line:#e5e7eb;--pw-bg:#ffffff;
  all:initial;display:block;box-sizing:border-box;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--pw-ink);
  background:var(--pw-bg);border:1px solid var(--pw-line);border-radius:12px;padding:16px;max-width:420px;width:100%}
.pw-root *{box-sizing:border-box;font-family:inherit}
.pw-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:0 0 8px}
.pw-title{font-weight:600;font-size:15px}
.pw-muted{color:var(--pw-ink2);font-size:12px}
.pw-law{margin:0 0 12px;padding:10px 12px;border-left:2px solid var(--pw-ink);font-size:13px}
.pw-count{font-variant-numeric:tabular-nums;font-size:28px;font-weight:600;letter-spacing:-0.01em;margin:4px 0 0}
.pw-count small{font-size:13px;font-weight:400;color:var(--pw-ink2);margin-left:6px}
.pw-list{list-style:none;margin:10px 0 0;padding:0;border-top:1px solid var(--pw-line)}
.pw-list li{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--pw-line);font-variant-numeric:tabular-nums}
.pw-list li.pw-mine{color:var(--pw-mine);font-weight:600}
.pw-list li.pw-other{color:var(--pw-other)}
.pw-beat{margin:12px 0 0;padding:12px;border:1px solid var(--pw-line);border-radius:10px}
.pw-beat .pw-big{font-size:26px;font-weight:600;font-variant-numeric:tabular-nums;margin:4px 0 0}
.pw-beat.pw-me{border-color:var(--pw-mine)}
.pw-seed{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;word-break:break-all;color:var(--pw-ink2)}
.pw-pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.pw-pair>div{padding:10px;border:1px solid var(--pw-line);border-radius:10px}
.pw-pair .pw-v{font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--pw-ink)}
.pw-row{display:flex;gap:8px;margin-top:12px;align-items:center}
.pw-input{flex:1;min-width:0;padding:9px 10px;border:1px solid var(--pw-line);border-radius:8px;font-size:14px;background:#fff;color:var(--pw-ink)}
.pw-btn{padding:9px 14px;border-radius:8px;border:1px solid var(--pw-ink);background:var(--pw-ink);color:#fff;font-size:14px;font-weight:600;cursor:pointer}
.pw-btn.pw-sec{background:#fff;color:var(--pw-ink)}
.pw-btn:disabled{opacity:.5;cursor:default}
.pw-err{margin-top:10px;color:var(--pw-ink);font-size:12px;border:1px solid var(--pw-line);border-radius:8px;padding:8px}
.pw-foot{margin-top:12px;font-size:11px;color:var(--pw-ink2)}
`;

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* ------------------------------- helpers ------------------------------- */

function fmtUnits(v: bigint, decimals: number, maxFrac = 4): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = a / base;
  let frac = (a % base).toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? "." + frac : ""}`;
}

function parseUnits(s: string, decimals: number): bigint | null {
  const m = /^\s*(\d*)(?:[.,](\d*))?\s*$/.exec(s);
  if (!m || (!m[1] && !m[2])) return null;
  const whole = m[1] || "0";
  const frac = (m[2] || "").padEnd(decimals, "0");
  if (frac.length > decimals) return null;
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

function shortKey(k: PublicKey): string {
  const s = k.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function hex(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, "0");
  return s;
}

function toPk(k: PublicKey | string | null | undefined): PublicKey | null {
  if (!k) return null;
  try { return typeof k === "string" ? new PublicKey(k) : k; } catch { return null; }
}

/* ------------------------------ component ------------------------------ */

export function PullWindow(props: PullWindowProps): ReactElement {
  const t: Dict = DICT[props.lang ?? "en"];
  const me = useMemo(() => toPk(props.publicKey), [props.publicKey]);
  const canWrite = !props.readOnly && !!me && !!props.signTransaction;

  const client = useMemo(() => {
    const connection = new Connection(props.rpc, { commitment: "confirmed", wsEndpoint: props.wsRpc });
    const programId = props.programId ? new PublicKey(props.programId) : PULLED_PROGRAM_ID;
    return new PulledClient({ connection, programId });
  }, [props.rpc, props.wsRpc, props.programId]);

  const market = useMemo(() => {
    try { return marketPda(new PublicKey(props.mint), client.programId)[0]; } catch { return null; }
  }, [props.mint, client]);

  const [live, setLive] = useState<LiveState | null>(null);
  const [decimals, setDecimals] = useState<number>(9);
  const [err, setErr] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const liveRef = useRef<LiveState | null>(null);

  useEffect(() => { injectStyles(); }, []);

  useEffect(() => {
    if (!market) { setErr("bad mint"); return; }
    setLive(null);
    const stop = client.watch(market, (s) => { liveRef.current = s; setLive(s); }, {
      pollMs: props.pollMs ?? 4000,
      onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
    });
    return stop;
  }, [client, market, props.pollMs]);

  useEffect(() => {
    if (!live) return;
    client.getQuoteDecimals(live.market.account).then(setDecimals).catch(() => {});
  }, [client, live?.market.pubkey.toBase58()]);

  const window_ = live?.window ?? null;
  const w = window_?.account ?? null;
  const entries = live?.entries ?? [];
  const slot = live?.slot ?? 0;
  const myEntries = useMemo(() => (me ? entries.filter((e) => e.account.owner.equals(me)) : []), [entries, me]);
  const myEntry: Keyed<Entry> | null = myEntries[0] ?? null;

  const slotsLeft = w ? Number(w.closeSlot) - slot : 0;
  const secondsLeft = Math.max(0, Math.round((slotsLeft * ESTIMATED_MS_PER_SLOT) / 1000));

  const sendTx = useCallback(async (label: string, build: () => Promise<Transaction>) => {
    if (!props.signTransaction || !me) return;
    setBusy(label); setErr(null); setSig(null);
    try {
      // Entry addresses are ["entry", window, owner]: other wallets entering
      // in the same slot cannot invalidate this transaction, so no rebuild.
      const tx = await build();
      const signed = await props.signTransaction(tx);
      const s = await client.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      await client.connection.confirmTransaction({ signature: s, blockhash: tx.recentBlockhash!, lastValidBlockHeight: tx.lastValidBlockHeight! }, "confirmed");
      setSig(s);
    } catch (e) {
      setErr(describeError(e));
    } finally {
      setBusy(null);
    }
  }, [client, me, props.signTransaction]);

  const onEnter = () => {
    if (!market || !me) return;
    const v = parseUnits(amount, decimals);
    if (v === null || v <= 0n) { setErr(`${t.amount}?`); return; }
    if (live && w) {
      const why = client.checkEnter(live.market.account, w, v, slot);
      if (why) { setErr(why); return; }
    }
    void sendTx("enter", () => client.enter({ market, amount: v, owner: me }));
  };

  const quote = useMemo(() => {
    if (!live || !myEntry || !w || w.state !== WindowState.Settled) return null;
    return client.quoteSellBackSync(live.market.account, myEntry.account);
  }, [client, live, myEntry, w]);

  const onSellBack = () => {
    if (!myEntry || !me) return;
    void sendTx("sellBack", () => client.sellBack({ entry: myEntry.pubkey, owner: me }));
  };
  const onVerify = async () => {
    if (!window_) return;
    setVerifyMsg(null);
    try {
      const v = await client.verifyWindow(window_.pubkey);
      if (!v.ok) console.warn("PULLED verify", v);
      setVerifyMsg(v.ok ? t.verifyOk : t.verifyKo);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  // smallest / largest result of a settled window, as pro-rata multipliers
  const extremes = useMemo(() => {
    if (!w || w.state !== WindowState.Settled || entries.length === 0 || w.tokensOut === 0n) return null;
    let lo = Infinity, hi = -Infinity;
    for (const e of entries) {
      const m = multiplierOf(e.account.share, e.account.amount, w.totalAmount, w.tokensOut);
      if (m < lo) lo = m;
      if (m > hi) hi = m;
    }
    return { lo, hi };
  }, [entries, w]);

  const beforeDraw = !w || w.state === WindowState.Open || w.state === WindowState.Sealed;

  /* ------------------------------ render ------------------------------ */

  const rootStyle: CSSProperties = { ...(props.style ?? {}) };

  return (
    <div className={`pw-root ${props.className ?? ""}`} style={rootStyle} data-mint={props.mint} data-host={props.host}>
      <div className="pw-h">
        <span className="pw-title">{live?.market.account.name || t.loading}</span>
        <span className="pw-muted">{live?.market.account.symbol}{w ? ` · #${w.index.toString()}` : ""}</span>
      </div>

      {beforeDraw && <p className="pw-law">{t.conserved}</p>}

      {!live && <p className="pw-muted">{t.loading}</p>}
      {live && !w && <p className="pw-muted">{t.noWindow}</p>}

      {w && w.state === WindowState.Open && (
        <div>
          <div className="pw-muted">{t.open} · {t.closesIn}</div>
          <div className="pw-count">
            {Math.max(0, slotsLeft)} <small>{t.slots} · {t.about} {secondsLeft} {t.seconds}</small>
          </div>
          <div className="pw-muted" style={{ marginTop: 6 }}>
            {w.entryCount} {t.entries} · {t.total} {fmtUnits(w.totalAmount, decimals)}
          </div>
          <EntryList entries={entries} me={me} decimals={decimals} t={t} />
          {!props.readOnly && (
            canWrite ? (
              <div className="pw-row">
                <input className="pw-input" inputMode="decimal" placeholder={t.amount} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!!busy} />
                <button className="pw-btn" onClick={onEnter} disabled={!!busy}>{busy === "enter" ? t.pending : t.enter}</button>
              </div>
            ) : (
              <p className="pw-muted" style={{ marginTop: 10 }}>{t.connect}</p>
            )
          )}
        </div>
      )}

      {w && w.state === WindowState.Sealed && (
        <div className="pw-beat">
          <div className="pw-muted">1 / 3</div>
          <div>{t.beat1}</div>
          <div className="pw-muted" style={{ marginTop: 6 }}>{w.entryCount} {t.entries} · {t.total} {fmtUnits(w.totalAmount, decimals)}</div>
        </div>
      )}

      {w && (w.state === WindowState.Drawn || w.state === WindowState.Tallied) && (
        <div>
          <div className="pw-beat">
            <div className="pw-muted">2 / 3</div>
            <div>{t.beat2}</div>
            <div className="pw-seed">{hex(w.seed).slice(0, 32)}…</div>
          </div>
          {myEntry && myEntry.account.index < w.tallyCursor && (
            <div className="pw-beat pw-me">
              <div className="pw-muted">3 / 3</div>
              <div>{t.beat3}</div>
              <div className="pw-big">{myEntry.account.roll.toString()} <small className="pw-muted">/ 10000</small></div>
            </div>
          )}
          {w.state === WindowState.Tallied && <p className="pw-muted" style={{ marginTop: 8 }}>{t.tallying}</p>}
        </div>
      )}

      {w && w.state === WindowState.Settled && (
        <div>
          {myEntry ? (
            <div className="pw-beat pw-me">
              <div className="pw-muted">{t.beat3} {myEntry.account.roll.toString()} / 10000</div>
              <div>{t.yourShare}</div>
              <div className="pw-big">{fmtUnits(myEntry.account.share, 6, 2)} <small className="pw-muted">{t.tokens}</small></div>
              <div className="pw-muted">
                {"×"}{multiplierOf(myEntry.account.share, myEntry.account.amount, w.totalAmount, w.tokensOut).toFixed(3)} {t.multiplier}
              </div>
              {canWrite && quote && quote.tokens > 0n && (
                <div className="pw-row">
                  <button className="pw-btn" onClick={onSellBack} disabled={!!busy}>
                    {busy === "sellBack" ? t.pending : `${t.sellBack} ${fmtUnits(quote.quoteOut, decimals, 6)}`}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="pw-muted">{me ? t.noEntry : t.settledNoShare}</p>
          )}
          {extremes && (
            <div className="pw-pair">
              <div><div className="pw-muted">{t.worst}</div><div className="pw-v">{"×"}{extremes.lo.toFixed(3)}</div></div>
              <div><div className="pw-muted">{t.best}</div><div className="pw-v">{"×"}{extremes.hi.toFixed(3)}</div></div>
            </div>
          )}
          <EntryList entries={entries} me={me} decimals={decimals} t={t} showShare />
          <div className="pw-row">
            <button className="pw-btn pw-sec" onClick={() => void onVerify()}>{t.verify}</button>
            {verifyMsg && <span className="pw-muted">{verifyMsg}</span>}
          </div>
        </div>
      )}

      {w && w.state === WindowState.Refunding && (
        <div className="pw-beat">
          <div>{t.refunding}</div>
          <EntryList entries={entries} me={me} decimals={decimals} t={t} showRefund />
        </div>
      )}

      {sig && <div className="pw-muted" style={{ marginTop: 8 }}>{t.sent}: {sig.slice(0, 12)}…</div>}
      {err && (
        <div className="pw-err">
          <strong>{t.error}:</strong> {err}{" "}
          <button className="pw-btn pw-sec" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => setErr(null)}>{t.retry}</button>
        </div>
      )}
      <div className="pw-foot">
        {props.readOnly ? `${t.readOnly} ` : ""}{t.slotNote}
      </div>
    </div>
  );
}

function EntryList(props: { entries: Keyed<Entry>[]; me: PublicKey | null; decimals: number; t: Dict; showShare?: boolean; showRefund?: boolean }): ReactElement {
  const shown = props.entries.slice(-12);
  return (
    <ul className="pw-list">
      {shown.map((e) => {
        const mine = props.me ? e.account.owner.equals(props.me) : false;
        return (
          <li key={e.account.index} className={mine ? "pw-mine" : "pw-other"}>
            <span>#{e.account.index} {mine ? props.t.you : shortKey(e.account.owner)}</span>
            <span>
              {fmtUnits(e.account.amount, props.decimals)}
              {props.showShare ? ` → ${fmtUnits(e.account.share, 6, 2)}` : ""}
              {props.showRefund && e.account.refunded ? ` · ${props.t.refunded}` : ""}
            </span>
          </li>
        );
      })}
      {props.entries.length > shown.length && (
        <li className="pw-other"><span>…</span><span>{props.entries.length - shown.length}</span></li>
      )}
    </ul>
  );
}

export default PullWindow;
