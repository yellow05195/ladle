"use client";

/**
 * Who is here (v20): the connected wallet (Wallet Standard through the
 * wallet adapter, or the demo wallet in demo mode), the profile kept for it
 * in this browser, and the three-step flow "1 Wallet · 2 Profile · 3 Seat".
 * A profile is made by signing a plain message: no transaction, no fee.
 */
import { useWallet } from "@solana/wallet-adapter-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DATA_SOURCE, getHistorySource } from "../../../lib/data";
import {
  GENESIS_CAP, demoWalletKey, genesisAvailable, loadProfile, profileMessage, randomHex, saveProfile, storageWorks,
  type Hat, type Profile, type Species,
} from "../../../lib/profile";
import { hall } from "../store";
import { chatProfileOf, setChatProfile, setChatSigner } from "../../../lib/chat";

export type Modal = null | "wallet" | "profile";

interface Ctx {
  pubkey: string | null;
  walletName: string | null;
  demoWallet: boolean;
  profile: Profile | null;
  modal: Modal;
  storageOk: boolean;
  /** Opens the flow at the step the viewer needs (wallet, profile or straight to the seat). */
  takeSeat(): void;
  openProfile(): void;
  close(): void;
  connectDemo(): void;
  disconnect(): void;
  /** `seat: false` saves an edit of an existing character without walking to the seat again. */
  createProfile(p: { nickname: string; species: Species; scarf: string; hat: Hat }, opts?: { seat?: boolean }): Promise<"ok" | "refused">;
  /** what the next profile's Genesis number would be (null when there is no count) */
  nextOrdinal(): Promise<number | null>;
}

const C = createContext<Ctx | null>(null);
const DEMO_KEY = "ladle.demoConnected";

function sessionFlag(k: string, v?: boolean): boolean {
  try {
    if (v === undefined) return window.sessionStorage.getItem(k) === "1";
    if (v) window.sessionStorage.setItem(k, "1"); else window.sessionStorage.removeItem(k);
  } catch { /* refused */ }
  return !!v;
}

function bytesToBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return btoa(s);
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const router = useRouter();
  const pathname = usePathname();
  const [demoKey, setDemoKey] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [storageOk, setStorageOk] = useState(true);
  const wantSeat = useRef(false);

  const adapterKey = wallet.publicKey?.toBase58() ?? null;
  const pubkey = adapterKey ?? demoKey;
  const demoWallet = !adapterKey && !!demoKey;

  useEffect(() => {
    setStorageOk(storageWorks());
    if (DATA_SOURCE === "demo" && sessionFlag(DEMO_KEY)) setDemoKey(demoWalletKey());
  }, []);

  useEffect(() => {
    setProfile(pubkey ? loadProfile(pubkey) : null);
    const on = () => setProfile(pubkey ? loadProfile(pubkey) : null);
    window.addEventListener("ladle:profile", on);
    return () => window.removeEventListener("ladle:profile", on);
  }, [pubkey]);

  const goSeat = useCallback((p: Profile) => {
    void p;
    setModal(null);
    hall.set((s) => ({ shot: "seat", arriving: performance.now(), wave: s.wave + 1, paused: false }));
    if (pathname !== "/play") { router.push("/play?seat=1"); return; }
    // /play?watch=1 (the home's "Watch a round", the footer): taking a seat drops the watch flag, or the room would keep watching
    const q = new URLSearchParams(window.location.search);
    if (q.get("watch") === "1") { q.delete("watch"); q.set("seat", "1"); router.replace(`/play?${q.toString()}`); }
    window.dispatchEvent(new CustomEvent("ladle:seated"));
  }, [pathname, router]);

  // once the wallet connects inside the flow: the profile step, or straight to the seat
  useEffect(() => {
    if (!wantSeat.current || !pubkey) return;
    const p = loadProfile(pubkey);
    if (p) { wantSeat.current = false; goSeat(p); }
    else setModal("profile");
  }, [pubkey, goSeat]);

  useEffect(() => { hall.set({ paused: modal === "profile" }); }, [modal]);

  // v21: who talks in the room, and how their wallet signs (the demo wallet signs nothing)
  useEffect(() => { setChatProfile(profile ? chatProfileOf(profile) : null); }, [profile]);
  const signMessage = wallet.signMessage;
  useEffect(() => { setChatSigner(!demoWallet && signMessage ? (m: Uint8Array) => signMessage(m) : null); }, [demoWallet, signMessage]);

  const takeSeat = useCallback(() => {
    wantSeat.current = true;
    if (!pubkey) { setModal("wallet"); return; }
    const p = loadProfile(pubkey);
    if (!p) { setModal("profile"); return; }
    wantSeat.current = false;
    goSeat(p);
  }, [pubkey, goSeat]);

  const nextOrdinal = useCallback(async () => {
    if (!genesisAvailable(DATA_SOURCE)) return null;
    const g = await getHistorySource()?.getGenesis().catch(() => null);
    return g ? g.claimed + 1 : null;
  }, []);

  const createProfile = useCallback(async (p: { nickname: string; species: Species; scarf: string; hat: Hat }, opts?: { seat?: boolean }) => {
    if (!pubkey) return "refused" as const;
    const issued = new Date().toISOString();
    const message = profileMessage({ pubkey, nickname: p.nickname, species: p.species, scarf: p.scarf, hat: p.hat, issued, nonce: randomHex(8) });
    let signature: string | null = null;
    if (!demoWallet && wallet.signMessage) {
      try { signature = bytesToBase64(await wallet.signMessage(new TextEncoder().encode(message))); }
      catch { return "refused" as const; }
    }
    const prev = loadProfile(pubkey);
    const ordinal = prev?.ordinal ?? (await nextOrdinal());
    const prof: Profile = {
      v: 1, pubkey, nickname: p.nickname, species: p.species, scarf: p.scarf, hat: p.hat,
      genesis: prev?.genesis ?? (ordinal !== null && ordinal <= GENESIS_CAP ? ordinal : null),
      ordinal, createdAt: prev?.createdAt ?? issued, message, signature, source: DATA_SOURCE,
    };
    saveProfile(prof);
    setProfile(prof);
    wantSeat.current = false;
    if (opts?.seat === false) { setModal(null); hall.set({ paused: false }); }
    else goSeat(prof);
    return "ok" as const;
  }, [pubkey, demoWallet, wallet, nextOrdinal, goSeat]);

  const value = useMemo<Ctx>(() => ({
    pubkey,
    walletName: adapterKey ? wallet.wallet?.adapter.name ?? null : demoKey ? "Demo wallet" : null,
    demoWallet,
    profile,
    modal,
    storageOk,
    takeSeat,
    openProfile: () => { wantSeat.current = false; setModal(pubkey ? "profile" : "wallet"); },
    close: () => { wantSeat.current = false; setModal(null); },
    connectDemo: () => { sessionFlag(DEMO_KEY, true); setDemoKey(demoWalletKey()); },
    disconnect: () => {
      sessionFlag(DEMO_KEY, false);
      setDemoKey(null);
      if (wallet.connected) void wallet.disconnect().catch(() => {});
      setProfile(null);
    },
    createProfile,
    nextOrdinal,
  }), [pubkey, adapterKey, wallet, demoKey, demoWallet, profile, modal, storageOk, takeSeat, createProfile, nextOrdinal]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useProfile(): Ctx {
  const c = useContext(C);
  if (!c) throw new Error("useProfile outside ProfileProvider");
  return c;
}
