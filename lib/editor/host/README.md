# The editor host

Core owns the whole reel editor — state, history, keyboard handling, the preview
Player, the timeline toolbar, crop gestures, save/discard. A brand supplies only
configuration: its composition, its frame size, its palette, its editor
vocabulary.

## A brand's `.editor/main.tsx`

```tsx
import { mountEditorHost } from '@video-toolkit/lib/editor/host/mount';
import { LayeredCampaignReel } from '../src/LayeredCampaignReel';
import { brandTheme } from '../src/config/brand-theme';
import { editorMeta } from '../src/config/editor-meta'; // the brand must author this module (or drop this import and the `meta:` line below until it does)
import { fps, width, height } from '../src/config/reel-config';
import '../src/styles/global.css';

mountEditorHost({
  component: LayeredCampaignReel,
  projectName: 'campaign-reels',
  fps,
  width,
  height,
  accentSlots: brandTheme.accentSlots,
  meta: editorMeta,
});
```

That is the whole file. Only `component`, `projectName`, `fps`, `width` and
`height` are required; a template with no palette, no editor vocabulary and no
stylesheet of its own drops the last three lines and the CSS import.

## Two rules

**`meta` and `accentSlots` must be module-level constants, never inline object
literals.** `LayeredTimeline` is `memo`ized with a shallow compare and it
re-renders on every playhead frame; a fresh object each render defeats the memo
entirely and makes playback stutter. Import them, or wrap them in `useMemo` —
never write `meta={{ … }}` at the call site.

**`accentSlots` has no default.** Omitting it means the inspector's accent editor
offers no palette — it never falls back to some colour core picked. A brand's
colours reach the editor through this prop or not at all.

## What the host ships that no brand configures

- Beats snapping. The toggle is always rendered; a reel without `meta.guidesMs`
  disables it by itself, so there is no per-brand flag.
- Undo/redo (⌘Z / ⌘⇧Z), Escape to deselect, Space to play/pause, ⌫ to delete.
- Save (⌘S or the header button) POSTs `{ props: { reel } }` to `/save`; the
  initial reel is loaded from `/props`. A dirty reel arms a `beforeunload` guard.
- Focus/Zoom on the preview: pinch to zoom a clip's crop, two-finger scroll or
  drag to move its focal point.

## `mountEditorHost(options, container?)`

Renders `<EditorHost>` into `container`, defaulting to `#root`. Throws if
neither exists. `EditorHost` itself is exported from `./EditorHost` for hosts
that manage their own React root.
