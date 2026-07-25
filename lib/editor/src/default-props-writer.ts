import { Project, SyntaxKind } from 'ts-morph';
import type {
  ArrayLiteralExpression,
  JsxAttribute,
  JsxOpeningElement,
  JsxSelfClosingElement,
  Node,
  ObjectLiteralExpression,
  PropertyAssignment,
} from 'ts-morph';

type CompositionEl = JsxSelfClosingElement | JsxOpeningElement;

/**
 * Evaluates a JSON-shaped literal expression node (object/array/string/number/boolean/null,
 * optionally negative numbers) without executing any code. This intentionally does NOT use
 * `eval`/`new Function` on the expression text: `readDefaultProps` will later be used by the
 * save endpoint to read back arbitrary `Root.tsx` source, and that source must never be
 * executed as JS. Any node kind outside this literal grammar (identifiers, function calls,
 * template expressions with substitutions, etc.) throws instead of silently running it.
 */
function evaluateLiteral(node: Node): unknown {
  switch (node.getKind()) {
    case SyntaxKind.ObjectLiteralExpression: {
      const obj = node.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      // Build on a null-prototype object so a literal key named "__proto__" (or any other
      // Object.prototype accessor) becomes an ordinary own data property via [[Set]] instead of
      // triggering the inherited `__proto__` setter and reassigning the result's prototype. The
      // final spread copies every own enumerable property (including a key literally named
      // "__proto__") onto a normal plain object via [[DefineOwnProperty]], not [[Set]] — matching
      // JSON.parse's semantics of always producing a real own data property.
      const result: Record<string, unknown> = Object.create(null);
      for (const prop of obj.getProperties()) {
        if (!prop.isKind(SyntaxKind.PropertyAssignment)) {
          throw new Error(
            `readDefaultProps: unsupported object member "${prop.getText()}" (only plain "key: value" properties are supported).`,
          );
        }
        const nameNode = prop.getNameNode();
        let key: string;
        if (nameNode.isKind(SyntaxKind.StringLiteral)) {
          key = nameNode.getLiteralValue();
        } else if (nameNode.isKind(SyntaxKind.Identifier)) {
          key = nameNode.getText();
        } else {
          throw new Error(
            `readDefaultProps: unsupported object member "${prop.getText()}" (computed property names are not supported; only plain "key: value" properties are supported).`,
          );
        }
        result[key] = evaluateLiteral(prop.getInitializerOrThrow());
      }
      return { ...result };
    }
    case SyntaxKind.ArrayLiteralExpression: {
      const arr = node.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
      return arr.getElements().map((el) => evaluateLiteral(el));
    }
    case SyntaxKind.StringLiteral:
      return node.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
    case SyntaxKind.NoSubstitutionTemplateLiteral:
      return node.asKindOrThrow(SyntaxKind.NoSubstitutionTemplateLiteral).getLiteralValue();
    case SyntaxKind.NumericLiteral:
      return node.asKindOrThrow(SyntaxKind.NumericLiteral).getLiteralValue();
    case SyntaxKind.TrueKeyword:
      return true;
    case SyntaxKind.FalseKeyword:
      return false;
    case SyntaxKind.NullKeyword:
      return null;
    case SyntaxKind.PrefixUnaryExpression: {
      const unary = node.asKindOrThrow(SyntaxKind.PrefixUnaryExpression);
      if (unary.getOperatorToken() === SyntaxKind.MinusToken) {
        const operand = evaluateLiteral(unary.getOperand());
        if (typeof operand === 'number') return -operand;
      }
      throw new Error(`readDefaultProps: unsupported expression "${node.getText()}".`);
    }
    case SyntaxKind.ParenthesizedExpression:
      return evaluateLiteral(node.asKindOrThrow(SyntaxKind.ParenthesizedExpression).getExpression());
    case SyntaxKind.AsExpression:
      // `X as const` / `X as SomeType` are type-only at runtime; the value is the inner
      // expression. Unwrapping and evaluating that is safe — still no code execution.
      return evaluateLiteral(node.asKindOrThrow(SyntaxKind.AsExpression).getExpression());
    case SyntaxKind.SatisfiesExpression:
      // `X satisfies T` is likewise type-only at runtime.
      return evaluateLiteral(node.asKindOrThrow(SyntaxKind.SatisfiesExpression).getExpression());
    default:
      throw new Error(`readDefaultProps: unsupported expression "${node.getText()}".`);
  }
}

