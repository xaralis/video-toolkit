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
 *  - `array-splice`: the array at `path` changed length. `start`/`deleteCount` bound the minimal
 *    contiguous run of elements that differ from the old array (found via a common-prefix/common-
 *    suffix scan), and `newElements` are the values that replace that run. Every element outside
 *    the run — including its comments/`as const` — is left byte-untouched; this covers append,
 *    prepend, insert-in-the-middle, delete, and duplicate without reserializing untouched siblings.
 */
type DiffOp =
  | { kind: 'replace'; path: PathSegment[] }
  | { kind: 'add'; path: PathSegment[] }
  | { kind: 'array-splice'; path: PathSegment[]; start: number; deleteCount: number; newElements: unknown[] };

/**
 * Finds the minimal contiguous "changed" run between `oldArr` and `newArr` by trimming a common
 * prefix and a common suffix (via `deepEqual`, elementwise) off both ends. Everything in the
 * prefix/suffix is identical between the two arrays and needs no edit at all; only the run in the
 * middle — `oldArr[start, start+deleteCount)` — actually differs, and `newElements` is what it
 * should become. This is what lets a single insert/delete/duplicate at any position be expressed
 * as one small splice instead of a whole-array replace.
 */
function arraySplice(
  oldArr: unknown[],
  newArr: unknown[],
): { start: number; deleteCount: number; newElements: unknown[] } {
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

  return {
    start: prefix,
    deleteCount: oldLen - prefix - suffix,
    newElements: newArr.slice(prefix, newLen - suffix),
  };
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
 * Arrays recurse element-by-element when the length is unchanged. When the length differs, a
 * common-prefix/common-suffix scan (`arraySplice`) finds the minimal contiguous run that actually
 * changed and emits a single `array-splice` op scoped to that run — every element outside it
 * (including its own comments/`as const`) is left alone. This covers append, prepend, insert-in-
 * the-middle, delete, and duplicate without reserializing untouched siblings.
 */
function diffOps(oldVal: unknown, newVal: unknown, path: PathSegment[], out: DiffOp[]): void {
  if (deepEqual(oldVal, newVal)) return;

  if (isPlainObject(oldVal) && isPlainObject(newVal)) {
    const keysA = Object.keys(oldVal);
    const keysB = Object.keys(newVal);
    const keysBSet = new Set(keysB);
    const removedKeys = keysA.filter((k) => !keysBSet.has(k));

    if (removedKeys.length > 0) {
      out.push({ kind: 'replace', path: path.slice() });
      return;
    }

    const keysASet = new Set(keysA);
    for (const k of keysA) {
      diffOps(oldVal[k], newVal[k], [...path, k], out);
    }
    for (const k of keysB) {
      if (!keysASet.has(k)) {
        out.push({ kind: 'add', path: [...path, k] });
      }
    }
    return;
  }

  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    if (oldVal.length === newVal.length) {
      for (let i = 0; i < oldVal.length; i++) {
        diffOps(oldVal[i], newVal[i], [...path, i], out);
      }
      return;
    }
    const { start, deleteCount, newElements } = arraySplice(oldVal, newVal);
    out.push({ kind: 'array-splice', path: path.slice(), start, deleteCount, newElements });
    return;
  }

  // Scalar difference or type change: replace the whole node at this path.
  out.push({ kind: 'replace', path: path.slice() });
}

function getAtPath(root: unknown, path: PathSegment[]): unknown {
  let cur = root;
  for (const seg of path) {
    cur = (cur as Record<PathSegment, unknown>)[seg];
  }
  return cur;
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

/** Applies a single `array-splice` op: the array at `path` changed length. Removes `deleteCount`
 * elements starting at `start` from the existing array literal AST node, then inserts
 * `newElements` (freshly serialized — they have no prior AST to preserve) at that same position.
 * Every element outside `[start, start + deleteCount)` is never touched, so its comments/`as const`
 * survive byte-for-byte, and the array literal node itself (and any `as const`/`satisfies` wrapping
 * it) is never replaced either. */
function applyArraySplice(
  topValueNode: Node,
  path: PathSegment[],
  start: number,
  deleteCount: number,
  newElements: unknown[],
): void {
  const containerNode = unwrapValue(navigateToValueNode(topValueNode, path));
  if (containerNode.getKind() !== SyntaxKind.ArrayLiteralExpression) {
    throw new Error(
      `updateDefaultPropsSurgically: expected an array literal at path "${path.join('.')}".`,
    );
  }
  const arrLit = containerNode.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  for (let i = 0; i < deleteCount; i++) {
    arrLit.removeElement(start);
  }
  if (newElements.length > 0) {
    arrLit.insertElements(start, newElements.map((v) => JSON.stringify(v, null, 2)));
  }
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
 * Arrays recurse element-by-element when the length is unchanged (existing elements may still
 * change value). When the length differs — an element was inserted, deleted, or duplicated — a
 * common-prefix/common-suffix scan finds the minimal contiguous run that actually changed and
 * splices only that run into the existing array literal AST node (removing/inserting elements in
 * place). Every element outside that run, and the array literal node itself (with any `as const`/
 * `satisfies` wrapping it), is left byte-untouched.
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

  for (const op of ops) {
    if (op.path.length === 0) {
      // The top-level props object itself needs a whole-node replace (e.g. a top-level key was
      // removed) — nothing surgical to do at the root, replace the whole literal.
      const serialized = JSON.stringify(newProps, null, 2);
      jsxExpr.replaceWithText(serialized);
      continue;
    }
    if (op.kind === 'add') {
      applyAddKey(jsxExpr, op.path, getAtPath(newProps, op.path));
    } else if (op.kind === 'array-splice') {
      applyArraySplice(jsxExpr, op.path, op.start, op.deleteCount, op.newElements);
    } else {
      applyLeafChange(jsxExpr, op.path, getAtPath(newProps, op.path));
    }
  }

  return attr.getSourceFile().getFullText();
}
