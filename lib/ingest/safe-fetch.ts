import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { promisify } from 'node:util';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import { Agent, request } from 'undici';
import { isIpLiteral, isPublicAddress } from './ip-policy';
import {
  badContentType,
  blocked,
  httpError,
  invalidUrl,
  network,
  timeout as timeoutError,
  tooLarge,
} from './errors';

/**
 * SSRF-hardened HTTP GET for publisher feeds.
 *
 *  - http/https only, no credentials in URLs, ports 80/443 (+ explicit allow-list)
 *  - hostnames resolved once per connection; the connection is pinned to the vetted addresses
 *    via a custom `lookup`, so DNS rebinding between check and connect is impossible
 *  - every redirect target is re-validated (max N hops); redirects to non-http(s) are refused
 *  - connect/header/body timeouts and a hard cap on compressed and decompressed size
 *  - conditional requests (ETag / If-Modified-Since)
 */

export interface SafeFetchOptions {
  userAgent: string;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  etag?: string | null;
  lastModified?: string | null;
  accept?: string;
  extraHeaders?: Record<string, string>;
  allowedPorts?: number[];
  /** Test seams. Production code never sets these. */
  resolve?: (hostname: string) => Promise<LookupAddress[]>;
  isAddressAllowed?: (address: string, hostname: string) => boolean;
}

export interface SafeFetchResult {
  status: number;
  notModified: boolean;
  finalUrl: string;
  body: string | null;
  bytes: number;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
}

const lookupAll = promisify(dnsLookup);
const BLOCKED_HOSTNAMES = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^metadata\./i,
];
const DEFAULT_PORTS = [80, 443];

