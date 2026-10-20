'use client';

import { useEffect } from 'react';

function skip() {
  document.documentElement.dataset.intro = 'skip';
}

export function IntroSkipButton() {
  useEffect(() => {
    if (document.documentElement.dataset.intro !== 'play') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    // Remove the overlay from the accessibility tree/hit-testing once the CSS animation ends.
    const timer = window.setTimeout(skip, 1600);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={skip}
      className="absolute right-4 bottom-[max(1.5rem,env(safe-area-inset-bottom))] min-h-11 min-w-11 rounded-md border border-border-strong px-4 text-sm text-muted hover:text-text"
    >
      Skip intro
    </button>
  );
}
