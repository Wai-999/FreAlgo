import { IntroSkipButton } from './intro-skip-button';

/**
 * Optional dark intro (<= 1.5s). Visibility is controlled purely by CSS + the head boot script
 * (see app/globals.css `.intro`), so it never blocks content, never repeats within a session,
 * and is skipped entirely for reduced motion or when disabled in preferences.
 */
export function Intro() {
  return (
    <div className="intro" data-testid="intro">
      <div className="flex flex-col items-center gap-4 px-6 text-center" aria-hidden="true">
        <p className="intro__title text-3xl font-semibold tracking-tight text-text sm:text-4xl">
          FreAlgo
        </p>
        <div className="intro__line" />
        <p className="intro__tagline max-w-sm text-base text-muted">
          The world&apos;s news, in the order you choose.
        </p>
      </div>
      <IntroSkipButton />
    </div>
  );
}