export function assertFetchableUrl(raw: string, allowedPorts = DEFAULT_PORTS): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalidUrl(`Invalid URL: ${raw.slice(0, 200)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw blocked(`Protocol ${url.protocol} is not allowed`);
  }
  if (url.username || url.password) throw blocked('Credentials in URL are not allowed');
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (!allowedPorts.includes(port)) throw blocked(`Port ${port} is not allowed`);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.some((re) => re.test(host))) throw blocked(`Host ${host} is not allowed`);
  if (isIpLiteral(host) && !isPublicAddress(host)) {
    throw blocked(`Address ${host} is not publicly routable`);
  }
  return url;
}

function makeAgent(opts: SafeFetchOptions): Agent {
  const resolve =
    opts.resolve ?? ((hostname: string) => lookupAll(hostname, { all: true, verbatim: true }));
  const allowed = opts.isAddressAllowed ?? ((address: string) => isPublicAddress(address));

  // Signature compatible with net.connect's `lookup` (single and `all: true` variants).
  const lookup = (
    hostname: string,
    options: { all?: boolean; family?: number } | number,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    const all = typeof options === 'object' && options?.all === true;
    resolve(hostname)
      .then((addresses) => {
        if (!addresses.length)
          throw Object.assign(new Error(`No address for ${hostname}`), { code: 'ENOTFOUND' });
        // Refuse if ANY resolved address is non-public (mixed answers are an attack signal).
        const bad = addresses.find((a) => !allowed(a.address, hostname));
        if (bad) {
          throw Object.assign(new Error(`SSRF_BLOCKED: ${hostname} resolves to ${bad.address}`), {
            code: 'ESSRFBLOCKED',
          });
        }
        if (all) callback(null, addresses);
        else callback(null, addresses[0]!.address, addresses[0]!.family);
      })
      .catch((err: NodeJS.ErrnoException) => callback(err, all ? [] : '', 0));
  };

  return new Agent({
    connect: { timeout: opts.timeoutMs, lookup: lookup as never },
    headersTimeout: opts.timeoutMs,
    bodyTimeout: opts.timeoutMs,
    connections: 4,
    pipelining: 0,
  });
}

function detectCharset(buf: Buffer, contentType: string | null): string {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf-8';
  if (buf[0] === 0xff && buf[1] === 0xfe) return 'utf-16le';
  if (buf[0] === 0xfe && buf[1] === 0xff) return 'utf-16be';
  const fromHeader = contentType?.match(/charset\s*=\s*"?([\w.:-]+)/i)?.[1];
  const head = buf.subarray(0, 200).toString('latin1');
  const fromXml = head.match(/<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i)?.[1];
  return (fromXml ?? fromHeader ?? 'utf-8').toLowerCase();
}

export function decodeBody(buf: Buffer, contentType: string | null): string {
  const charset = detectCharset(buf, contentType);
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

function decompress(buf: Buffer, encoding: string | null, maxBytes: number): Buffer {
  const enc = (encoding ?? '').toLowerCase().trim();
  try {
    if (enc === 'gzip' || enc === 'x-gzip') return gunzipSync(buf, { maxOutputLength: maxBytes });
    if (enc === 'deflate') return inflateSync(buf, { maxOutputLength: maxBytes });
    if (enc === 'br') return brotliDecompressSync(buf, { maxOutputLength: maxBytes });
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE' ||
      /larger than/i.test(String(err))
    ) {
      throw tooLarge(`Decompressed body exceeds ${maxBytes} bytes`);
    }
    throw network(`Could not decode ${enc} body`);
  }
  return buf;
}

const ACCEPTABLE_TYPES = /xml|rss|atom|json|^text\//i;

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const allowedPorts = opts.allowedPorts ?? DEFAULT_PORTS;
  let url = assertFetchableUrl(rawUrl, allowedPorts);
  const agent = makeAgent(opts);
  try {
    for (let hop = 0; hop <= opts.maxRedirects; hop++) {
      const headers: Record<string, string> = {
        'user-agent': opts.userAgent,
        accept:
          opts.accept ??
          'application/rss+xml, application/atom+xml, application/rdf+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.1',
        'accept-encoding': 'gzip, deflate, br',
        ...opts.extraHeaders,
      };
      // Conditional headers apply to the original resource only.
      if (hop === 0 && opts.etag) headers['if-none-match'] = opts.etag;
      if (hop === 0 && opts.lastModified) headers['if-modified-since'] = opts.lastModified;

      let res: Awaited<ReturnType<typeof request>>;
      try {
        res = await request(url, {
          method: 'GET',
          headers,
          dispatcher: agent,
          signal: AbortSignal.timeout(opts.timeoutMs),
        });
      } catch (err) {
        const e = err as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
        const code = e.code ?? e.cause?.code;
        const message = `${e.message} ${e.cause?.message ?? ''}`;
        if (code === 'ESSRFBLOCKED' || /SSRF_BLOCKED/.test(message)) throw blocked(message.trim());
        if (
          e.name === 'TimeoutError' ||
          e.name === 'AbortError' ||
          /timeout/i.test(String(code)) ||
          code === 'UND_ERR_CONNECT_TIMEOUT'
        ) {
          throw timeoutError(`Timed out after ${opts.timeoutMs}ms`);
        }
        throw network(`${code ?? 'NETWORK'}: ${message.trim()}`.slice(0, 300));
      }

      const header = (name: string) => {
        const v = res.headers[name];
        return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
      };

      if (res.statusCode >= 300 && res.statusCode < 400 && res.statusCode !== 304) {
        await res.body.dump();
        const location = header('location');
        if (!location) throw httpError(res.statusCode);
        if (hop === opts.maxRedirects) throw blocked(`Too many redirects (>${opts.maxRedirects})`);
        url = assertFetchableUrl(new URL(location, url).toString(), allowedPorts);
        continue;
      }

      if (res.statusCode === 304) {
        await res.body.dump();
        return {
          status: 304,
          notModified: true,
          finalUrl: url.toString(),
          body: null,
          bytes: 0,
          contentType: null,
          etag: header('etag') ?? opts.etag ?? null,
          lastModified: header('last-modified') ?? opts.lastModified ?? null,
        };
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        await res.body.dump();
        throw httpError(res.statusCode);
      }

      const contentType = header('content-type');
      if (contentType && !ACCEPTABLE_TYPES.test(contentType)) {
        await res.body.dump();
        throw badContentType(`Unsupported content type: ${contentType}`);
      }
      const declared = Number(header('content-length') ?? '0');
      if (declared > opts.maxBytes) {
        await res.body.dump();
        throw tooLarge(`Declared length ${declared} exceeds ${opts.maxBytes} bytes`);
      }

      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const chunk of res.body) {
          size += (chunk as Buffer).length;
          if (size > opts.maxBytes) {
            res.body.destroy();
            throw tooLarge(`Body exceeds ${opts.maxBytes} bytes`);
          }
          chunks.push(chunk as Buffer);
        }
      } catch (err) {
        if ((err as { code?: string }).code === 'RESPONSE_TOO_LARGE') throw err;
        if (err instanceof Error && err.name === 'IngestError') throw err;
        throw timeoutError(`Body read failed: ${(err as Error).message}`.slice(0, 200));
      }
      const raw = decompress(Buffer.concat(chunks), header('content-encoding'), opts.maxBytes);
      return {
        status: res.statusCode,
        notModified: false,
        finalUrl: url.toString(),
        body: decodeBody(raw, contentType),
        bytes: raw.length,
        contentType,
        etag: header('etag'),
        lastModified: header('last-modified'),
      };
    }
    throw blocked('Redirect loop');
  } finally {
    await agent.close().catch(() => undefined);
  }
}
