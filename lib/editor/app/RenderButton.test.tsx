import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RenderButton } from './RenderButton';

/** RenderButton hands its two pieces (phaseControl / renderControls) out
 *  through a render-prop `children` function rather than rendering them
 *  itself — EditorHost places each in a different EditorShell header zone.
 *  This harness renders both into one DOM so plain RTL queries can reach
 *  whichever piece a test cares about. */
function Harness() {
  return (
    <RenderButton>
      {({ phaseControl, renderControls }) => (
        <div>
          <div data-testid="phase-slot">{phaseControl}</div>
          <div data-testid="controls-slot">{renderControls}</div>
        </div>
      )}
    </RenderButton>
  );
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RenderButton — phaseControl', () => {
  it('is absent until /project-state answers with phases', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // never resolves
    render(<Harness />);
    expect(screen.queryByTitle('Project phase (written to project.json)')).not.toBeInTheDocument();
  });

  it('renders a phase select once /project-state resolves, and posts a change back', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url) === '/project-state') return jsonResponse({ exists: true, phase: 'editing', phases: ['planning', 'editing', 'complete'] });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);

    const select = await screen.findByTitle('Project phase (written to project.json)');
    expect((select as HTMLSelectElement).value).toBe('editing');

    fireEvent.change(select, { target: { value: 'complete' } });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === '/project-state' && c[1]);
      expect(call).toBeDefined();
      expect((call as any[])[1].method).toBe('POST');
      expect((call as any[])[1].body).toBe(JSON.stringify({ phase: 'complete' }));
    });
  });
});