function compositionElements(sf: ReturnType<Project['createSourceFile']>): CompositionEl[] {
  return [
    ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
  ].filter((el) => el.getTagNameNode().getText() === 'Composition');
}

function idOf(el: CompositionEl): string | undefined {
  const attr = el.getAttributes().find(
    (a): a is JsxAttribute =>
      a.getKind() === SyntaxKind.JsxAttribute &&
      (a as JsxAttribute).getNameNode().getText() === 'id',
  );
  const init = attr?.getInitializer();
  if (!init) return undefined;
  if (init.getKind() === SyntaxKind.StringLiteral) {
    return init.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
  }
  const expr = init.asKind(SyntaxKind.JsxExpression)?.getExpression();
  return expr?.asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
}

function findDefaultPropsAttr(source: string, compositionId?: string): JsxAttribute {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile('Root.tsx', source, { overwrite: true });
  let comps = compositionElements(sf);
  if (comps.length === 0) {
    throw new Error('rewriteDefaultProps: no <Composition> element found in source.');
  }
  if (compositionId) {
    comps = comps.filter((el) => idOf(el) === compositionId);
    if (comps.length === 0) {
      throw new Error(`rewriteDefaultProps: no <Composition> with id="${compositionId}".`);
    }
  } else if (comps.length > 1) {
    throw new Error(
      'rewriteDefaultProps: multiple <Composition> elements; pass opts.compositionId to disambiguate.',
    );
  }
  const attr = comps[0].getAttributes().find(
    (a): a is JsxAttribute =>
      a.getKind() === SyntaxKind.JsxAttribute &&
      (a as JsxAttribute).getNameNode().getText() === 'defaultProps',
  );
  if (!attr) {
    throw new Error('rewriteDefaultProps: <Composition> has no defaultProps attribute.');
  }
  return attr;
}

export function rewriteDefaultProps(
  source: string,
  props: unknown,
  opts: { compositionId?: string } = {},
): string {
  const attr = findDefaultPropsAttr(source, opts.compositionId);
  const json = JSON.stringify(props, null, 2);
  attr.setInitializer(`{${json}}`);
  return attr.getSourceFile().getFullText();
}

export function readDefaultProps(
  source: string,
  opts: { compositionId?: string } = {},
): unknown {
  const attr = findDefaultPropsAttr(source, opts.compositionId);
  const expr = attr
    .getInitializer()
    ?.asKind(SyntaxKind.JsxExpression)
    ?.getExpression();
  if (!expr) {
    throw new Error('readDefaultProps: defaultProps initializer is not a JSX expression.');
  }
  // The literal may be either JSON produced by rewriteDefaultProps (double-quoted keys) or a
  // hand-written JS object literal (unquoted keys, single-quoted strings) for compositions that
  // haven't been rewritten yet — plain JSON.parse only handles the former. Walk the already-
  // parsed AST instead of JSON.parse'ing or eval'ing the source text.
  return evaluateLiteral(expr);
}

/**
 * Verifies that `source` — freshly produced by `updateDefaultPropsSurgically`, and possibly by a
 * caller's formatter after it — actually reads back as `expected`, and throws if it doesn't.
 *
 * Re-PARSING the rewritten source is not a sufficient gate. TypeScript's parser is deliberately
 * error-recovering, so a truncated literal such as `defaultProps={{ a: [1, 2 }}` yields a value
 * instead of throwing — and an unbalanced bracket or a swallowed element is exactly the shape a bug
 * in the raw character-range surgery of `applyArraySpliceToSource` (an off-by-one `tail` slice, a
 * mis-joined `parts` list) would produce. Comparing the round-tripped VALUE closes that gap: any
 * rewrite that lost, duplicated, or altered data is rejected before the caller writes anything.
 *
 * `expected` is normalised through JSON first, because that is the only shape the writer can
 * actually emit: `JSON.stringify` drops `undefined` members and turns a `Date` into a string, so
 * comparing against the raw input would flag those faithful round-trips as corruption.
 */
export function verifyDefaultProps(
  source: string,
  expected: unknown,
  opts: { compositionId?: string } = {},
): void {
  const readBack = readDefaultProps(source, opts);
  let json: string | undefined;
  try {
    json = JSON.stringify(expected);
  } catch {
    json = undefined;
  }
  const normalized = json === undefined ? expected : (JSON.parse(json) as unknown);
  if (!deepEqual(readBack, normalized)) {
    throw new Error(
      'verifyDefaultProps: the rewritten source does not match the props that were saved — ' +
        'the rewrite is corrupt and was NOT written to disk.',
    );
  }
}

