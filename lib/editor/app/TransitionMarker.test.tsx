import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransitionMarker } from './TransitionMarker';

describe('TransitionMarker', () => {
  it('shows the kind in full even when the transition is far too short to hold it', () => {
    // The whole point: a 15-frame transition is ~12px wide at normal zoom, so
    // a label clipped to the glyph's own width would read "gra…" and the
    // kind would be unreadable at every zoom a person actually edits at.
    const { container } = render(<TransitionMarker kind="gradient-wipe" frames={15} />);
    expect(screen.getByText('gradient-wipe')).toBeInTheDocument();
    const label = container.querySelector('[data-testid="transition-label"]') as HTMLElement;
    // Not clipped to the glyph's own width, and never wrapped onto a second
    // line inside an 18px row.
    expect(label.className).toContain('ed:whitespace-nowrap');
    expect(label.className).not.toContain('ed:overflow-hidden');
  });

  it("marks the transition's real span with the glyph's own width, not a fixed one", () => {
    // There is no separate span bar or leg pair any more — the bowtie glyph
    // IS the span: it stretches to the container's width via
    // preserveAspectRatio="none" plus a 100% (not fixed-px) width, so the
    // wedges always meet in the middle of the true duration.
    const { container } = render(<TransitionMarker kind="fade" frames={30} />);
    const glyph = container.querySelector('[data-testid="transition-glyph"]') as SVGSVGElement;
    expect(glyph).toBeTruthy();
    expect(glyph.getAttribute('preserveAspectRatio')).toBe('none');
    expect(glyph.style.width).toBe('100%');
    expect(glyph.style.width).not.toMatch(/^\d+px$/);
  });

  it('guarantees a minimum rendered width so a very short transition never disappears', () => {
    // At a zoomed-out scale the action box can shrink below any sane visible
    // width; the glyph floors at 4px and overhangs its own box rather than
    // vanishing, the same way the label is already allowed to.
    const { container } = render(<TransitionMarker kind="fade" frames={1} />);
    const glyph = container.querySelector('[data-testid="transition-glyph"]') as SVGSVGElement;
    expect(glyph.style.minWidth).toBe('4px');
  });

  it('keeps the frame count readable — on the label when there is room, in the title always', () => {
    render(<TransitionMarker kind="fade" frames={30} />);
    expect(screen.getByText('30f')).toBeInTheDocument();
    expect(screen.getByTitle(/fade/)).toHaveAttribute('title', expect.stringContaining('30 frames'));
  });

  it('is visually distinct when selected, and only when selected', () => {
    // A 12px glyph can't show an outline legibly, so selection is a fill
    // change (glyph to the accent, kind label to full-brightness ink)
    // instead.
    const { container, rerender } = render(<TransitionMarker kind="fade" frames={15} />);
    const glyphOf = () => container.querySelector('[data-testid="transition-glyph"]') as SVGSVGElement;
    const kindOf = () => screen.getByText('fade');
    expect(glyphOf().getAttribute('class')).not.toContain('ed:fill-accent');
    expect(kindOf().className).not.toContain('ed:text-ink ');
    expect(kindOf().className).toContain('ed:text-ink-2');

    rerender(<TransitionMarker kind="fade" frames={15} selected />);
    expect(glyphOf().getAttribute('class')).toContain('ed:fill-accent');
    expect(kindOf().className).toContain('ed:text-ink');
    expect(kindOf().className).not.toContain('ed:text-ink-2');
  });

  it('carries the starvation colour and its message when the transition is starved', () => {
    // A starved transition renders BLACK frames into the final MP4 — the
    // marker is the only place that warns before the render does. Colour
    // alone (the `warn` token, on both the glyph and the label) carries the
    // state; at this scale a hatch overlay would be mush, and it existed
    // originally only because an opaque pill couldn't show a hatch through
    // its own fill — there is no fill to hide it behind any more.
    const { container } = render(
      <TransitionMarker kind="fade" frames={15} starvedMessage="Needs 15 frames, seg-002 can lend 4" />,
    );
    const glyph = container.querySelector('[data-testid="transition-glyph"]') as SVGSVGElement;
    expect(glyph.getAttribute('class')).toContain('ed:fill-warn');
    expect(screen.getByText('fade').className).toContain('ed:text-warn');
    expect(screen.getByText('15f').className).toContain('ed:text-warn');
    expect(screen.getByTitle('Needs 15 frames, seg-002 can lend 4')).toBeInTheDocument();
  });

  it('lets a click on the label reach an ancestor click handler, exactly as the glyph does', () => {
    // xzdarcy attaches onClickAction's onClick to the action's own root div,
    // and TransitionMarker's whole tree renders as a plain DOM descendant of
    // it (getActionRender in LayeredTimeline.tsx). So the real thing to
    // prove is DOM bubbling reaching an ancestor — not just the absence of a
    // class name, which would pass even if some other mechanism silently
    // broke the click.
    const onClick = vi.fn();
    render(
      <div onClick={onClick} data-testid="action-root">
        <TransitionMarker kind="fade" frames={15} />
      </div>,
    );
    fireEvent.click(screen.getByText('fade'));
    expect(onClick).toHaveBeenCalledTimes(1);

    onClick.mockClear();
    fireEvent.click(screen.getByText('15f'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not block pointer events on the label (would fall through to a scrub instead of a select)', () => {
    const { container } = render(<TransitionMarker kind="fade" frames={15} />);
    const label = container.querySelector('[data-testid="transition-label"]') as HTMLElement;
    expect(label.className).not.toContain('pointer-events-none');
  });
});
