/** The editor chrome's "on" accent — core's editor UI colour, NOT a brand
 *  colour. Mirrors `--ed-color-accent` in `app/editor.in.css`; kept as a JS
 *  string for the few consumers that cannot use a class (an SVG stroke, a
 *  spinner border). A brand's palette reaches the editor only through
 *  `accentSlots`. */
export const EDITOR_ACCENT = '#7c5cff';

/** A square icon button (zoom, transport). */
export const zoomBtnClass =
  'ed:bg-control ed:text-ink ed:border ed:border-line ed:rounded ed:w-7 ed:h-7 ed:text-xs ed:leading-none ed:cursor-pointer ed:inline-flex ed:items-center ed:justify-center ed:gap-1.5';

/** A pill toggle (Ripple / Snap / Beats): accented when on, neutral when off. */
export const toggleBtnClass = (on: boolean): string =>
  `ed:h-7 ed:px-3 ed:text-xs ed:rounded ed:border ed:border-line ed:cursor-pointer ed:inline-flex ed:items-center ed:gap-1.5 ${
    on ? 'ed:bg-accent ed:text-accent-ink' : 'ed:bg-control ed:text-ink'
  }`;
