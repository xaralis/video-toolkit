import type { Grade } from '../reel-config-base/base-types';
import { gradeNeedsWb, gradeWbMatrixValues } from '../reel-config-base/grade';

// Renders the hidden SVG <filter> that `gradeFilter(...)` references by id for
// white-balance (temperature / tint). Returns null when the grade has no WB
// component — brightness/contrast/saturation use native CSS filter functions
// and need no SVG. Render once per graded segment, alongside the video.
export const GradeDefs: React.FC<{ id: string; grade?: Grade }> = ({ id, grade }) => {
  if (!gradeNeedsWb(grade)) return null;
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
      <defs>
        <filter id={id} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={gradeWbMatrixValues(grade!)} />
        </filter>
      </defs>
    </svg>
  );
};
