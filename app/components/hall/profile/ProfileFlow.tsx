"use client";

/**
 * The check-in sheet (v21.1, §7.15): a charcoal plate on the right over the
 * dimmed hall that stops at the rail. Three step tokens (1 Wallet, 2
 * Character, 3 Seat). Esc closes; focus stays inside while it is open; the
 * one main key is sticky at the bottom.
 */
import dynamic from "next/dynamic";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../../i18n/client";
import { DATA_SOURCE } from "../../../lib/data";
import { GENESIS_CAP, SCARVES, SPECIES, checkNickname, cleanNickname, formatGenesis, getNick, listLocalProfiles, scarfHex, scarfIdOf, shortPubkey, type Species } from "../../../lib/profile";
import { CHAT_SOURCE, roomNicknameOk } from "../../../lib/chat";
import { formatInt } from "../../../lib/format";
import { HIcon } from "../../ui/icons";
import { Arr, Mark } from "../../ui/house";
import { useLiveOptional } from "../../live/LiveProvider";
import { portraitUrl } from "../pets";
import { useProfile } from "./ProfileProvider";
import { thumbUrl } from "./thumb";

const PetPicker = dynamic(() => import("./PetPicker"), { ssr: false });
const GET: Record<string, string> = { Phantom: "https://phantom.com/download", Solflare: "https://solflare.com/download", Backpack: "https://backpack.app/downloads" };

export function ProfileFlow() {
  const { modal, close } = useProfile();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!modal) return;
    const prev = document.activeElement as HTMLElement | null;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", k);
    // the first focus is the sheet's heading: nothing looks chosen before the viewer chooses (the brass ring stays for the keyboard)
    window.setTimeout(() => ref.current?.querySelector<HTMLElement>("#checkin-title")?.focus({ preventScroll: true }), 30);
    return () => { document.removeEventListener("keydown", k); prev?.focus?.(); };
  }, [modal, close]);
  if (!modal) return null;
  return (
    <>
      <div className="sheet-backdrop" onMouseDown={close} aria-hidden="true" />
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
        {modal === "wallet" ? <WalletStep /> : <CharacterStep />}
      </div>
    </>
  );
}

function StepLine({ at }: { at: 1 | 2 | 3 }) {
  const t = useT();
  return (
    <p className="steps-line" aria-label={t("h.ci.stepOf", { k: at })}>
      {([1, 2, 3] as const).map((k) => (
        <span key={k} className={`stp ${k === at ? "on" : k < at ? "done" : ""}`} aria-current={k === at ? "step" : undefined}>
          {k < at ? <HIcon name="check" size={14} /> : null}{k} {t(`h.steps.${k}`)}
        </span>
      ))}
    </p>
  );
}

