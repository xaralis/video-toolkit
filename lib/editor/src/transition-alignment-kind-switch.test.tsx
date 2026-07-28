// ALIGNMENT SURVIVES THE EDITOR — the gap review found in Task 1.4.
//
// `alignment` has no control of its own (it is timing, not a look parameter,
// so `subOptionsFor` does not produce one). A field with no control must at
// least survive the editor UNTOUCHED, and one path did not: the Kind dropdown
// calls `defaultTransition(nextKind, …)`, which builds a FRESH object, and the
// caller writes that over the old transition wholesale. Anything not explicitly
// threaded through is gone — silently, with nothing on screen to show where it
// went.
//
// `frames` was already threaded, and that is the precedent: kind-independent
// timing survives a kind change. Alignment is a sibling of `frames`, so it
// belongs on the same line. These tests assert ALIGNMENT specifically — a test
// that only checks `frames` survives is testing what already worked.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TransitionFields } from '@video-toolkit/lib/editor/app/LayeredInspector';
import { defaultTransition, type DraftTransition } from '@video-toolkit/lib/reel-config-base/transition-schema';

/** Mounts the picker on `t`, switches the Kind dropdown to `nextKind`, and
 *  returns the transition the picker handed back. */
function switchKind(t: DraftTransition, nextKind: string): DraftTransition {
  const onChange = vi.fn();
  const { getByLabelText } = render(<TransitionFields t={t} onChange={onChange} />);
  fireEvent.change(getByLabelText('Kind'), { target: { value: nextKind } });
  expect(onChange).toHaveBeenCalledTimes(1);
  return onChange.mock.calls[0][0] as DraftTransition;
}

describe('switching a transition’s kind in the inspector', () => {
  it('keeps a non-default alignment', () => {
    const next = switchKind({ kind: 'dissolve', frames: 12, alignment: 'end' }, 'fade');
    expect(next).toMatchObject({ kind: 'fade', alignment: 'end' });
  });

  it('keeps `start` too — not just whichever one the code happened to test', () => {
    const next = switchKind({ kind: 'fade', frames: 8, alignment: 'start' }, 'glitch');
    expect(next.alignment).toBe('start');
  });

  it('keeps it when switching TO a kind with its own look params', () => {
    // `slide` seeds a required `direction`; the seeding loop must not crowd out
    // the timing that was threaded in.
    const next = switchKind({ kind: 'dissolve', frames: 12, alignment: 'end' }, 'slide');
    expect(next).toMatchObject({ kind: 'slide', frames: 12, alignment: 'end', direction: 'left' });
  });

  it('still drops the OLD kind’s look params — they belonged to that kind', () => {
    const next = switchKind({ kind: 'wipe', frames: 12, direction: 'left', alignment: 'end' }, 'dissolve');
    expect(next.alignment).toBe('end');
    expect(next.direction).toBeUndefined();
  });

  it('adds nothing when there was no alignment to keep', () => {
    const next = switchKind({ kind: 'dissolve', frames: 12 }, 'fade');
    expect('alignment' in next).toBe(false);
  });
});

describe('defaultTransition threads alignment, and only a real one', () => {
  it('carries a recognised alignment onto the new kind', () => {
    expect(defaultTransition('fade', { frames: 12, alignment: 'start' })).toEqual({
      kind: 'fade',
      frames: 12,
      alignment: 'start',
    });
  });

  it('carries it onto an UNKNOWN kind too — the legacy round-trip path', () => {
    expect(defaultTransition('some-brand-kind', { frames: 12, alignment: 'end' })).toEqual({
      kind: 'some-brand-kind',
      frames: 12,
      alignment: 'end',
    });
  });

  it('drops a value that is not an alignment rather than propagating it', () => {
    // A stale config or a hand-typed literal reaches here unvalidated; the new
    // object should not be the thing that carries it forward.
    expect(defaultTransition('fade', { frames: 12, alignment: 'middle' })).toEqual({ kind: 'fade', frames: 12 });
  });
});
