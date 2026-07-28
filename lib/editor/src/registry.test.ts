import type React from 'react';
import { describe, it, expect } from 'vitest';
import { resolveRegistered, registrationConfig, type Registration } from '@video-toolkit/lib/theming/registry';

// ANNOTATED as components, not left as bare `() => null`. Phase 4 Task 1.2 made
// the RENDERER TYPE a parameter of `resolveRegistered` (the transition axis'
// renderer returns a presentation object, which cannot be a React.FC), so the
// renderer type is now inferred from the arguments instead of being pinned to
// `React.FC<P>`. A bare `() => null` in the generics table would infer the
// zero-arg type and then reject the `Registration<unknown>` fixtures below,
// which are the real shape. Every real core generics table is explicitly typed
// (`Record<string, OverlayRenderer>` and friends), so this only ever bit the
// ad-hoc literals here.
const Generic: React.FC<unknown> = () => null;
const Brand: React.FC<unknown> = () => null;

// Registration is deliberately CLOSED (no index signature), so a typo'd
// `renderer` is a compile error rather than a brand renderer that silently
// vanishes into the core generic. Fixtures carrying a per-axis field are typed
// as that axis's superset — which is exactly how real registries are declared.
type RoutingReg = Registration<unknown> & { routing?: 'track' | 'anchored' };
const routingOnly: Record<string, RoutingReg> = { title: { routing: 'anchored' } };
const routingOnTextKind: Record<string, RoutingReg> = { text: { routing: 'track' } };

describe('resolveRegistered', () => {
  it('prefers a brand registration over the core generic', () => {
    expect(resolveRegistered({ text: { renderer: Brand } }, 'text', { text: Generic })).toBe(Brand);
  });

  it('falls back to the core generic when the brand did not register the kind', () => {
    expect(resolveRegistered({}, 'text', { text: Generic })).toBe(Generic);
  });

  it('falls back to the core generic when the registry is absent entirely', () => {
    expect(resolveRegistered(undefined, 'text', { text: Generic })).toBe(Generic);
  });

  it('returns undefined when neither brand nor core has the kind', () => {
    expect(resolveRegistered({}, 'chevron', { text: Generic })).toBeUndefined();
  });

  it('treats a routing-only registration (no renderer) as not resolving a renderer', () => {
    expect(resolveRegistered(routingOnly, 'title', {})).toBeUndefined();
  });

  it('does NOT let a routing-only registration mask the core generic', () => {
    // A brand that registers routing for a kind core can draw still gets core's drawing.
    expect(resolveRegistered(routingOnTextKind, 'text', { text: Generic })).toBe(Generic);
  });

  it('reads the opaque config off the registration', () => {
    expect(registrationConfig({ text: { config: { strokeRatio: 0.2 } } }, 'text')).toEqual({ strokeRatio: 0.2 });
  });
});
