import { createRoot } from 'react-dom/client';
import { EditorHost, type EditorHostOptions } from './EditorHost';

export type { EditorHostOptions };

/**
 * Mounts the reel editor. A brand's `.editor/main.tsx` is this call plus its own
 * CSS import — see lib/editor/host/README.md.
 */
export function mountEditorHost(options: EditorHostOptions, container?: HTMLElement): void {
  const el = container ?? document.getElementById('root');
  if (!el) throw new Error('mountEditorHost: no #root element (is index.html missing <div id="root">?)');
  createRoot(el).render(<EditorHost {...options} />);
}
