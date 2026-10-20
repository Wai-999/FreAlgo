import { createHash } from 'node:crypto';

/**
 * URL canonicalization used for deduplication (canonicalUrlHash).
 *
 * Conservative by design: only transformations that cannot change which resource a publisher
 * serves are applied. Paths are kept verbatim (trailing slashes and case can be significant).
 */

/** Query parameters that only carry campaign/tracking state. Matched case-insensitively. */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'yclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  'ocid',
  'cmpid',
  'cmp',
  'ito',
  'ns_mchannel',
  'ns_source',
  'ns_campaign',
  'ns_linkname',
  'ns_fee',
  'at_medium',
  'at_campaign',
  'at_custom1',
  'at_custom2',
  'at_custom3',
  'at_custom4',
  'ref_src',
  'ref_url',
  'rss',
  'feed',
  'from_rss',
  'source_rss',
  'smid',
  'xtor',
  'spm',
  '_ga',
  '_gl',
  'vero_id',
  'oly_enc_id',
  'oly_anon_id',
  'wt_mc',
  'wt.mc_id',
  'cid_source',
]);

const TRACKING_PREFIXES = ['utm_', 'pk_', 'piwik_', 'hsa_', 'mtm_'];

export class InvalidArticleUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidArticleUrlError';
  }
}

function isTrackingParam(name: string): boolean {
  const n = name.toLowerCase();
  return TRACKING_PARAMS.has(n) || TRACKING_PREFIXES.some((p) => n.startsWith(p));
}

export function canonicalizeUrl(input: string, base?: string): string {
  let url: URL;
  try {
    url = new URL(input.trim(), base);
  } catch {
    throw new InvalidArticleUrlError(`Not a valid URL: ${input.slice(0, 200)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidArticleUrlError(`Unsupported protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new InvalidArticleUrlError('Credentials in article URLs are not allowed');
  }

  // WHATWG URL already lower-cases scheme/host, applies punycode and drops default ports.
  url.hash = '';
  url.hostname = url.hostname.replace(/\.$/, '');

  const kept = [...url.searchParams.entries()].filter(([k]) => !isTrackingParam(k));
  kept.sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  url.search = '';
  for (const [k, v] of kept) url.searchParams.append(k, v);

  if (url.pathname === '') url.pathname = '/';
  return url.toString();
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function canonicalUrlHash(canonicalUrl: string): string {
  return sha256Hex(canonicalUrl);
}