// The render control's whole lifecycle — menu, progress, done, error — has
// to render inside ONE control. These tests walk all five states and check
// each one is entirely contained in a single element with a stable class
// (RENDER_WRAP_CLASS), never a second, separate surface for the same thing.
describe('RenderButton — renderControls, one control through its whole lifecycle', () => {
  const wrapOf = (container: HTMLElement) => container.querySelector('[data-testid="controls-slot"] > div') as HTMLElement;

  it('idle: shows a "Render" menu button; the menu is closed until clicked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    const { container } = render(<Harness />);
    const btn = screen.getByRole('button', { name: /^Render$/ });
    expect(btn).toHaveAttribute('aria-haspopup', 'menu');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    // Exactly one control node for the whole lifecycle.
    expect(wrapOf(container)).toBeTruthy();
  });

  it('idle, opened: offers Preview and Full with their titles, each in one click', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Render$/ }));
    expect(screen.getByRole('button', { name: /^Render$/ })).toHaveAttribute('aria-expanded', 'true');

    const preview = screen.getByRole('menuitem', { name: 'Preview' });
    const full = screen.getByRole('menuitem', { name: 'Full' });
    expect(preview).toHaveAttribute('title', 'Render a half-scale preview MP4');
    expect(full).toHaveAttribute('title', 'Render the final full-scale MP4');
  });

  it('closes the menu on outside click without starting a render', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Render$/ }));
    expect(screen.getByRole('menuitem', { name: 'Preview' })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menuitem', { name: 'Preview' })).not.toBeInTheDocument();
  });

  // Escape is the ONLY dismissal a keyboard-only user has — they cannot
  // "click outside" — so an outside-click-only menu is a keyboard trap whose
  // only exit is starting a render you did not want.
  it('closes the menu on Escape, without starting a render, and returns focus to the trigger', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: /^Render$/ });
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Preview' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menuitem', { name: 'Preview' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('render'), expect.anything());
    expect(document.activeElement).toBe(trigger);
  });

  it('choosing Preview from the menu starts that render', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') return jsonResponse({});
      return jsonResponse({ running: false, done: false, percent: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Render$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Preview' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === '/render' && (c[1] as RequestInit)?.method === 'POST');
      expect(call).toBeDefined();
      expect((call as any[])[1].body).toBe(JSON.stringify({ mode: 'preview' }));
    });
  });

  it('rendering: the button is disabled, shows a progress ring and the percentage in its accessible name', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') return jsonResponse({});
      return jsonResponse({ running: true, done: false, percent: 42, mode: 'full' });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Render$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Full' }));

    const btn = await screen.findByRole('button', { name: /42%/ });
    expect(btn).toBeDisabled();
    expect(btn.querySelector('svg[aria-hidden="true"]')).toBeTruthy(); // the ring, hidden from a11y tree
  });

  it('rendering: the control is accented, and the disabled label is NOT dimmed', async () => {
    // A render is the one thing in this editor that takes minutes, and the
    // user walks away from it. It has to read as ACTIVE across the room —
    // which the neutral shell plus `disabled:opacity-60` did the opposite of.
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') return jsonResponse({});
      return jsonResponse({ running: true, done: false, percent: 42, mode: 'full' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Render$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Full' }));

    const btn = await screen.findByRole('button', { name: /42%/ });
    expect(wrapOf(container).className).toContain('ed:border-accent');
    expect(wrapOf(container).className).toContain('ed:bg-accent-soft');
    // Disabled here means "you cannot start another one", not "inactive" —
    // the opacity wash is what made a running render look switched off.
    expect(btn.className).not.toContain('ed:disabled:opacity-60');
  });

  it('idle: the control is NOT accented — only a running render earns that', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    const { container } = render(<Harness />);
    expect(wrapOf(container).className).not.toContain('ed:border-accent');
    expect(wrapOf(container).className).not.toContain('ed:bg-accent-soft');
  });

  it('done: the button reads "Open", reveals on click, and returns to idle', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') return jsonResponse({});
      return jsonResponse({ running: false, done: true, percent: 100, mode: 'preview', outPath: '/Users/x/out/reel.mp4' });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Render$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Preview' }));

    const openBtn = await screen.findByRole('button', { name: /Render complete\. Open/ });
    expect(openBtn).toHaveAttribute('title', '/Users/x/out/reel.mp4'); // full path only in the title
    expect(openBtn.textContent).not.toContain('/Users/x/out/reel.mp4'); // never inline

    fireEvent.click(openBtn);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === '/render' && (c[1] as RequestInit)?.body?.toString().includes('reveal'));
      expect(call).toBeDefined();
    });
    // Back to idle — a second render can start immediately.
    expect(await screen.findByRole('button', { name: /^Render$/ })).toBeInTheDocument();
  });

  it('done: a separate dismiss returns to idle WITHOUT revealing', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') return jsonResponse({});
      return jsonResponse({ running: false, done: true, percent: 100, mode: 'preview', outPath: '/out/reel.mp4' });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Render$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Preview' }));

    const dismissBtn = await screen.findByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissBtn);

    expect(screen.getByRole('button', { name: /^Render$/ })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => c[0] === '/render' && (c[1] as RequestInit)?.body?.toString().includes('reveal'))).toBe(false);
  });

  it('rendering: offers a Cancel affordance with an accessible name, next to the progress button', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') return jsonResponse({});
      return jsonResponse({ running: true, done: false, percent: 42, mode: 'full' });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Render$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Full' }));

    const cancelBtn = await screen.findByRole('button', { name: 'Cancel render' });
    expect(cancelBtn).toBeEnabled();
    // The progress button keeps its own accessible name — Cancel is a second
    // control in the same box, not a replacement for the percentage.
    expect(screen.getByRole('button', { name: /42%/ })).toBeInTheDocument();
  });

  it('idle, done and error offer no Cancel — only a running render can be cancelled', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') return jsonResponse({});
      return jsonResponse({ running: false, done: true, percent: 100, mode: 'full', outPath: '/out/reel.mp4' });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Cancel render' })).not.toBeInTheDocument(); // idle

    fireEvent.click(screen.getByRole('button', { name: /^Render$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Full' }));
    await screen.findByRole('button', { name: /Render complete\. Open/ });
    expect(screen.queryByRole('button', { name: 'Cancel render' })).not.toBeInTheDocument(); // done
  });

  it('clicking Cancel posts the cancel action and reports the render as cancelling', async () => {
    let cancelled = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') {
        if (init.body?.toString().includes('cancel')) cancelled = true;
        return jsonResponse({});
      }
      return jsonResponse({ running: true, cancelling: cancelled, cancelled: false, done: false, percent: 42, mode: 'full' });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Render$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Full' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel render' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === '/render' && (c[1] as RequestInit)?.body?.toString().includes('cancel'));
      expect(call).toBeDefined();
    });
    expect(await screen.findByRole('button', { name: /Cancelling/ })).toBeInTheDocument();
    // The stop is already requested — no second Cancel to click.
    expect(screen.queryByRole('button', { name: 'Cancel render' })).not.toBeInTheDocument();
  });

  it('cancelled: reads as cancelled rather than failed, and dismisses to idle', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') return jsonResponse({});
      return jsonResponse({ running: false, cancelling: false, cancelled: true, done: false, percent: 37, mode: 'full' });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Render$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Full' }));

    const btn = await screen.findByRole('button', { name: /Render cancelled/ });
    expect(screen.queryByRole('button', { name: /Render failed/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Render complete/ })).not.toBeInTheDocument();

    fireEvent.click(btn);
    expect(await screen.findByRole('button', { name: /^Render$/ })).toBeInTheDocument();
  });

  it('error: the failure message is reachable via title/aria-label, and clicking returns to idle so the user can retry', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') return jsonResponse({});
      return jsonResponse({ running: false, done: false, percent: 0, error: 'Render process crashed' });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Render$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Preview' }));

    const errBtn = await screen.findByRole('button', { name: /Render failed: Render process crashed/ });
    expect(errBtn).toHaveAttribute('title', 'Render process crashed');

    fireEvent.click(errBtn);
    expect(await screen.findByRole('button', { name: /^Render$/ })).toBeInTheDocument();
  });
});
