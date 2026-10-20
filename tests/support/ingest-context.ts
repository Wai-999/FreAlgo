import { readFileSync } from 'node:fs';
import { isPublicAddress } from '@/lib/ingest/ip-policy';
import type { ProviderContext } from '@/workers/providers/types';
import type { PrismaClient } from '@/generated/prisma/client';

export const feedFixture = (name: string) => readFileSync(`tests/fixtures/feeds/${name}`, 'utf8');

/**
 * Test DNS: feeds.test / feeds2.test -> the local test server (explicitly allowed);
 * internal.test -> a private address; rebind.test -> mixed public + loopback answers.
 */
export function testProviderContext(
  port: number,
  overrides: Partial<ProviderContext> = {},
): ProviderContext {
  const local = new Set(['feeds.test', 'feeds2.test']);
  return {
    env: {},
    respectRobots: true,
    ...overrides,
    fetchOptions: {
      userAgent: 'FreAlgoFeedReader/0.1 (integration test)',
      timeoutMs: 3_000,
      maxBytes: 1_000_000,
      maxRedirects: 3,
      allowedPorts: [80, 443, port],
      resolve: async (host) => {
        if (local.has(host)) return [{ address: '127.0.0.1', family: 4 }];
        if (host === 'internal.test') return [{ address: '10.0.0.7', family: 4 }];
        if (host === 'rebind.test')
          return [
            { address: '93.184.216.34', family: 4 },
            { address: '127.0.0.1', family: 4 },
          ];
        throw Object.assign(new Error(`ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
      },
      isAddressAllowed: (address, host) =>
        (local.has(host) && address === '127.0.0.1') || isPublicAddress(address),
      ...overrides.fetchOptions,
    },
  };
}

let counter = 0;

export async function createTestSource(
  prisma: PrismaClient,
  opts: {
    url: string;
    countryIso2?: string;
    status?: 'ACTIVE' | 'PAUSED' | 'ERROR';
    kind?: 'RSS' | 'LICENSED_API';
    providerConfig?: object;
    defaultCountryIso2?: string[];
    excerptAllowed?: boolean;
  },
) {
  counter += 1;
  const country = await prisma.country.findUnique({ where: { iso2: opts.countryIso2 ?? 'MM' } });
  const outlet = await prisma.mediaOutlet.create({
    data: {
      name: `Integration Outlet ${counter}`,
      slug: `integration-outlet-${counter}-${Date.now()}`,
      homepageUrl: 'https://feeds.test/',
      countryId: country?.id ?? null,
      primaryLanguage: 'en',
      isFixture: true,
    },
  });
  // FeedSource.url is unique; the test server routes on path only, so a query keeps URLs distinct.
  const url = opts.url.startsWith('http')
    ? `${opts.url}${opts.url.includes('?') ? '&' : '?'}n=${counter}`
    : opts.url;
  return prisma.feedSource.create({
    data: {
      outletId: outlet.id,
      url,
      kind: opts.kind ?? 'RSS',
      status: opts.status ?? 'ACTIVE',
      defaultCountryIso2: opts.defaultCountryIso2 ?? [],
      excerptAllowed: opts.excerptAllowed ?? true,
      providerConfig: opts.providerConfig ?? undefined,
      isFixture: true,
    },
  });
}