type PathSegment = string | number;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return a === b;
}

/**
 * A single surgical edit to apply to the source AST:
 *  - `replace`: the node at `path` changed value/shape in a way that can't be edited in place
 *    (a genuine scalar difference, a key was REMOVED from an object, or a type change) — the whole
 *    node at that path is re-serialized from scratch. `path` may be `[]`, meaning the entire
 *    top-level props object is replaced.
 *  - `add`: `path`'s last segment is a NEW key that didn't exist on the object at the parent path
 *    — every other existing key on that object (and its comments/`as const`) is left untouched;
 *    only a new property is inserted into the existing object literal.
 *
 * `replace`/`add` carry their `value` inline rather than letting the apply phase re-read it out of
 * the new props by `path`. Array segments in a `path` index the array AS IT EXISTS IN THE SOURCE,
 * which is NOT the same index the element has in the new props once anything ahead of it was
 * inserted or deleted — looking the value up by `path` would read the wrong element (or run off
 * the end of a shortened array).
 *  - `array-splice`: elements were inserted into and/or deleted from the array at `path`.
 *    `start`/`deleteCount` are indices into the array AS IT EXISTS IN THE SOURCE (the old array),
 *    and `newElements` are freshly serialized values to insert at that position. A single Save may
 *    produce SEVERAL disjoint splices for one array (plus ordinary `replace`/`add` ops for
 *    elements that merely changed in place); the apply phase therefore runs all non-splice ops
 *    first and then the splices from the highest `start` down, so every op's indices stay valid
 *    against the original AST. Every element outside a splice's own `[start, start+deleteCount)`
 *    range — including its comments/`as const` — is left byte-untouched.
 */
type DiffOp =
  | { kind: 'replace'; path: PathSegment[]; value: unknown }
  | { kind: 'add'; path: PathSegment[]; value: unknown }
  | { kind: 'array-splice'; path: PathSegment[]; start: number; deleteCount: number; newElements: unknown[] };

/**
 * Longest-common-subsequence alignment of two arrays under `matches` (defaults to `deepEqual`).
 * Returns the matched `[oldIndex, newIndex]` anchor pairs in increasing order. Under `deepEqual`,
 * anchors are elements that survived the edit completely unchanged; everything between two anchors
 * is a "gap" that was inserted, deleted, or edited in place. This is what lets several disjoint
 * edits in one array be expressed as several small ops instead of one big run covering all of them.
 * A looser `matches` (see `identityAnchors`) is used inside a gap to line up elements that are the
 * SAME element but no longer equal because the user edited them.
 */
function lcsAnchors(
  oldArr: unknown[],
  newArr: unknown[],
  matches: (a: unknown, b: unknown) => boolean = deepEqual,
): Array<[number, number]> {
  const n = oldArr.length;
  const m = newArr.length;
  const eq: boolean[][] = Array.from({ length: n }, (_unused, i) =>
    Array.from({ length: m }, (_unused2, j) => matches(oldArr[i], newArr[j])),
  );

  // dp[i][j] = LCS length of oldArr[i..] and newArr[j..]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = eq[i][j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const anchors: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq[i][j]) {
      anchors.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return anchors;
}

/**
 * The stable identity of an array element, if it has one. Reel segments, overlays, and transitions
 * all carry a unique `id`, which is what lets a gap's old and new elements be paired by WHICH
 * element they are rather than by where they happen to sit — see `identityAnchors`.
 */
function stableKeyOf(value: unknown): string | undefined {
  if (!isPlainObject(value)) return undefined;
  const id = value.id;
  if (typeof id === 'string') return `s:${id}`;
  if (typeof id === 'number') return `n:${id}`;
  return undefined;
}

