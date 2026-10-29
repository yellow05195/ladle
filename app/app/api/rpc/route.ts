/**
 * The site's RPC relay: the browser's JSON-RPC calls, forwarded from the
 * server. The public mainnet endpoint answers 403 to every browser request
 * (it refuses web origins), and a paid endpoint's key must not ship in the
 * page: here it stays a server secret.
 *
 *   NEXT_PUBLIC_RPC_URL=https://useladle.fun/api/rpc   the browser's RPC
 *   NEXT_PUBLIC_RPC_WS_URL=off                         no websocket: polls only (lib/data/cluster.ts)
 *   LADLE_RPC_UPSTREAM                                 server only: the endpoint called, a provider URL
 *                                                      with its key; the cluster's public one otherwise
 *
 * Only the methods the site and the wallets use pass (getProgramAccounts on
 * the Ladle program only), from the site's own origins, small bodies only:
 * not an open relay for anyone's heavy calls.
 */
import { CLUSTER, PROGRAM_ENV, PUBLIC_RPC } from "../../../lib/data/cluster";

const UPSTREAM = (process.env.LADLE_RPC_UPSTREAM ?? "").trim() || PUBLIC_RPC[CLUSTER];
const MAX_BODY = 64 * 1024;
const MAX_BATCH = 20;

const METHODS = new Set([
  "getAccountInfo", "getMultipleAccounts", "getProgramAccounts", "getBalance", "getSlot", "getBlockHeight", "getBlockTime",
  "getGenesisHash", "getLatestBlockhash", "isBlockhashValid", "getSignatureStatuses", "getSignaturesForAddress", "getTransaction",
  "sendTransaction", "simulateTransaction", "getFeeForMessage", "getRecentPrioritizationFees", "getMinimumBalanceForRentExemption",
  "getTokenAccountBalance", "getTokenAccountsByOwner", "getTokenSupply", "getEpochInfo", "getVersion", "getHealth",
]);

const ORIGINS = [/^https:\/\/(www\.)?useladle\.fun$/, /^https:\/\/ladle-[a-z0-9-]+\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const allowed = (origin: string | null) => origin === null || ORIGINS.some((re) => re.test(origin));

function cors(origin: string | null): Record<string, string> {
  return origin ? { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, solana-client", "access-control-max-age": "86400", vary: "origin" } : {};
}

type Call = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };

/** Why a call may not pass, or null. */
function refused(call: Call): string | null {
  if (typeof call.method !== "string" || !METHODS.has(call.method)) return `method not relayed: ${String(call.method)}`;
  if (call.method === "getProgramAccounts") {
    const program = Array.isArray(call.params) ? call.params[0] : undefined;
    if (!PROGRAM_ENV || program !== PROGRAM_ENV) return "getProgramAccounts is relayed for the Ladle program only";
  }
  return null;
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (!allowed(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: cors(origin) });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!allowed(origin)) return Response.json({ error: "origin not allowed" }, { status: 403 });
  const headers = { ...cors(origin), "cache-control": "no-store" };
  const text = await request.text();
  if (text.length > MAX_BODY) return Response.json({ error: "body too large" }, { status: 413, headers });
  let body: Call | Call[];
  try { body = JSON.parse(text) as Call | Call[]; } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, { status: 400, headers }); }
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > MAX_BATCH) return Response.json({ error: `1 to ${MAX_BATCH} calls per request` }, { status: 400, headers });
  for (const call of calls) {
    const why = refused(call);
    if (why) return Response.json({ jsonrpc: "2.0", id: call.id ?? null, error: { code: -32601, message: why } }, { status: 403, headers });
  }
  // the provider first; the cluster's public endpoint when it fails or throttles (a free plan's credits run out)
  const upstreams = UPSTREAM === PUBLIC_RPC[CLUSTER] ? [UPSTREAM] : [UPSTREAM, PUBLIC_RPC[CLUSTER]];
  for (const [i, url] of upstreams.entries()) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: text, cache: "no-store" });
      if ((res.status === 429 || res.status >= 500 || res.status === 401 || res.status === 403) && i < upstreams.length - 1) continue;
      return new Response(await res.text(), { status: res.status, headers: { ...headers, "content-type": "application/json" } });
    } catch { /* the next upstream */ }
  }
  return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "upstream RPC unreachable" } }, { status: 502, headers });
}