/** A portrait that keeps its previous image until the next one is decoded (no empty squares on a scarf change). */
function Portrait({ src, size }: { src: string; size: number }) {
  const [shown, setShown] = useState(src);
  useEffect(() => {
    if (src === shown) return;
    let alive = true;
    const img = new Image();
    img.src = src;
    img.decode().then(() => { if (alive) setShown(src); }).catch(() => { if (alive) setShown(src); });
    return () => { alive = false; };
  }, [src, shown]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={shown} alt="" width={size} height={size} decoding="async" />;
}

function WalletStep() {
  const t = useT();
  const { wallets, select, connect, wallet, connecting, connected, publicKey } = useWallet();
  const { connectDemo, close, pubkey, walletName, disconnect, openProfile } = useProfile();
  const [err, setErr] = useState<string | null>(null);
  const asked = useRef<string | null>(null);
  const installed = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);
  const others = wallets.filter((w) => !installed.includes(w));
  const known = ["Phantom", "Solflare", "Backpack"].filter((n) => !wallets.some((w) => w.adapter.name === n));
  // the next step's twelve portraits, fetched while the viewer picks a wallet
  useEffect(() => { for (const sp of SPECIES) { const i = new Image(); i.src = thumbUrl(sp, "saffron"); } }, []);

  useEffect(() => {
    if (!wallet || connected || connecting || asked.current !== wallet.adapter.name) return;
    asked.current = null;
    connect().catch((e: unknown) => {
      const m = e instanceof Error ? e.message : String(e);
      setErr(/reject|closed|cancel|denied/i.test(m) ? t("h.wal.errClosed") : t("h.wal.errClosed"));
    });
  }, [wallet, connected, connecting, connect, t]);
  const pick = (name: WalletName) => { setErr(null); asked.current = name; select(name); };

  return (
    <>
      <button type="button" className="icon-btn round x" aria-label={t("h.close")} onClick={close}><HIcon name="close" /></button>
      <div className="scroll">
        <StepLine at={1} />
        <h2 id="checkin-title" className="display-m" tabIndex={-1}>{t("h.wal.title")}</h2>
        {pubkey ? (
          <div className="grid gap-1" role="status">
            <p className="ui">{t("h.wal.connected", { key: shortPubkey(publicKey?.toBase58() ?? pubkey), wallet: walletName ?? "" })} ✓</p>
            <div><button type="button" className="key sec xs" onClick={disconnect}>{t("h.me.disconnect")}</button></div>
          </div>
        ) : null}
        <div className="wal-rows">
          {installed.map((w) => (
            <button key={w.adapter.name} type="button" className="wal-row" onClick={() => pick(w.adapter.name)} disabled={connecting}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {w.adapter.icon ? <img src={w.adapter.icon} alt="" width={28} height={28} /> : null}
              <span className="nm">{w.adapter.name}</span>
              <span className="label">{connecting && wallet?.adapter.name === w.adapter.name ? t("h.wal.connecting") : t("h.wal.installed")}</span>
            </button>
          ))}
          {others.map((w) => (
            <a key={w.adapter.name} className="wal-row" href={w.adapter.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {w.adapter.icon ? <img src={w.adapter.icon} alt="" width={28} height={28} /> : null}
              <span className="nm">{w.adapter.name}</span>
              <span className="label go">{t("h.wal.getIt")}<Arr ch="↗" /></span>
            </a>
          ))}
          {installed.length === 0 ? known.map((n) => (
            <a key={n} className="wal-row" href={GET[n]} target="_blank" rel="noreferrer">
              <span className="nm">{n}</span>
              <span className="label go">{t("h.wal.getIt")}<Arr ch="↗" /></span>
            </a>
          )) : null}
          {DATA_SOURCE === "demo" ? (
            <button type="button" className="wal-row" onClick={() => { setErr(null); connectDemo(); }}>
              <span className="mk" aria-hidden="true"><Mark size={20} /></span>
              <span className="nm">{t("h.wal.demoName")}</span>
              <span className="label">{t("h.wal.demoNote")}</span>
            </button>
          ) : null}
        </div>
        <p className="body" style={{ fontSize: 15 }}>{t("h.wal.body")}</p>
        {installed.length === 0 ? <p className="fine">{t("h.wal.howGet")}</p> : null}
        <p className="fine">{t("h.wal.foot")}</p>
      </div>
      <div className="bottom">
        <button type="button" className="key cream wide" aria-disabled={!pubkey || undefined} onClick={() => { if (pubkey) openProfile(); }}>{t("h.wal.continue")}</button>
        <p className={`reason ${err ? "bad" : ""}`} aria-live="polite">{err ?? (!pubkey ? t("h.wal.pick") : "")}</p>
      </div>
    </>
  );
}

function CharacterStep() {
  const t = useT();
  const { profile, pubkey, close, createProfile, nextOrdinal, storageOk, demoWallet } = useProfile();
  const w = useLiveOptional()?.w ?? null;
  const [species, setSpecies] = useState<Species>(profile?.species ?? "fox");
  const [scarf, setScarf] = useState<string>(profile ? scarfIdOf(profile.scarf) : "saffron");
  const [nick, setNickV] = useState(profile?.nickname ?? "");
  const [hover, setHover] = useState<Species | null>(null);
  const [cheer, setCheer] = useState(0);
  const [ordinal, setOrdinal] = useState<number | null>(profile?.ordinal ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [gl, setGl] = useState(true);
  const [petReady, setPetReady] = useState(false);
  const grid = useRef<Array<HTMLButtonElement | null>>([]);
  /** an existing character opened from the plate: editing it, not checking in again */
  const editing = !!profile;

  useEffect(() => { if (!profile) setNickV(cleanNickname(getNick())); }, [profile]);
  useEffect(() => { if (!profile) void nextOrdinal().then(setOrdinal); }, [profile, nextOrdinal]);
  useEffect(() => { try { const c = document.createElement("canvas"); setGl(!!(c.getContext("webgl2") || c.getContext("webgl"))); } catch { setGl(false); } }, []);

  const taken = useMemo(() => {
    const names = new Set<string>();
    w?.entries.forEach((e) => { if (!e.mine) names.add(e.label); });
    listLocalProfiles().forEach((p) => { if (p.pubkey !== pubkey) names.add(p.nickname); });
    return names;
  }, [w, pubkey]);
  const state = checkNickname(nick, (n) => DATA_SOURCE === "demo" && taken.has(n));
  const roomWarn = CHAT_SOURCE === "live" && state === "ok" && !roomNicknameOk(nick);
  const bad = { short: t("h.prof.short"), chars: t("h.prof.chars"), reserved: t("h.prof.reserved"), taken: t("h.prof.taken"), empty: "", ok: "" }[state];
  const genesis = profile?.genesis ?? (ordinal !== null && ordinal <= GENESIS_CAP ? ordinal : null);
  const scarfColor = scarfHex(scarf);
  const disabled = state !== "ok" || busy;

  const submit = async () => {
    if (disabled) return;
    setBusy(true); setErr(null);
    const r = await createProfile({ nickname: nick, species, scarf: scarfColor, hat: "none" }, { seat: !editing });
    setBusy(false);
    if (r === "refused") setErr(t("h.prof.refused"));
  };
  const onGridKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? 4 : e.key === "ArrowUp" ? -4 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + SPECIES.length) % SPECIES.length;
    setSpecies(SPECIES[j]!); setCheer((c) => c + 1);
    grid.current[j]?.focus();
  };

  return (
    <>
      <button type="button" className="icon-btn round x" aria-label={t("h.close")} onClick={close}><HIcon name="close" /></button>
      <div className="scroll">
        {editing ? <p className="label" style={{ paddingRight: 48 }}>{t("h.prof.editFolio")}</p> : <StepLine at={2} />}
        <h2 id="checkin-title" className="display-m" tabIndex={-1}>{t("h.prof.title")}</h2>
        <div className="pick">
          <div>
            <div className="pedestal">
              {/* the selected portrait holds the felt well until the 3D pet has loaded */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={`ped-still ${gl && petReady ? "gone" : ""}`} src={portraitUrl(hover ?? species, scarf)} alt="" />
              {gl ? <PetPicker species={hover ?? species} scarf={scarfColor} dance={!!hover} cheer={cheer} onReady={() => setPetReady(true)} /> : null}
            </div>
            <p className="label ped-cap">{gl ? t("h.prof.dragSpecies", { species: hover ?? species }) : hover ?? species}</p>
          </div>
          <div className="species" role="radiogroup" aria-label={t("h.prof.title")}>
            {SPECIES.map((s, i) => (
              <button key={s} ref={(el) => { grid.current[i] = el; }} type="button" role="radio" aria-checked={s === species} aria-label={s} tabIndex={s === species ? 0 : -1}
                onClick={() => { setSpecies(s); setCheer((c) => c + 1); }} onKeyDown={(e) => onGridKey(e, i)} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(null)}>
                <Portrait src={thumbUrl(s, scarf)} size={60} />
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3">
          <span className="title" style={{ fontSize: 15 }}>{t("h.prof.scarf")}</span>
          <div className="swatches" role="radiogroup" aria-label={t("h.prof.scarf")}>
            {SCARVES.map((s) => <button key={s.id} type="button" role="radio" aria-checked={scarf === s.id} aria-label={s.id} style={{ ["--pc" as string]: s.hex }} onClick={() => setScarf(s.id)} />)}
          </div>
        </div>
        <div className={`ufield ${bad ? "bad" : ""}`}>
          <label htmlFor="prof-nick" className="title" style={{ fontSize: 15 }}>{t("h.prof.nick")}</label>
          <div className="well">
            <input id="prof-nick" value={nick} maxLength={16} spellCheck={false} autoComplete="nickname" placeholder={t("h.play.placeholder")} onChange={(e) => setNickV(cleanNickname(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} aria-describedby="prof-help prof-state" aria-invalid={bad ? true : undefined} />
            {state === "ok" ? <span className="avail">{DATA_SOURCE === "demo" ? t("h.prof.ok") : t("h.prof.okChain")}</span> : null}
          </div>
          <span id="prof-help" className="help">{t("h.prof.help")}</span>
          <span id="prof-state" aria-live="polite">
            {bad ? <span className="reason bad">{bad}</span> : null}
            {roomWarn ? <span className="reason">{t("h.prof.roomWarn")}</span> : null}
          </span>
        </div>
        {genesis !== null ? (
          <div className="gen-block">
            <span className="label">{t("h.prof.genesisFolio")}</span>
            <span className="num-l">{formatGenesis(genesis).replace(/^#/, "No. ")}</span>
            <p className="fine">{t("h.prof.genesisNote")}</p>
          </div>
        ) : ordinal !== null ? <p className="fine">{t("h.prof.genesisFull", { ordinal: formatInt(ordinal) })}</p> : null}
        {!storageOk ? <p className="fine" role="status">{t("h.prof.memory")}</p> : null}
      </div>
      <div className="bottom">
        <button type="button" className={`key main wide ${busy && !demoWallet ? "busy" : ""}`} aria-disabled={disabled || undefined} onClick={() => void submit()}>{busy && !demoWallet ? t("h.dock.waiting") : editing ? t("h.prof.save") : t("h.prof.cta")}</button>
        <p className={`${err ? "reason bad" : "fine"}`} aria-live="polite">{err ?? (state !== "ok" ? t("h.prof.needNick") : editing ? t("h.prof.saveNote") : t("h.prof.ctaNote"))}</p>
      </div>
    </>
  );
}