function keyCounts(values: unknown[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = stableKeyOf(value);
    if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Aligns a gap's old and new elements by stable identity (`id`), returning order-preserving
 * `[oldIndex, newIndex]` pairs. This is what keeps an author's comment attached to the element they
 * wrote it for: a gap's elements are otherwise paired positionally from its head, so a DELETION at
 * the head of a gap followed by a surviving-but-EDITED element would shift the pairing by one and
 * rewrite the deleted element's source node — comment and all — with the survivor's data.
 *
 * A key only anchors when it occurs exactly once on each side; a duplicated `id` is ambiguous, so
 * those elements fall back to positional pairing rather than guessing. Elements with no `id` at all
 * (nested scalar/array members, hand-written objects without one) likewise fall back.
 */
function identityAnchors(oldGap: unknown[], newGap: unknown[]): Array<[number, number]> {
  const oldCounts = keyCounts(oldGap);
  const newCounts = keyCounts(newGap);
  if (oldCounts.size === 0 || newCounts.size === 0) return [];
  return lcsAnchors(oldGap, newGap, (a, b) => {
    const key = stableKeyOf(a);
    if (key === undefined || key !== stableKeyOf(b)) return false;
    return oldCounts.get(key) === 1 && newCounts.get(key) === 1;
  });
}

/**
 * Diffs two arrays into the smallest set of ops that turns the old one into the new one.
 *
 * A common prefix and suffix are trimmed first (the cheap, overwhelmingly common case), then the
 * remaining middle is aligned with `lcsAnchors`. Elements that survived unchanged act as anchors
 * and are never touched. Each gap between anchors is aligned a second time — by stable `id`, via
 * `identityAnchors` — so an element that was merely EDITED (its trim nudged, say) is recognised as
 * the same element, recursed into leaf-by-leaf, and keeps its own comments/`as const`, even when
 * elements around it were inserted or deleted in the same Save. Whatever is left between two
 * identity anchors has no identity correspondence and is paired positionally from the head, with a
 * splice for the leftover insert or delete. That is what keeps "edit element 0 AND insert at
 * index 2" as two small disjoint ops instead of one run that reserializes everything between them.
 *
 * With no anchors and equal lengths this degenerates to plain index-by-index recursion, which is
 * exactly what a same-length array diff should do.
 */
function diffArrayElements(
  oldArr: unknown[],
  newArr: unknown[],
  path: PathSegment[],
  out: DiffOp[],
): void {
  const oldLen = oldArr.length;
  const newLen = newArr.length;
  const maxPrefix = Math.min(oldLen, newLen);

  let prefix = 0;
  while (prefix < maxPrefix && deepEqual(oldArr[prefix], newArr[prefix])) prefix++;

  let suffix = 0;
  const maxSuffix = maxPrefix - prefix;
  while (
    suffix < maxSuffix &&
    deepEqual(oldArr[oldLen - 1 - suffix], newArr[newLen - 1 - suffix])
  ) {
    suffix++;
  }

  const oldMid = oldArr.slice(prefix, oldLen - suffix);
  const newMid = newArr.slice(prefix, newLen - suffix);

  let oi = 0;
  let ni = 0;
  const emitGap = (oEnd: number, nEnd: number): void => {
    const oldGap = oldMid.slice(oi, oEnd);
    const newGap = newMid.slice(ni, nEnd);
    // Indices below are relative to the gap; `prefix + oi + …` maps them back onto the SOURCE array.
    let o = 0;
    let n = 0;
    const emitPositional = (oStop: number, nStop: number): void => {
      const paired = Math.min(oStop - o, nStop - n);
      for (let k = 0; k < paired; k++) {
        diffOps(oldGap[o + k], newGap[n + k], [...path, prefix + oi + o + k], out);
      }
      // At most one of these is non-zero (`paired` consumed the shorter side).
      const deleteCount = oStop - o - paired;
      const inserted = newGap.slice(n + paired, nStop);
      if (deleteCount > 0 || inserted.length > 0) {
        out.push({
          kind: 'array-splice',
          path: path.slice(),
          start: prefix + oi + o + paired,
          deleteCount,
          newElements: inserted,
        });
      }
      o = oStop;
      n = nStop;
    };

    for (const [anchorOld, anchorNew] of identityAnchors(oldGap, newGap)) {
      emitPositional(anchorOld, anchorNew);
      // Same element, edited: recurse so it is updated leaf-by-leaf in its own source node.
      diffOps(oldGap[anchorOld], newGap[anchorNew], [...path, prefix + oi + anchorOld], out);
      o = anchorOld + 1;
      n = anchorNew + 1;
    }
    emitPositional(oldGap.length, newGap.length);

    oi = oEnd;
    ni = nEnd;
  };

  for (const [anchorOld, anchorNew] of lcsAnchors(oldMid, newMid)) {
    emitGap(anchorOld, anchorNew);
    oi = anchorOld + 1;
    ni = anchorNew + 1;
  }
  emitGap(oldMid.length, newMid.length);
}

/** Orders two op paths. Numeric segments compare numerically (so index 10 sorts after index 2);
 * when one path is a prefix of the other, the deeper path sorts last. */
function comparePaths(a: PathSegment[], b: PathSegment[]): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return a.length - b.length;
}

/**
 * Walks `oldVal`/`newVal` in parallel and collects the surgical edits needed to turn the former
 * into the latter (see `DiffOp`).
 *
 * Object handling distinguishes two cases by key set:
 *  - **Superset** (every old key is still present, plus zero or more new keys): recurse into
 *    every existing key as usual, and emit an `add` op for each new key. The existing object
 *    literal AST node is never replaced wholesale, so its comments/`as const` survive.
 *  - **Key removed** (regardless of whether keys were also added): there is no source AST node
 *    to surgically delete a property from, so the whole object at this path is replaced instead.
 *
 * Arrays go through `diffArrayElements`, which aligns old and new elements and emits one op per
 * independent edit — elements that only changed value are recursed into (keeping their comments/
 * `as const`), and only genuinely inserted/deleted runs become `array-splice` ops. This covers
 * append, prepend, insert-in-the-middle, delete, duplicate, and several disjoint edits in one
 * Save, without reserializing untouched siblings.
 */
function diffOps(oldVal: unknown, newVal: unknown, path: PathSegment[], out: DiffOp[]): void {
  if (deepEqual(oldVal, newVal)) return;

  if (isPlainObject(oldVal) && isPlainObject(newVal)) {
    const keysA = Object.keys(oldVal);
    const keysB = Object.keys(newVal);
    const keysBSet = new Set(keysB);
    const removedKeys = keysA.filter((k) => !keysBSet.has(k));

    if (removedKeys.length > 0) {
      out.push({ kind: 'replace', path: path.slice(), value: newVal });
      return;
    }

    const keysASet = new Set(keysA);
    for (const k of keysA) {
      diffOps(oldVal[k], newVal[k], [...path, k], out);
    }
    for (const k of keysB) {
      if (!keysASet.has(k)) {
        out.push({ kind: 'add', path: [...path, k], value: newVal[k] });
      }
    }
    return;
  }

  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    diffArrayElements(oldVal, newVal, path, out);
    return;
  }

  // Scalar difference or type change: replace the whole node at this path.
  out.push({ kind: 'replace', path: path.slice(), value: newVal });
}

