import { createServer, type Server } from 'node:http';

export interface HealthState {
  startedAt: Date;
  ready: () => Promise<{ ok: boolean; checks: Record<string, string> }>;
  metrics: () => Promise<string>;
}

/** Internal-only HTTP endpoint (not published by Compose): /healthz and /metrics. */
export function startHealthServer(port: number, state: HealthState): Server {
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/healthz') {
        const r = await state.ready();
        res.writeHead(r.ok ? 200 : 503, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({ status: r.ok ? 'ok' : 'unavailable', ...r, startedAt: state.startedAt }),
        );
        return;
      }
      if (req.url === '/metrics') {
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
        res.end(await state.metrics());
        return;
      }
      res.writeHead(404).end();
    } catch {
      res.writeHead(500).end();
    }
  });
  server.listen(port, '0.0.0.0');
  return server;
}
