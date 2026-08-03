import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MediaLoadingOverlay, pendingSources } from './MediaLoading';

describe('pendingSources', () => {
  it('counts a url with no entry yet as pending', () => {
    expect(pendingSources(['a.mp4', 'b.mp4'], { 'a.mp4': 3000 })).toEqual(['b.mp4']);
  });

  it('treats a FAILED decode as settled, not pending', () => {
    // The hook writes 0 for a source it could not read. Without this, one
    // missing file would leave the indicator spinning for the whole session.
    expect(pendingSources(['a.mp4'], { 'a.mp4': 0 })).toEqual([]);
  });

  it('is empty for a reel with no video sources at all', () => {
    expect(pendingSources([], {})).toEqual([]);
  });
});

describe('MediaLoadingOverlay', () => {
  it('renders nothing once everything is loaded and the player is not waiting', () => {
    const { container } = render(<MediaLoadingOverlay loaded={3} total={3} buffering={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a reel with no media', () => {
    const { container } = render(<MediaLoadingOverlay loaded={0} total={0} buffering={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reports progress while sources are still being probed', () => {
    const { container } = render(<MediaLoadingOverlay loaded={2} total={5} buffering={false} />);
    expect(container.textContent).toContain('2/5');
  });

  it('shows buffering when the player is waiting even with every source probed', () => {
    const { container } = render(<MediaLoadingOverlay loaded={3} total={3} buffering />);
    expect(container.textContent).toContain('Buffering');
  });

  it('lets the caller name a stage that is neither', () => {
    const { container } = render(<MediaLoadingOverlay loaded={0} total={0} buffering label="Loading project…" />);
    expect(container.textContent).toContain('Loading project');
  });

  it('never eats pointer events — it is a status, not a modal', () => {
    const { container } = render(<MediaLoadingOverlay loaded={0} total={2} buffering={false} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('ed:pointer-events-none');
  });
});
