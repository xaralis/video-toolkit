import { describe, it, expect } from 'vitest';
import { routeOverlays } from '@video-toolkit/lib/render/overlay-routing';
import type { OverlayItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const o = (id: string, kind: string, anchorVideoId?: string): OverlayItem => ({
  id, startMs: 0, endMs: 1000, content: { kind }, anchorVideoId,
});

describe('routeOverlays', () => {
  const regs = {
    title: { routing: 'anchored' as const },
    chevron: { routing: 'singleton' as const },
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
  it('singletons collected separately', () => {
    const r = routeOverlays([o('c', 'chevron')], regs);
    expect(r.singleton.map((x) => x.id)).toEqual(['c']);
  });
  it('no registrations → everything on track', () => {
    const r = routeOverlays([o('a', 'title')], undefined);
    expect(r.track.length).toBe(1);
  });
});
