import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RenderButton } from './RenderButton';

/** RenderButton hands its three pieces (phaseControl / renderControls /
 *  renderStatus) out through a render-prop `children` function rather than
 *  rendering them itself — EditorHost places each in a different EditorShell
 *  header zone. This harness renders all three into one DOM so plain RTL
 *  queries can reach whichever piece a test cares about. */
function Harness() {
  return (
    <RenderButton>
      {({ phaseControl, renderControls, renderStatus }) => (
        <div>
          <div data-testid="phase-slot">{phaseControl}</div>
          <div data-testid="controls-slot">{renderControls}</div>
          <div data-testid="status-slot">{renderStatus}</div>
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

describe('RenderButton — renderControls (Preview|Full)', () => {
  it('renders both actions, reachable in one click each, with their titles intact', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    render(<Harness />);
    expect(screen.getByRole('button', { name: /^Preview/ })).toHaveAttribute('title', 'Render a half-scale preview MP4');
    expect(screen.getByRole('button', { name: /^Full/ })).toHaveAttribute('title', 'Render the final full-scale MP4');
  });

  it('starts a preview render on click and disables both buttons while starting', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') return jsonResponse({});
      return jsonResponse({ running: false, done: false, percent: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /^Preview/ }));
    expect(screen.getByRole('button', { name: /^Preview/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Full/ })).toBeDisabled();

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === '/render' && (c[1] as RequestInit)?.method === 'POST');
      expect(call).toBeDefined();
      expect((call as any[])[1].body).toBe(JSON.stringify({ mode: 'preview' }));
    });
  });

  it('stays in place and clickable through a completed render — a second render can start without dismissing anything', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') return jsonResponse({});
      return jsonResponse({ running: false, done: true, percent: 100, mode: 'preview', outPath: '/out/reel.mp4' });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /^Preview/ }));

    await waitFor(() => expect(screen.getByText('reel.mp4')).toBeInTheDocument());
    // The control itself is still there and enabled — never swapped for a pill.
    expect(screen.getByRole('button', { name: /^Preview/ })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /^Full/ })).not.toBeDisabled();
  });

  it('shows a determinate progress readout on the control while rendering, without replacing it', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') return jsonResponse({});
      return jsonResponse({ running: true, done: false, percent: 42, mode: 'full' });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /^Full/ }));

    await waitFor(() => expect(screen.getByText('Full 42%')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Preview/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Full/ })).toBeDisabled();
  });
});

describe('RenderButton — renderStatus toast', () => {
  it('is absent while idle', () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    render(<Harness />);
    expect(screen.getByTestId('status-slot')).toBeEmptyDOMElement();
  });

  it('shows the output basename (full path in the title) plus Show in Finder and a dismiss, once done', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') return jsonResponse({});
      return jsonResponse({ running: false, done: true, percent: 100, mode: 'full', outPath: '/Users/x/out/final.mp4' });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /^Full/ }));

    const toast = await screen.findByText('final.mp4');
    expect(toast.closest('[title]')).toHaveAttribute('title', '/Users/x/out/final.mp4');

    const revealBtn = screen.getByRole('button', { name: /Show in Finder/i });
    fireEvent.click(revealBtn);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === '/render' && (c[1] as RequestInit)?.body?.toString().includes('reveal'));
      expect(call).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('final.mp4')).not.toBeInTheDocument();
  });

  it('shows an error in the toast (not inline, not shoving the controls) and can be dismissed', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/render' && init?.method === 'POST') return jsonResponse({});
      return jsonResponse({ running: false, done: false, percent: 0, error: 'Render process crashed' });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /^Preview/ }));

    await screen.findByText('Render process crashed');
    // The Preview|Full control is usable again — errors don't lock the tool.
    expect(screen.getByRole('button', { name: /^Preview/ })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Render process crashed')).not.toBeInTheDocument();
  });
});
