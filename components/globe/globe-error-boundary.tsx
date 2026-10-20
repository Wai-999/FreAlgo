'use client';

import { Component, type ReactNode } from 'react';

/**
 * Contains failures of the lazily loaded 3D globe: a chunk that cannot be downloaded (offline,
 * flaky network, or a deploy that removed old chunks while a tab was open) or a crash inside
 * three.js. The stage then shows the flat map; without this boundary the error would replace the
 * whole Explore page.
 */
export class GlobeErrorBoundary extends Component<
  { onError: (error: unknown) => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
