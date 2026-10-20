import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <article className="prose-body measure">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-4 text-lg text-muted">
        Collect as little as possible, keep it local by default.
      </p>

      <h2>Preferences stay on your device</h2>
      <p>
        Your filters, pinned countries, motion and intro settings are stored in your browser
        (localStorage) and never sent to the server unless you sign in and switch on sync. You can
        clear them at any time from Settings.
      </p>

      <h2>Optional account sync</h2>
      <p>
        If you sign in and opt in, FreAlgo stores only your explicit preference choices against an
        opaque account identifier. You can export or delete that record from the account page. There
        is no reading history, dwell time or click tracking.
      </p>

      <h2>Cookies</h2>
      <ul>
        <li>
          <strong>Session cookie</strong> (only after you sign in): essential, HttpOnly, used to
          keep you signed in.
        </li>
        <li>No advertising, analytics or cross-site cookies are set.</li>
      </ul>

      <h2>Operational telemetry</h2>
      <p>
        The server keeps aggregate counters such as “WebGL unavailable today: N” to keep the 3D
        globe and its fallback working. These counters carry no IP address, user agent string or
        identifier. Server logs record request paths and errors without IP addresses. Rate limiting
        uses a short-lived, hashed network key that is never stored in the database.
      </p>

      <h2>Publisher links and images</h2>
      <p>
        Story links open the original publisher in a new tab, without sending a referrer. Article
        images are not loaded, so your browser does not contact publishers until you choose to open
        a story.
      </p>
    </article>
  );
}
