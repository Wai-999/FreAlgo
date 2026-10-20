import ipaddr from 'ipaddr.js';

/**
 * SSRF address policy: only globally routable unicast addresses may be fetched.
 * Loopback, private (RFC 1918 / ULA), link-local (incl. cloud metadata 169.254.169.254),
 * CGNAT, multicast, broadcast, documentation, benchmarking, reserved and translation ranges are
 * all refused. IPv4-mapped IPv6 addresses are unwrapped and checked as IPv4.
 */
export function isPublicAddress(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address.replace(/^\[|\]$/g, '').split('%')[0]!);
  } catch {
    return false;
  }
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) return isPublicAddress(v6.toIPv4Address().toString());
    return v6.range() === 'unicast';
  }
  const v4 = parsed as ipaddr.IPv4;
  if (v4.range() !== 'unicast') return false;
  // Ranges ipaddr.js reports as unicast but that are not globally routable.
  const extraBlocked: [string, number][] = [
    ['0.0.0.0', 8],
    ['192.0.0.0', 24], // IETF protocol assignments
    ['192.0.2.0', 24], // TEST-NET-1
    ['198.51.100.0', 24], // TEST-NET-2
    ['203.0.113.0', 24], // TEST-NET-3
    ['198.18.0.0', 15], // benchmarking
    ['240.0.0.0', 4], // reserved
  ];
  return !extraBlocked.some(([net, bits]) => v4.match(ipaddr.IPv4.parse(net), bits));
}

export function isIpLiteral(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '');
  return ipaddr.isValid(h);
}
