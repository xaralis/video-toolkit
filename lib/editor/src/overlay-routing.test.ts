import { describe, it, expect } from 'vitest';
import { routeOverlays } from '@video-toolkit/lib/render/overlay-routing';
import type { OverlayItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const o = (id: string, kind: string, anchorVideoId?: string): OverlayItem => ({
  id, startMs: 0, endMs: 1000, content: { kind }, anchorVideoId,
});

describe('routeOverlays', () => {
  const regs = {
    title: { routing: 'anchored' as const },
    'stat-callout': {},
  };
  it('defaults unregistered and routing-less kinds to track', () => {
    const r = routeOverlays([o('a', 'text'), o('b', 'stat-callout')], regs);
    expect(r.track.map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('splits anchored by anchorVideoId', () => {
    const r = routeOverlays([o('t1', 'title', 'seg-001'), o('t2', 'title', 'seg-002')], regs);
    expect(r.track).toEqual([]);
    expect(r.anchored.get('seg-001')![0].id).toBe('t1');
    expect(r.anchored.get('seg-002')![0].id).toBe('t2');
  });
  it('anchored without anchorVideoId falls back to track (stays visible)', () => {
    const r = routeOverlays([o('t3', 'title')], regs);
    expect(r.track.map((x) => x.id)).toEqual(['t3']);
  });
  it('every item of a kind reaches the track — no per-kind capping', () => {
    // A reel may legitimately carry several markers of one kind at different
    // points on the timeline; each gets its own Sequence window.
    const r = routeOverlays([o('c1', 'chevron'), o('c2', 'chevron')], regs);
    expect(r.track.map((x) => x.id)).toEqual(['c1', 'c2']);
  });
  it('delivers an anchored overlay to every video item its span overlaps', () => {
    // A title stretched in the editor across two clips must render in both:
    // it draws INSIDE its clip's body, so a clip it isn't delivered to has
    // nowhere to show it — the timeline would promise a span the render drops.
    const video = [
      { id: 'a', startMs: 0, endMs: 4500 },
      { id: 'b', startMs: 4500, endMs: 8233 },
      { id: 'c', startMs: 8233, endMs: 11733 },
    ];
    const title: OverlayItem = { id: 't', startMs: 0, endMs: 8233, content: { kind: 'title' }, anchorVideoId: 'b' };
    const r = routeOverlays([title], regs, video);
    expect(r.anchored.get('a')?.map((x) => x.id)).toEqual(['t']);
    expect(r.anchored.get('b')?.map((x) => x.id)).toEqual(['t']);
    // touching at 8233 is not an overlap
    expect(r.anchored.get('c')).toBeUndefined();
    expect(r.track).toEqual([]);
  });
  it('delivers once to the anchor even when it also overlaps', () => {
    const video = [{ id: 'b', startMs: 0, endMs: 5000 }];
    const r = routeOverlays([o('t', 'title', 'b')], regs, video);
    expect(r.anchored.get('b')?.length).toBe(1);
  });
  it('with video items, placement is by time alone — the anchor is not a link', () => {
    // An anchored overlay is placed purely by its span. A stale anchorVideoId
    // (the item was moved off that clip) must not pull it back there, and an
    // item with no anchor at all still lands in the clips it covers.
    const video = [
      { id: 'a', startMs: 0, endMs: 4000 },
      { id: 'b', startMs: 4000, endMs: 8000 },
    ];
    const moved: OverlayItem = { id: 'm', startMs: 5000, endMs: 7000, content: { kind: 'title' }, anchorVideoId: 'a' };
    const free: OverlayItem = { id: 'f', startMs: 1000, endMs: 3000, content: { kind: 'title' } };
    const r = routeOverlays([moved, free], regs, video);
    expect(r.anchored.get('a')?.map((x) => x.id)).toEqual(['f']);
    expect(r.anchored.get('b')?.map((x) => x.id)).toEqual(['m']);
    expect(r.track).toEqual([]);
  });
  it('an anchored overlay covering no video item stays visible on the track', () => {
    const video = [{ id: 'a', startMs: 0, endMs: 1000 }];
    const late: OverlayItem = { id: 'l', startMs: 2000, endMs: 3000, content: { kind: 'title' }, anchorVideoId: 'a' };
    const r = routeOverlays([late], regs, video);
    expect(r.track.map((x) => x.id)).toEqual(['l']);
    expect(r.anchored.size).toBe(0);
  });
  it('no registrations → everything on track', () => {
    const r = routeOverlays([o('a', 'title')], undefined);
    expect(r.track.length).toBe(1);
  });
});
