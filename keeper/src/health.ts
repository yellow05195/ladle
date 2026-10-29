/**
 * `GET /health` for uptime checks: 200 with a small JSON body when the keeper
 * is ticking (and funded), 503 with the reasons otherwise. Bind it to
 * 127.0.0.1 and expose it through the TLS proxy (deploy/Caddyfile).
 */
import { createServer, type Server } from "node:http";

export interface HealthReport {
  ok: boolean;
  reasons: string[];
  [k: string]: unknown;
}

export function startHealthServer(host: string, port: number, report: () => HealthReport): Promise<Server> {
  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if ((req.method === "GET" || req.method === "HEAD") && path === "/health") {
      const r = report();
      res.writeHead(r.ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify(r));
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => { server.off("error", reject); resolve(server); });
  });
}
