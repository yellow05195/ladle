/**
 * Alerts: a log line always, and a POST to a webhook when one is configured.
 *
 * The webhook body carries both `text` (Slack, Mattermost, most chat
 * webhooks) and `content` (Discord), plus the raw fields. A webhook that
 * fails is logged and never stops the keeper.
 */

export type AlarmEvent = "raise" | "repeat" | "clear";

/**
 * One condition that can be on or off (low balance, ticks failing). Raised
 * once when it turns on, repeated every `repeatMs` while it stays on, cleared
 * once when it turns off.
 */
export class Alarm {
  readonly name: string;
  private readonly repeatMs: number;
  private on = false;
  private lastSent = 0;

  constructor(name: string, repeatMs: number) {
    this.name = name;
    this.repeatMs = repeatMs;
  }

  get active(): boolean { return this.on; }

  update(active: boolean, now: number): AlarmEvent | null {
    if (active && !this.on) { this.on = true; this.lastSent = now; return "raise"; }
    if (active && this.repeatMs > 0 && now - this.lastSent >= this.repeatMs) { this.lastSent = now; return "repeat"; }
    if (!active && this.on) { this.on = false; return "clear"; }
    return null;
  }
}

export interface AlertPayload {
  level: "warn" | "info";
  alarm: string;
  event: AlarmEvent;
  text: string;
  keeper: string;
  cluster: string;
  ts: string;
  [k: string]: unknown;
}

/** POST the alert; resolves to an error message, or null when delivered. */
export async function postWebhook(url: string, payload: AlertPayload, timeoutMs = 5_000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, content: payload.text }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? null : `webhook answered ${res.status}`;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Lamports as a SOL string with up to 4 decimals (display only). */
export function sol(lamports: bigint | number): string {
  return (Number(lamports) / 1e9).toFixed(4).replace(/\.?0+$/, "");
}
