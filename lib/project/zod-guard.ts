// Warns when a brand repo's zod is not the one Remotion can actually use.
//
// The contract is in docs/zod-version.md: exactly 3.22.3, and it is imposed by
// REMOTION, not by core. Remotion 4.0.425 is zod-3-only, 4.0.489 accepts both,
// so the intersection across the versions in use is a single major. Core itself
// is nearly major-agnostic.
//
// WARNS, NEVER THROWS — deliberately, and this is the whole design of the file.
// A hard assertion here turns a routine `git submodule update` into a hard stop
// on a repo that very likely still renders fine: nothing about a zod-4 install
// is broken until a schema actually crosses the boundary, and the failure it
// eventually produces ("discriminator value for key `type` could not be
// extracted") is the thing the zod$ alias already prevents. The cost of the
// mismatch is subtler than a crash — the brand runs core's shared schema code
// on a major core's own tests never exercise — so the right response is to say
// so, once, and keep going.
//
// Sequencing note: this landed only AFTER both brand repos moved off zod 4
// (Phase 2.5). Added before that, it would have fired on every build of the one
// repo that was not broken, which is exactly how a warning gets tuned out.
import path from 'node:path';
import { createRequire } from 'node:module';

/** The single version every brand repo should resolve. See docs/zod-version.md. */
export const REQUIRED_ZOD = '3.22.3';

export interface ZodGuardOptions {
  /** Seams for testing. */
  readVersion?: (projectRoot: string) => string | null;
  warn?: (message: string) => void;
}

const defaultReadVersion = (projectRoot: string): string | null => {
  try {
    const req = createRequire(path.join(projectRoot, 'index.js'));
    return (req('zod/package.json') as { version?: string }).version ?? null;
  } catch {
    // Unresolvable zod is not this guard's business — applyToolkitWebpack and
    // createEditorViteConfig both already throw on it, loudly and with a better
    // message, before anything here could add value.
    return null;
  }
};

/**
 * Emit a one-line warning if the project's resolved zod is not `3.22.3`.
 * Returns the version it saw (or `null` when zod could not be resolved), so a
 * caller can assert on it without capturing console output.
 */
export function warnOnZodMismatch(projectRoot: string, opts: ZodGuardOptions = {}): string | null {
  const version = (opts.readVersion ?? defaultReadVersion)(projectRoot);
  if (version === null || version === REQUIRED_ZOD) return version;

  const warn = opts.warn ?? ((m: string) => console.warn(m));
  const major = version.split('.')[0];
  warn(
    `[video-toolkit] zod ${version} resolved in ${projectRoot}, but Remotion's ` +
      `@remotion/zod-types pins exactly ${REQUIRED_ZOD}. ` +
      (major === '3'
        ? 'Same major, so this is hygiene rather than a break.'
        : `Major ${major} is NOT what core's schemas are tested against — a schema crossing ` +
          'the Remotion boundary can fail in ways nothing here checks.') +
      ' See toolkit/docs/zod-version.md. (Warning only; nothing is blocked.)',
  );
  return version;
}