/** Unwraps `as const` / `satisfies T` / parenthesized wrappers to reach the underlying value node. */
function unwrapValue(node: Node): Node {
  let n = node;
  for (;;) {
    if (n.getKind() === SyntaxKind.AsExpression) {
      n = n.asKindOrThrow(SyntaxKind.AsExpression).getExpression();
    } else if (n.getKind() === SyntaxKind.SatisfiesExpression) {
      n = n.asKindOrThrow(SyntaxKind.SatisfiesExpression).getExpression();
    } else if (n.getKind() === SyntaxKind.ParenthesizedExpression) {
      n = n.asKindOrThrow(SyntaxKind.ParenthesizedExpression).getExpression();
    } else {
      break;
    }
  }
  return n;
}

function getObjectProperty(objLit: ObjectLiteralExpression, key: string): PropertyAssignment {
  const prop = objLit.getProperties().find((p): p is PropertyAssignment => {
    if (!p.isKind(SyntaxKind.PropertyAssignment)) return false;
    const nameNode = p.getNameNode();
    if (nameNode.isKind(SyntaxKind.StringLiteral)) return nameNode.getLiteralValue() === key;
    if (nameNode.isKind(SyntaxKind.Identifier)) return nameNode.getText() === key;
    return false;
  });
  if (!prop) {
    throw new Error(`updateDefaultPropsSurgically: property "${key}" not found in source AST.`);
  }
  return prop;
}

/** Navigates from `topValueNode` through `path` segments (object keys / array indices),
 * unwrapping `as const`/`satisfies`/parens at each container, and returns the value node reached
 * at the end of `path`. Throws if any intermediate container isn't the expected object/array
 * literal kind, or an array index is out of bounds. An empty `path` returns `topValueNode` as-is. */
