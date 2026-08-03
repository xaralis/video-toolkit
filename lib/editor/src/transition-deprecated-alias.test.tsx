// A DEPRECATED ALIAS MUST NOT MAKE THE EDITOR LIE — Task 2.5, review round 1.
//
// Hiding `zoom-through.from` from `subOptionsFor` closed the fork in the UI
// (one concept, one control) but opened a smaller one: a baked
// `{from:'out'}` literal RENDERS `'out'` while the inspector's Direction
// control shows *unset*. The editor would then be describing a reel that does
// not exist — the same class as Task 1.2's coerced brand kind and Task 1.4's
// dropped `alignment`, and the reason those both got pinned rather than
// documented.
//
// The rule this file states: the control shows the EFFECTIVE value (canonical
// field, else its alias), and the first edit MIGRATES — writes the canonical
// field and drops the alias, so the literal stops being ambiguous the moment
// anyone touches it.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { TransitionFields } from '../app/LayeredInspector';
import type { DraftTransition } from '@video-toolkit/lib/reel-config-base/transition-schema';

// zoom-through's `direction` is a 2-choice enum (`in`/`out`), so (Task 10) it
// routes to SegmentedField, not SelectField — a `role="group"` of buttons,
// not a `<select>` with a `.value`.
describe('a baked `from` literal is shown honestly and migrated on edit', () => {
  it('shows the value the reel actually renders, not an empty control', () => {
    render(<TransitionFields t={{ kind: 'zoom-through', frames: 15, from: 'out' }} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Out' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'In' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('prefers the canonical field when a literal carries both', () => {
    render(
      <TransitionFields t={{ kind: 'zoom-through', frames: 15, direction: 'in', from: 'out' }} onChange={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'In' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Out' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('MIGRATES on the first edit: writes `direction`, drops `from`', () => {
    const onChange = vi.fn();
    render(<TransitionFields t={{ kind: 'zoom-through', frames: 15, from: 'out' }} onChange={onChange} />);
    // A SegmentedField button, not a select — a click, not a change event.
    fireEvent.click(screen.getByRole('button', { name: 'In' }));
    const next = onChange.mock.calls.at(-1)![0] as DraftTransition;
    expect(next).toEqual({ kind: 'zoom-through', frames: 15, direction: 'in' });
  });

  // Editing a DIFFERENT param must not silently rewrite the alias behind the
  // author's back — migration is a consequence of touching the aliased field,
  // not a side effect of opening the section.
  it('leaves the alias alone when an unrelated param is edited', () => {
    const onChange = vi.fn();
    render(<TransitionFields t={{ kind: 'zoom-through', frames: 15, from: 'out' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Zoom amount'), { target: { value: '2' } });
    fireEvent.blur(screen.getByLabelText('Zoom amount'));
    const next = onChange.mock.calls.at(-1)![0] as DraftTransition;
    expect(next).toMatchObject({ kind: 'zoom-through', frames: 15, from: 'out', zoomAmount: 2 });
  });

  // The rule is general, not a zoom-through special case: a kind with no alias
  // behaves exactly as it always did. `slide`'s `direction` has 4 choices, so
  // it too routes to SegmentedField (Task 10).
  it('changes nothing for a kind that has no deprecated alias', () => {
    const onChange = vi.fn();
    render(<TransitionFields t={{ kind: 'slide', frames: 12, direction: 'left' }} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Left' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Right' }));
    expect(onChange.mock.calls.at(-1)![0]).toEqual({ kind: 'slide', frames: 12, direction: 'right' });
  });
});
