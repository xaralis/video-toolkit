import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FrameOverlay } from './FrameOverlay';

/**
 * jsdom performs no layout, so getBoundingClientRect() always reports zeros.
 * Stub the overlay container's rect with a known pixel box so the
 * pointer-to-fraction conversion is deterministic — mirrors the
 * getBoundingClientRect stubbing approach used throughout Timeline.test.tsx.
 */
function stubContainerRect(container: HTMLElement) {
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    width: 200,
    height: 356,
    top: 0,
    left: 0,
    right: 200,
    bottom: 356,
    x: 0,
    y: 0,
    toJSON: () => {},
  } as DOMRect);
}

describe('FrameOverlay', () => {
  it('renders the dot at focalX/focalY as a percentage position', () => {
    render(<FrameOverlay focalX={0.85} focalY={0.5} onFocalChange={vi.fn()} />);
    const dot = screen.getByTestId('focus-dot');
    expect(dot.style.left).toBe('85%');
    expect(dot.style.top).toBe('50%');
    expect(dot).toHaveAttribute('data-fx', '0.85');
    expect(dot).toHaveAttribute('data-fy', '0.5');
  });

  it('defaults to center (0.5, 0.5) when focalX/focalY are omitted', () => {
    render(<FrameOverlay onFocalChange={vi.fn()} />);
    const dot = screen.getByTestId('focus-dot');
    expect(dot.style.left).toBe('50%');
    expect(dot.style.top).toBe('50%');
  });

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <FrameOverlay focalX={0.5} focalY={0.5} onFocalChange={vi.fn()} visible={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the container with pointer-events none and the dot with pointer-events auto', () => {
    render(<FrameOverlay focalX={0.5} focalY={0.5} onFocalChange={vi.fn()} />);
    const root = screen.getByTestId('frame-overlay');
    const dot = screen.getByTestId('focus-dot');
    expect(root.style.pointerEvents).toBe('none');
    expect(dot.style.pointerEvents).toBe('auto');
  });

  it('calls onFocalChange with the fraction under the pointer during a drag', () => {
    const onFocalChange = vi.fn();
    render(<FrameOverlay focalX={0.5} focalY={0.5} onFocalChange={onFocalChange} />);
    const root = screen.getByTestId('frame-overlay');
    stubContainerRect(root);
    const dot = screen.getByTestId('focus-dot');

    fireEvent.pointerDown(dot, { clientX: 100, clientY: 178 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 178 });

    expect(onFocalChange).toHaveBeenCalled();
    const [fx, fy] = onFocalChange.mock.calls[onFocalChange.mock.calls.length - 1];
    expect(fx).toBeCloseTo(0.5);
    expect(fy).toBeCloseTo(0.5);

    fireEvent.pointerUp(window, { clientX: 100, clientY: 178 });
  });

  it('clamps the fraction to [0, 1] when the pointer moves outside the container', () => {
    const onFocalChange = vi.fn();
    render(<FrameOverlay focalX={0.5} focalY={0.5} onFocalChange={onFocalChange} />);
    const root = screen.getByTestId('frame-overlay');
    stubContainerRect(root);
    const dot = screen.getByTestId('focus-dot');

    fireEvent.pointerDown(dot, { clientX: 100, clientY: 178 });
    fireEvent.pointerMove(window, { clientX: -50, clientY: 400 });

    expect(onFocalChange).toHaveBeenCalled();
    const [fx, fy] = onFocalChange.mock.calls[onFocalChange.mock.calls.length - 1];
    expect(fx).toBe(0);
    expect(fy).toBe(1);

    fireEvent.pointerUp(window, { clientX: -50, clientY: 400 });
  });

  it('stops calling onFocalChange after pointerup', () => {
    const onFocalChange = vi.fn();
    render(<FrameOverlay focalX={0.5} focalY={0.5} onFocalChange={onFocalChange} />);
    const root = screen.getByTestId('frame-overlay');
    stubContainerRect(root);
    const dot = screen.getByTestId('focus-dot');

    fireEvent.pointerDown(dot, { clientX: 100, clientY: 178 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 178 });
    onFocalChange.mockClear();

    fireEvent.pointerMove(window, { clientX: 20, clientY: 20 });
    expect(onFocalChange).not.toHaveBeenCalled();
  });

  it('renders a "focus" label', () => {
    render(<FrameOverlay focalX={0.5} focalY={0.5} onFocalChange={vi.fn()} />);
    expect(screen.getByText('focus')).toBeInTheDocument();
  });

  it('sets a title tooltip on the dot explaining what dragging it does', () => {
    render(<FrameOverlay focalX={0.5} focalY={0.5} onFocalChange={vi.fn()} />);
    expect(screen.getByTestId('focus-dot')).toHaveAttribute(
      'title',
      'Drag to set which part of the shot stays in frame'
    );
  });

  it('shows a live numeric readout reflecting the current focalX/focalY', () => {
    render(<FrameOverlay focalX={0.85} focalY={0.5} onFocalChange={vi.fn()} />);
    const readout = screen.getByTestId('focal-readout');
    expect(readout.textContent).toContain('0.85');
    expect(readout.textContent).toContain('0.50');
  });

  it('updates the readout as focalX/focalY props change', () => {
    const { rerender } = render(
      <FrameOverlay focalX={0.5} focalY={0.5} onFocalChange={vi.fn()} />
    );
    expect(screen.getByTestId('focal-readout').textContent).toContain('0.50');

    rerender(<FrameOverlay focalX={0.12} focalY={0.98} onFocalChange={vi.fn()} />);
    const readout = screen.getByTestId('focal-readout');
    expect(readout.textContent).toContain('0.12');
    expect(readout.textContent).toContain('0.98');
  });
});
