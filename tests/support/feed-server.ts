import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/** Local HTTP server standing in for publishers. Routes can be swapped during a test. */
export async function startFeedServer() {
  const routes = new Map<string, Handler>();
  const hits = new Map<string, number>();
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!;
    hits.set(path, (hits.get(path) ?? 0) + 1);
    const handler = routes.get(path);
    if (!handler) {
      res.writeHead(404).end('not found');
      return;
    }
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    routes,
    hits,
    totalHits: () => [...hits.values()].reduce((a, b) => a + b, 0),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export function xml(body: string, opts: { etag?: string; status?: number } = {}): Handler {
  return (req, res) => {
    if (opts.etag && req.headers['if-none-match'] === opts.etag) {
      res.writeHead(304, { etag: opts.etag }).end();
      return;
    }
    res.writeHead(opts.status ?? 200, {
      'content-type': 'application/rss+xml; charset=utf-8',
      ...(opts.etag ? { etag: opts.etag } : {}),
    });
    res.end(body);
  };
}

export function redirect(location: string): Handler {
  return (_req, res) => {
    res.writeHead(302, { location }).end();
  };
}

export function status(code: number): Handler {
  return (_req, res) => {
    res.writeHead(code).end();
  };
}
