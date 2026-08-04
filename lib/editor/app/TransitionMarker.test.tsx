import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransitionMarker } from './TransitionMarker';

describe('TransitionMarker', () => {
  it('shows the kind in full even when the transition is far too short to hold it', () => {
    // The whole point: a 15-frame transition is ~12px wide at normal zoom, so
    // the old label truncated to "gra…" and the kind was unreadable at every
    // zoom a person actually edits at.
    const { container } = render(<TransitionMarker kind="gradient-wipe" frames={15} />);
    expect(screen.getByText('gradient-wipe')).toBeInTheDocument();
    const label = container.querySelector('[data-testid="transition-label"]') as HTMLElement;
    // Not clipped to the marker's own width, and never wrapped onto a second
    // line inside an 18px row.
    expect(label.className).toContain('ed:whitespace-nowrap');
    expect(label.className).not.toContain('ed:overflow-hidden');
  });

  it('marks the transition’s real span with a leg at each end', () => {
    // The label floats free of the span, so something still has to say where
    // the transition actually starts and ends — that is what the legs are.
    const { container } = render(<TransitionMarker kind="fade" frames={30} />);
    expect(container.querySelectorAll('[data-testid="transition-leg"]')).toHaveLength(2);
    expect(container.querySelector('[data-testid="transition-span"]')).toBeTruthy();
  });

  it('keeps the frame count readable — on the label when there is room, in the title always', () => {
    render(<TransitionMarker kind="fade" frames={30} />);
    expect(screen.getByText('30f')).toBeInTheDocument();
    expect(screen.getByTitle(/fade/)).toHaveAttribute('title', expect.stringContaining('30 frames'));
  });

  it('shows the selection outline only when selected', () => {
    const { container, rerender } = render(<TransitionMarker kind="fade" frames={15} />);
    const labelOf = () => container.querySelector('[data-testid="transition-label"]') as HTMLElement;
    expect(labelOf().style.outline).toBe('');
    rerender(<TransitionMarker kind="fade" frames={15} selected />);
    expect(labelOf().style.outline).toContain('solid');
  });

  it('carries the starvation hatch and its message when the transition is starved', () => {
    // A starved transition renders BLACK frames into the final MP4 — the
    // marker is the only place that warns before the render does.
    const { container } = render(
      <TransitionMarker kind="fade" frames={15} starvedMessage="Needs 15 frames, seg-002 can lend 4" />,
    );
    expect(container.querySelector('.vt-grip-muted')).toBeTruthy();
    expect(screen.getByTitle('Needs 15 frames, seg-002 can lend 4')).toBeInTheDocument();
  });
});
