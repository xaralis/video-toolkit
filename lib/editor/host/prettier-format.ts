/**
 * Formats Save's surgically-updated source with the *project's own* Prettier (config resolved
 * from `filePath`), so Save produces diffs that match the project's style (e.g. `singleQuote`)
 * instead of the surgical writer's raw double-quoted, sometimes-misindented output. Mirrors how
 * Remotion Studio's own "update default props" codemod formats after editing.
 *
 * This lives in core deliberately — it resolves the *project's* own Prettier config from the
 * file path, so it is generic machinery, identical for every brand, not brand-specific policy.
 * The formatter-agnostic rule this repo otherwise holds applies to `createSaveHandler`
 * (`lib/editor/src/save-endpoint.ts`), which must keep taking `format` as an option rather than
 * hardcoding a formatter — that contract is unchanged. This function is simply the *default*
 * value for `EditorPluginOptions.format`, still overridable by any caller that wants a different
 * (or no) formatting pass.
 *
 * If Prettier can't be loaded or no config resolves for this file, the source is returned
 * unchanged so a missing/misconfigured Prettier never breaks Save.
 */
export async function formatWithProjectPrettier(source: string, filePath: string): Promise<string> {
  try {
    // Built from a variable, not a string literal: Vite/vite-node's import-analysis
    // statically resolves literal dynamic-import specifiers at transform time (even
    // inside a try/catch, and even with a `/* @vite-ignore */` comment under
    // vitest's SSR transform), which would fail the whole module load in any
    // environment — like core's own — that has no `prettier` devDependency. A
    // non-literal specifier defers resolution to real runtime `import()`, so a
    // project without Prettier still saves; this catch is what makes that graceful.
    const prettierSpecifier = 'prettier';
    const prettier = await import(prettierSpecifier);
    const config = await prettier.resolveConfig(filePath);
    if (!config) {
      return source;
    }
    return await prettier.format(source, { ...config, filepath: filePath });
  } catch (err) {
    console.error('[video-toolkit-editor] Prettier formatting failed; writing unformatted source:', err);
    return source;
  }
}