function navigateToValueNode(topValueNode: Node, path: PathSegment[]): Node {
  let node: Node = topValueNode;
  for (const seg of path) {
    const container = unwrapValue(node);
    if (typeof seg === 'string') {
      if (container.getKind() !== SyntaxKind.ObjectLiteralExpression) {
        throw new Error(
          `updateDefaultPropsSurgically: expected an object literal at path segment "${seg}".`,
        );
      }
      const prop = getObjectProperty(
        container.asKindOrThrow(SyntaxKind.ObjectLiteralExpression),
        seg,
      );
      node = prop.getInitializerOrThrow();
    } else {
      if (container.getKind() !== SyntaxKind.ArrayLiteralExpression) {
        throw new Error(
          `updateDefaultPropsSurgically: expected an array literal at path index ${seg}.`,
        );
      }
      const elements = (container as ArrayLiteralExpression).getElements();
      if (seg < 0 || seg >= elements.length) {
        throw new Error(`updateDefaultPropsSurgically: array index ${seg} out of bounds.`);
      }
      node = elements[seg];
    }
  }
  return node;
}

/** A key is emitted verbatim as an identifier property name when it looks like one; anything else
 * (hyphens, leading digits, etc.) is emitted as a quoted string property name instead. */
function propertyNameFor(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

/** Applies a single changed-leaf `replace` op by navigating the AST from `topValueNode` and
 * rewriting only the final node's text — every sibling and every ancestor's comments/`as const`
 * are left byte-untouched. */
function applyLeafChange(topValueNode: Node, path: PathSegment[], newLeafValue: unknown): void {
  const parentPath = path.slice(0, -1);
  const lastSeg = path[path.length - 1];
  const containerNode = unwrapValue(navigateToValueNode(topValueNode, parentPath));

  let valueNode: Node;
  if (typeof lastSeg === 'string') {
    if (containerNode.getKind() !== SyntaxKind.ObjectLiteralExpression) {
      throw new Error(
        `updateDefaultPropsSurgically: expected an object literal at path segment "${lastSeg}".`,
      );
    }
    valueNode = getObjectProperty(
      containerNode.asKindOrThrow(SyntaxKind.ObjectLiteralExpression),
      lastSeg,
    ).getInitializerOrThrow();
  } else {
    if (containerNode.getKind() !== SyntaxKind.ArrayLiteralExpression) {
      throw new Error(
        `updateDefaultPropsSurgically: expected an array literal at path index ${lastSeg}.`,
      );
    }
    const elements = (containerNode as ArrayLiteralExpression).getElements();
    if (lastSeg < 0 || lastSeg >= elements.length) {
      throw new Error(`updateDefaultPropsSurgically: array index ${lastSeg} out of bounds.`);
    }
    valueNode = elements[lastSeg];
  }

  const wasAsConst =
    valueNode.getKind() === SyntaxKind.AsExpression &&
    valueNode.asKindOrThrow(SyntaxKind.AsExpression).getTypeNodeOrThrow().getText() === 'const';
  const serialized = JSON.stringify(newLeafValue, null, 2);
  valueNode.replaceWithText(wasAsConst ? `${serialized} as const` : serialized);
}

/** Applies a single `add` op: `path`'s last segment is a brand-new object key that doesn't exist
 * on the object at the parent path. Inserts a new property assignment into the existing object
 * literal AST node in place — every existing property (and its comments/`as const`) is left
 * byte-untouched, since nothing about them is read or rewritten. */
function applyAddKey(topValueNode: Node, path: PathSegment[], newValue: unknown): void {
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  if (typeof key !== 'string') {
    throw new Error(
      'updateDefaultPropsSurgically: cannot surgically add an array element (only new object keys can be inserted in place).',
    );
  }

  const containerNode = unwrapValue(navigateToValueNode(topValueNode, parentPath));
  if (containerNode.getKind() !== SyntaxKind.ObjectLiteralExpression) {
    throw new Error(
      `updateDefaultPropsSurgically: expected an object literal at path segment "${key}".`,
    );
  }
  const objLit = containerNode.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  const serialized = JSON.stringify(newValue, null, 2);
  objLit.addPropertyAssignment({ name: propertyNameFor(key), initializer: serialized });
}

/** Applies a single `array-splice` op to `source` and returns the new source text: the
 * `deleteCount` elements starting at `start` are removed from the array literal at `path`, and
 * `newElements` (freshly serialized — they have no prior AST to preserve) are put in their place.
 *
 * The array literal's text is rebuilt from the VERBATIM source text of every element outside
 * `[start, start + deleteCount)` — each element's `getFullText()`, which carries its own leading
 * trivia (its comments and indentation) with it — and swapped into `source` by exact character
 * range. Both halves of that are deliberate:
 *  - ts-morph's `insertElements(index, …)` inserts *after* the leading trivia of the element
 *    currently at `index`, which silently swallows a neighbour's comment. Copying each surviving
 *    element's full text keeps the comment attached to the element the author wrote it for.
 *  - ts-morph's `replaceWithText` re-indents every line of the text it is handed, so untouched
 *    elements would come back shifted. Plain string splicing at `[arrayStart, arrayEnd)` leaves
 *    them byte-identical.
 *
 * Anything outside the `[…]` — including an `as const`/`satisfies` wrapping the array — is not
 * part of the replaced range and is therefore untouched. */
function applyArraySpliceToSource(
  source: string,
  compositionId: string | undefined,
  op: Extract<DiffOp, { kind: 'array-splice' }>,
): string {
  const attr = findDefaultPropsAttr(source, compositionId);
  const jsxExpr = attr.getInitializer()?.asKind(SyntaxKind.JsxExpression)?.getExpression();
  if (!jsxExpr) {
    throw new Error(
      'updateDefaultPropsSurgically: defaultProps initializer is not a JSX expression.',
    );
  }

  const containerNode = unwrapValue(navigateToValueNode(jsxExpr, op.path));
  if (containerNode.getKind() !== SyntaxKind.ArrayLiteralExpression) {
    throw new Error(
      `updateDefaultPropsSurgically: expected an array literal at path "${op.path.join('.')}".`,
    );
  }
  const arrLit = containerNode.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  const elements = arrLit.getElements();
  const { start, deleteCount } = op;
  if (start < 0 || start + deleteCount > elements.length) {
    throw new Error(
      `updateDefaultPropsSurgically: array splice [${start}, ${start + deleteCount}) out of bounds at path "${op.path.join('.')}".`,
    );
  }

  const before = elements.slice(0, start).map((el) => el.getFullText());
  const after = elements.slice(start + deleteCount).map((el) => el.getFullText());

  // Indent new elements like their surviving neighbours (the first indented line inside a kept
  // element's full text); fall back to the array's own indentation + one level when every original
  // element is being replaced and there is nothing to copy the indentation from.
  const neighbourIndent = [...before, ...after]
    .map((text) => /\n([ \t]*)\S/.exec(text)?.[1])
    .find((found) => found !== undefined);
  const indent = neighbourIndent ?? `${arrLit.getIndentationText()}  `;
  const serializedNew = op.newElements.map(
    (v) => `\n${indent}${JSON.stringify(v, null, 2).split('\n').join(`\n${indent}`)}`,
  );

  const parts = [...before, ...serializedNew, ...after];

  let replacement: string;
  if (parts.length === 0) {
    // Everything was deleted: there is no element left to hang the original trailing comma and
    // closing-bracket indentation off, so collapse to an empty literal.
    replacement = '[]';
  } else {
    // Everything from the last original element's end up to (and including) the closing bracket:
    // a trailing comma, any trailing comment, and the closing bracket's own indentation.
    const tail =
      elements.length > 0
        ? source.slice(elements[elements.length - 1].getEnd(), arrLit.getEnd())
        : source.slice(arrLit.getStart() + 1, arrLit.getEnd());
    replacement = `[${parts.join(',')}${tail}`;
  }

  return source.slice(0, arrLit.getStart()) + replacement + source.slice(arrLit.getEnd());
}

/**
 * Diff-based, surgical alternative to `rewriteDefaultProps`. Locates the `<Composition>`'s
 * `defaultProps={{…}}` literal, reads the CURRENT props out of it (via `evaluateLiteral`, so
 * `as const`/`satisfies` wrappers are already understood), deep-diffs against `newProps`, and
 * rewrites ONLY the AST nodes affected by the diff. Every unchanged property, comment, and
 * `as const`/`satisfies` assertion is left byte-for-byte untouched — this is what lets the reel
 * editor's Save preserve a human author's structure instead of regenerating the whole literal via
 * `JSON.stringify` (which strips both comments and type assertions).
 *
 * Object diffs are classified by key set:
 *  - **A key was ADDED** (the new object is a superset of the old, e.g. dragging the focus dot
 *    adds `focalY` to a segment that only had `focalX`): handled surgically. Existing keys whose
 *    values changed are replaced leaf-by-leaf as usual; each new key is inserted as a new
 *    property assignment into the existing object literal AST node. Nothing about the object's
 *    existing properties is read or rewritten, so their comments/`as const` survive untouched.
 *    This is recursive, so a new key nested inside an existing nested object is inserted the same
 *    way.
 *  - **A key was REMOVED** (regardless of whether keys were also added): there's no source AST
 *    node representing "a property that no longer exists" to surgically delete, so the whole
 *    object at that path is replaced with a freshly serialized literal instead — comments/
 *    `as const` *inside* that particular object are lost, but everything outside it (siblings,
 *    ancestors) is unaffected.
 *
 * Arrays are aligned old-to-new in two passes — a common prefix/suffix trim plus an LCS over the
 * middle finds the elements that survived UNCHANGED, then each remaining gap is aligned again by
 * stable `id` (`identityAnchors`) to find the elements that survived but were EDITED. A single Save
 * may therefore contain several independent array edits and each is handled on its own:
 *  - An element that merely CHANGED VALUE is recursed into and updated leaf-by-leaf in its own
 *    source node, exactly like any other object — its comments and `as const` survive. This holds
 *    even when elements around it were inserted or deleted in the same Save, **provided the
 *    element carries a unique `id`** (every reel segment, overlay, and transition does).
 *  - Elements that were INSERTED or DELETED are spliced into the existing array literal by
 *    rebuilding it from the verbatim source text of every element that stayed. Elements outside
 *    the spliced range keep their own leading comments byte-for-byte (including the element that
 *    happens to sit at the insertion point), a deleted element takes its own comment with it, and
 *    the array literal's `as const`/`satisfies` wrapper is never touched.
 *
 * The one thing that is NOT preserved is trivia belonging to something that no longer exists: a
 * deleted element's own comments go with it, and a freshly inserted element has no authored text
 * to preserve, so it is serialized as JSON (double-quoted keys) at its neighbours' indentation.
 *
 * The remaining caveat is elements with NO stable `id` (or a duplicated one): those are paired
 * positionally from the head of their gap, so a deletion at the head of a gap followed by an edited
 * element still shifts the pairing by one and rewrites the deleted element's source node — moving
 * its comment onto data that isn't its own. Values stay correct either way; only comment
 * attribution degrades, and only for id-less elements.
 */
export function updateDefaultPropsSurgically(
  source: string,
  newProps: unknown,
  opts: { compositionId?: string } = {},
): string {
  const attr = findDefaultPropsAttr(source, opts.compositionId);
  const jsxExpr = attr.getInitializer()?.asKind(SyntaxKind.JsxExpression)?.getExpression();
  if (!jsxExpr) {
    throw new Error(
      'updateDefaultPropsSurgically: defaultProps initializer is not a JSX expression.',
    );
  }

  const currentProps = evaluateLiteral(jsxExpr);
  const ops: DiffOp[] = [];
  diffOps(currentProps, newProps, [], ops);

  if (ops.length === 0) {
    return source;
  }

  // Every op's path indexes the array literals AS THEY EXIST IN THE SOURCE, so ops that shift
  // those indices must run last: first the length-preserving ops (replace/add), then the splices
  // from the deepest/highest index downwards, so that no splice invalidates a pending one's path.
  const splices = ops.filter((op): op is Extract<DiffOp, { kind: 'array-splice' }> => op.kind === 'array-splice');
  const inPlaceOps = ops.filter((op) => op.kind !== 'array-splice');
  splices.sort((a, b) => comparePaths(b.path, a.path) || b.start - a.start);

  for (const op of inPlaceOps) {
    if (op.path.length === 0) {
      // The top-level props object itself needs a whole-node replace (e.g. a top-level key was
      // removed) — nothing surgical to do at the root, replace the whole literal.
      const serialized = JSON.stringify(op.value, null, 2);
      jsxExpr.replaceWithText(serialized);
      continue;
    }
    if (op.kind === 'add') {
      applyAddKey(jsxExpr, op.path, op.value);
    } else {
      applyLeafChange(jsxExpr, op.path, op.value);
    }
  }

  // Splices are text-level edits (see `applyArraySpliceToSource`), so they run against the source
  // produced by the in-place ops, each one re-parsing the text it is handed. The descending order
  // guarantees a pending op's indices still refer to the same elements after an earlier splice.
  let out = attr.getSourceFile().getFullText();
  for (const op of splices) {
    out = applyArraySpliceToSource(out, opts.compositionId, op);
  }

  return out;
}
