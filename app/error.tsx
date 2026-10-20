'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16"
    >
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-muted">
        This page could not be loaded. The news database may be temporarily unavailable.
        {error.digest ? ` Reference: ${error.digest}.` : ''}
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-md border border-border-strong px-4 hover:bg-surface"
        >
          Try again
        </button>
        <Link href="/" className="inline-flex min-h-11 items-center px-2">
          Go to the map
        </Link>
      </div>
    </main>
  );
}
