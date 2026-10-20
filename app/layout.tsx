import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Intro } from '@/components/shell/intro';
import { SiteHeader } from '@/components/shell/site-header';
import { PREFERENCE_BOOT_SCRIPT } from '@/lib/preferences/schema';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'FreAlgo — Global News Explorer', template: '%s · FreAlgo' },
  description:
    'A personal, ad-free, algorithm-free global news explorer. Choose a country, filter transparently, and read the original publisher.',
  applicationName: 'FreAlgo',
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
  colorScheme: 'dark',
  interactiveWidget: 'resizes-content',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request nonce also opts every page into dynamic rendering (required for CSP).
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: PREFERENCE_BOOT_SCRIPT }}
        />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-surface-raised px-4 py-3 text-text focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to main content
        </a>
        <Intro />
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
