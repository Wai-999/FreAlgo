'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: '#000', color: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ maxWidth: 560, margin: '15vh auto', padding: 16 }}>
          <h1>FreAlgo is temporarily unavailable</h1>
          <p style={{ color: '#a6b2c3' }}>Please try again in a moment.</p>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: '0 16px' }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
