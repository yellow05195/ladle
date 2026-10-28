/**
 * The mute list: a plain text file, one entry per line, reloaded when it
 * changes (polled, so it works the same on every OS and on network disks).
 *
 *   # comments and blank lines are ignored
 *   7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU     a wallet: can read, cannot talk
 *   ip:203.0.113.7                                   an address: no talk from it
 *
 * Muting is about talk only: a muted wallet still sees the room.
 */
import { readFileSync, unwatchFile, watchFile } from "node:fs";

export class MuteList {
  private wallets = new Set<string>();
  private ips = new Set<string>();
  private readonly file: string | null;
  private readonly onReload: (n: number) => void;
  private watching = false;

  constructor(file: string | null, onReload: (n: number) => void = () => {}) {
    this.file = file;
    this.onReload = onReload;
    this.load();
  }

  load(): void {
    if (!this.file) return;
    let text = "";
    try { text = readFileSync(this.file, "utf8"); } catch { /* no file yet: nobody is muted */ }
    const wallets = new Set<string>(), ips = new Set<string>();
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, "").trim();
      if (!line) continue;
      if (line.startsWith("ip:")) ips.add(line.slice(3).trim());
      else wallets.add(line.split(/\s+/)[0]!);
    }
    this.wallets = wallets;
    this.ips = ips;
    this.onReload(wallets.size + ips.size);
  }

  watch(intervalMs = 2000): void {
    if (!this.file || this.watching) return;
    this.watching = true;
    watchFile(this.file, { interval: intervalMs, persistent: false }, (cur, prev) => {
      if (cur.mtimeMs !== prev.mtimeMs || cur.size !== prev.size) this.load();
    });
  }

  close(): void {
    if (this.file && this.watching) unwatchFile(this.file);
    this.watching = false;
  }

  isMuted(wallet: string | null, ip: string): boolean {
    return (wallet !== null && this.wallets.has(wallet)) || this.ips.has(ip);
  }

  get size(): number { return this.wallets.size + this.ips.size; }
}
