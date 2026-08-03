export type ShortcutGroup = 'Playback' | 'Editing' | 'Timeline' | 'File' | 'Help';

export interface Shortcut {
  id: string;
  /** Display form, e.g. '⌘Z'. */
  keys: string;
  match: (e: KeyboardEvent) => boolean;
  label: string;
  group: ShortcutGroup;
}

const mod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;
const bare = (e: KeyboardEvent) => !e.metaKey && !e.ctrlKey && !e.altKey;

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'save', keys: '⌘S', group: 'File', label: 'Save', match: (e) => mod(e) && e.key.toLowerCase() === 's' },
  { id: 'play', keys: 'Space', group: 'Playback', label: 'Play / pause', match: (e) => bare(e) && (e.key === ' ' || e.code === 'Space') },
  { id: 'stepBack', keys: '←', group: 'Playback', label: 'Back 1 frame', match: (e) => bare(e) && !e.shiftKey && e.key === 'ArrowLeft' },
  { id: 'stepFwd', keys: '→', group: 'Playback', label: 'Forward 1 frame', match: (e) => bare(e) && !e.shiftKey && e.key === 'ArrowRight' },
  { id: 'jumpBack', keys: '⇧←', group: 'Playback', label: 'Back 10 frames', match: (e) => bare(e) && e.shiftKey && e.key === 'ArrowLeft' },
  { id: 'jumpFwd', keys: '⇧→', group: 'Playback', label: 'Forward 10 frames', match: (e) => bare(e) && e.shiftKey && e.key === 'ArrowRight' },
  { id: 'toStart', keys: 'Home', group: 'Playback', label: 'Jump to start', match: (e) => bare(e) && e.key === 'Home' },
  { id: 'toEnd', keys: 'End', group: 'Playback', label: 'Jump to end', match: (e) => bare(e) && e.key === 'End' },
  { id: 'undo', keys: '⌘Z', group: 'Editing', label: 'Undo', match: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === 'z' },
  { id: 'redo', keys: '⌘⇧Z', group: 'Editing', label: 'Redo', match: (e) => mod(e) && e.shiftKey && e.key.toLowerCase() === 'z' },
  { id: 'delete', keys: '⌫', group: 'Editing', label: 'Delete selected', match: (e) => bare(e) && (e.key === 'Delete' || e.key === 'Backspace') },
  { id: 'split', keys: 'S', group: 'Editing', label: 'Split at playhead', match: (e) => bare(e) && !e.shiftKey && e.key.toLowerCase() === 's' },
  { id: 'duplicate', keys: '⌘D', group: 'Editing', label: 'Duplicate selected', match: (e) => mod(e) && e.key.toLowerCase() === 'd' },
  { id: 'deselect', keys: 'Esc', group: 'Editing', label: 'Deselect', match: (e) => bare(e) && e.key === 'Escape' },
  { id: 'zoomIn', keys: '+', group: 'Timeline', label: 'Zoom in', match: (e) => bare(e) && (e.key === '+' || e.key === '=') },
  { id: 'zoomOut', keys: '-', group: 'Timeline', label: 'Zoom out', match: (e) => bare(e) && e.key === '-' },
  { id: 'help', keys: '?', group: 'Help', label: 'Show shortcuts', match: (e) => bare(e) && e.key === '?' },
];
