/**
 * Minimal RFC 9309 robots.txt evaluation for feed URLs.
 *  - Group selection: the group whose user-agent equals our product token (case-insensitive,
 *    RFC 9309 §2.2.1), else `*`. Substring matching would let unrelated short agents ("re", "ac")
 *    capture us.
 *  - Rule matching: longest matching path wins; on equal length, Allow wins. `*` and `$` supported.
 *  - Availability (RFC 9309 §2.3.1): 4xx => no restrictions; 5xx/unreachable => assume disallow.
 */

interface Rule {
  allow: boolean;
  pattern: string;
}

function parseGroups(txt: string): Map<string, Rule[]> {
  const groups = new Map<string, Rule[]>();
  let agents: string[] = [];
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) agents = [];
      agents.push(value.toLowerCase());
      for (const a of agents) if (!groups.has(a)) groups.set(a, []);
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'allow' || key === 'disallow') {
      for (const a of agents) groups.get(a)!.push({ allow: key === 'allow', pattern: value });
    }
  }
  return groups;
}

/** Limits keep a hostile robots.txt from causing pathological regex backtracking. */
const MAX_PATTERN_LENGTH = 512;
const MAX_WILDCARDS = 8;

function patternToRegex(pattern: string): RegExp | null {
  if (pattern.length > MAX_PATTERN_LENGTH || (pattern.match(/\*/g)?.length ?? 0) > MAX_WILDCARDS)
    return null;
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

export function isAllowedByRobots(
  robotsTxt: string,
  productToken: string,
  pathAndQuery: string,
): boolean {
  const groups = parseGroups(robotsTxt);
  const token = productToken.toLowerCase();
  const rules = groups.get(token) ?? groups.get('*') ?? [];
  let best: { len: number; allow: boolean } | null = null;
  for (const rule of rules) {
    if (rule.pattern === '') continue; // empty Disallow = allow all
    const re = patternToRegex(rule.pattern);
    if (!re || !re.test(pathAndQuery)) continue;
    const len = rule.pattern.length;
    if (!best || len > best.len || (len === best.len && rule.allow))
      best = { len, allow: rule.allow };
  }
  return best ? best.allow : true;
}

export type RobotsAvailability =
  { kind: 'ok'; body: string } | { kind: 'unavailable' } | { kind: 'unreachable' };

/** Converts a robots.txt fetch outcome into an allow/deny decision for one path. */
export function robotsDecision(
  availability: RobotsAvailability,
  productToken: string,
  path: string,
): boolean {
  if (availability.kind === 'unavailable') return true;
  if (availability.kind === 'unreachable') return false;
  return isAllowedByRobots(availability.body, productToken, path);
}

/** Product token used for robots matching, e.g. "FreAlgoFeedReader/0.1 (...)" -> "frealgofeedreader". */
export function productToken(userAgent: string): string {
  return (userAgent.split(/[/\s]/)[0] ?? userAgent).toLowerCase();
}
